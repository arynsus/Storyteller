import type { StorytellerAPI } from "../global/types";

declare global {
    interface Window {
        storyteller: StorytellerAPI;
    }
}

export {};
