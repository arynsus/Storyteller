import { app, shell } from "electron";
import fs from "fs";
import path from "path";

// Everything Storyteller generates lives under one content_cache folder so
// users can find (and clear) it in a single place, instead of hunting through
// loose folders in the Electron userData root (which also holds Chromium's own
// Blob Storage/Session Storage/etc.).
//
// Layout, all keyed by a job's UUID so the History tab can always say which
// bytes belong to which chapter:
//
//   content_cache/
//     jobs.json                     -- the manifest (see jobs.ts)
//     working_txt/<stem>__<id8>.txt -- app-owned copy of the source text
//     audio_sections/<jobId>/N.mp3  -- per-section audio, deleted once combined
//     cover_arts/<jobId>.jpg        -- normalized cover, embedded then kept for display
//     audio_output/<name>_<id>.m4b  -- the finished audiobook chapter
const USER_DATA_PATH = app.getPath("userData");
export const CONTENT_CACHE_DIR = path.join(USER_DATA_PATH, "content_cache");
export const WORKING_TXT_DIR = path.join(CONTENT_CACHE_DIR, "working_txt");
export const AUDIO_SECTIONS_DIR = path.join(CONTENT_CACHE_DIR, "audio_sections");
export const COVER_ART_DIR = path.join(CONTENT_CACHE_DIR, "cover_arts");
export const AUDIO_OUTPUT_DIR = path.join(CONTENT_CACHE_DIR, "audio_output");
export const JOBS_MANIFEST_PATH = path.join(CONTENT_CACHE_DIR, "jobs.json");

export const createDirIfNeeded = (dirPath: string): void => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
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

/** Size of a single file, or 0 if it's missing/unreadable. */
export const fileSize = (filePath?: string): number => {
    if (!filePath) return 0;
    try {
        const stat = fs.statSync(filePath);
        return stat.isDirectory() ? getDirectoryInfo(filePath).size : stat.size;
    } catch {
        return 0;
    }
};

export const pathExists = (filePath?: string): boolean => {
    if (!filePath) return false;
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
};

/**
 * Delete a file or directory, preferring the OS trash so a misclick in History
 * is recoverable. Some systems (headless Linux, network drives) have no trash;
 * fall back to a hard delete there rather than silently keeping the bytes.
 * Returns the bytes freed.
 */
export const removeToTrash = async (targetPath?: string): Promise<number> => {
    if (!targetPath || !pathExists(targetPath)) return 0;
    const bytes = fileSize(targetPath);
    try {
        await shell.trashItem(targetPath);
    } catch {
        try {
            await fs.promises.rm(targetPath, { recursive: true, force: true });
        } catch (err) {
            console.error(`Error deleting ${targetPath}:`, err);
            return 0;
        }
    }
    return bytes;
};

/** Recursively lists every file path under a directory. */
export const listFilesRecursive = (dirPath: string): string[] => {
    const found: string[] = [];
    try {
        if (!fs.existsSync(dirPath)) return found;
        for (const entry of fs.readdirSync(dirPath)) {
            const entryPath = path.join(dirPath, entry);
            const stat = fs.statSync(entryPath);
            if (stat.isDirectory()) {
                found.push(...listFilesRecursive(entryPath));
            } else if (stat.isFile()) {
                found.push(entryPath);
            }
        }
    } catch (err) {
        console.error(`Error listing directory ${dirPath}:`, err);
    }
    return found;
};

export function sanitizeFilename(name: string): string {
    return name.replace(/[\/\\:*?"<>|]/g, "").trim() || "chapter";
}
