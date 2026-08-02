import { app } from "electron";
import crypto from "crypto";
import fs from "fs";
import { readFile } from "fs/promises";
import path from "path";
import wordsCountModule from "words-count";
import { FileDataClass, FileData, ChapterPreview, MakeChaptersResult } from "../../global/types";
import { analyzeMetadata } from "../../global/metadataAnalyzer";
import { emitAddToList } from "./emitter";
import { WORKING_TXT_DIR, createDirIfNeeded, sanitizeFilename } from "./paths";
import { recordJobCreated, recordWordcountByPath } from "./jobs";

const wordsCount = (wordsCountModule as unknown as { default: (t: string) => number }).default ?? wordsCountModule;

/**
 * Working-text filenames carry the chapter's name for anyone browsing the cache
 * folder, plus a slice of the job id so two chapters that happen to share a
 * title can't collide. The id — not the name — is what the manifest keys on.
 */
function workingTxtPathFor(displayName: string, jobId: string): string {
    const stem = sanitizeFilename(displayName.replace(/\.txt$/i, "")) || "chapter";
    return path.join(WORKING_TXT_DIR, `${stem}__${jobId.slice(0, 8)}.txt`);
}

/**
 * Regex-based chapter splitting (Ebook Loader's Regex Split mode): split
 * monolithic text into chapters *in memory* and return a preview. No files
 * are written until the user commits via `handleAddToList`.
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
            const jobId = crypto.randomUUID();
            const filePath = workingTxtPathFor(chapter.filename, jobId);
            fs.writeFileSync(filePath, chapter.content, "utf8");
            const metadata = analyzeMetadata(chapter.filename);
            recordJobCreated({
                jobId,
                filename: chapter.filename,
                workingTxtPath: filePath,
                wordcount: chapter.wordcount,
                metadata,
            });
            // The job id doubles as the queue key: two chapters may legitimately
            // share a title, and rows must still be addressable one by one.
            return new FileDataClass(jobId, jobId, chapter.filename, filePath, chapter.wordcount, metadata);
        });
        emitAddToList(fileList);
        return { success: true };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
};

/**
 * Files dragged straight into the queue: copy their content into the same
 * working area Ebook Loader uses, so every queued job is an app-owned copy
 * and conversion/edit logic never has to special-case "the user's original
 * file" vs "a chapter we generated".
 */
export const handleImportDroppedFiles = async (
    _event: unknown,
    incoming: { filename: string; content: string }[]
): Promise<{ success: boolean; files?: FileData[]; error?: string }> => {
    try {
        createDirIfNeeded(WORKING_TXT_DIR);
        const fileList: FileData[] = incoming.map((item) => {
            const candidate = `${sanitizeFilename(item.filename.replace(/\.txt$/i, "")) || "untitled"}.txt`;
            const jobId = crypto.randomUUID();
            const filePath = workingTxtPathFor(candidate, jobId);
            fs.writeFileSync(filePath, item.content, "utf8");
            const wordcount = wordsCount(item.content);
            const metadata = analyzeMetadata(candidate);
            recordJobCreated({ jobId, filename: candidate, workingTxtPath: filePath, wordcount, metadata });
            return new FileDataClass(jobId, jobId, candidate, filePath, wordcount, metadata);
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
        const wordcount = wordsCount(content);
        recordWordcountByPath(filePath, wordcount);
        return { success: true, wordcount };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
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
