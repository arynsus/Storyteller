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
import {
    AUDIO_OUTPUT_DIR,
    AUDIO_SECTIONS_DIR,
    COVER_ART_DIR,
    createDirIfNeeded,
} from "./paths";
import {
    activeJobIds,
    recordCoverArt,
    recordJobComplete,
    recordJobFailed,
    recordJobStarted,
} from "./jobs";
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

const USER_DATA_PATH = app.getPath("userData");

// Nothing is wiped at startup any more: section files left by an interrupted
// run are what lets that job resume instead of re-paying for TTS, and the
// History tab is now responsible for clearing them when the user says so.

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
    // Guard against two runs processing the same job at once (e.g. the user
    // clicks "Convert" again before the previous run finished). Without this
    // both runs emit progress for the same sections and the counter can exceed
    // the total (the "57/55" bug).
    if (activeJobIds.has(file.jobId)) {
        return;
    }

    const { jobId, filename } = file;
    const sectionsDir = path.join(AUDIO_SECTIONS_DIR, jobId);
    const config = resolveEffectiveConfig(globalConfig, file);

    recordJobStarted({
        jobId,
        filename,
        workingTxtPath: file.path,
        sectionsDir,
        wordcount: file.wordcount,
        metadata: file.metadata,
        ttsConfig: {
            service: config.service,
            voice: config.voice,
            pitch: config.pitch,
            speed: config.speed,
            wordsPerSection: config.wordsPerSection,
            outputFormat: config.outputFormat,
        },
    });

    try {
        createDirIfNeeded(sectionsDir);
        const text = fs.readFileSync(file.path, "utf8");
        const sections = divideTextIntoSections(text, config.wordsPerSection);

        emitConversionEvent({ type: "split-start", jobId, filename });
        emitConversionEvent({ type: "split-complete", jobId, filename, totalSections: sections.length });

        // Authoritative progress: track which section indices are done rather than
        // counting events. Pre-seed with sections already cached on disk so a job
        // resumed after a crash reports the correct starting point.
        const completed = new Set<number>();
        const sectionPaths = sections.map((_, index) => path.join(sectionsDir, `${index}.mp3`));
        sectionPaths.forEach((p, index) => {
            if (fs.existsSync(p) && fs.statSync(p).size > 0) completed.add(index);
        });
        const emitProgress = () =>
            emitConversionEvent({
                type: "conversion-progress",
                jobId,
                filename,
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
            // The sections that did land stay on disk: History lists this job as
            // unfinished, and re-running it picks up where this run stopped.
            recordJobFailed(jobId, err instanceof Error ? err.message : String(err));
            emitError(err, jobId, filename);
            return; // stop before combining
        }

        emitConversionEvent({ type: "combine-start", jobId, filename });
        const sectionFiles = sectionPaths.map((p, index) => ({ index, path: p }));
        const outputFilePath = path.join(
            AUDIO_OUTPUT_DIR,
            `${formatOutputFilename(file)}_${crypto.randomUUID()}.${config.outputFormat}`
        );

        try {
            await combineSectionFiles(sectionFiles, sectionsDir, outputFilePath, file.metadata, { jobId, filename });
            recordJobComplete(jobId, outputFilePath, await probeDuration(outputFilePath));
            emitConversionEvent({ type: "combine-complete", jobId, filename, url: outputFilePath });
        } catch (err) {
            recordJobFailed(jobId, err instanceof Error ? err.message : String(err));
            emitError(err, jobId, filename);
        }
    } catch (err) {
        recordJobFailed(jobId, err instanceof Error ? err.message : String(err));
        emitError(err, jobId, filename);
    } finally {
        activeJobIds.delete(jobId);
    }
};

function sanitizeFilename(name: string): string {
    return name.replace(/[\/\\:*?"<>|]/g, "_");
}

/** Playback length of the finished file, so History can show it without re-probing. */
const probeDuration = (filePath: string): Promise<number | undefined> =>
    new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err: Error | null, data: { format?: { duration?: number } }) => {
            resolve(err ? undefined : data?.format?.duration);
        });
    });

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
    sectionsDir: string,
    outputFile: string,
    metadata: MetadataConfig,
    job: { jobId: string; filename: string }
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

    // Cleanup section files: once combined they're dead weight, and the job's
    // History entry now points at the finished audio instead.
    sectionFiles.forEach(({ path: sectionPath }) => {
        if (fs.existsSync(sectionPath)) fs.unlinkSync(sectionPath);
    });
    try {
        if (fs.existsSync(sectionsDir) && fs.readdirSync(sectionsDir).length === 0) fs.rmdirSync(sectionsDir);
    } catch {
        /* a concurrent write can repopulate it; harmless either way */
    }

    // Add cover art via a direct ffmpeg call (fluent-ffmpeg can't embed it well).
    if (metadata.coverArt) {
        const coverArtPath = await getCoverArt(metadata.coverArt, job);
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

// Cover art can be downloaded or loaded from the local machine. The normalized
// copy is kept (keyed by job) so History can show the book's cover without
// re-reading the audio file's embedded artwork.
const getCoverArt = async (
    coverArtPathOrUrl: string,
    job: { jobId: string; filename: string }
): Promise<string | null> => {
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
        const outputPath = path.join(COVER_ART_DIR, `${job.jobId}.jpg`);
        await sharp(buffer).toFile(outputPath);
        recordCoverArt(job.jobId, outputPath);
        return outputPath;
    } catch {
        emitConversionEvent({ type: "cover-art-unavailable", ...job });
        return null;
    }
};
