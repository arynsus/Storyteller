import { app, BrowserWindow, shell, ipcMain, Menu, MenuItemConstructorOptions, contextBridge } from 'electron'
import { release } from 'node:os'
import path from 'node:path'
import fs from 'fs';
import { handleFileConversion, AUDIO_OUTPUT_DIR } from "./tts";
import { handleMakeChapters, handleAddToList, handleAudioLoad, handleFileDownload, handleAllFilesDownload, clearDirectory } from "./utils";
import { testVoiceAvailability } from "./edge";
import locales from '../locales'
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
process.env.DIST_ELECTRON = path.join(__dirname, '..')
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
    ? path.join(process.env.DIST_ELECTRON, '../public')
    : process.env.DIST
process.env.LANGUAGE = "en"
const userDataPath = app.getPath("userData");
const configFilePath = path.join(userDataPath, "tts-config.json");


// Disable GPU Acceleration
app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let win: BrowserWindow | null = null
// Here, you can also use other preload
const preload = path.join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = path.join(process.env.DIST, 'index.html')
const isMac = process.platform === 'darwin'

async function changeLanguage(language) {
    if (process.env.LANGUAGE != language) {
        // Update the process.env.LANGUAGE
        process.env.LANGUAGE = language;

        // Load the new language translations
        const locale = locales[language];

        // Rebuild the menu with the new language
        const menuTemplate = getMenuTemplate(locale);
        const menu = Menu.buildFromTemplate(menuTemplate);
        if (win) {
            win.setMenu(menu)
        }

        // Notify all renderer windows about the language change
        const allWindows = BrowserWindow.getAllWindows();
        allWindows.forEach(window => {
            window.webContents.send("change-language", language);
        })
    }
}

function getMenuTemplate(locale) {
    // Build your menu template here using the 'locale' object
    // For example:
    return [
        // { role: 'appMenu' }
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about', label: locale.About },
                { type: 'separator' },
                { role: 'services', label: locale.Services },
                { type: 'separator' },
                { role: 'hide', label: locale.Hide },
                { role: 'hideothers', label: locale.Hideothers },
                { role: 'unhide', label: locale.Unhide },
                { type: 'separator' },
                { role: 'quit', label: locale.Quit }
            ]
        }] : []) as MenuItemConstructorOptions[],
        // { role: 'fileMenu' }
        {
            label: locale.File,
            submenu: [
                {
                    label: locale.ClearOutputCache,
                    click: () => {
                        const removed = clearDirectory(AUDIO_OUTPUT_DIR);
                        win.webContents.send("output-cache-cleared", removed.length)
                    }
                },
                { type: 'separator' },
                isMac ? { role: 'close', label: locale.Close } : { role: 'quit', label: locale.Quit }
            ] as MenuItemConstructorOptions[]
        } as MenuItemConstructorOptions,
        // { role: 'editMenu' }
        {
            label: locale.Edit,
            submenu: [
                { role: 'undo', label: locale.Undo },
                { role: 'redo', label: locale.Redo },
                { type: 'separator' },
                { role: 'cut', label: locale.Cut },
                { role: 'copy', label: locale.Copy },
                { role: 'paste', label: locale.Paste },
                ...(isMac ? [
                    { role: 'pasteAndMatchStyle', label: locale.PasteAndMatchStyle },
                    { role: 'delete', label: locale.Delete },
                    { role: 'selectAll', label: locale.SelectAll },
                    { type: 'separator' },
                    {
                        label: locale.Speech,
                        submenu: [
                            { role: 'startSpeaking', label: locale.StartSpeaking },
                            { role: 'stopSpeaking', label: locale.StopSpeaking }
                        ]
                    }
                ] : [
                    { role: 'delete', label: locale.Delete },
                    { type: 'separator' },
                    { role: 'selectAll', label: locale.SelectAll }
                ])
            ] as MenuItemConstructorOptions[]
        },
        // { role: 'viewMenu' }
        {
            label: locale.View,
            submenu: [
                { role: 'reload', label: locale.Reload },
                { role: 'forceReload', label: locale.ForceReload },
                { role: 'toggleDevTools', label: locale.ToggleDevTools },
                { type: 'separator' },
                { role: 'resetZoom', label: locale.ResetZoom },
                { role: 'zoomIn', label: locale.ZoomIn },
                { role: 'zoomOut', label: locale.ZoomOut },
                { type: 'separator' },
                { role: 'togglefullscreen', label: locale.Togglefullscreen }
            ] as MenuItemConstructorOptions[]
        },
        // { role: 'windowMenu' }
        {
            label: locale.Window,
            submenu: [
                {
                    label: locale.ChapterMaker,
                    click: () => createChapterMakerWindow(),
                },
                {
                    label: locale.VoiceTester,
                    click: () => createVoiceTesterWindow(),
                },
                { type: 'separator' },
                { role: 'minimize', label: locale.Minimize },
                { role: 'zoom', label: locale.Zoom },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front', label: locale.Front },
                    { type: 'separator' },
                    { role: 'window', label: locale.Window }
                ] : [
                    { role: 'close', label: locale.Close }
                ])
            ] as MenuItemConstructorOptions[]
        },
        {
            label: locale.Help,
            submenu: [
                {
                    label: locale.GithubRepo,
                    click: async () => {
                        await shell.openExternal('https://github.com/arynsus/Storyteller')
                    }
                }
            ] as MenuItemConstructorOptions[]
        },
        {
            label: locale.Language,
            submenu: [
                {
                    label: 'English',
                    click: async () => {
                        await changeLanguage("en")
                    }
                },
                {
                    label: '简体中文',
                    click: async () => {
                        await changeLanguage("zh")
                    }
                },
                {
                    label: 'Español',
                    click: async () => {
                        await changeLanguage("es")
                    }
                }
            ] as MenuItemConstructorOptions[]
        }
    ];
}

async function createMainWindow() {
    win = new BrowserWindow({
        title: 'Storyteller',
        width: 1280,
        height: 720,
        minWidth: 1280,
        minHeight: 720,
        icon: path.join(process.env.VITE_PUBLIC, 'favicon.png'),
        webPreferences: {
            preload,
            // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
            // Consider using contextBridge.exposeInMainWorld
            // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    const systemLanguage = app.getLocale();
    process.env.LANGUAGE = systemLanguage.slice(0, 2)
    const menuTemplate = getMenuTemplate(locales[process.env.LANGUAGE]);
    const menu = Menu.buildFromTemplate(menuTemplate);
    if (isMac) {
        Menu.setApplicationMenu(menu)
    }
    win.setMenu(menu)

    if (process.env.VITE_DEV_SERVER_URL) { // electron-vite-vue#298
        win.loadURL(url)
        // Open devTool if the app is not packaged
        win.webContents.openDevTools()
    } else {
        win.loadFile(indexHtml)
    }

    // Test actively push message to the Electron-Renderer
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', new Date().toLocaleString())
    })

    // Make all links open with the browser, not with the application
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) shell.openExternal(url)
        return { action: 'deny' }
    })
    // win.webContents.on('will-navigate', (event, url) => { }) #344
}

async function createChapterMakerWindow() {
    const chapterMakerWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: 'Chapter Maker',
        webPreferences: {
            preload,
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    chapterMakerWindow.setMenu(null)

    if (process.env.VITE_DEV_SERVER_URL) {
        // Load Vue component via URL for development
        chapterMakerWindow.loadURL(`${url}#chapter-maker`);
        chapterMakerWindow.webContents.openDevTools()
    } else {
        // Load Vue component via file for production
        chapterMakerWindow.loadFile(indexHtml, { hash: 'chapter-maker' });
    }
}

async function createVoiceTesterWindow() {
    const voiceTesterWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: 'Voice Tester',
        webPreferences: {
            preload,
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    voiceTesterWindow.setMenu(null)

    if (process.env.VITE_DEV_SERVER_URL) {
        // Load Vue component via URL for development
        voiceTesterWindow.loadURL(`${url}#voice-tester`);
        voiceTesterWindow.webContents.openDevTools()
    } else {
        // Load Vue component via file for production
        voiceTesterWindow.loadFile(indexHtml, { hash: 'voice-tester' });
    }
}

let ttsConfig: TTSConfig;

function loadConfig(): void {
    if (fs.existsSync(configFilePath)) {
        const data = fs.readFileSync(configFilePath, "utf-8");
        ttsConfig = JSON.parse(data) as TTSConfig;
    } else {
        // default config
        ttsConfig = {
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
        saveConfig(ttsConfig);
    }
}

function saveConfig(config: TTSConfig): void {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), "utf-8");
}

app.whenReady().then(() => {
    loadConfig();
    createMainWindow();
});

app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
    if (win) {
        // Focus on the main window if the user tried to open another
        if (win.isMinimized()) win.restore()
        win.focus()
    }
})

app.on('activate', () => {
    const allWindows = BrowserWindow.getAllWindows()
    if (allWindows.length) {
        allWindows[0].focus()
    } else {
        createMainWindow()
    }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
    const childWindow = new BrowserWindow({
        webPreferences: {
            preload,
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        childWindow.loadURL(`${url}#${arg}`)
    } else {
        childWindow.loadFile(indexHtml, { hash: arg })
    }
})

ipcMain.on('convert-files', handleFileConversion);
ipcMain.on('load-audio', handleAudioLoad);
ipcMain.on('download-file', handleFileDownload);
ipcMain.on('download-files', handleAllFilesDownload);
ipcMain.on('make-chapters', handleMakeChapters);
ipcMain.on('add-to-list', (event, files) => handleAddToList(event, files, win));
ipcMain.on('voice-test-start', testVoiceAvailability);
ipcMain.on('change-language', (event, language) => changeLanguage(language));
ipcMain.handle('get-tts-config', () => {
    return ttsConfig;
});

ipcMain.handle('save-tts-config', (event, newConfig: TTSConfig) => {
    ttsConfig = { ...ttsConfig, ...newConfig };
    saveConfig(ttsConfig);
    return ttsConfig;
});