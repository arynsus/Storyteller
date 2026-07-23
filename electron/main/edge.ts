import { createHash, randomBytes } from "crypto";
import WebSocket from "ws";
import { edgeVoices } from "../../global/voices";
import { emitVoiceTestEvent } from "./emitter";

// `ws` ships no types; alias the runtime instance type to avoid the DOM
// `WebSocket` lib type leaking into annotations.
type WSocket = InstanceType<typeof WebSocket>;

interface Executor {
    resolve: (value: Buffer) => void;
    reject: (reason?: unknown) => void;
}

// Microsoft's public "read aloud" trusted client token (same value edge-tts uses).
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
// Seconds between the Windows epoch (1601-01-01) and the Unix epoch (1970-01-01).
const WINDOWS_EPOCH_OFFSET = 11644473600n;
// Reported Edge/Chromium build. Microsoft REJECTS stale versions with HTTP 403,
// so this must track a current Edge release. Keep it in sync with edge-tts's
// CHROMIUM_FULL_VERSION (https://github.com/rany2/edge-tts) when the free
// endpoint starts returning 403 again.
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const EDGE_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    `Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

// Microsoft validates the token against its own clock. If the local clock is
// off, the handshake is rejected with 403; we then read the server `Date` header
// and correct for the difference on the next attempt (same approach edge-tts uses).
let clockSkewSeconds = 0;

/**
 * Since mid-2024 Microsoft requires a `Sec-MS-GEC` token on every synthesis
 * request; without it the WebSocket handshake is rejected. The token is the
 * uppercase SHA-256 of `<ticks><TrustedClientToken>`, where `ticks` is the
 * current UTC time expressed in Windows file-time units (100 ns since
 * 1601-01-01), rounded down to the nearest five minutes. BigInt keeps the large
 * integer exact.
 */
function generateSecMsGec(): string {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000 + clockSkewSeconds));
    let ticks = nowSeconds + WINDOWS_EPOCH_OFFSET;
    ticks -= ticks % 300n; // round down to a 5-minute boundary
    ticks *= 10_000_000n; // seconds -> 100 ns units
    return createHash("sha256")
        .update(`${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`)
        .digest("hex")
        .toUpperCase();
}

class EdgeTTSService {
    private ws: WSocket | null = null;
    private executorMap = new Map<string, Executor>();
    private bufferMap = new Map<string, Buffer>();
    private timer: NodeJS.Timeout | null = null;
    private connecting: Promise<WSocket> | null = null;

    constructor() {
        this.handleClose = this.handleClose.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
    }

    private buildUrl(): string {
        const connectionId = randomBytes(16).toString("hex").toLowerCase();
        const secMsGec = generateSecMsGec();
        return (
            "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
            `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
            `&Sec-MS-GEC=${secMsGec}` +
            `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
            `&ConnectionId=${connectionId}`
        );
    }

    private async connect(): Promise<WSocket> {
        const ws = new WebSocket(this.buildUrl(), {
            host: "speech.platform.bing.com",
            origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
            headers: {
                "User-Agent": EDGE_USER_AGENT,
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Accept-Language": "en-US,en;q=0.9",
                Pragma: "no-cache",
                "Cache-Control": "no-cache",
                "Sec-WebSocket-Version": "13",
                "Sec-CH-UA": `" Not;A Brand";v="99", "Microsoft Edge";v="${CHROMIUM_MAJOR_VERSION}", "Chromium";v="${CHROMIUM_MAJOR_VERSION}"`,
                "Sec-CH-UA-Mobile": "?0",
                "Sec-CH-UA-Platform": '"Windows"',
            },
        });

        return new Promise<WSocket>((resolve, reject) => {
            const onError = (err: Error) => {
                ws.removeListener("open", onOpen);
                reject(new Error(`Edge TTS connection failed: ${err.message}`));
            };
            const onOpen = () => {
                ws.removeListener("error", onError);
                resolve(ws);
            };
            // A 403 handshake means our token/clock is out of the accepted window.
            // Capture the server's Date header to correct the skew, then let the
            // caller retry with a freshly-generated token.
            const onUnexpected = (_req: unknown, res: { statusCode?: number; headers: Record<string, string | undefined>; destroy: () => void }) => {
                ws.removeListener("open", onOpen);
                ws.removeListener("error", onError);
                const dateHeader = res.headers?.date;
                if (res.statusCode === 403 && dateHeader) {
                    const serverSeconds = Date.parse(dateHeader) / 1000;
                    if (!Number.isNaN(serverSeconds)) {
                        clockSkewSeconds = serverSeconds - Date.now() / 1000;
                    }
                }
                res.destroy();
                reject(new Error(`Edge TTS handshake rejected (HTTP ${res.statusCode ?? "?"}). Retrying with corrected token…`));
            };
            ws.once("open", onOpen);
            ws.once("error", onError);
            ws.once("unexpected-response", onUnexpected);
            ws.on("close", this.handleClose);
            ws.on("message", this.handleMessage);
        });
    }

    private async ensureConnected(): Promise<WSocket> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws;
        if (!this.connecting) {
            this.connecting = this.connect()
                .then((ws) => {
                    this.ws = ws;
                    return ws;
                })
                .finally(() => {
                    this.connecting = null;
                });
        }
        return this.connecting;
    }

    private handleClose(code: number, reason: Buffer): void {
        this.ws = null;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const message = `Connection closed: ${reason?.toString() || ""} ${code}`;
        this.executorMap.forEach((executor) => executor.reject(new Error(message)));
        this.executorMap.clear();
        this.bufferMap.clear();
    }

    private handleMessage(message: Buffer, isBinary: boolean): void {
        const pattern = /X-RequestId:(?<id>[a-z0-9]*)/;
        if (!isBinary) {
            this.handleTextMessage(message.toString(), pattern);
        } else {
            this.handleBinaryMessage(message as Buffer, pattern);
        }
    }

    private handleTextMessage(data: string, pattern: RegExp): void {
        const requestId = data.match(pattern)?.groups?.id;
        if (!requestId) return;

        if (data.includes("Path:turn.start")) {
            this.bufferMap.set(requestId, Buffer.from([]));
        } else if (data.includes("Path:turn.end")) {
            const executor = this.executorMap.get(requestId);
            if (executor) {
                const result = this.bufferMap.get(requestId);
                if (result) executor.resolve(result);
                this.cleanupRequest(requestId);
            }
        }
    }

    private handleBinaryMessage(data: Buffer, pattern: RegExp): void {
        const separator = "Path:audio\r\n";
        const contentIndex = data.indexOf(separator) + separator.length;
        const headers = data.slice(2, contentIndex).toString();
        const requestId = headers.match(pattern)?.groups?.id;
        if (!requestId) return;

        const content = data.slice(contentIndex);
        const buffer = this.bufferMap.get(requestId);
        if (buffer) {
            this.bufferMap.set(requestId, Buffer.concat([buffer, content]));
        }
    }

    async convert(ssml: string, format: string): Promise<Buffer> {
        const ws = await this.ensureConnected();
        const requestId = randomBytes(16).toString("hex").toLowerCase();

        return new Promise<Buffer>((resolve, reject) => {
            this.executorMap.set(requestId, { resolve, reject });

            const configData = {
                context: {
                    synthesis: {
                        audio: {
                            metadataoptions: {
                                sentenceBoundaryEnabled: "false",
                                wordBoundaryEnabled: "false",
                            },
                            outputFormat: format,
                        },
                    },
                },
            };

            this.sendMessage(ws, this.createMessage("speech.config", JSON.stringify(configData)), requestId);
            this.sendMessage(ws, this.createMessage("ssml", ssml, requestId), requestId);
        })
            .then((result) => {
                this.resetTimer();
                return result;
            })
            .catch((error) => {
                this.cleanupRequest(requestId);
                throw error;
            });
    }

    private createMessage(path: string, content: string, requestId?: string): string {
        return (
            `X-Timestamp:${new Date().toISOString()}\r\n` +
            (requestId ? `X-RequestId:${requestId}\r\n` : "") +
            `Content-Type:${path === "ssml" ? "application/ssml+xml" : "application/json; charset=utf-8"}\r\n` +
            `Path:${path}\r\n\r\n` +
            content
        );
    }

    private sendMessage(ws: WSocket, message: string, requestId: string): void {
        ws.send(message, (error?: Error) => {
            if (error) {
                this.executorMap.get(requestId)?.reject(new Error(`Send failed: ${error.message}`));
                this.cleanupRequest(requestId);
            }
        });
    }

    private resetTimer(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.ws?.close();
            this.timer = null;
        }, 10000);
    }

    private cleanupRequest(requestId: string): void {
        this.executorMap.delete(requestId);
        this.bufferMap.delete(requestId);
    }
}

const service = new EdgeTTSService();

async function retry<T>(
    fn: () => Promise<T>,
    times: number,
    onError?: (attempt: number, error: unknown) => void,
    errorMessage = "Operation failed after retries"
): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < times; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            onError?.(i, error);
        }
    }
    throw new Error(`${errorMessage}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function edgeTextToSpeech(ssml: string): Promise<Buffer> {
    if (!ssml) throw new Error("Invalid conversion parameter");
    const format = "audio-24khz-48kbitrate-mono-mp3";
    return retry(
        () => service.convert(ssml, format),
        3,
        (index, error) => console.log(`Edge conversion attempt ${index + 1} failed: ${error}`),
        "Failed to convert text via Edge TTS after multiple attempts"
    );
}

// Voice availability tester (used by the Voice tester window).
export const testVoiceAvailability = async (): Promise<void> => {
    const totalVoices = edgeVoices.length;
    let testedVoices = 0;

    for (const voice of edgeVoices) {
        emitVoiceTestEvent({ type: "voice-test-progress", voice, testedVoices, totalVoices });

        let attempt = 0;
        let success = false;
        while (attempt < 3 && !success) {
            try {
                const ssml =
                    `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" ` +
                    `xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">` +
                    `<voice name="${voice}"><prosody rate="0%" pitch="0%">This is a test message.</prosody></voice></speak>`;
                await service.convert(ssml, "audio-24khz-48kbitrate-mono-mp3");
                success = true;
                emitVoiceTestEvent({ type: "voice-test-success", voice });
            } catch (error) {
                attempt++;
                if (error instanceof Error && error.message.includes("1007")) {
                    attempt = 3; // unsupported voice -> stop retrying
                }
            }
        }
        testedVoices++;
    }

    emitVoiceTestEvent({ type: "voice-test-end", testedVoices, totalVoices });
};
