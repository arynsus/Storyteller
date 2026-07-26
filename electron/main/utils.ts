import { app } from "electron";
import fs from "fs";
import { readFile } from "fs/promises";
import path from "path";
import wordsCountModule from "words-count";
import { FileDataClass, FileData, ChapterPreview, MakeChaptersResult } from "../../global/types";
import { analyzeMetadata } from "../../global/metadataAnalyzer";
import { emitAddToList } from "./emitter";

const wordsCount = (wordsCountModule as unknown as { default: (t: string) => number }).default ?? wordsCountModule;

// Set up directories. Everything Storyteller generates lives under one
// content_cache folder so users can find (and clear) it in a single place,
// instead of hunting through loose folders in the Electron userData root
// (which also holds Chromium's own Blob Storage/Session Storage/etc.).
const USER_DATA_PATH = app.getPath("userData");
export const CONTENT_CACHE_DIR = path.join(USER_DATA_PATH, "content_cache");
// Shared working area for source text: both Chapter Maker output and files
// dragged straight into the queue get copied here, so conversion and the
// content editor always deal with one app-owned copy instead of juggling
// original-file paths (which we must never mutate).
const WORKING_TXT_DIR = path.join(CONTENT_CACHE_DIR, "working_txt");

export const createDirIfNeeded = (dirPath: string): void => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

export const clearDirectory = (dirPath: string): string[] => {
    const removedFiles: string[] = [];
    try {
        if (fs.existsSync(dirPath)) {
            for (const file of fs.readdirSync(dirPath)) {
                fs.unlinkSync(path.join(dirPath, file));
                removedFiles.push(file);
            }
        }
    } catch (err) {
        console.error(`Error clearing directory ${dirPath}:`, err);
    }
    return removedFiles;
};

// Recurses into subdirectories so a parent folder (e.g. content_cache) reports
// the combined size/count of everything nested under it.
export const getDirectoryInfo = (dirPath: string): { size: number; count: number } => {
    let size = 0;
    let count = 0;
    try {
        if (fs.existsSync(dirPath)) {
            for (const entry of fs.readdirSync(dirPath)) {
                const entryPath = path.join(dirPath, entry);
                const stat = fs.statSync(entryPath);
                if (stat.isDirectory()) {
                    const nested = getDirectoryInfo(entryPath);
                    size += nested.size;
                    count += nested.count;
                } else if (stat.isFile()) {
                    size += stat.size;
                    count++;
                }
            }
        }
    } catch (err) {
        console.error(`Error reading directory ${dirPath}:`, err);
    }
    return { size, count };
};

clearDirectory(WORKING_TXT_DIR);

function sanitizeFilename(name: string): string {
    return name.replace(/[\/\\:*?"<>|]/g, "").trim() || "chapter";
}

/**
 * Chapter Maker: split monolithic text into chapters *in memory* and return a
 * preview. No files are written until the user commits via `handleAddToList`.
 */
export const handleMakeChapters = async (
    _event: unknown,
    content: string,
    pattern: string,
    flags: string
): Promise<MakeChaptersResult> => {
    if (!pattern) {
        return { chapters: [], matchCount: 0, error: "EMPTY_PATTERN" };
    }

    let regex: RegExp;
    try {
        regex = new RegExp(pattern, flags || "");
    } catch (err) {
        return { chapters: [], matchCount: 0, error: err instanceof Error ? err.message : "INVALID_REGEX" };
    }

    const lines = content.split(/\r?\n/);
    const blocks: { title: string; lines: string[]; isPreamble?: boolean }[] = [];
    let matchCount = 0;
    let current: { title: string; lines: string[]; isPreamble?: boolean } | null = null;

    for (const line of lines) {
        // Use a fresh test each line (avoid stateful lastIndex from the "g" flag).
        const isHeading = new RegExp(pattern, flags.replace("g", "")).test(line);
        if (isHeading) {
            matchCount++;
            if (current) blocks.push(current);
            current = { title: line.trim(), lines: [line] };
        } else if (current) {
            current.lines.push(line);
        } else {
            // Text before the first heading -> preamble block.
            if (!current) {
                current = { title: "", lines: [line], isPreamble: true };
            }
        }
    }
    if (current) blocks.push(current);

    // Drop an empty preamble (leading blank lines only).
    const meaningful = blocks.filter((b) => b.lines.join("").trim().length > 0);

    const usedNames = new Set<string>();
    const chapters: ChapterPreview[] = meaningful.map((block, index) => {
        const rawTitle = block.isPreamble ? block.title || "Introduction" : block.title || `Chapter ${index + 1}`;
        let base = sanitizeFilename(rawTitle);
        let unique = base;
        let suffix = 2;
        while (usedNames.has(unique.toLowerCase())) {
            unique = `${base}_${suffix++}`;
        }
        usedNames.add(unique.toLowerCase());

        const text = block.lines.join("\n");
        return {
            index,
            title: rawTitle,
            filename: `${unique}.txt`,
            wordcount: wordsCount(text),
            charcount: text.length,
            snippet: text.trim().slice(0, 200),
            content: text,
            isPreamble: block.isPreamble,
        };
    });

    return { chapters, matchCount };
};

/**
 * Commit chapters: write each preview's content to disk, analyze metadata, and
 * push the resulting queue entries to the main window.
 */
export const handleAddToList = async (
    _event: unknown,
    chapters: ChapterPreview[]
): Promise<{ success: boolean; error?: string }> => {
    try {
        createDirIfNeeded(WORKING_TXT_DIR);
        const fileList: FileData[] = chapters.map((chapter) => {
            const filePath = path.join(WORKING_TXT_DIR, chapter.filename);
            fs.writeFileSync(filePath, chapter.content, "utf8");
            return new FileDataClass(
                chapter.filename,
                chapter.filename,
                filePath,
                chapter.wordcount,
                analyzeMetadata(chapter.filename)
            );
        });
        emitAddToList(fileList);
        return { success: true };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
};

/**
 * Files dragged straight into the queue: copy their content into the same
 * working area Chapter Maker uses, so every queued job is an app-owned copy
 * and conversion/edit logic never has to special-case "the user's original
 * file" vs "a chapter we generated".
 */
export const handleImportDroppedFiles = async (
    _event: unknown,
    incoming: { filename: string; content: string }[]
): Promise<{ success: boolean; files?: FileData[]; error?: string }> => {
    try {
        createDirIfNeeded(WORKING_TXT_DIR);
        const usedNames = new Set(fs.existsSync(WORKING_TXT_DIR) ? fs.readdirSync(WORKING_TXT_DIR) : []);
        const fileList: FileData[] = incoming.map((item) => {
            const stem = sanitizeFilename(item.filename.replace(/\.txt$/i, "")) || "untitled";
            let candidate = `${stem}.txt`;
            let suffix = 2;
            while (usedNames.has(candidate)) {
                candidate = `${stem}_${suffix++}.txt`;
            }
            usedNames.add(candidate);

            const filePath = path.join(WORKING_TXT_DIR, candidate);
            fs.writeFileSync(filePath, item.content, "utf8");
            return new FileDataClass(
                candidate,
                candidate,
                filePath,
                wordsCount(item.content),
                analyzeMetadata(candidate)
            );
        });
        return { success: true, files: fileList };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
};

function isInsideWorkingDir(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    return resolved.startsWith(path.resolve(WORKING_TXT_DIR) + path.sep);
}

// Content editor: lazily load a queued chapter's text for viewing/editing.
export const handleReadFileContent = async (
    _event: unknown,
    filePath: string
): Promise<{ success: boolean; content?: string; error?: string }> => {
    if (!isInsideWorkingDir(filePath)) return { success: false, error: "INVALID_PATH" };
    try {
        const content = await readFile(filePath, "utf8");
        return { success: true, content };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
};

// Content editor: persist edits back to the working-area copy (never the
// user's original file) and report the recomputed word count.
export const handleWriteFileContent = async (
    _event: unknown,
    filePath: string,
    content: string
): Promise<{ success: boolean; wordcount?: number; error?: string }> => {
    if (!isInsideWorkingDir(filePath)) return { success: false, error: "INVALID_PATH" };
    try {
        fs.writeFileSync(filePath, content, "utf8");
        return { success: true, wordcount: wordsCount(content) };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
};

// Load audio for result preview -> returns a data URL the renderer can play.
export const handleAudioLoad = async (
    _event: unknown,
    audioUrl: string
): Promise<{ success: boolean; dataUrl?: string }> => {
    try {
        const data = await readFile(audioUrl);
        const ext = path.extname(audioUrl).replace(".", "") || "mp3";
        const mime = ext === "m4b" || ext === "m4a" ? "audio/mp4" : "audio/mpeg";
        return { success: true, dataUrl: `data:${mime};base64,${data.toString("base64")}` };
    } catch {
        return { success: false };
    }
};

// Download file (copy file to system download folder).
export const handleFileDownload = async (
    _event: unknown,
    filePath: string
): Promise<{ success: boolean; filename?: string; error?: string }> => {
    const filename = path.basename(filePath);
    const destination = path.join(app.getPath("downloads"), filename);
    try {
        await fs.promises.copyFile(filePath, destination);
        return { success: true, filename };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
};

// Download all files (copy files to system download folder).
export const handleAllFilesDownload = async (
    _event: unknown,
    filePaths: string[]
): Promise<{ succeeded: number; failed: number }> => {
    const results = await Promise.allSettled(
        filePaths.map((filePath) =>
            fs.promises.copyFile(filePath, path.join(app.getPath("downloads"), path.basename(filePath)))
        )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    return { succeeded, failed: results.length - succeeded };
};
