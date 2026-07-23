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
    selected: boolean;
    /** Multi-select flag for bulk apply operations. */
    checked?: boolean;
    url?: string;
    metadata: MetadataConfig;
    /** Per-file overrides layered on top of the global TTS config. */
    ttsConfig?: Partial<TTSConfig>;
    /** Whether this file uses custom (per-chapter) TTS settings. */
    useCustomTts?: boolean;
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
    selected: boolean;
    checked?: boolean;
    metadata: MetadataConfig;
    ttsConfig?: Partial<TTSConfig>;
    useCustomTts?: boolean;

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
        this.selected = false;
        this.checked = false;
        this.metadata = metadata;
        this.useCustomTts = false;
    }
}

/**
 * Merge a file's per-chapter overrides on top of the global config.
 * A file only overrides fields it explicitly sets.
 */
export function resolveEffectiveConfig(global: TTSConfig, file: Pick<FileData, "ttsConfig" | "useCustomTts">): TTSConfig {
    if (!file.useCustomTts || !file.ttsConfig) return global;
    return { ...global, ...file.ttsConfig };
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
    downloadFile(path: string): Promise<{ success: boolean; filename?: string; error?: string }>;
    downloadFiles(paths: string[]): Promise<{ succeeded: number; failed: number }>;
    changeLanguage(language: string): Promise<void>;
    testVoices(): Promise<void>;
    clearOutputCache(): Promise<number>;
    openWindow(name: "chapter-maker" | "voice-tester"): Promise<void>;

    onConversionEvent(cb: (event: ConversionEvent) => void): () => void;
    onAddToList(cb: (files: FileData[]) => void): () => void;
    onLanguageChange(cb: (language: string) => void): () => void;
    onVoiceTestEvent(cb: (event: VoiceTestEvent) => void): () => void;
    onOutputCacheCleared(cb: (removed: number) => void): () => void;
}
