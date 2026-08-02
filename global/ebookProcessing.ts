// global/ebookProcessing.ts
// Pure text-processing pipeline shared by the Ebook Loader main-process parsers
// (final "Add to Queue" pass) and the renderer (instant, IPC-free live preview).
// Ported from Epub2TXT's epub_core.py `process_chapter_text` / `_apply_punctuation` /
// `split_text_into_parts`, minus the find/replace rules step (naive substring/regex
// substitution with no context awareness — omitted rather than ported as-is).

import { EbookProcessOptions, PunctuationMode } from "./types";

export const DEFAULT_EBOOK_PROCESS_OPTIONS: EbookProcessOptions = {
    stripIndentSpaces: true,
    collapseBlankLines: true,
    removeFootnoteMarkers: false,
    normalizePunctuation: "none",
    addTitleHeading: true,
    titleTemplate: "{title}",
    paragraphBlankLines: 1,
    maxCharsPerFile: 0,
};

const FOOTNOTE_RE = /[\[［](\d{1,4})[\]］]/g;
const MULTI_BLANK_RE = /\n{3,}/g;
const INDENT_RE = /^[ \t　]+/gm;
const BLANK_PARA_SPLIT_RE = /\n\s*\n/;

const FULLWIDTH_PAIRS: [string, string][] = [
    [",", "，"],
    [".", "。"],
    ["!", "！"],
    ["?", "？"],
    [":", "："],
    [";", "；"],
    ["(", "（"],
    [")", "）"],
];

function applyPunctuation(text: string, mode: PunctuationMode): string {
    if (mode === "fullwidth") {
        for (const [half, full] of FULLWIDTH_PAIRS) text = text.split(half).join(full);
    } else if (mode === "halfwidth") {
        for (const [half, full] of FULLWIDTH_PAIRS) text = text.split(full).join(half);
    }
    return text;
}

/** Turns a chapter's raw extracted text into its final exportable form (not yet length-split). */
export function processChapterText(rawText: string, title: string, options: EbookProcessOptions): string {
    let text = rawText;

    if (options.removeFootnoteMarkers) text = text.replace(FOOTNOTE_RE, "");
    if (options.stripIndentSpaces) text = text.replace(INDENT_RE, "");

    text = applyPunctuation(text, options.normalizePunctuation);

    if (options.collapseBlankLines) text = text.replace(MULTI_BLANK_RE, "\n\n");

    if (options.paragraphBlankLines !== 1) {
        const sep = "\n".repeat(Math.max(0, options.paragraphBlankLines) + 1);
        const paras = text.split(BLANK_PARA_SPLIT_RE).filter((p) => p.trim().length > 0);
        text = paras.join(sep);
    }

    text = text.replace(/^\n+|\n+$/g, "");

    if (options.addTitleHeading && title) {
        const heading = options.titleTemplate.replace("{title}", title);
        text = text ? `${heading}\n\n${text}` : heading;
    }

    return text;
}

/** Splits text into <= maxChars parts on paragraph boundaries; hard-cuts a single overlong paragraph. */
export function splitTextIntoParts(text: string, maxChars: number): string[] {
    if (maxChars <= 0 || text.length <= maxChars) return [text];

    const paragraphs = text.split("\n\n");
    const parts: string[] = [];
    let current: string[] = [];
    let currentLen = 0;

    for (const p of paragraphs) {
        const pLen = p.length + 2;
        if (current.length && currentLen + pLen > maxChars) {
            parts.push(current.join("\n\n"));
            current = [];
            currentLen = 0;
        }
        if (pLen - 2 > maxChars) {
            for (let i = 0; i < p.length; i += maxChars) parts.push(p.slice(i, i + maxChars));
            continue;
        }
        current.push(p);
        currentLen += pLen;
    }

    if (current.length) parts.push(current.join("\n\n"));

    return parts.length ? parts : [text];
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\r\n\t]/g;

export function sanitizeFilename(name: string, maxLen = 80): string {
    let cleaned = name.replace(ILLEGAL_FILENAME_CHARS, "_").trim().replace(/^[._]+|[._]+$/g, "");
    if (!cleaned) cleaned = "untitled";
    return cleaned.slice(0, maxLen);
}
