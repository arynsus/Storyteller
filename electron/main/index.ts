import { app, BrowserWindow, shell, ipcMain, Menu, MenuItemConstructorOptions } from 'electron'
import { release } from 'node:os'
import { join } from 'node:path'
import { handleFileConversion, AUDIO_OUTPUT_DIR } from "./tts";
import { handleMakeChapters, handleAddToList, handleAudioLoad, handleFileDownload, clearDirectory } from "./utils";

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
process.env.DIST_ELECTRON = join(__dirname, '..')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
    ? join(process.env.DIST_ELECTRON, '../public')
    : process.env.DIST

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let win: BrowserWindow | null = null
// Here, you can also use other preload
const preload = join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = join(process.env.DIST, 'index.html')
const isMac = process.platform === 'darwin'

const menu = Menu.buildFromTemplate(
    [
        // { role: 'appMenu' }
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideothers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []) as MenuItemConstructorOptions[],
        // { role: 'fileMenu' }
        {
            label: 'File',
            submenu: [
                {
                    label: 'Clear output cache',
                    click: () => {
                        const removed = clearDirectory(AUDIO_OUTPUT_DIR);
                        win.webContents.send("output-cache-cleared", removed.length)
                    }
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' }
            ] as MenuItemConstructorOptions[]
        },
        // { role: 'editMenu' }
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                ...(isMac ? [
                    { role: 'pasteAndMatchStyle' },
                    { role: 'delete' },
                    { role: 'selectAll' },
                    { type: 'separator' },
                    {
                        label: 'Speech',
                        submenu: [
                            { role: 'startSpeaking' },
                            { role: 'stopSpeaking' }
                        ]
                    }
                ] : [
                    { role: 'delete' },
                    { type: 'separator' },
                    { role: 'selectAll' }
                ]) as MenuItemConstructorOptions[]
            ]
        },
        // { role: 'viewMenu' }
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        // { role: 'windowMenu' }
        {
            label: 'Window',
            submenu: [
                {
                    label: 'Chapter Maker',
                    click: () => createChapterMakerWindow(),
                },
                { type: 'separator' },
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ]) as MenuItemConstructorOptions[]
            ]
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'Github Repo',
                    click: async () => {
                        await shell.openExternal('https://github.com/arynsus/Storyteller')
                    }
                }
            ]
        }
    ])

async function createWindow() {
    win = new BrowserWindow({
        title: 'Storyteller',
        width: 1640,
        height: 900,
        minWidth: 1640,
        minHeight: 900,
        icon: join(process.env.VITE_PUBLIC, 'favicon.png'),
        webPreferences: {
            preload,
            // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
            // Consider using contextBridge.exposeInMainWorld
            // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    win.setMenu(menu);

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

app.whenReady().then(createWindow)

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
        createWindow()
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
ipcMain.on('make-chapters', handleMakeChapters);
ipcMain.on('add-to-list', (event, files) => handleAddToList(event, files, win));

function createChapterMakerWindow() {
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
        chapterMakerWindow.loadURL(`${url}chapter-maker`);
    } else {
        // Load Vue component via file for production
        chapterMakerWindow.loadFile(indexHtml, { hash: 'chapter-maker' });
    }
}