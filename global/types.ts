// global/types.ts
// Shared type definitions used by both the Electron main process and the Vue renderer.

export type TTSService = "edge" | "azure";

export interface TTSConfig {
    // Common
    service: TTSService;
    voice: string;
    pitch: number;
    speed: number;
    wordsPerSection: number;
    jobConcurrencyLimit: number;
    sectionConcurrencyLimit: number;
    outputFormat: string;
    /** Total content-cache size (in MB) above which History flags the cache as large. */
    cacheClearThresholdMB: number;

    // Azure-specific
    azureKey?: string;
    azureRegion?: string;
}

export interface MetadataConfig {
    bookTitle?: string;
    chapterTitle?: string;
    chapterNumber?: string;
    author?: string;
    coverArt?: string; // URL or path to the image file
}

/** The subset of TTSConfig that can be applied per chapter (the rest — Azure
 * credentials, concurrency limits, cache threshold — is infra-level and only
 * edited globally in Settings). */
export type ChapterTTSFields = Pick<
    TTSConfig,
    "service" | "voice" | "pitch" | "speed" | "wordsPerSection" | "outputFormat"
>;

export interface FileData {
    key: string;
    /**
     * Stable per-job identity, minted in the main process when the chapter first
     * enters the queue. Everything this job owns on disk is keyed by it (working
     * text, audio sections, cover art, output) and so is its History record —
     * unlike `filename`, which is only a display label and can repeat.
     */
    jobId: string;
    filename: string;
    path: string;
    wordcount: number;
    readyToStart: boolean;
    inQueue: boolean;
    splitting: boolean;
    converting: boolean;
    combining: boolean;
    finished: boolean;
    warnings: string[];
    finishedSections: number;
    totalSections: number;
    errors: string[];
    /** Multi-select flag: bulk-apply target and the only "selected" concept in the UI. */
    checked?: boolean;
    /** Set once the user edits this chapter's source text via the content editor. */
    contentModified?: boolean;
    url?: string;
    metadata: MetadataConfig;
    /** TTS config applied to this job. Absent means "not configured yet" — the job can't start. */
    ttsConfig?: ChapterTTSFields;
}

export class FileDataClass implements FileData {
    key: string;
    jobId: string;
    filename: string;
    path: string;
    wordcount: number;
    readyToStart: boolean;
    inQueue: boolean;
    splitting: boolean;
    converting: boolean;
    combining: boolean;
    finished: boolean;
    warnings: string[];
    finishedSections: number;
    totalSections: number;
    errors: string[];
    checked?: boolean;
    contentModified?: boolean;
    metadata: MetadataConfig;
    ttsConfig?: ChapterTTSFields;

    constructor(
        key: string,
        jobId: string,
        filename: string,
        path: string,
        wordcount = 0,
        metadata: MetadataConfig = {}
    ) {
        this.key = key;
        this.jobId = jobId;
        this.filename = filename;
        this.path = path;
        this.wordcount = wordcount;
        this.readyToStart = true;
        this.inQueue = false;
        this.splitting = false;
        this.converting = false;
        this.combining = false;
        this.finished = false;
        this.warnings = [];
        this.errors = [];
        this.finishedSections = 0;
        this.totalSections = 1;
        this.checked = false;
        this.metadata = metadata;
    }
}

/**
 * Merge a file's applied per-chapter TTS fields on top of the global config
 * (which still supplies Azure credentials and concurrency limits).
 */
export function resolveEffectiveConfig(global: TTSConfig, file: Pick<FileData, "ttsConfig">): TTSConfig {
    return file.ttsConfig ? { ...global, ...file.ttsConfig } : global;
}

// ---------------------------------------------------------------------------
// IPC event payloads (main -> renderer, pushed via webContents.send)
// ---------------------------------------------------------------------------

/** Events carry `jobId` (the queue row they belong to) plus `filename` for display. */
export type ConversionEvent =
    | { type: "split-start"; jobId: string; filename: string }
    | { type: "split-complete"; jobId: string; filename: string; totalSections: number }
    | { type: "conversion-progress"; jobId: string; filename: string; finishedSections: number; totalSections: number }
    | { type: "combine-start"; jobId: string; filename: string }
    | { type: "combine-complete"; jobId: string; filename: string; url: string }
    | { type: "cover-art-unavailable"; jobId: string; filename: string }
    | { type: "error"; jobId?: string; filename?: string; error: string };

export type VoiceTestEvent =
    | { type: "voice-test-progress"; voice: string; testedVoices: number; totalVoices: number }
    | { type: "voice-test-success"; voice: string }
    | { type: "voice-test-end"; testedVoices: number; totalVoices: number };

// ---------------------------------------------------------------------------
// Regex-based chapter splitting (used by Ebook Loader's Regex Split mode)
// ---------------------------------------------------------------------------

export interface ChapterPreview {
    index: number;
    title: string;
    filename: string;
    wordcount: number;
    charcount: number;
    snippet: string;
    content: string;
    isPreamble?: boolean;
}

export interface MakeChaptersResult {
    chapters: ChapterPreview[];
    matchCount: number;
    error?: string;
}

// ---------------------------------------------------------------------------
// Ebook Loader
// ---------------------------------------------------------------------------

export type EbookFormat = "epub" | "fb2" | "txt";

export interface EbookChapterRaw {
    index: number;
    title: string;
    /** Table-of-contents nesting depth, 0 = top level. */
    level: number;
    rawText: string;
    /** Set when this chapter's text could not be fully extracted; the chapter is still included. */
    warning?: string;
}

export interface ParsedEbook {
    format: EbookFormat;
    title: string;
    author: string;
    /** A usable table of contents has >1 entry. 0 or 1 entries means "no TOC" (fall back to fullText + manual split). */
    chapters: EbookChapterRaw[];
    /** Full extracted plain text, in reading order. Used for regex-based manual splitting when there's no usable TOC. */
    fullText: string;
}

export type PunctuationMode = "none" | "fullwidth" | "halfwidth";

export interface EbookProcessOptions {
    stripIndentSpaces: boolean;
    collapseBlankLines: boolean;
    removeFootnoteMarkers: boolean;
    normalizePunctuation: PunctuationMode;
    addTitleHeading: boolean;
    titleTemplate: string;
    paragraphBlankLines: number;
    /** 0 = do not split by length. */
    maxCharsPerFile: number;
}

// ---------------------------------------------------------------------------
// History / job records
//
// The manifest (content_cache/jobs.json) is the app's memory of every chapter
// it has ever been asked to convert. The Pinia queue is per-session and the
// cache directories are just bytes; this is the only thing that survives a
// restart and knows which bytes belong to which chapter.
// ---------------------------------------------------------------------------

export type JobStatus =
    /** Queued but never started, or its conversion was cancelled before splitting. */
    | "pending"
    /** Actively converting in this session. Demoted to "failed" if the app restarts. */
    | "converting"
    /** Finished; an audio file exists (unless the user later deleted it outside the app). */
    | "complete"
    /** Started and stopped without producing audio (error, crash, or quit mid-run). */
    | "failed";

export interface JobRecord {
    jobId: string;
    /** Display name of the source chapter, as shown in the queue. */
    filename: string;
    status: JobStatus;
    createdAt: number;
    completedAt?: number;
    /** Book-level metadata, snapshotted at conversion time so History stays correct
     *  even after the user edits the sidebar for a later book. */
    metadata: MetadataConfig;
    /** The TTS settings this job actually ran with (absent for never-started jobs). */
    ttsConfig?: ChapterTTSFields;
    wordcount: number;
    /** Working-text copy; cleared by "free cache", which makes the job non-rerunnable. */
    workingTxtPath?: string;
    /** Per-job section directory; only non-empty for interrupted conversions. */
    sectionsDir?: string;
    coverArtPath?: string;
    outputPath?: string;
    /** Size of the finished audio file, cached so History doesn't stat on every render. */
    outputBytes?: number;
    durationSec?: number;
    error?: string;
    /** Set on records reconstructed from stray audio files at startup (pre-History outputs). */
    recovered?: boolean;
}

/** A job plus the on-disk reality behind it, recomputed on every History load. */
export interface JobEntry extends JobRecord {
    /** True when `outputPath` still exists on disk. */
    hasAudio: boolean;
    /** Bytes that "free cache" would reclaim: working text + sections + cover art. */
    reclaimableBytes: number;
    /** Currently converting in this session — deletion is refused. */
    active: boolean;
}

export interface CacheInfo {
    /** Total bytes under content_cache — what the Settings threshold measures. */
    size: number;
    count: number;
    /** Bytes clearable without losing audio: working text, sections, cover art, orphans. */
    reclaimable: number;
}

export interface HistorySnapshot {
    jobs: JobEntry[];
    /** Files under content_cache that no record claims (crashes, manual meddling). */
    orphans: { bytes: number; count: number };
    totals: CacheInfo;
}

// ---------------------------------------------------------------------------
// The typed API exposed to the renderer via contextBridge (window.storyteller)
// ---------------------------------------------------------------------------

export interface StorytellerAPI {
    getConfig(): Promise<TTSConfig>;
    saveConfig(config: TTSConfig): Promise<TTSConfig>;
    convertFiles(files: FileData[], config: TTSConfig): Promise<void>;
    makeChapters(content: string, pattern: string, flags: string): Promise<MakeChaptersResult>;
    addToList(chapters: ChapterPreview[]): Promise<{ success: boolean; error?: string }>;
    /** Parses an EPUB/FB2/txt file on disk (main process — needs Buffer/fs) into a chapter-preview-ready structure. */
    loadEbook(filePath: string): Promise<{ success: boolean; book?: ParsedEbook; error?: string }>;
    /** Copies dropped .txt content into the app's working area and returns queue-ready entries. */
    importDroppedFiles(
        files: { filename: string; content: string }[]
    ): Promise<{ success: boolean; files?: FileData[]; error?: string }>;
    readFileContent(path: string): Promise<{ success: boolean; content?: string; error?: string }>;
    writeFileContent(path: string, content: string): Promise<{ success: boolean; wordcount?: number; error?: string }>;
    downloadFile(path: string): Promise<{ success: boolean; filename?: string; error?: string }>;
    downloadFiles(paths: string[]): Promise<{ succeeded: number; failed: number }>;
    changeLanguage(language: string): Promise<void>;
    testVoices(): Promise<void>;
    openWindow(name: "voice-tester"): Promise<void>;

    // ---- History / cache ----
    listJobs(): Promise<HistorySnapshot>;
    /** Deletes source text, leftover sections and cover art; keeps the audio and the record. */
    freeJobsCache(jobIds: string[]): Promise<{ freedBytes: number }>;
    /** Removes the jobs and everything they own, audio included. Active jobs are skipped. */
    deleteJobs(jobIds: string[]): Promise<{ freedBytes: number; deleted: string[]; skipped: string[] }>;
    /** Deletes cache files no record claims. */
    clearOrphanCache(): Promise<{ freedBytes: number; removed: number }>;
    getCacheInfo(): Promise<CacheInfo>;
    openCacheFolder(): Promise<void>;
    /** Streamable URL for a file inside the content cache — audio `src`, cover `src`. */
    cacheFileUrl(filePath: string): string;

    onConversionEvent(cb: (event: ConversionEvent) => void): () => void;
    onAddToList(cb: (files: FileData[]) => void): () => void;
    onLanguageChange(cb: (language: string) => void): () => void;
    onVoiceTestEvent(cb: (event: VoiceTestEvent) => void): () => void;
    /** The manifest changed in the main process (conversion finished, job deleted, …). */
    onHistoryChanged(cb: () => void): () => void;
    /** The File menu's History entry was clicked. */
    onOpenHistory(cb: () => void): () => void;
}
