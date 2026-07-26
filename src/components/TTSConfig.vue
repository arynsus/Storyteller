<template>
    <div class="st-panel">
        <div class="st-panel-header cursor-pointer" @click="isOpen = !isOpen">
            <div class="st-panel-title">
                <i class="fa-sharp fa-light fa-waveform-lines"></i>
                <span>{{ t('TTSCONFIG_CardTitle') }}</span>
            </div>
            <i class="fa-sharp fa-light" :class="isOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
        </div>

        <div v-show="isOpen" class="p-4 flex flex-col gap-4">

            <!-- Service -->
            <div>
                <p class="st-label">{{ t('TTSCONFIG_FormLabelSelectTTSService') }}</p>
                <div class="st-seg">
                    <button :class="{ 'is-active': form.service === 'edge' }" @click="setService('edge')">{{ t('TTSCONFIG_OptionEdge') }}</button>
                    <button :class="{ 'is-active': form.service === 'azure' }" @click="setService('azure')">{{ t('TTSCONFIG_OptionAzure') }}</button>
                </div>
            </div>

            <p v-if="form.service === 'azure'" class="st-hint">
                <i class="fa-sharp fa-light fa-circle-info mr-1"></i>{{ t('TTSCONFIG_AzureHint') }}
            </p>

            <!-- Voice -->
            <div>
                <p class="st-label">{{ t('TTSCONFIG_FormLabelVoice') }}</p>
                <a-select v-model="form.voice" :allow-search="true" @change="onChange()">
                    <a-option v-for="voice in voiceList" :key="voice" :value="voice">{{ voice }}</a-option>
                </a-select>
            </div>

            <div>
                <p class="st-label">{{ t('TTSCONFIG_FormLabelPitch') }}</p>
                <a-slider :min="-50" :max="50" show-input :show-tooltip="false" v-model="form.pitch" @change="onChange()" />
            </div>
            <div>
                <p class="st-label">{{ t('TTSCONFIG_FormLabelSpeed') }}</p>
                <a-slider :min="-50" :max="50" show-input :show-tooltip="false" v-model="form.speed" @change="onChange()" />
            </div>
            <div>
                <p class="st-label">{{ t('TTSCONFIG_FormLabelWordsPerSection') }}</p>
                <a-slider :min="100" :max="500" show-input :show-tooltip="false" v-model="form.wordsPerSection" @change="onChange()" />
            </div>
            <div>
                <p class="st-label">{{ t('TTSCONFIG_OutputFormat') }}</p>
                <a-select v-model="form.outputFormat" @change="onChange()">
                    <a-option v-for="fmt in formats" :key="fmt" :value="fmt">{{ fmt }}</a-option>
                </a-select>
            </div>

            <a-button v-if="fileListStore.files.length > 0" long type="primary" @click="applyToTargets">
                {{ applyLabel }}
            </a-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from "vue";
import { useTTSConfigStore, useFileListStore } from "../store";
import { useI18n } from "vue-i18n";
import { ChapterTTSFields } from "../../global/types";
import { edgeVoices, azureVoices } from "../../global/voices";

const { t } = useI18n();
const ttsConfigStore = useTTSConfigStore();
const fileListStore = useFileListStore();
const isOpen = ref(true);

const formats = ["m4b", "mp3", "m4a"];
type ChapterField = keyof ChapterTTSFields;
const chapterFields: ChapterField[] = ["service", "voice", "pitch", "speed", "wordsPerSection", "outputFormat"];

// The editor always represents a single "config to apply" — there is no
// separate default vs. per-chapter distinction. It starts from the last
// persisted values as a convenient baseline, and can be re-seeded from any
// job's own config by clicking that job's TTS status icon in the queue.
const form = reactive<ChapterTTSFields>(pickChapterFields(ttsConfigStore.config));
const loadedFromFilename = ref<string | null>(null);

function pickChapterFields(source: ChapterTTSFields): ChapterTTSFields {
    const result = {} as ChapterTTSFields;
    chapterFields.forEach((f) => ((result as Record<string, unknown>)[f] = source[f]));
    return result;
}

const voiceList = computed(() => (form.service === "azure" ? azureVoices : edgeVoices));

onMounted(async () => {
    await ttsConfigStore.loadConfigFromMain();
    Object.assign(form, pickChapterFields(ttsConfigStore.config));
});

// A job's TTS status icon requests this config be loaded for editing.
watch(
    () => fileListStore.ttsLoadNonce,
    () => {
        const file = fileListStore.ttsLoadKey ? fileListStore.getFileWithKey(fileListStore.ttsLoadKey) : undefined;
        if (file?.ttsConfig) {
            Object.assign(form, file.ttsConfig);
            loadedFromFilename.value = file.filename;
        }
    }
);

function onChange() {
    loadedFromFilename.value = null;
    ttsConfigStore.updateConfig(pickChapterFields(form));
    ttsConfigStore.saveConfigToMain();
}

function setService(service: "edge" | "azure") {
    if (form.service === service) return;
    form.service = service;
    // Reset the voice to a valid one for the new service.
    form.voice = (service === "azure" ? azureVoices : edgeVoices)[0];
    onChange();
}

const applyLabel = computed(() => {
    const n = fileListStore.getChecked.length;
    return n > 0 ? `${t("TTSCONFIG_ApplyToSelected")} (${n})` : t("TTSCONFIG_ApplyToAll");
});

function applyToTargets() {
    fileListStore.applyTtsConfigToTargets(pickChapterFields(form));
}
</script>

<style scoped>
.st-scope {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(124, 108, 255, 0.08);
    border: 1px solid rgba(124, 108, 255, 0.2);
}
.st-scope i {
    color: var(--st-accent-soft);
}
</style>
