// azure.tts.ts
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

/**
 * Example usage:
 *   const audioData = await azureTextToSpeech({
 *     text: "<speak>Hi from Azure TTS</speak>",
 *     region: "eastus",
 *     subscriptionKey: "YOUR_SPEECH_KEY",
 *     voice: "en-US-AriaNeural",
 *     rate: "0%",
 *     pitch: "0%",
 *   });
 *
 *   // Write Buffer to file
 *   fs.writeFileSync("output.mp3", audioData);
 */

interface AzureTTSOptions {
  text: string;                 // SSML text to convert
  region: string;               // e.g. "eastus"
  subscriptionKey: string;      // your Azure TTS subscription key
  voice: string;                // e.g. "en-US-AriaNeural"
  rate?: string;                // e.g. "0%"
  pitch?: string;               // e.g. "0%"
  format?: string;              // e.g. "audio-24khz-48kbitrate-mono-mp3"
}

export async function azureTextToSpeech(options: AzureTTSOptions): Promise<Buffer> {
  const {
    text,
    region,
    subscriptionKey,
    voice,
    rate = "0%",
    pitch = "0%",
    format = "audio-24khz-48kbitrate-mono-mp3",
  } = options;

  // Endpoint for Azure TTS
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  // Build SSML if user hasn't passed in full <speak> block 
  // (You can skip this if your `text` is already a <speak> block)
  const ssml = text.startsWith("<speak")
    ? text
    : `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
        xmlns:mstts="http://www.w3.org/2001/mstts"
        xml:lang="en-US">
         <voice name="${voice}">
            <prosody rate="${rate}" pitch="${pitch}">
              ${text}
            </prosody>
         </voice>
       </speak>`;

  // Construct the headers
  const headers = {
    "Content-Type": "application/ssml+xml",
    "X-Microsoft-OutputFormat": format,
    "Ocp-Apim-Subscription-Key": subscriptionKey,
    "User-Agent": "my-electron-app", // Or anything describing your app
    "X-RequestId": uuidv4(),
  };

  // Make the POST request
  const response = await axios.post<ArrayBuffer>(url, ssml, {
    headers,
    responseType: "arraybuffer",
  });

  // Return the Buffer of the audio
  return Buffer.from(response.data);
}
