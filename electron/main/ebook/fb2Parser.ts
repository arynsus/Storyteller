// electron/main/ebook/fb2Parser.ts
// FictionBook (.fb2) parsing. No Epub2TXT precedent -- FB2 is a single XML
// document (optionally zipped as .fb2.zip/.fbz), so it's parsed with cheerio
// in XML mode, reusing the same DOM-traversal library as the EPUB parser's
// chapter-HTML extraction rather than introducing a second XML stack.
import fs from "fs";
import path from "path";
import JSZip from "jszip";
// See epubParser.ts for why this imports the "slim" build.
import * as cheerio from "cheerio/slim";
import { EbookChapterRaw, ParsedEbook } from "../../../global/types";

async function readFb2Xml(filePath: string): Promise<string> {
    const buffer = await fs.promises.readFile(filePath);
    // Zipped FB2 (.fb2.zip / .fbz) starts with the PK zip magic regardless of extension.
    if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
        const zip = await JSZip.loadAsync(buffer);
        const entry = Object.keys(zip.files).find((k) => k.toLowerCase().endsWith(".fb2"));
        if (!entry) throw new Error("No .fb2 file found inside the zip archive");
        return zip.file(entry)!.async("string");
    }
    return buffer.toString("utf8");
}

interface FbSection {
    index: number;
    title: string;
    level: number;
    rawText: string;
}

/** Text of this section's own paragraphs, excluding nested <section> children (they become their own entries). */
function extractOwnParagraphs($: cheerio.CheerioAPI, $section: any): string {
    const paragraphs: string[] = [];
    $section.children().each((_: number, el: any) => {
        const $el = $(el);
        if ($el.is("section") || $el.is("title")) return;
        if ($el.is("empty-line")) {
            paragraphs.push("");
            return;
        }
        const text = $el.text().replace(/[ \t]+/g, " ").trim();
        if (text) paragraphs.push(text);
    });
    return paragraphs
        .join("\n\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function sectionTitle($: cheerio.CheerioAPI, $section: any): string {
    const $title = $section.children("title").first();
    if (!$title.length) return "";
    const fromParagraphs = $title
        .find("p")
        .toArray()
        .map((p) => $(p).text().trim())
        .filter(Boolean)
        .join(" ");
    return fromParagraphs || $title.text().replace(/\s+/g, " ").trim();
}

function walkSections($: cheerio.CheerioAPI, $sections: any, level: number, out: FbSection[]): void {
    $sections.each((_: number, el: any) => {
        const $section = $(el);
        out.push({
            index: out.length,
            title: sectionTitle($, $section) || `Chapter ${out.length + 1}`,
            level,
            rawText: extractOwnParagraphs($, $section),
        });
        const nested = $section.children("section");
        if (nested.length) walkSections($, nested, level + 1, out);
    });
}

export async function parseFb2(filePath: string): Promise<ParsedEbook> {
    const xml = await readFb2Xml(filePath);
    const $ = cheerio.load(xml, { xmlMode: true });

    const titleInfo = $("description").first().find("title-info").first();
    const title = titleInfo.children("book-title").first().text().trim() || path.basename(filePath, path.extname(filePath));

    const $authorNode = titleInfo.children("author").first();
    const author = [
        $authorNode.children("first-name").first().text().trim(),
        $authorNode.children("middle-name").first().text().trim(),
        $authorNode.children("last-name").first().text().trim(),
    ]
        .filter(Boolean)
        .join(" ");

    // The main text body has no "name" attribute; footnote/notes bodies carry one (e.g. name="notes").
    const bodies = $("body").toArray();
    const mainBodyEl = bodies.find((b) => !$(b).attr("name")) ?? bodies[0];

    const sections: FbSection[] = [];
    if (mainBodyEl) {
        walkSections($, $(mainBodyEl).children("section"), 0, sections);
    }

    const chapters: EbookChapterRaw[] = sections.map((s) => ({
        index: s.index,
        title: s.title,
        level: s.level,
        rawText: s.rawText,
    }));

    return {
        format: "fb2",
        title,
        author,
        chapters,
        fullText: chapters.map((c) => c.rawText).join("\n\n"),
    };
}
