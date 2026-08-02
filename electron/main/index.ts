import { app, BrowserWindow, shell, ipcMain, Menu, MenuItemConstructorOptions, protocol } from "electron";
import path from "node:path";
import fs from "fs";
import { Readable } from "stream";
import { handleFileConversion } from "./tts";
import {
    handleMakeChapters,
    handleAddToList,
    handleFileDownload,
    handleAllFilesDownload,
    handleImportDroppedFiles,
    handleReadFileContent,
    handleWriteFileContent,
} from "./utils";
import { createDirIfNeeded, CONTENT_CACHE_DIR } from "./paths";
import {
    clearOrphanCache,
    deleteJobs,
    flushJobs,
    freeJobsCache,
    getCacheInfo,
    getSnapshot,
    loadJobs,
} from "./jobs";
import { handleLoadEbook } from "./ebook";
import { testVoiceAvailability } from "./edge";
import locales from "../locales";
import { TTSConfig } from "../../global/types";

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.DIST_ELECTRON = path.join(__dirname, "..");
process.env.DIST = path.join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
    ? path.join(process.env.DIST_ELECTRON, "../public")
    : process.env.DIST;

const DIST = process.env.DIST as string;
const VITE_PUBLIC = process.env.VITE_PUBLIC as string;
process.env.LANGUAGE = "en";

const userDataPath = app.getPath("userData");
const configFilePath = path.join(userDataPath, "tts-config.json");

// Disable GPU Acceleration
app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

// Remove electron security warnings (only shown in development mode).
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

let win: BrowserWindow | null = null;
const preload = path.join(__dirname, "../preload/index.js");
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = path.join(DIST, "index.html");
const isMac = process.platform === "darwin";

// Secure, hardened defaults shared by every window.
const secureWebPreferences = {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
} as const;

async function changeLanguage(language: string): Promise<void> {
    if (process.env.LANGUAGE !== language) {
        process.env.LANGUAGE = language;
        const locale = locales[language as keyof typeof locales];
        const menu = Menu.buildFromTemplate(getMenuTemplate(locale));
        if (isMac) Menu.setApplicationMenu(menu);
        win?.setMenu(menu);
        BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.send("change-language", language);
        });
    }
}

function getMenuTemplate(locale: (typeof locales)[keyof typeof locales]): MenuItemConstructorOptions[] {
    return [
        ...((isMac
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: "about", label: locale.About },
                          { type: "separator" },
                          { role: "services", label: locale.Services },
                          { type: "separator" },
                          { role: "hide", label: locale.Hide },
                          { role: "hideothers", label: locale.Hideothers },
                          { role: "unhide", label: locale.Unhide },
                          { type: "separator" },
                          { role: "quit", label: locale.Quit },
                      ],
                  },
              ]
            : []) as MenuItemConstructorOptions[]),
        {
            label: locale.File,
            submenu: [
                {
                    // Cache is managed per job in History now, so the menu opens
                    // that tab rather than offering a second, blunter clear-all.
                    label: locale.OpenHistory,
                    click: () => win?.webContents.send("open-history"),
                },
                { type: "separator" },
                isMac ? { role: "close", label: locale.Close } : { role: "quit", label: locale.Quit },
            ] as MenuItemConstructorOptions[],
        },
        {
            label: locale.Edit,
            submenu: [
                { role: "undo", label: locale.Undo },
                { role: "redo", label: locale.Redo },
                { type: "separator" },
                { role: "cut", label: locale.Cut },
                { role: "copy", label: locale.Copy },
                { role: "paste", label: locale.Paste },
                ...(isMac
                    ? [
                          { role: "pasteAndMatchStyle", label: locale.PasteAndMatchStyle },
                          { role: "delete", label: locale.Delete },
                          { role: "selectAll", label: locale.SelectAll },
                          { type: "separator" },
                          {
                              label: locale.Speech,
                              submenu: [
                                  { role: "startSpeaking", label: locale.StartSpeaking },
                                  { role: "stopSpeaking", label: locale.StopSpeaking },
                              ],
                          },
                      ]
                    : [
                          { role: "delete", label: locale.Delete },
                          { type: "separator" },
                          { role: "selectAll", label: locale.SelectAll },
                      ]),
            ] as MenuItemConstructorOptions[],
        },
        {
            label: locale.View,
            submenu: [
                { role: "reload", label: locale.Reload },
                { role: "forceReload", label: locale.ForceReload },
                { role: "toggleDevTools", label: locale.ToggleDevTools },
                { type: "separator" },
                { role: "resetZoom", label: locale.ResetZoom },
                { role: "zoomIn", label: locale.ZoomIn },
                { role: "zoomOut", label: locale.ZoomOut },
                { type: "separator" },
                { role: "togglefullscreen", label: locale.Togglefullscreen },
            ] as MenuItemConstructorOptions[],
        },
        {
            label: locale.Window,
            submenu: [
                { label: locale.VoiceTester, click: () => createVoiceTesterWindow() },
                { type: "separator" },
                { role: "minimize", label: locale.Minimize },
                { role: "zoom", label: locale.Zoom },
                ...(isMac
                    ? [
                          { type: "separator" },
                          { role: "front", label: locale.Front },
                          { type: "separator" },
                          { role: "window", label: locale.Window },
                      ]
                    : [{ role: "close", label: locale.Close }]),
            ] as MenuItemConstructorOptions[],
        },
        {
            label: locale.Help,
            submenu: [
                {
                    label: locale.GithubRepo,
                    click: async () => {
                        await shell.openExternal("https://github.com/arynsus/Storyteller");
                    },
                },
            ] as MenuItemConstructorOptions[],
        },
    ];
}

async function createMainWindow(): Promise<void> {
    win = new BrowserWindow({
        title: "Storyteller",
        width: 1280,
        height: 800,
        minWidth: 1120,
        minHeight: 720,
        backgroundColor: "#0f1115",
        icon: path.join(VITE_PUBLIC, "favicon.png"),
        webPreferences: { ...secureWebPreferences },
    });

    const systemLanguage = app.getLocale();
    process.env.LANGUAGE = systemLanguage.slice(0, 2);
    const menu = Menu.buildFromTemplate(
        getMenuTemplate(locales[process.env.LANGUAGE as keyof typeof locales] || locales.en)
    );
    if (isMac) Menu.setApplicationMenu(menu);
    win.setMenu(menu);

    if (url) {
        win.loadURL(url);
        win.webContents.openDevTools();
    } else {
        win.loadFile(indexHtml);
    }

    win.webContents.setWindowOpenHandler(({ url: externalUrl }) => {
        if (externalUrl.startsWith("https:")) shell.openExternal(externalUrl);
        return { action: "deny" };
    });
}

function createChildWindow(hash: string, title: string): void {
    const child = new BrowserWindow({
        width: 900,
        height: 680,
        title,
        backgroundColor: "#0f1115",
        webPreferences: { ...secureWebPreferences },
    });
    child.setMenu(null);
    if (url) {
        child.loadURL(`${url}#${hash}`);
        child.webContents.openDevTools();
    } else {
        child.loadFile(indexHtml, { hash });
    }
}

const createVoiceTesterWindow = () => createChildWindow("voice-tester", "Voice Tester");

// ---------------------------------------------------------------------------
// st-cache:// — streams files out of content_cache to the renderer
//
// A finished audiobook chapter can be hundreds of megabytes, so History (and
// the queue's player) can't inline it as a base64 data URL. This serves the
// file straight off disk with Range support, which is also what lets the user
// drag the scrubber without downloading the whole thing first. Cover art rides
// the same scheme so History can show thumbnails.
// ---------------------------------------------------------------------------

const CACHE_SCHEME = "st-cache";

protocol.registerSchemesAsPrivileged([
    { scheme: CACHE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const MIME_BY_EXTENSION: Record<string, string> = {
    ".m4b": "audio/mp4",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
};

function registerCacheProtocol(): void {
    protocol.handle(CACHE_SCHEME, async (request) => {
        let filePath: string;
        try {
            filePath = path.resolve(decodeURIComponent(new URL(request.url).searchParams.get("p") ?? ""));
        } catch {
            return new Response(null, { status: 400 });
        }

        // Never serve anything outside the app's own cache, whatever the renderer asks for.
        if (!filePath.startsWith(path.resolve(CONTENT_CACHE_DIR) + path.sep)) {
            return new Response(null, { status: 403 });
        }

        let size: number;
        try {
            size = fs.statSync(filePath).size;
        } catch {
            return new Response(null, { status: 404 });
        }

        const contentType = MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
        const rangeHeader = request.headers.get("Range");
        const match = rangeHeader?.match(/bytes=(\d*)-(\d*)/);

        if (match) {
            const start = match[1] ? Number(match[1]) : 0;
            const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
            if (!Number.isFinite(start) || start >= size || end < start) {
                return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
            }
            const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
            return new Response(stream, {
                status: 206,
                headers: {
                    "Content-Type": contentType,
                    "Content-Length": String(end - start + 1),
                    "Content-Range": `bytes ${start}-${end}/${size}`,
                    "Accept-Ranges": "bytes",
                },
            });
        }

        const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
        return new Response(stream, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(size),
                "Accept-Ranges": "bytes",
            },
        });
    });
}

// ---------------------------------------------------------------------------
// TTS config persistence
// ---------------------------------------------------------------------------

/** Pre-History default, when the threshold only counted clearable output. */
const LEGACY_CACHE_THRESHOLD_MB = 50;
/** Now that finished audiobooks count too, the warning is about a large library. */
const DEFAULT_CACHE_THRESHOLD_MB = 5000;

const DEFAULT_CONFIG: TTSConfig = {
    service: "edge",
    voice: "zh-CN-XiaoxiaoNeural",
    pitch: 0,
    speed: 0,
    wordsPerSection: 300,
    jobConcurrencyLimit: 1,
    sectionConcurrencyLimit: 1,
    outputFormat: "m4b",
    cacheClearThresholdMB: DEFAULT_CACHE_THRESHOLD_MB,
    azureKey: "",
    azureRegion: "",
};

let ttsConfig: TTSConfig = DEFAULT_CONFIG;

function loadConfig(): void {
    try {
        if (fs.existsSync(configFilePath)) {
            ttsConfig = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configFilePath, "utf-8")) };
            // The threshold used to measure only clearable output; it now covers
            // the whole cache, including the audiobook library that History keeps
            // permanently. Anyone still on the old 50MB default would be warned
            // constantly, so move that one value (and only that one) forward.
            if (ttsConfig.cacheClearThresholdMB === LEGACY_CACHE_THRESHOLD_MB) {
                ttsConfig.cacheClearThresholdMB = DEFAULT_CACHE_THRESHOLD_MB;
                saveConfig(ttsConfig);
            }
        } else {
            saveConfig(DEFAULT_CONFIG);
        }
    } catch {
        ttsConfig = DEFAULT_CONFIG;
    }
}

function saveConfig(config: TTSConfig): void {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), "utf-8");
}

app.whenReady().then(() => {
    loadConfig();
    loadJobs();
    registerCacheProtocol();
    createMainWindow();
});

app.on("window-all-closed", () => {
    win = null;
    if (process.platform !== "darwin") app.quit();
});

// The manifest writes are debounced; make sure the last one lands on quit.
app.on("before-quit", () => flushJobs());

app.on("second-instance", () => {
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

app.on("activate", () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length) {
        allWindows[0].focus();
    } else {
        createMainWindow();
    }
});

// ---------------------------------------------------------------------------
// IPC handlers (all request/response now use ipcMain.handle)
// ---------------------------------------------------------------------------

ipcMain.handle("get-tts-config", () => ttsConfig);
ipcMain.handle("save-tts-config", (_event, newConfig: TTSConfig) => {
    ttsConfig = { ...ttsConfig, ...newConfig };
    saveConfig(ttsConfig);
    return ttsConfig;
});
ipcMain.handle("convert-files", handleFileConversion);
ipcMain.handle("make-chapters", handleMakeChapters);
ipcMain.handle("add-to-list", handleAddToList);
ipcMain.handle("load-ebook", handleLoadEbook);
ipcMain.handle("import-dropped-files", handleImportDroppedFiles);
ipcMain.handle("read-file-content", handleReadFileContent);
ipcMain.handle("write-file-content", handleWriteFileContent);
ipcMain.handle("download-file", handleFileDownload);
ipcMain.handle("download-files", handleAllFilesDownload);
ipcMain.handle("test-voices", () => testVoiceAvailability());
ipcMain.handle("change-language", (_event, language: string) => changeLanguage(language));
ipcMain.handle("list-jobs", () => getSnapshot());
ipcMain.handle("free-jobs-cache", (_event, jobIds: string[]) => freeJobsCache(jobIds));
ipcMain.handle("delete-jobs", (_event, jobIds: string[]) => deleteJobs(jobIds));
ipcMain.handle("clear-orphan-cache", () => clearOrphanCache());
ipcMain.handle("get-cache-info", () => getCacheInfo());
ipcMain.handle("open-cache-folder", () => {
    createDirIfNeeded(CONTENT_CACHE_DIR);
    shell.openPath(CONTENT_CACHE_DIR);
});
ipcMain.handle("open-window", (_event, name: "voice-tester") => {
    if (name === "voice-tester") createVoiceTesterWindow();
});
