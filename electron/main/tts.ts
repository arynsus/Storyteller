import { app } from "electron";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import wordsCountModule from "words-count";
import { edgeTextToSpeech } from "./edge";
import { azureTextToSpeech } from "./azure";
import { FileData, TTSConfig, MetadataConfig, resolveEffectiveConfig } from "../../global/types";
import { clearDirectory, createDirIfNeeded } from "./utils";
import { emitConversionEvent, emitError } from "./emitter";

const wordsCount = (wordsCountModule as unknown as { default: (t: string) => number }).default ?? wordsCountModule;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require("sharp");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegBin = require("ffmpeg-static-electron");
process.env.FFMPEG_PATH = ffmpegBin.path;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeBin = require("ffprobe-static-electron");
process.env.FFPROBE_PATH = ffprobeBin.path;

// Set up directories
const USER_DATA_PATH = app.getPath("userData");
const AUDIO_SECTIONS_DIR = path.join(USER_DATA_PATH, "audio_sections");
const COVER_ART_DIR = path.join(USER_DATA_PATH, "cover_arts");
export const AUDIO_OUTPUT_DIR = path.join(USER_DATA_PATH, "audio_output");
clearDirectory(AUDIO_SECTIONS_DIR);
clearDirectory(COVER_ART_DIR);

// Guard against two conversion runs processing the same file at once (e.g. the
// user clicks "Convert" again before the previous run finished). Without this
// the two runs would each emit progress for the same sections and the counter
// could exceed the total (the "57/55" bug).
const activeJobs = new Set<string>();

// Receive a list of files to convert, send to queue.
export const handleFileConversion = async (
    _event: unknown,
    files: FileData[],
    config: TTSConfig
): Promise<void> => {
    createDirIfNeeded(AUDIO_SECTIONS_DIR);
    createDirIfNeeded(AUDIO_OUTPUT_DIR);
    const tasks = files.map((file) => () => processFile(file, config));
    await asyncQueue(tasks, Math.max(1, config.jobConcurrencyLimit));
};

const asyncQueue = async (tasks: Array<() => Promise<void>>, concurrencyLimit: number): Promise<void> => {
    const ongoingTasks: Promise<void>[] = [];
    const enqueue = (task: () => Promise<void>): Promise<void> => {
        if (ongoingTasks.length >= concurrencyLimit) {
            return Promise.race(ongoingTasks).then(() => enqueue(task));
        }
        const taskPromise = task().finally(() => {
            ongoingTasks.splice(ongoingTasks.indexOf(taskPromise), 1);
        });
        ongoingTasks.push(taskPromise);
        return taskPromise;
    };
    await Promise.all(tasks.map(enqueue));
};

const processFile = async (file: FileData, globalConfig: TTSConfig): Promise<void> => {
    if (activeJobs.has(file.filename)) {
        return; // already being processed by another run
    }
    activeJobs.add(file.filename);

    try {
        const config = resolveEffectiveConfig(globalConfig, file);
        const text = fs.readFileSync(file.path, "utf8");
        const sections = divideTextIntoSections(text, config.wordsPerSection);

        emitConversionEvent({ type: "split-start", filename: file.filename });
        emitConversionEvent({ type: "split-complete", filename: file.filename, totalSections: sections.length });

        // Authoritative progress: track which section indices are done rather than
        // counting events. Pre-seed with sections already cached on disk so a
        // resumed job reports the correct starting point.
        const completed = new Set<number>();
        const sectionPaths = sections.map((_, index) =>
            path.join(AUDIO_SECTIONS_DIR, `${sanitizeFilename(file.filename)}_${index}.mp3`)
        );
        sectionPaths.forEach((p, index) => {
            if (fs.existsSync(p)) completed.add(index);
        });
        const emitProgress = () =>
            emitConversionEvent({
                type: "conversion-progress",
                filename: file.filename,
                finishedSections: Math.min(completed.size, sections.length),
                totalSections: sections.length,
            });
        emitProgress();

        const sectionTasks = sections.map((section, index) => async () => {
            const sectionPath = sectionPaths[index];
            if (!completed.has(index)) {
                await convertSectionToMP3(section, sectionPath, config);
                completed.add(index);
            }
            emitProgress();
        });

        try {
            await asyncQueue(sectionTasks, Math.max(1, config.sectionConcurrencyLimit));
        } catch (err) {
            emitError(err, file.filename);
            return; // stop before combining
        }

        emitConversionEvent({ type: "combine-start", filename: file.filename });
        const sectionFiles = sectionPaths.map((p, index) => ({ index, path: p }));
        const outputFilePath = path.join(
            AUDIO_OUTPUT_DIR,
            `${formatOutputFilename(file)}_${crypto.randomUUID()}.${config.outputFormat}`
        );

        try {
            await combineSectionFiles(sectionFiles, outputFilePath, file.metadata);
            emitConversionEvent({ type: "combine-complete", filename: file.filename, url: outputFilePath });
        } catch (err) {
            emitError(err, file.filename);
        }
    } finally {
        activeJobs.delete(file.filename);
    }
};

function sanitizeFilename(name: string): string {
    return name.replace(/[\/\\:*?"<>|]/g, "_");
}

function formatOutputFilename(file: FileData): string {
    const { bookTitle, chapterTitle, chapterNumber } = file.metadata;
    const nonEmptyFields: string[] = [];
    if (bookTitle) nonEmptyFields.push(bookTitle);
    if (chapterNumber) nonEmptyFields.push(chapterNumber);
    if (chapterTitle) nonEmptyFields.push(chapterTitle);
    if (!chapterNumber && !chapterTitle) {
        return sanitizeFilename(file.filename.replace(/\.txt$/i, ""));
    }
    return sanitizeFilename(nonEmptyFields.join("_"));
}

// Split txt content into small bite-size sections.
const divideTextIntoSections = (text: string, maxLength = 300): string[] => {
    const paragraphs = text.split("\n");
    const sections: string[] = [];
    let currentSection = "";
    let currentLength = 0;

    for (const para of paragraphs) {
        const paraLength = wordsCount(para);
        if (currentLength + paraLength > maxLength && currentSection) {
            sections.push(currentSection);
            currentSection = para + "\n";
            currentLength = paraLength;
        } else {
            currentSection += para + "\n";
            currentLength += paraLength;
        }
    }
    if (currentSection.trim()) {
        sections.push(currentSection);
    }
    return sections.length > 0 ? sections : [text];
};

// Each section is converted to audio and saved to local cache.
const convertSectionToMP3 = async (
    sectionText: string,
    outputFilePath: string,
    config: TTSConfig
): Promise<void> => {
    if (config.service === "azure") {
        const audioData = await azureTextToSpeech({
            text: sectionText,
            region: config.azureRegion || "",
            subscriptionKey: config.azureKey || "",
            voice: config.voice,
            rate: `${config.speed}%`,
            pitch: `${config.pitch}%`,
        });
        fs.writeFileSync(outputFilePath, audioData);
    } else {
        const ssml =
            `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" ` +
            `xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">` +
            `<voice name="${config.voice}"><prosody rate="${config.speed}%" pitch="${config.pitch}%">` +
            `${sectionText}</prosody></voice></speak>`;
        const audioBuffer = await edgeTextToSpeech(ssml);
        fs.writeFileSync(outputFilePath, audioBuffer);
    }
};

// All sections are combined into one file of the chosen format.
const combineSectionFiles = async (
    sectionFiles: { index: number; path: string }[],
    outputFile: string,
    metadata: MetadataConfig
): Promise<void> => {
    const command = ffmpeg();

    sectionFiles
        .slice()
        .sort((a, b) => a.index - b.index)
        .forEach(({ path: sectionPath }) => {
            if (fs.existsSync(sectionPath) && fs.statSync(sectionPath).size > 0) {
                command.input(sectionPath);
            }
        });

    if (metadata.bookTitle) command.outputOption("-metadata", `album=${metadata.bookTitle}`);
    if (metadata.author) command.outputOption("-metadata", `artist=${metadata.author}`);
    if (metadata.chapterTitle) command.outputOption("-metadata", `title=${metadata.chapterTitle}`);

    if (metadata.chapterNumber) {
        const chapterParts = metadata.chapterNumber.split(".");
        if (chapterParts.length === 1) {
            command.outputOption("-metadata", `track=${chapterParts[0]}`);
        } else {
            command.outputOption("-metadata", `disc=${chapterParts[0]}`);
            command.outputOption("-metadata", `track=${chapterParts.slice(1).join(".")}`);
        }
    }

    await new Promise<void>((resolve, reject) => {
        command
            .on("error", (err: Error) => reject(err))
            .on("end", () => resolve())
            .mergeToFile(outputFile, path.join(USER_DATA_PATH, "temp"));
    });

    // Cleanup section files.
    sectionFiles.forEach(({ path: sectionPath }) => {
        if (fs.existsSync(sectionPath)) fs.unlinkSync(sectionPath);
    });

    // Add cover art via a direct ffmpeg call (fluent-ffmpeg can't embed it well).
    if (metadata.coverArt) {
        const coverArtPath = await getCoverArt(metadata.coverArt, outputFile);
        if (coverArtPath) {
            const tempFile = `${outputFile}.temp${path.extname(outputFile)}`;
            const isMp3 = path.extname(outputFile).toLowerCase() === ".mp3";
            const args = isMp3
                ? ["-y", "-i", outputFile, "-i", coverArtPath, "-map", "0:0", "-map", "1:0", "-c:a", "copy",
                   "-c:v", "mjpeg", "-id3v2_version", "3", "-metadata:s:v", "title=Album cover",
                   "-metadata:s:v", "comment=Cover (front)", tempFile]
                : ["-y", "-i", outputFile, "-i", coverArtPath, "-map", "0", "-map", "1", "-c", "copy",
                   "-disposition:1", "attached_pic", tempFile];

            await new Promise<void>((resolve, reject) => {
                execFile(ffmpegBin.path, args, (error: Error | null) => {
                    if (error) {
                        reject(error);
                    } else {
                        fs.renameSync(tempFile, outputFile);
                        resolve();
                    }
                });
            });
        }
    }
};

// Cover art can be downloaded or loaded from the local machine.
const getCoverArt = async (coverArtPathOrUrl: string, filename: string): Promise<string | null> => {
    if (!coverArtPathOrUrl) return null;

    try {
        let buffer: Buffer;
        try {
            buffer = fs.readFileSync(coverArtPathOrUrl);
        } catch {
            const fetch = (await import("node-fetch")).default;
            const response = await fetch(coverArtPathOrUrl);
            buffer = Buffer.from(await response.arrayBuffer());
        }

        const type = await (await import("file-type")).fileTypeFromBuffer(buffer);
        if (!type || type.mime !== "image/jpeg") {
            buffer = await sharp(buffer).jpeg().toBuffer();
        }
        createDirIfNeeded(COVER_ART_DIR);
        const outputPath = path.join(COVER_ART_DIR, `${crypto.randomUUID()}.jpg`);
        await sharp(buffer).toFile(outputPath);
        return outputPath;
    } catch {
        emitConversionEvent({ type: "cover-art-unavailable", filename });
        return null;
    }
};
