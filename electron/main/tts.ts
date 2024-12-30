import { app } from 'electron'
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const ffmpeg = require('fluent-ffmpeg');
const wordsCount = require('words-count').default;
import { edgeTextToSpeech } from "./edge";
import { azureTextToSpeech } from "./azure";
const sharp = require('sharp');
const { exec } = require('child_process');
import { FileData, TTSConfig, MetadataConfig } from "../../global/types";
import { clearDirectory, wss, createDirIfNeeded, handleWebSocketError } from "./utils";

// Disable this to use local ffmpeg and ffprobe binaries
const ffmpegBin = require('ffmpeg-static-electron');
process.env.FFMPEG_PATH = ffmpegBin.path
const ffprobeBin = require('ffprobe-static-electron');
process.env.FFPROBE_PATH = ffprobeBin.path

// Set up directories
const USER_DATA_PATH = app.getPath('userData');
const AUDIO_SECTIONS_DIR = path.join(USER_DATA_PATH, 'audio_sections');
const COVER_ART_DIR = path.join(USER_DATA_PATH, 'cover_arts');
export const AUDIO_OUTPUT_DIR = path.join(USER_DATA_PATH, 'audio_output');
clearDirectory(AUDIO_SECTIONS_DIR)
clearDirectory(COVER_ART_DIR)

// Receive a list of files to convert, send to queue.
export const handleFileConversion = async (event: any, files: FileData[], config: TTSConfig): Promise<void> => {
    createDirIfNeeded(AUDIO_SECTIONS_DIR);
    createDirIfNeeded(AUDIO_OUTPUT_DIR);
    const tasks = files.map(file => () => processFile(file, config));
    await asyncQueue(tasks, config.jobConcurrencyLimit);
};
const asyncQueue = async (tasks: Array<() => Promise<void>>, jobConcurrencyLimit: number): Promise<void> => {
    const ongoingTasks = [];
    const enqueue = task => {
        if (ongoingTasks.length >= jobConcurrencyLimit) {
            return Promise.race(ongoingTasks).then(() => enqueue(task));
        }
        const taskPromise = task().finally(() => ongoingTasks.splice(ongoingTasks.indexOf(taskPromise), 1));
        ongoingTasks.push(taskPromise);
        return taskPromise;
    };
    await Promise.all(tasks.map(enqueue));
};
const processFile = async (file: FileData, config: TTSConfig): Promise<void> => {

    const text = fs.readFileSync(file.path, 'utf8');
    const sections = divideTextIntoSections(text, config.wordsPerSection);
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'split-start', filename: file.filename })));
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'split-complete', filename: file.filename, sections: sections.length })));

    const sectionFiles: { index: number, path: string }[] = []; // Store section index and path
    const sectionTasks = sections.map((section, index) => async () => {
        const sectionPath = path.join(AUDIO_SECTIONS_DIR, `${file.filename}_${index}.mp3`);
        // In case last conversion fails due to internet issues, continue where left off
        if (!fs.existsSync(sectionPath)) {
            try {
                await convertSectionToMP3(section, sectionPath, config);
                wss.clients.forEach(client => client.send(JSON.stringify({ type: 'conversion-progress', filename: file.filename, total_sections: sections.length })));
            } catch (err) {
                handleWebSocketError(err, file.filename);
                throw err; // Important to rethrow the error to stop further processing
            }
        } else {
            wss.clients.forEach(client => client.send(JSON.stringify({ type: 'conversion-progress', filename: file.filename, total_sections: sections.length })));
        }
        sectionFiles.push({ index, path: sectionPath });
    });

    try {
        await asyncQueue(sectionTasks, config.sectionConcurrencyLimit); // Use the concurrency limit for sections
    } catch (err) {
        return; // Stop further processing if an error occurred in any of the tasks
    }

    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'combine-start', filename: file.filename })));

    const outputFilePath = path.join(AUDIO_OUTPUT_DIR, `${formatOutputFilename(file)}_${crypto.randomUUID()}.${config.outputFormat}`);

    try {
        await combineSectionFiles(sectionFiles, outputFilePath, file.metadata);
        wss.clients.forEach(client => client.send(JSON.stringify({ filename: file.filename, type: 'combine-complete', url: outputFilePath })));
    } catch (err) {
        console.log(err)
        handleWebSocketError(err, file.filename);
    }
};

function formatOutputFilename(file: FileData): string {
    const { bookTitle, chapterTitle, chapterNumber } = file.metadata;
    const nonEmptyFields = []
    if (bookTitle) { nonEmptyFields.push(bookTitle) }
    if (chapterNumber) { nonEmptyFields.push(chapterNumber) }
    if (chapterTitle) { nonEmptyFields.push(chapterTitle) }
    if (!chapterNumber && !chapterTitle) {
        return file.filename.slice(0, -4)
    }
    return nonEmptyFields.join('_')
}

// Split txt content into small bite-size sections.
const divideTextIntoSections = (text: string, maxLength: number = 300): string[] => {
    const paragraphs = text.split('\n');
    const sections = [];
    let currentSection = '';
    let currentLength = 0;

    for (let para of paragraphs) {
        const paraLength = wordsCount(para);
        if (currentLength + paraLength > maxLength) {
            sections.push(currentSection);
            currentSection = para + '\n';
            currentLength = paraLength;
        } else {
            currentSection += para + '\n';
            currentLength += paraLength;
        }
    }
    if (currentSection) {
        sections.push(currentSection);
    }
    return sections;
};

// Each section is converted to audio and save to local cache.
const convertSectionToMP3 = async (sectionText: string, outputFilePath: string, config: TTSConfig): Promise<void> => {
    switch (config.service) {
        case 'azure':
            const audioData = await azureTextToSpeech({
                text: sectionText,
                region: config.azureRegion,
                subscriptionKey: config.azureKey,
                voice: config.voice,
                rate: `${String(config.speed)}%`,
                pitch: `${String(config.pitch)}%`,
              });
              fs.writeFileSync(outputFilePath, audioData);
            break;
        default:
            const audioBuffer = await edgeTextToSpeech(`<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US"> <voice name="${config.voice}"><prosody rate="${String(config.speed)}%" pitch="${String(config.pitch)}%">${sectionText}</prosody ></voice > </speak >`);
            fs.writeFileSync(outputFilePath, audioBuffer);
            break;
    }
};

// All sections are combined to one file of the chosen format.
const combineSectionFiles = async (sectionFiles: { index: number, path: string }[], outputFile: string, metadata: MetadataConfig): Promise<void> => {
    const command = ffmpeg();

    // Sort and input files
    sectionFiles.sort((a, b) => a.index - b.index).forEach(({ path }) => {
        if (fs.statSync(path).size > 0) {
            command.input(path);
        }
    });


    // Add metadata options with escaped and encoded values
    if (metadata.bookTitle) {
        command.outputOption('-metadata', `album=${metadata.bookTitle}`);
    }
    if (metadata.author) {
        command.outputOption('-metadata', `artist=${metadata.author}`);
    }
    if (metadata.chapterTitle) {
        command.outputOption('-metadata', `title=${metadata.chapterTitle}`);
    }

    // Handle chapterNumber for track and disc
    if (metadata.chapterNumber) {
        const chapterParts = metadata.chapterNumber.split('.');
        if (chapterParts.length === 1) {
            // Only track number
            command.outputOption(`-metadata track=${chapterParts[0]}`);
        } else {
            // Disc and track number
            command.outputOption(`-metadata disc=${chapterParts[0]}`);
            command.outputOption(`-metadata track=${chapterParts.slice(1).join('.')}`);
        }
    }

    // Combine and embed metadata
    await new Promise<void>((resolve, reject) => {
        command
            .on('error', (err) => {
                reject(err);
            })
            .on('end', () => {
                resolve();
            })
            .mergeToFile(outputFile, './temp');
    });

    // Cleanup
    sectionFiles.forEach(({ path }) => fs.unlinkSync(path));

    // Add cover art, because fluent-ffmpeg cannot handle this for some weird reason.
    if (metadata.coverArt) {
        const coverArtPath = await getCoverArt(metadata.coverArt, outputFile);
        if (coverArtPath) {
            let coverArtCommand
            if (path.extname(outputFile) == '.mp3') {
                coverArtCommand = `${ffmpegBin.path} -i "${outputFile}" -i "${coverArtPath}" -map 0:0 -map 1:0 -c:a copy -c:v mjpeg -id3v2_version 3 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" "${outputFile}.temp${path.extname(outputFile)}"`;
            }
            else {
                coverArtCommand = `${ffmpegBin.path} -i "${outputFile}" -i "${coverArtPath}" -map 0 -map 1 -c copy -disposition:1 attached_pic "${outputFile}.temp${path.extname(outputFile)}"`;
            }
            console.log(coverArtCommand)
            await new Promise<void>((resolve, reject) => {
                exec(coverArtCommand, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    } else {
                        fs.renameSync(`${outputFile}.temp${path.extname(outputFile)}`, outputFile); // Replace original file
                        resolve();
                    }
                });
            });
        }
    }
};

// Cover art can be downloaded or loaded from local machine.
const getCoverArt = async (coverArtPathOrUrl: string, filename: string) => {
    if (!coverArtPathOrUrl) {
        return
    }

    try {
        let buffer: Buffer;
        try {
            // First, try to read as a local file
            buffer = fs.readFileSync(coverArtPathOrUrl);
        } catch {
            // If reading file fails, try fetching it
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(coverArtPathOrUrl);
            buffer = await response.buffer();
        }

        const type = await (await import('file-type')).fileTypeFromBuffer(buffer);

        if (!type || type.mime !== 'image/jpeg') {
            // Convert to JPEG if not already
            buffer = await sharp(buffer).jpeg().toBuffer();
        }
        createDirIfNeeded(COVER_ART_DIR)
        const outputPath = path.join(COVER_ART_DIR, `${crypto.randomUUID()}.jpg`);
        await sharp(buffer).toFile(outputPath);
        return outputPath;
    } catch (error) {
        wss.clients.forEach(client => client.send(JSON.stringify({ type: 'cover-art-unavailable', filename })));
        return null;
    }
};