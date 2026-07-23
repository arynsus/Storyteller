import { app, BrowserWindow, shell, ipcMain, Menu, MenuItemConstructorOptions } from "electron";
import path from "node:path";
import fs from "fs";
import { handleFileConversion, AUDIO_OUTPUT_DIR } from "./tts";
import {
    handleMakeChapters,
    handleAddToList,
    handleAudioLoad,
    handleFileDownload,
    handleAllFilesDownload,
    clearDirectory,
} from "./utils";
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
                    label: locale.ClearOutputCache,
                    click: () => {
                        const removed = clearDirectory(AUDIO_OUTPUT_DIR);
                        win?.webContents.send("output-cache-cleared", removed.length);
                    },
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
                { label: locale.ChapterMaker, click: () => createChapterMakerWindow() },
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
        {
            label: locale.Language,
            submenu: [
                { label: "English", click: () => changeLanguage("en") },
                { label: "简体中文", click: () => changeLanguage("zh") },
                { label: "Español", click: () => changeLanguage("es") },
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

const createChapterMakerWindow = () => createChildWindow("chapter-maker", "Chapter Maker");
const createVoiceTesterWindow = () => createChildWindow("voice-tester", "Voice Tester");

// ---------------------------------------------------------------------------
// TTS config persistence
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: TTSConfig = {
    service: "edge",
    voice: "zh-CN-XiaoxiaoNeural",
    pitch: 0,
    speed: 0,
    wordsPerSection: 300,
    jobConcurrencyLimit: 1,
    sectionConcurrencyLimit: 1,
    outputFormat: "m4b",
    azureKey: "",
    azureRegion: "",
};

let ttsConfig: TTSConfig = DEFAULT_CONFIG;

function loadConfig(): void {
    try {
        if (fs.existsSync(configFilePath)) {
            ttsConfig = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configFilePath, "utf-8")) };
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
    createMainWindow();
});

app.on("window-all-closed", () => {
    win = null;
    if (process.platform !== "darwin") app.quit();
});

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
ipcMain.handle("load-audio", handleAudioLoad);
ipcMain.handle("download-file", handleFileDownload);
ipcMain.handle("download-files", handleAllFilesDownload);
ipcMain.handle("test-voices", () => testVoiceAvailability());
ipcMain.handle("change-language", (_event, language: string) => changeLanguage(language));
ipcMain.handle("clear-output-cache", () => clearDirectory(AUDIO_OUTPUT_DIR).length);
ipcMain.handle("open-window", (_event, name: "chapter-maker" | "voice-tester") => {
    if (name === "chapter-maker") createChapterMakerWindow();
    else if (name === "voice-tester") createVoiceTesterWindow();
});
