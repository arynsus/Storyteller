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
    /** Output cache size (in MB) above which the clear-cache icon flags as full. */
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
        filename: string,
        path: string,
        wordcount = 0,
        metadata: MetadataConfig = {}
    ) {
        this.key = key;
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

export type ConversionEvent =
    | { type: "split-start"; filename: string }
    | { type: "split-complete"; filename: string; totalSections: number }
    | { type: "conversion-progress"; filename: string; finishedSections: number; totalSections: number }
    | { type: "combine-start"; filename: string }
    | { type: "combine-complete"; filename: string; url: string }
    | { type: "cover-art-unavailable"; filename: string }
    | { type: "error"; filename?: string; error: string };

export type VoiceTestEvent =
    | { type: "voice-test-progress"; voice: string; testedVoices: number; totalVoices: number }
    | { type: "voice-test-success"; voice: string }
    | { type: "voice-test-end"; testedVoices: number; totalVoices: number };

// ---------------------------------------------------------------------------
// Chapter Maker
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
// The typed API exposed to the renderer via contextBridge (window.storyteller)
// ---------------------------------------------------------------------------

export interface StorytellerAPI {
    getConfig(): Promise<TTSConfig>;
    saveConfig(config: TTSConfig): Promise<TTSConfig>;
    convertFiles(files: FileData[], config: TTSConfig): Promise<void>;
    makeChapters(content: string, pattern: string, flags: string): Promise<MakeChaptersResult>;
    addToList(chapters: ChapterPreview[]): Promise<{ success: boolean; error?: string }>;
    loadAudio(url: string): Promise<{ success: boolean; dataUrl?: string }>;
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
    clearOutputCache(): Promise<number>;
    getOutputCacheInfo(): Promise<{ size: number; count: number }>;
    openOutputCacheFolder(): Promise<void>;
    openWindow(name: "chapter-maker" | "voice-tester"): Promise<void>;

    onConversionEvent(cb: (event: ConversionEvent) => void): () => void;
    onAddToList(cb: (files: FileData[]) => void): () => void;
    onLanguageChange(cb: (language: string) => void): () => void;
    onVoiceTestEvent(cb: (event: VoiceTestEvent) => void): () => void;
    onOutputCacheCleared(cb: (removed: number) => void): () => void;
}
