import { BrowserWindow } from "electron";
import type { ConversionEvent, VoiceTestEvent, FileData } from "../../global/types";

/**
 * Push a payload to every live renderer. Replaces the old ws://localhost:8080
 * broadcast server: renderers subscribe via the typed preload bridge and filter
 * by the channel they care about.
 */
function broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    }
}

export function emitConversionEvent(event: ConversionEvent): void {
    broadcast("conversion-event", event);
}

export function emitVoiceTestEvent(event: VoiceTestEvent): void {
    broadcast("voice-test-event", event);
}

export function emitError(error: unknown, jobId?: string, filename?: string): void {
    const message = error instanceof Error ? error.message : String(error);
    broadcast("conversion-event", { type: "error", error: message, jobId, filename });
}

export function emitAddToList(files: FileData[]): void {
    broadcast("add-to-list", files);
}

/** The job manifest changed; History should re-read it. */
export function emitHistoryChanged(): void {
    broadcast("history-changed", null);
}
