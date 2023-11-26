<template>
    <div class="h-18 w-full">
        <a-card class="w-full h-full">
            <div class="flex gap-5">
                <a-button type="primary" :disabled="!audio" shape="circle" @click="togglePlayPause">
                    <i v-if="isPlaying" class="fa-sharp fa-pause"></i>
                    <i v-else class="fa-sharp fa-play"></i>
                </a-button>
                <div class="timer grow">
                    <a-slider :min="0" :max="duration" :disabled="!audio" :show-tooltip="false" v-model="currentTime" @change="seekAudio"></a-slider>
                    <div class="mt-0.5 text-end">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</div>
                </div>
            </div>
        </a-card>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Button as AButton, Slider as ASlider } from '@arco-design/web-vue';
import { ipcRenderer } from 'electron';
import { useFileListStore } from '../store';

const fileListStore = useFileListStore();
const audio = ref();
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);

watch(() => fileListStore.getSelected, (selectedFile, oldSelectedFile) => {
    if (audio.value) {
        audio.value.removeEventListener('timeupdate', updateProgress);
        audio.value = null;
        currentTime.value = 0
        duration.value  = 0
        isPlaying.value = false
    }
    if (selectedFile?.url) {
        ipcRenderer.send('load-audio', selectedFile.url);
    } else {
        audio.value = null;
        currentTime.value = 0
        duration.value  = 0
        isPlaying.value = false
    }
});

ipcRenderer.on('load-audio-reply', (event, { success, data }) => {
    if (success) {
        const audioBlob = new Blob([new Uint8Array(Buffer.from(data, 'base64'))], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        audio.value = new Audio(audioUrl);
        audio.value.addEventListener('timeupdate', updateProgress);
    }
});

const togglePlayPause = () => {
    if (audio.value.paused) {
        audio.value.play();
        isPlaying.value = true;
    } else {
        audio.value.pause();
        isPlaying.value = false;
    }
};

const updateProgress = () => {
    currentTime.value = audio.value.currentTime;
    duration.value = audio.value.duration;
};


const seekAudio = (value: number | [number, number]) => {
    // Check if value is a number
    if (typeof value === 'number') {
        audio.value.currentTime = value;
    }
};

const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

</script>

<style>
.fa-play {
    transform: translateX(1px);
}
</style>
