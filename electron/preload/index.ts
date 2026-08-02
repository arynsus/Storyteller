import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
    StorytellerAPI,
    TTSConfig,
    FileData,
    ChapterPreview,
    ConversionEvent,
    VoiceTestEvent,
} from "../../global/types";

// ---------------------------------------------------------------------------
// Typed contextBridge API. The renderer runs with contextIsolation enabled and
// nodeIntegration disabled, so this is the *only* surface it can use to talk to
// the main process. Every channel is explicitly listed here (allow-list).
// ---------------------------------------------------------------------------

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
    const listener = (_event: IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

const api: StorytellerAPI = {
    // request / response
    getConfig: () => ipcRenderer.invoke("get-tts-config"),
    saveConfig: (config: TTSConfig) => ipcRenderer.invoke("save-tts-config", config),
    convertFiles: (files: FileData[], config: TTSConfig) => ipcRenderer.invoke("convert-files", files, config),
    makeChapters: (content: string, pattern: string, flags: string) =>
        ipcRenderer.invoke("make-chapters", content, pattern, flags),
    addToList: (chapters: ChapterPreview[]) => ipcRenderer.invoke("add-to-list", chapters),
    loadEbook: (filePath: string) => ipcRenderer.invoke("load-ebook", filePath),
    importDroppedFiles: (files: { filename: string; content: string }[]) =>
        ipcRenderer.invoke("import-dropped-files", files),
    readFileContent: (path: string) => ipcRenderer.invoke("read-file-content", path),
    writeFileContent: (path: string, content: string) => ipcRenderer.invoke("write-file-content", path, content),
    downloadFile: (path: string) => ipcRenderer.invoke("download-file", path),
    downloadFiles: (paths: string[]) => ipcRenderer.invoke("download-files", paths),
    changeLanguage: (language: string) => ipcRenderer.invoke("change-language", language),
    testVoices: () => ipcRenderer.invoke("test-voices"),
    openWindow: (name: "voice-tester") => ipcRenderer.invoke("open-window", name),

    // history / cache
    listJobs: () => ipcRenderer.invoke("list-jobs"),
    freeJobsCache: (jobIds: string[]) => ipcRenderer.invoke("free-jobs-cache", jobIds),
    deleteJobs: (jobIds: string[]) => ipcRenderer.invoke("delete-jobs", jobIds),
    clearOrphanCache: () => ipcRenderer.invoke("clear-orphan-cache"),
    getCacheInfo: () => ipcRenderer.invoke("get-cache-info"),
    openCacheFolder: () => ipcRenderer.invoke("open-cache-folder"),
    // Synchronous by design: it only builds a URL the main process will serve.
    cacheFileUrl: (filePath: string) => `st-cache://media?p=${encodeURIComponent(filePath)}`,

    // push events
    onConversionEvent: (cb: (event: ConversionEvent) => void) => subscribe("conversion-event", cb),
    onAddToList: (cb: (files: FileData[]) => void) => subscribe("add-to-list", cb),
    onLanguageChange: (cb: (language: string) => void) => subscribe("change-language", cb),
    onVoiceTestEvent: (cb: (event: VoiceTestEvent) => void) => subscribe("voice-test-event", cb),
    onHistoryChanged: (cb: () => void) => subscribe("history-changed", cb),
    onOpenHistory: (cb: () => void) => subscribe("open-history", cb),
};

contextBridge.exposeInMainWorld("storyteller", api);

// ---------------------------------------------------------------------------
// Loading spinner (shown until the Vue app signals it has mounted).
// ---------------------------------------------------------------------------

function domReady(condition: DocumentReadyState[] = ["complete", "interactive"]): Promise<boolean> {
    return new Promise((resolve) => {
        if (condition.includes(document.readyState)) {
            resolve(true);
        } else {
            document.addEventListener("readystatechange", () => {
                if (condition.includes(document.readyState)) {
                    resolve(true);
                }
            });
        }
    });
}

const safeDOM = {
    append(parent: HTMLElement, child: HTMLElement) {
        if (!Array.from(parent.children).find((e) => e === child)) {
            return parent.appendChild(child);
        }
    },
    remove(parent: HTMLElement, child: HTMLElement) {
        if (Array.from(parent.children).find((e) => e === child)) {
            return parent.removeChild(child);
        }
    },
};

function useLoading() {
    const className = "storyteller-loader";
    const styleContent = `
@keyframes storyteller-spin {
  to { transform: rotate(360deg); }
}
.${className} {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 3px solid rgba(124, 108, 255, 0.25);
  border-top-color: #7c6cff;
  animation: storyteller-spin 0.8s linear infinite;
}
.app-loading-wrap {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f1115;
  z-index: 9;
}`;
    const oStyle = document.createElement("style");
    const oDiv = document.createElement("div");

    oStyle.id = "app-loading-style";
    oStyle.innerHTML = styleContent;
    oDiv.className = "app-loading-wrap";
    oDiv.innerHTML = `<div class="${className}"></div>`;

    return {
        appendLoading() {
            safeDOM.append(document.head, oStyle);
            safeDOM.append(document.body, oDiv);
        },
        removeLoading() {
            safeDOM.remove(document.head, oStyle);
            safeDOM.remove(document.body, oDiv);
        },
    };
}

const { appendLoading, removeLoading } = useLoading();
domReady().then(appendLoading);

window.onmessage = (ev) => {
    ev.data.payload === "removeLoading" && removeLoading();
};
