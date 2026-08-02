// electron/main/ebook/index.ts
// Ebook Loader: dispatches a file path to the right format parser and returns
// a chapter-preview-ready structure. This is the only new main-process IPC
// surface Ebook Loader needs -- processing and commit reuse the existing pure
// `makeChapters`/`addToList` handlers (see electron/main/utils.ts).
import fs from "fs";
import path from "path";
import { ParsedEbook } from "../../../global/types";
import { parseEpub } from "./epubParser";
import { parseFb2 } from "./fb2Parser";

async function parseTxt(filePath: string): Promise<ParsedEbook> {
    const content = await fs.promises.readFile(filePath, "utf8");
    const title = path.basename(filePath, path.extname(filePath));
    // No structure to derive chapters from -- the renderer falls back to
    // Ebook Loader's regex-based manual splitter on fullText.
    return { format: "txt", title, author: "", chapters: [], fullText: content };
}

export const handleLoadEbook = async (
    _event: unknown,
    filePath: string
): Promise<{ success: boolean; book?: ParsedEbook; error?: string }> => {
    try {
        const lower = filePath.toLowerCase();
        let book: ParsedEbook;
        if (lower.endsWith(".epub")) {
            book = await parseEpub(filePath);
        } else if (lower.endsWith(".fb2") || lower.endsWith(".fb2.zip") || lower.endsWith(".fbz")) {
            book = await parseFb2(filePath);
        } else if (lower.endsWith(".txt")) {
            book = await parseTxt(filePath);
        } else {
            return { success: false, error: "UNSUPPORTED_FORMAT" };
        }
        return { success: true, book };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
};
