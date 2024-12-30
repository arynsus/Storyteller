import { randomBytes } from "crypto";
import WebSocket from "ws";
import fs from "fs";
import { wss } from "./utils";

interface Executor {
    resolve: (value: Buffer) => void;
    reject: (reason?: any) => void;
}

class Service {
    private ws: WebSocket | null = null;
    private executorMap = new Map<string, Executor>();
    private bufferMap = new Map<string, Buffer>();
    private timer: NodeJS.Timeout | null = null;

    constructor() {
        this.handleClose = this.handleClose.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleTextMessage = this.handleTextMessage.bind(this);
        this.handleBinaryMessage = this.handleBinaryMessage.bind(this);
    }

    async connect(): Promise<WebSocket> {
        const connectionId = randomBytes(16).toString("hex").toLowerCase();
        const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`;
        const ws = new WebSocket(url, {
            host: "speech.platform.bing.com",
            origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.66 Safari/537.36 Edg/103.0.1264.44",
            },
        });

        return new Promise((resolve, reject) => {
            ws.on("open", () => resolve(ws));
            ws.on("close", this.handleClose);
            ws.on("message", this.handleMessage);
            ws.on("error", reject);
        });
    }

    private handleClose(code: number, reason: string): void {
        console.log(`Connection closed: ${reason} ${code}`);
        this.ws = null;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.executorMap.forEach(executor => executor.reject(`Connection closed: ${reason} ${code}`));
        this.executorMap.clear();
        this.bufferMap.clear();
    }

    private handleMessage(message: WebSocket.Data, isBinary: boolean): void {
        const pattern = /X-RequestId:(?<id>[a-z0-9]*)/;
        if (!isBinary) {
            this.handleTextMessage(message.toString(), pattern);
        } else {
            this.handleBinaryMessage(message as Buffer, pattern);
        }
    }

    private handleTextMessage(data: string, pattern: RegExp): void {
        const matches = data.match(pattern);
        const requestId = matches?.groups?.id;

        if (data.includes("Path:turn.start") && requestId) {
            this.bufferMap.set(requestId, Buffer.from([]));
        } else if (data.includes("Path:turn.end") && requestId) {
            const executor = this.executorMap.get(requestId);
            if (executor) {
                const result = this.bufferMap.get(requestId);
                if (result) {
                    executor.resolve(result);
                    console.log(`Transfer complete: ${requestId}`);
                }
                this.cleanupRequest(requestId);
            }
        }
    }

    private handleBinaryMessage(data: Buffer, pattern: RegExp): void {
        const separator = "Path:audio\r\n";
        const contentIndex = data.indexOf(separator) + separator.length;

        const headers = data.slice(2, contentIndex).toString();
        const matches = headers.match(pattern);
        const requestId = matches?.groups?.id;

        if (requestId) {
            const content = data.slice(contentIndex);
            const buffer = this.bufferMap.get(requestId);
            if (buffer) {
                const newBuffer = Buffer.concat([buffer, content]);
                this.bufferMap.set(requestId, newBuffer);
            }
        }
    }

    async convert(ssml: string, format: string): Promise<Buffer> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log("Connecting to server...");
            this.ws = await this.connect();
            console.log("Connected successfully!");
        }

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

            const configMessage = this.createMessage("speech.config", JSON.stringify(configData));
            this.sendMessage(configMessage, requestId, "Configuration request failed");

            const ssmlMessage = this.createMessage("ssml", ssml, requestId);
            this.sendMessage(ssmlMessage, requestId, "SSML message failed");
        }).then(result => {
            this.resetTimer();
            return result;
        }).catch(error => {
            this.cleanupRequest(requestId);
            throw error;
        });
    }

    private createMessage(path: string, content: string, requestId?: string): string {
        return `X-Timestamp:${new Date().toISOString()}\r\n` +
            (requestId ? `X-RequestId:${requestId}\r\n` : '') +
            `Content-Type:${path === 'ssml' ? 'application/ssml+xml' : 'application/json; charset=utf-8'}\r\n` +
            `Path:${path}\r\n\r\n` +
            content;
    }

    private sendMessage(message: string, requestId: string, errorMessage: string): void {
        if (!this.ws) {
            throw new Error("WebSocket is not initialized");
        }
        this.ws.send(message, error => {
            if (error) {
                this.executorMap.get(requestId)?.reject(`${errorMessage}: ${error}`);
                this.cleanupRequest(requestId);
            }
        });
    }

    private resetTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
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

const service = new Service();

export async function edgeTextToSpeech(text: string): Promise<Buffer> {
    try {
        const format = "audio-24khz-48kbitrate-mono-mp3";

        if (!text) {
            throw new Error("Invalid conversion parameter");
        }

        return await retry(
            async () => {
                return await service.convert(text, format);
            },
            3,
            (index, error) => {
                console.log(`Conversion attempt ${index} failed: ${error}`);
            },
            "Failed to convert text after multiple attempts"
        );
    } catch (error) {
        console.error(`Error occurred: ${error.message}`);
        throw error; // Rethrow the error to let the caller handle it
    }
}

async function retry<T>(
    fn: () => Promise<T>,
    times: number,
    onError?: (attempt: number, error: any) => void,
    errorMessage = "Operation failed after retries"
): Promise<T> {
    for (let i = 0; i < times; i++) {
        try {
            return await fn();
        } catch (error) {
            onError?.(i, error);
            if (i === times - 1) {
                throw new Error(errorMessage);
            }
        }
    }
    throw new Error(errorMessage);
}

// Voice availability tester
export const testVoiceAvailability = async () => {
    const voices = JSON.parse(fs.readFileSync("./voices.json", "utf8"));
    const totalVoices = voices.length;
    let testedVoices = 0;

    for (const voice of voices) {
        console.log(`Testing voice ${voice}`);
        let attempt = 0;
        let success = false;

        // Inform clients about the voice being tested and progress
        const progressMessage = {
            type: "voice-test-progress",
            voice,
            testedVoices,
            totalVoices,
        };
        wss.clients.forEach(client => client.send(JSON.stringify(progressMessage)));

        while (attempt < 3 && !success) {
            try {
                const textToConvert = `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US"><voice name="${voice}"><prosody rate="0%" pitch="0%">This is a test message, the content is irrelevant.</prosody></voice></speak>`;
                await service.convert(textToConvert, "audio-24khz-48kbitrate-mono-mp3");
                success = true;
                wss.clients.forEach(client => client.send(JSON.stringify({ type: "voice-test-success", voice })));
            } catch (error) {
                attempt++;
                if (error.includes("1007")) {
                    attempt = 3;
                } else if (attempt >= 3) {
                    console.error(`Failed to convert voice ${voice} after 3 attempts, check Internet connection.`);
                }
            }
        }
        testedVoices++;
    }
    wss.clients.forEach(client => client.send(JSON.stringify({
        type: "voice-test-end",
        testedVoices,
        totalVoices,
    })));
};