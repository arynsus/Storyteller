export interface EdgeTTSConfig {
    voice: string,
    speed: number,
    pitch: number,
    wordsPerSection: number,
    jobConcurrencyLimit: number,
    sectionConcurrencyLimit: number,
    outputFormat: string
}

export interface MetadataConfig {
    bookTitle?: string,
    chapterTitle?: string,
    chapterNumber?: string,
    author?: string,
    coverArt?: string // URL or path to the image file
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
    url?: string;
    metadata?: MetadataConfig;
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
    metadata?: MetadataConfig;

    constructor(
        key: string,
        filename: string,
        path: string,
        wordcount?: number,
        metadata?: MetadataConfig
    ) {
        this.key = key;
        this.filename = filename;
        this.path = path;
        this.wordcount = wordcount || 0;
        this.readyToStart = true;
        this.inQueue = false
        this.splitting = false;
        this.converting = false;
        this.combining = false;
        this.finished = false;
        this.warnings = [];
        this.errors = [];
        this.finishedSections = 0;
        this.totalSections = 1;
        this.selected = false;
        this.metadata = metadata;
    }
}
