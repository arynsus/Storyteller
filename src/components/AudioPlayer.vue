<template>
    <div class="st-panel w-full shrink-0 px-4 py-3">
        <div class="flex items-center gap-4">
            <button class="st-play-btn" :disabled="!audio" @click="togglePlayPause">
                <i v-if="isPlaying" class="fa-sharp fa-solid fa-pause"></i>
                <i v-else class="fa-sharp fa-solid fa-play"></i>
            </button>
            <div class="grow flex flex-col gap-1">
                <a-slider
                    :min="0"
                    :max="duration || 1"
                    :disabled="!audio"
                    :show-tooltip="false"
                    v-model="currentTime"
                    @change="seekAudio"
                />
                <div class="flex justify-between text-[12px] st-text-3 tabular-nums">
                    <span>{{ selectedName || t('AUDIOPLAYER_NoSelection') }}</span>
                    <span>{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useFileListStore } from "../store";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const fileListStore = useFileListStore();
const audio = ref<HTMLAudioElement | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);

const selectedName = computed(() => fileListStore.getSelected?.filename ?? "");

function reset() {
    if (audio.value) {
        audio.value.pause();
        audio.value.removeEventListener("timeupdate", updateProgress);
    }
    audio.value = null;
    currentTime.value = 0;
    duration.value = 0;
    isPlaying.value = false;
}

// Streamed from the main process rather than inlined as base64: an m4b chapter
// can be hundreds of megabytes, and this way seeking doesn't wait on a full read.
watch(
    () => fileListStore.getSelected,
    (selectedFile) => {
        reset();
        if (selectedFile?.url) {
            const el = new Audio(window.storyteller.cacheFileUrl(selectedFile.url));
            el.addEventListener("timeupdate", updateProgress);
            el.addEventListener("loadedmetadata", updateProgress);
            el.addEventListener("ended", () => (isPlaying.value = false));
            audio.value = el;
        }
    }
);

const togglePlayPause = () => {
    if (!audio.value) return;
    if (audio.value.paused) {
        audio.value.play();
        isPlaying.value = true;
    } else {
        audio.value.pause();
        isPlaying.value = false;
    }
};
const updateProgress = () => {
    if (!audio.value) return;
    currentTime.value = audio.value.currentTime;
    duration.value = audio.value.duration || 0;
};
const seekAudio = (value: number | [number, number]) => {
    if (typeof value === "number" && audio.value) {
        audio.value.currentTime = value;
    }
};
const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};
</script>

<style scoped>
.st-play-btn {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    flex-shrink: 0;
    border: none;
    cursor: pointer;
    color: white;
    background: linear-gradient(135deg, var(--st-accent-soft), var(--st-accent-deep));
    box-shadow: 0 6px 16px -6px rgba(124, 108, 255, 0.8);
    transition: transform 0.12s ease, opacity 0.12s ease;
}
.st-play-btn:hover:not(:disabled) {
    transform: scale(1.05);
}
.st-play-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
}
</style>
