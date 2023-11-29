import { BrowserWindow, app } from 'electron';
const wordsCount = require('words-count').default;
const WebSocket = require('ws');
import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { FileDataClass, FileData } from "../../global/types";
import { analyzeMetadata } from "../../global/metadataAnalyzer";

// Set up directories
const USER_DATA_PATH = app.getPath('userData');
const CHAPTER_TXT_DIR = path.join(USER_DATA_PATH, 'chapter_txt');

// Set up WebSocket server
function setupWebSocketServer() {
    const wss = new WebSocket.Server({ port: 8080 });
    return wss;
}
export const wss = setupWebSocketServer();

export const createDirIfNeeded = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// Add results of Chapter Maker to TTS conversion list
export const handleAddToList = async (event, files: FileData[], mainWindow: BrowserWindow) => {
    const readFilePromises = files.map(file => {
        return readFile(file.path, 'utf8')
            .then(text => {
                const wordCount = wordsCount(text);
                return new FileDataClass(file.filename, file.filename, file.path, wordCount, analyzeMetadata(file.filename));
            })
            .catch(err => {
                console.error('Error reading file:', err);
                return null;
            });
    });

    Promise.all(readFilePromises).then(fileList => {
        console.log(fileList);
        mainWindow.webContents.send("add-to-list", fileList.filter(file => file !== null));
    });
}

// Chapter Maker functionality
export const handleMakeChapters = (event, content, pattern) => {

    createDirIfNeeded(CHAPTER_TXT_DIR);

    // Split the content into lines
    const lines = content.split(/\r?\n/);
    let currentChapter = '';
    let currentChapterContent = '';
    let isFirstChapter = true;
    const chapterFiles = [];

    lines.forEach((line, index) => {
        if (line.match(new RegExp(pattern))) {
            if (!isFirstChapter) {
                const safeChapterName = currentChapter.replace(/[\/\\:*?"<>|]/g, '');
                const filePath = path.join(CHAPTER_TXT_DIR, `${safeChapterName}.txt`);
                fs.writeFileSync(filePath, currentChapterContent, 'utf8');
                chapterFiles.push({ filename: `${safeChapterName}.txt`, path: filePath, key: safeChapterName });
            } else {
                isFirstChapter = false;
            }

            currentChapter = line.trim();
            currentChapterContent = line + '\n';
        } else {
            currentChapterContent += line + '\n';
        }

        // Save to local cache
        if (index === lines.length - 1 && currentChapter) {
            const safeChapterName = currentChapter.replace(/[\/\\:*?"<>|]/g, '');
            const filePath = path.join(CHAPTER_TXT_DIR, `${safeChapterName}.txt`);
            fs.writeFileSync(filePath, currentChapterContent, 'utf8');
            chapterFiles.push({ filename: `${safeChapterName}.txt`, path: filePath, key: safeChapterName });
        }
    });

    event.reply('chapters-made', chapterFiles);
};

export const clearDirectory = (dirPath) => {
    const removedFiles = []
    try {
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                fs.unlinkSync(filePath);
                removedFiles.push(file)
            }
        }
    } catch (err) {
        console.error(`Error clearing directory ${dirPath}:`, err);
    }
    return removedFiles
};

clearDirectory(CHAPTER_TXT_DIR)

// Load audio for result preview
export const handleAudioLoad = async (event, audioUrl: string): Promise<void> => {
    fs.readFile(audioUrl, (err: Error, data: Buffer | string) => {
        if (err) {
            handleWebSocketError(err)
            event.reply('audio-loaded', { success: false });
        } else {
            event.reply('audio-loaded', { success: true, data: data.toString('base64') });
        }
    });
}

// Download files (copy files to system download folder)
export const handleFileDownload = async (event, filePath: string): Promise<void> => {
    const filename = path.basename(filePath);
    const userDownloadFolder = app.getPath('downloads');
    const destination = path.join(userDownloadFolder, filename);
    fs.copyFile(filePath, destination, (err: Error) => {
        if (err) {
            console.error('Error copying file to downloads folder:', err);
            event.reply('file-downloaded', { success: false, err })
        } else {
            event.reply('file-downloaded', { success: true, filename })
        }
    });
}

// Inform vue frontend of errors
export const handleWebSocketError = (error: Error, filename?: string) => {
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'error', error: error.message, filename })));
};