import fs from "fs";
import path from "path";
import type {
    CacheInfo,
    ChapterTTSFields,
    HistorySnapshot,
    JobEntry,
    JobRecord,
    MetadataConfig,
} from "../../global/types";
import {
    AUDIO_OUTPUT_DIR,
    AUDIO_SECTIONS_DIR,
    CONTENT_CACHE_DIR,
    COVER_ART_DIR,
    JOBS_MANIFEST_PATH,
    WORKING_TXT_DIR,
    createDirIfNeeded,
    fileSize,
    getDirectoryInfo,
    listFilesRecursive,
    pathExists,
    removeToTrash,
} from "./paths";
import { emitHistoryChanged } from "./emitter";

// ---------------------------------------------------------------------------
// The job manifest: Storyteller's memory of every chapter it has converted.
//
// The renderer's queue is per-session Pinia state and the cache directories are
// just loose bytes, so without this file a restarted app has no idea that
// `audio_output/Dune_3_Arrakis_9f2c….m4b` is chapter 3 of Dune, which voice
// read it, or which working text it came from. History reads this; the cache
// directories are treated as derived data that this file explains.
// ---------------------------------------------------------------------------

let records: JobRecord[] = [];
let loaded = false;

/**
 * Jobs converting right now, in this session. Owned here (rather than in tts.ts)
 * so deletion can refuse to pull files out from under a running conversion.
 */
export const activeJobIds = new Set<string>();

/** Everything under content_cache except the manifest itself — i.e. the bytes
 *  History can actually account for and act on. */
const CACHE_CONTENT_DIRS = [WORKING_TXT_DIR, AUDIO_SECTIONS_DIR, COVER_ART_DIR, AUDIO_OUTPUT_DIR];

function readManifest(): JobRecord[] {
    try {
        if (!fs.existsSync(JOBS_MANIFEST_PATH)) return [];
        const parsed = JSON.parse(fs.readFileSync(JOBS_MANIFEST_PATH, "utf8"));
        if (!Array.isArray(parsed?.jobs)) return [];
        return parsed.jobs.filter((job: JobRecord) => job && typeof job.jobId === "string");
    } catch (err) {
        console.error("Error reading job manifest:", err);
        return [];
    }
}

// Write to a sibling temp file and rename over the original: a crash mid-write
// then costs the newest record instead of the entire history.
function writeManifest(): void {
    try {
        createDirIfNeeded(CONTENT_CACHE_DIR);
        const tempPath = `${JOBS_MANIFEST_PATH}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify({ version: 1, jobs: records }, null, 2), "utf8");
        fs.renameSync(tempPath, JOBS_MANIFEST_PATH);
    } catch (err) {
        console.error("Error writing job manifest:", err);
    }
}

// Conversion updates records on every section batch; coalesce the writes.
let saveTimer: NodeJS.Timeout | null = null;
function save(options: { notify?: boolean } = {}): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        writeManifest();
    }, 300);
    if (options.notify !== false) emitHistoryChanged();
}

/** Flush any pending manifest write (called on quit). */
export function flushJobs(): void {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (loaded) writeManifest();
}

/**
 * Load the manifest and reconcile it with what's actually on disk:
 *   - jobs left "converting" by a crash or quit become failed-but-resumable,
 *   - finished audio with no record (pre-History outputs) is adopted so the
 *     user's existing library shows up instead of looking like orphan junk,
 *   - records that no longer point at anything are dropped.
 */
export function loadJobs(): void {
    records = readManifest();

    for (const record of records) {
        if (record.status === "converting") {
            record.status = "failed";
            record.error = record.error ?? "INTERRUPTED";
        }
    }

    adoptStrayOutputs();

    records = records.filter((record) => {
        if (pathExists(record.outputPath)) return true;
        if (pathExists(record.workingTxtPath)) return true;
        if (pathExists(record.sectionsDir)) return true;
        // Nothing of this job survives on disk; a "complete" record whose audio
        // the user deleted outside the app would otherwise linger forever.
        return false;
    });

    loaded = true;
    writeManifest();
}

/** Audio files under audio_output that no record claims — adopt them as recovered jobs. */
function adoptStrayOutputs(): void {
    const claimed = new Set(records.map((record) => record.outputPath).filter(Boolean) as string[]);
    for (const filePath of listFilesRecursive(AUDIO_OUTPUT_DIR)) {
        if (claimed.has(filePath)) continue;
        const base = path.basename(filePath, path.extname(filePath));
        // Outputs are named `<book>_<number>_<title>_<uuid>`; drop the uuid tail.
        const withoutId = base.replace(/_[0-9a-f-]{36}$/i, "");
        let createdAt = Date.now();
        try {
            createdAt = fs.statSync(filePath).mtimeMs;
        } catch {
            /* keep the default */
        }
        records.push({
            jobId: `recovered-${base}`,
            filename: `${withoutId}.txt`,
            status: "complete",
            createdAt,
            completedAt: createdAt,
            metadata: { chapterTitle: withoutId },
            wordcount: 0,
            outputPath: filePath,
            outputBytes: fileSize(filePath),
            recovered: true,
        });
    }
}

function find(jobId: string): JobRecord | undefined {
    return records.find((record) => record.jobId === jobId);
}

// ---------------------------------------------------------------------------
// Lifecycle hooks, called as a chapter moves through the app
// ---------------------------------------------------------------------------

/** A chapter entered the queue: it now owns a working-text file worth tracking. */
export function recordJobCreated(input: {
    jobId: string;
    filename: string;
    workingTxtPath: string;
    wordcount: number;
    metadata: MetadataConfig;
}): void {
    records.push({
        jobId: input.jobId,
        filename: input.filename,
        status: "pending",
        createdAt: Date.now(),
        metadata: input.metadata,
        wordcount: input.wordcount,
        workingTxtPath: input.workingTxtPath,
    });
    save();
}

/** Conversion started: snapshot the settings and metadata it's actually running with. */
export function recordJobStarted(input: {
    jobId: string;
    filename: string;
    workingTxtPath: string;
    sectionsDir: string;
    wordcount: number;
    metadata: MetadataConfig;
    ttsConfig: ChapterTTSFields;
}): void {
    let record = find(input.jobId);
    if (!record) {
        record = {
            jobId: input.jobId,
            filename: input.filename,
            status: "pending",
            createdAt: Date.now(),
            metadata: input.metadata,
            wordcount: input.wordcount,
        };
        records.push(record);
    }
    record.filename = input.filename;
    record.status = "converting";
    record.metadata = input.metadata;
    record.ttsConfig = input.ttsConfig;
    record.wordcount = input.wordcount;
    record.workingTxtPath = input.workingTxtPath;
    record.sectionsDir = input.sectionsDir;
    record.error = undefined;
    activeJobIds.add(input.jobId);
    save();
}

export function recordCoverArt(jobId: string, coverArtPath: string): void {
    const record = find(jobId);
    if (!record) return;
    record.coverArtPath = coverArtPath;
    save({ notify: false });
}

export function recordJobComplete(jobId: string, outputPath: string, durationSec?: number): void {
    const record = find(jobId);
    activeJobIds.delete(jobId);
    if (!record) return;
    // Re-converting a chapter writes a new file (the name carries a fresh uuid).
    // Bin the superseded one instead of leaving it behind as untracked bytes.
    if (record.outputPath && path.resolve(record.outputPath) !== path.resolve(outputPath)) {
        void removeToTrash(record.outputPath);
    }
    record.status = "complete";
    record.completedAt = Date.now();
    record.outputPath = outputPath;
    record.outputBytes = fileSize(outputPath);
    record.durationSec = durationSec;
    record.error = undefined;
    save();
}

export function recordJobFailed(jobId: string, error: string): void {
    const record = find(jobId);
    activeJobIds.delete(jobId);
    if (!record) return;
    // A failed re-run shouldn't demote a chapter whose audio is still sitting
    // there (e.g. re-converting after its source text was cleared): the file on
    // disk, not this run's outcome, decides whether the job counts as done.
    record.status = pathExists(record.outputPath) ? "complete" : "failed";
    record.error = error;
    save();
}

/** The user edited a chapter's text in the content editor, so its word count is stale. */
export function recordWordcountByPath(workingTxtPath: string, wordcount: number): void {
    const resolved = path.resolve(workingTxtPath);
    const record = records.find((r) => r.workingTxtPath && path.resolve(r.workingTxtPath) === resolved);
    if (!record) return;
    record.wordcount = wordcount;
    save({ notify: false });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every cache file a record claims — used to tell owned bytes from orphans. */
function claimedPaths(): Set<string> {
    const claimed = new Set<string>();
    for (const record of records) {
        for (const candidate of [record.workingTxtPath, record.coverArtPath, record.outputPath]) {
            if (candidate) claimed.add(path.resolve(candidate));
        }
        if (record.sectionsDir) {
            for (const filePath of listFilesRecursive(record.sectionsDir)) {
                claimed.add(path.resolve(filePath));
            }
        }
    }
    return claimed;
}

function toEntry(record: JobRecord): JobEntry {
    const reclaimableBytes =
        fileSize(record.workingTxtPath) + fileSize(record.sectionsDir) + fileSize(record.coverArtPath);
    return {
        ...record,
        hasAudio: pathExists(record.outputPath),
        reclaimableBytes,
        active: activeJobIds.has(record.jobId),
    };
}

export function getSnapshot(): HistorySnapshot {
    const claimed = claimedPaths();
    let orphanBytes = 0;
    let orphanCount = 0;
    for (const dir of CACHE_CONTENT_DIRS) {
        for (const filePath of listFilesRecursive(dir)) {
            if (claimed.has(path.resolve(filePath))) continue;
            orphanBytes += fileSize(filePath);
            orphanCount++;
        }
    }

    const jobs = records.map(toEntry).sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
    const totals = getCacheInfo();

    return { jobs, orphans: { bytes: orphanBytes, count: orphanCount }, totals };
}

export function getCacheInfo(): CacheInfo {
    // Sum the content directories rather than the whole folder: jobs.json is
    // bookkeeping the app can never delete, so counting it would inflate both
    // the threshold total and the "clearable" figure with bytes no button frees.
    let size = 0;
    let count = 0;
    for (const dir of CACHE_CONTENT_DIRS) {
        const info = getDirectoryInfo(dir);
        size += info.size;
        count += info.count;
    }
    const claimed = claimedPaths();
    // Reclaimable = everything except finished audio that a record still claims.
    let audioBytes = 0;
    for (const record of records) {
        if (record.outputPath && claimed.has(path.resolve(record.outputPath))) {
            audioBytes += fileSize(record.outputPath);
        }
    }
    return { size, count, reclaimable: Math.max(0, size - audioBytes) };
}

// ---------------------------------------------------------------------------
// Writes driven by the History tab
// ---------------------------------------------------------------------------

/**
 * Drop a job's working files but keep its audio and its record. The job can no
 * longer be re-converted (its source text is gone) — the UI says so before
 * asking for confirmation.
 */
export async function freeJobsCache(jobIds: string[]): Promise<{ freedBytes: number }> {
    let freedBytes = 0;
    for (const jobId of jobIds) {
        const record = find(jobId);
        if (!record || activeJobIds.has(jobId)) continue;
        freedBytes += await removeToTrash(record.workingTxtPath);
        freedBytes += await removeToTrash(record.sectionsDir);
        freedBytes += await removeToTrash(record.coverArtPath);
        record.workingTxtPath = undefined;
        record.sectionsDir = undefined;
        record.coverArtPath = undefined;
    }
    save();
    return { freedBytes };
}

/** Remove jobs entirely — audio included. Running jobs are reported back as skipped. */
export async function deleteJobs(
    jobIds: string[]
): Promise<{ freedBytes: number; deleted: string[]; skipped: string[] }> {
    let freedBytes = 0;
    const deleted: string[] = [];
    const skipped: string[] = [];

    for (const jobId of jobIds) {
        const record = find(jobId);
        if (!record) continue;
        if (activeJobIds.has(jobId)) {
            skipped.push(jobId);
            continue;
        }
        freedBytes += await removeToTrash(record.workingTxtPath);
        freedBytes += await removeToTrash(record.sectionsDir);
        freedBytes += await removeToTrash(record.coverArtPath);
        freedBytes += await removeToTrash(record.outputPath);
        deleted.push(jobId);
    }

    const removedSet = new Set(deleted);
    records = records.filter((record) => !removedSet.has(record.jobId));
    save();
    return { freedBytes, deleted, skipped };
}

/** Delete cache files that no record claims. */
export async function clearOrphanCache(): Promise<{ freedBytes: number; removed: number }> {
    const claimed = claimedPaths();
    let freedBytes = 0;
    let removed = 0;
    for (const dir of CACHE_CONTENT_DIRS) {
        for (const filePath of listFilesRecursive(dir)) {
            if (claimed.has(path.resolve(filePath))) continue;
            const bytes = await removeToTrash(filePath);
            // removeToTrash reports 0 for both "wasn't there" and "couldn't
            // delete", so confirm against disk before claiming it's gone.
            if (!pathExists(filePath)) removed++;
            freedBytes += bytes;
        }
    }
    // Section folders left behind by the files we just removed.
    try {
        for (const entry of fs.existsSync(AUDIO_SECTIONS_DIR) ? fs.readdirSync(AUDIO_SECTIONS_DIR) : []) {
            const dirPath = path.join(AUDIO_SECTIONS_DIR, entry);
            if (fs.statSync(dirPath).isDirectory() && fs.readdirSync(dirPath).length === 0) {
                fs.rmdirSync(dirPath);
            }
        }
    } catch (err) {
        console.error("Error pruning empty section folders:", err);
    }
    save();
    return { freedBytes, removed };
}
