// electron/main/ebook/epubParser.ts
// EPUB parsing: JSZip for the container, fast-xml-parser for the (mostly flat,
// order-insensitive) container.xml/OPF/NCX documents, cheerio for anything that
// needs real DOM traversal in document order (the EPUB3 nav document and each
// chapter's XHTML). Ported from Epub2TXT's `EpubDocument` (epub_core.py).
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
// The "slim" build excludes cheerio's fetch-based `fromURL` helper (and its
// undici dependency), which otherwise crashes Electron's main process: undici
// references the global `File` constructor at import time, and that global
// isn't defined in this Electron/Node build. We never use `fromURL` anyway.
import * as cheerio from "cheerio/slim";
import { EbookChapterRaw, ParsedEbook } from "../../../global/types";

const posix = path.posix;

const BLOCK_TAGS = ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "td", "figcaption"];
const BLOCK_SELECTOR = BLOCK_TAGS.join(",");

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    textNodeName: "#text",
    trimValues: true,
});

interface ChapterEntry {
    index: number;
    title: string;
    href: string;
    anchor: string | null;
    level: number;
}

interface TocEntry {
    title: string;
    href: string;
    level: number;
}

function ensureArray<T>(v: T | T[] | undefined | null): T[] {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
}

function firstText(v: unknown): string {
    const val = Array.isArray(v) ? v[0] : v;
    if (val == null) return "";
    if (typeof val === "string") return val.trim();
    if (typeof val === "object") return String((val as Record<string, unknown>)["#text"] ?? "").trim();
    return String(val).trim();
}

function decodeHref(href: string): string {
    try {
        return decodeURIComponent(href);
    } catch {
        return href;
    }
}

function resolveZipPath(dir: string, href: string): string {
    const joined = dir ? posix.join(dir, href) : href;
    return posix.normalize(joined).replace(/^\/+/, "").replace(/^(\.\.\/)+/, "");
}

function zipDirname(p: string): string {
    const d = posix.dirname(p);
    return d === "." ? "" : d;
}

function splitAnchor(href: string): [string, string] {
    const i = href.indexOf("#");
    return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i + 1)];
}

async function readZipText(zip: JSZip, zipPath: string): Promise<string | null> {
    let file = zip.file(zipPath);
    if (!file) {
        const found = Object.keys(zip.files).find((k) => k.toLowerCase() === zipPath.toLowerCase());
        if (found) file = zip.file(found);
    }
    if (!file) return null;
    return file.async("string");
}

// ---------------------------------------------------------------------------
// TOC parsing (EPUB3 nav document / EPUB2 NCX)
// ---------------------------------------------------------------------------

function walkNavOl($: cheerio.CheerioAPI, $ol: any, level: number, out: TocEntry[], navDir: string): void {
    $ol.children("li").each((_: number, li: any) => {
        const $li = $(li);
        const $a = $li.children("a").first();
        if ($a.length) {
            const href = $a.attr("href") || "";
            const title = $a.text().trim();
            if (href) out.push({ title, href: resolveZipPath(navDir, decodeHref(href)), level });
        }
        const $childOl = $li.children("ol").first();
        if ($childOl.length) walkNavOl($, $childOl, level + 1, out, navDir);
    });
}

function parseNavToc(html: string, navDir: string): TocEntry[] {
    const $ = cheerio.load(html);
    let $nav = $("nav")
        .filter((_, el) => $(el).attr("epub:type") === "toc")
        .first();
    if (!$nav.length) $nav = $("nav").first();
    if (!$nav.length) return [];
    const $ol = $nav.find("ol").first();
    if (!$ol.length) return [];
    const out: TocEntry[] = [];
    walkNavOl($, $ol, 0, out, navDir);
    return out;
}

function walkNcxNavPoints($: cheerio.CheerioAPI, $points: any, level: number, out: TocEntry[], ncxDir: string): void {
    $points.each((_: number, el: any) => {
        const $el = $(el);
        const title = $el.children("navLabel").first().children("text").first().text().trim();
        const src = $el.children("content").first().attr("src") || "";
        if (src) out.push({ title, href: resolveZipPath(ncxDir, decodeHref(src)), level });
        const children = $el.children("navPoint");
        if (children.length) walkNcxNavPoints($, children, level + 1, out, ncxDir);
    });
}

function parseNcxToc(xml: string, ncxDir: string): TocEntry[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const $navMap = $("navMap").first();
    if (!$navMap.length) return [];
    const out: TocEntry[] = [];
    walkNcxNavPoints($, $navMap.children("navPoint"), 0, out, ncxDir);
    return out;
}

// ---------------------------------------------------------------------------
// Chapter HTML -> plain text
// ---------------------------------------------------------------------------

/** Deep-clones each node before mutating it, so the cached document parse is never touched. */
function extractTextFromNodes($: cheerio.CheerioAPI, nodes: any[]): string {
    const paragraphs: string[] = [];
    for (const n of nodes) {
        const $clone = $(n).clone();
        $clone.find("rt, rp, script, style").remove();
        $clone.find("br").each((_, br) => {
            $(br).replaceWith("\n");
        });

        const blocks = $clone.find(BLOCK_SELECTOR);
        let leafs: any;
        if (blocks.length) {
            leafs = blocks.filter((_, b) => $(b).find(BLOCK_SELECTOR).length === 0);
            if (!leafs.length) leafs = $clone;
        } else {
            leafs = $clone;
        }

        leafs.each((_: number, b: any) => {
            const text = $(b).text().trim();
            if (text) paragraphs.push(text);
        });
    }
    return paragraphs.join("\n\n");
}

/** Handles the case where several TOC entries point at anchors inside one shared XHTML file. */
function getChapterRawText($: cheerio.CheerioAPI, chapter: ChapterEntry, allChapters: ChapterEntry[]): string {
    const $body = $("body").first();
    if (!$body.length) return "";
    const bodyEl = $body.get(0);
    const children = $body.children().toArray();

    const siblings = allChapters.filter((c) => c.href === chapter.href);

    let fragmentNodes: any[];
    if (siblings.length <= 1) {
        fragmentNodes = children;
    } else {
        const topIndexForAnchor = (anchor: string | null): number => {
            if (!anchor) return 0;
            const escaped = anchor.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            const tag = $(`[id="${escaped}"]`).first();
            if (!tag.length) return 0;
            let node: any = tag.get(0);
            while (node.parent && node.parent !== bodyEl) node = node.parent;
            const idx = children.indexOf(node);
            return idx === -1 ? 0 : idx;
        };

        const idxMap = siblings.map((c) => ({ c, idx: topIndexForAnchor(c.anchor) }));
        idxMap.sort((a, b) => a.idx - b.idx);

        let start = 0;
        let end = children.length;
        for (let k = 0; k < idxMap.length; k++) {
            if (idxMap[k].c === chapter) {
                start = idxMap[k].idx;
                end = k + 1 < idxMap.length ? idxMap[k + 1].idx : children.length;
                break;
            }
        }
        fragmentNodes = children.slice(start, end);
    }

    return extractTextFromNodes($, fragmentNodes);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function parseEpub(filePath: string): Promise<ParsedEbook> {
    const buffer = await fs.promises.readFile(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const containerXml = await readZipText(zip, "META-INF/container.xml");
    if (!containerXml) throw new Error("Not a valid EPUB: missing META-INF/container.xml");
    const containerDoc = xmlParser.parse(containerXml) as any;
    const rootfileEntry = ensureArray(containerDoc?.container?.rootfiles?.rootfile)[0];
    const opfPath: string | undefined = rootfileEntry?.["@_full-path"];
    if (!opfPath) throw new Error("Not a valid EPUB: no rootfile declared in container.xml");

    const opfDir = zipDirname(opfPath);
    const opfXml = await readZipText(zip, opfPath);
    if (!opfXml) throw new Error("Not a valid EPUB: OPF package file is missing");
    const opfDoc = xmlParser.parse(opfXml) as any;
    const pkg = opfDoc?.package ?? {};

    const metadata = pkg.metadata ?? {};
    const title = firstText(metadata.title) || path.basename(filePath, path.extname(filePath));
    const author = ensureArray(metadata.creator).map(firstText).filter(Boolean).join(", ");

    const manifestItems = ensureArray(pkg?.manifest?.item);
    const manifestById = new Map<string, { href: string; mediaType: string; properties: string }>();
    for (const item of manifestItems) {
        const id = item?.["@_id"];
        const href = item?.["@_href"];
        if (!id || !href) continue;
        manifestById.set(id, {
            href: resolveZipPath(opfDir, decodeHref(href)),
            mediaType: item["@_media-type"] || "",
            properties: item["@_properties"] || "",
        });
    }

    const spineItemRefs = ensureArray(pkg?.spine?.itemref);
    const spineIds: string[] = spineItemRefs.map((r: any) => r?.["@_idref"]).filter(Boolean);
    const tocId: string | undefined = pkg?.spine?.["@_toc"];

    let flat: TocEntry[] = [];

    const navItem = manifestItems.find((it) => (it?.["@_properties"] || "").split(/\s+/).includes("nav"));
    if (navItem) {
        const navHref = resolveZipPath(opfDir, decodeHref(navItem["@_href"]));
        const navHtml = await readZipText(zip, navHref);
        if (navHtml) flat = parseNavToc(navHtml, zipDirname(navHref));
    }
    if (!flat.length && tocId && manifestById.has(tocId)) {
        const ncxHref = manifestById.get(tocId)!.href;
        const ncxXml = await readZipText(zip, ncxHref);
        if (ncxXml) flat = parseNcxToc(ncxXml, zipDirname(ncxHref));
    }

    let chapters: ChapterEntry[];
    if (flat.length) {
        chapters = flat.map((f, i) => {
            const [filePart, anchor] = splitAnchor(f.href);
            return {
                index: i,
                title: (f.title || "").trim() || `Chapter ${i + 1}`,
                href: filePart,
                anchor: anchor || null,
                level: f.level,
            };
        });
    } else {
        chapters = spineIds
            .map((id) => manifestById.get(id))
            .filter((it): it is { href: string; mediaType: string; properties: string } => !!it && /html/i.test(it.mediaType))
            .map((it, i) => ({
                index: i,
                title: path.posix.basename(it.href, path.posix.extname(it.href)) || `Chapter ${i + 1}`,
                href: it.href,
                anchor: null,
                level: 0,
            }));
    }

    const docCache = new Map<string, cheerio.CheerioAPI>();
    const getDoc = async (href: string): Promise<cheerio.CheerioAPI> => {
        const cached = docCache.get(href);
        if (cached) return cached;
        const html = await readZipText(zip, href);
        const $ = cheerio.load(html ?? "<body></body>");
        docCache.set(href, $);
        return $;
    };

    const rawChapters: EbookChapterRaw[] = [];
    for (const chapter of chapters) {
        try {
            const $ = await getDoc(chapter.href);
            const text = getChapterRawText($, chapter, chapters);
            rawChapters.push({ index: chapter.index, title: chapter.title, level: chapter.level, rawText: text });
        } catch (err) {
            rawChapters.push({
                index: chapter.index,
                title: chapter.title,
                level: chapter.level,
                rawText: "",
                warning: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return {
        format: "epub",
        title,
        author,
        chapters: rawChapters,
        fullText: rawChapters.map((c) => c.rawText).join("\n\n"),
    };
}
