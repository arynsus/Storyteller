<template>
    <div class="flex flex-col h-screen w-screen p-5 gap-4 text-white">
        <header class="flex items-baseline gap-3 shrink-0">
            <h1 class="text-[19px] font-bold tracking-tight">{{ t('VOICETESTER_Title') }}</h1>
            <span class="st-text-3 text-[13px]">{{ t('VOICETESTER_Subtitle') }}</span>
        </header>

        <div class="st-panel shrink-0 p-4 flex flex-col gap-2">
            <div class="st-track" :class="testStatus === 'success' ? 'st-track--done' : ''">
                <span :style="{ width: `${totalVoices === 0 ? 0 : Math.round((testedVoices / totalVoices) * 100)}%` }"></span>
            </div>
            <div class="flex justify-between text-[13px]">
                <span class="st-text-2">
                    {{ testStatus === 'normal' ? t('VOICETESTER_TestStatusTextInProgress') : t('VOICETESTER_TestStatusTextFinished') }}
                    <b>{{ currentVoice }}</b>
                </span>
                <span class="st-text-3 tabular-nums">{{ testedVoices }} / {{ totalVoices }}</span>
            </div>
        </div>

        <div class="st-panel grow flex flex-col min-h-0">
            <div class="st-panel-header">
                <div class="st-panel-title"><i class="fa-sharp fa-light fa-circle-check"></i><span>{{ t('VOICETESTER_AvailableVoicesCardTitle') }}</span></div>
                <span class="st-text-3 text-[13px]">{{ availableVoices.length }}</span>
            </div>
            <div class="grow min-h-0 overflow-y-auto p-2">
                <div v-if="availableVoices.length === 0" class="h-full flex items-center justify-center st-text-3 text-[13px]">
                    {{ t('VOICETESTER_NoResults') }}
                </div>
                <div class="grid grid-cols-2 gap-1">
                    <p v-for="voice in availableVoices" :key="voice" class="st-voice">{{ voice }}</p>
                </div>
            </div>
        </div>

        <div class="flex justify-end gap-2 shrink-0">
            <a-button :disabled="availableVoices.length === 0" @click="downloadArrayAsJSON">{{ t('VOICETESTER_ButtonDownloadAsJSON') }}</a-button>
            <a-button type="primary" @click="startVoiceTest">
                <template #icon><i class="fa-sharp fa-solid fa-play"></i></template>
                {{ t('VOICETESTER_ButtonStart') }}
            </a-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { VoiceTestEvent } from "../../global/types";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const availableVoices = ref<string[]>([]);
const currentVoice = ref("");
const testedVoices = ref(0);
const totalVoices = ref(0);
const testStatus = ref<"normal" | "success">("normal");

const startVoiceTest = () => {
    availableVoices.value = [];
    testedVoices.value = 0;
    testStatus.value = "normal";
    window.storyteller.testVoices();
};

let unsubscribe: (() => void) | null = null;
onMounted(() => {
    unsubscribe = window.storyteller.onVoiceTestEvent((res: VoiceTestEvent) => {
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
                currentVoice.value = "";
                testStatus.value = "success";
                testedVoices.value = res.testedVoices;
                totalVoices.value = res.totalVoices;
                break;
        }
    });
});
onUnmounted(() => unsubscribe?.());

const downloadArrayAsJSON = () => {
    const blob = new Blob([JSON.stringify(availableVoices.value, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "availableVoices.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};
</script>

<style scoped>
.st-voice {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 8px;
    color: var(--st-text-2);
}
.st-voice:hover {
    background: rgba(255, 255, 255, 0.04);
    color: var(--st-text-1);
}
</style>
