<template>
    <div class="flex h-screen w-screen bg-zinc-800 gap-4 gap-maker">
        <div class="flex flex-col w-full gap-4 h-screen gap-maker">
            <a-card class="w-full h-18" :title="t('VOICETESTER_TestingProgressCardTitle')">
                <div class="flex flex-col gap-2">
                    <a-progress :percent="totalVoices == 0 ? 0 : testedVoices / totalVoices" :show-text="false" :status="testStatus" />
                    <div class="flex justify-between">
                        <span>{{ t(testStatus == "normal" ? "VOICETESTER_TestStatusTextInProgress" : "VOICETESTER_TestStatusTextFinished") }}{{ currentVoice }}</span>
                        <span>{{ testedVoices }} / {{ totalVoices }}</span>
                    </div>
                </div>
            </a-card>
            <a-card class="w-full grow" :title="t('VOICETESTER_AvailableVoicesCardTitle')" ref="availableVoicesCardWrapper" :style="{ height: `${availableVoicesCardWrapperHeight - 100}px` }">
                <a-scrollbar :style="{ height: `${availableVoicesCardWrapperHeight - 180}px`, overflow: 'auto' }">
                    <div class="flex flex-col gap-1">
                        <p v-for="voice in availableVoices">{{ voice }}</p>
                    </div>
                </a-scrollbar>
            </a-card>

            <a-button-group class="justify-end gap-2">
                <a-button type="secondary" @click="downloadArrayAsJSON" :disabled="availableVoices.length == 0">{{ t('VOICETESTER_ButtonDownloadAsJSON')}}</a-button>
                <a-button type="primary" @click="startVoiceTest">{{ t('VOICETESTER_ButtonStart')}}</a-button>
            </a-button-group>
        </div>
    </div>
</template>


<script setup lang="ts">

import { ref, onMounted, watchEffect } from 'vue';
import { ipcRenderer } from 'electron';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();

const availableVoices = ref<string[]>([])
const currentVoice = ref<string>('')
const testedVoices = ref<number>(0)
const totalVoices = ref<number>(0)
const testStatus = ref<"normal" | "success" | "warning" | "danger">("normal")

const startVoiceTest = () => {
    ipcRenderer.send("voice-test-start")
}

// Update test progress via ws messages
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (event) => {
    const res = JSON.parse(event.data);
    switch (res.type) {
        case "voice-test-progress":
            currentVoice.value = res.voice;
            testedVoices.value = res.testedVoices;
            totalVoices.value = res.totalVoices;
            break;
        case "voice-test-success":
            availableVoices.value.push(res.voice);
            break;
        case "voice-test-end":
            currentVoice.value = '';
            testStatus.value = 'success'
            testedVoices.value = res.testedVoices;
            totalVoices.value = res.totalVoices;
            break;
        default:
            break;
    }
}

// Card will activate scrollbar once reach maximum height possible to allocate.
const availableVoicesCardWrapper = ref<HTMLElement | null>(null);
const availableVoicesCardWrapperHeight = ref(0);
onMounted(() => {
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    if (availableVoicesCardWrapper.value) {
        resizeObserver.observe(document.body);
    }
    watchEffect((onInvalidate) => {
        onInvalidate(() => {
            if (availableVoicesCardWrapper.value) {
                resizeObserver.unobserve(availableVoicesCardWrapper.value);
            }
        });
    });
});
const updateHeight = () => {
    if (availableVoicesCardWrapper.value) {
        availableVoicesCardWrapperHeight.value = window.innerHeight - 100
    }
};

const downloadArrayAsJSON = () => {
    // Convert the array to a JSON string
    const jsonString = JSON.stringify(availableVoices.value);

    // Create a Blob from the JSON string
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Create an anchor element and set the URL to the blob
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'availableVoices.json'; // Name of the downloaded file

    // Append the anchor to the document, trigger the download, and then remove it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

</script>