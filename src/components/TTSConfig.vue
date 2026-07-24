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
            <!-- Editing scope banner -->
            <div class="st-scope">
                <div class="flex items-center gap-2 min-w-0">
                    <i class="fa-sharp fa-solid" :class="selectedFile ? 'fa-sliders' : 'fa-globe'"></i>
                    <span class="truncate text-[13px]">
                        {{ selectedFile ? t('TTSCONFIG_EditingChapter') : t('TTSCONFIG_EditingDefault') }}
                        <b v-if="selectedFile" class="truncate">{{ selectedFile.filename }}</b>
                    </span>
                </div>
                <a-tooltip v-if="selectedFile && selectedFile.useCustomTts" :content="t('TTSCONFIG_ResetTooltip')">
                    <button class="st-mini-btn" @click="resetToDefault">
                        <i class="fa-sharp fa-light fa-arrow-rotate-left"></i>
                    </button>
                </a-tooltip>
            </div>

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
                <a-select v-model="form.voice" :allow-search="true" @change="onChange('voice')">
                    <a-option v-for="voice in voiceList" :key="voice" :value="voice">{{ voice }}</a-option>
                </a-select>
            </div>

            <div>
                <p class="st-label">{{ t('TTSCONFIG_FormLabelPitch') }}</p>
                <a-slider :min="-50" :max="50" show-input :show-tooltip="false" v-model="form.pitch" @change="onChange('pitch')" />
            </div>
            <div>
                <p class="st-label">{{ t('TTSCONFIG_FormLabelSpeed') }}</p>
                <a-slider :min="-50" :max="50" show-input :show-tooltip="false" v-model="form.speed" @change="onChange('speed')" />
            </div>
            <div>
                <p class="st-label">{{ t('TTSCONFIG_FormLabelWordsPerSection') }}</p>
                <a-slider :min="100" :max="500" show-input :show-tooltip="false" v-model="form.wordsPerSection" @change="onChange('wordsPerSection')" />
            </div>
            <div>
                <p class="st-label">{{ t('TTSCONFIG_OutputFormat') }}</p>
                <a-select v-model="form.outputFormat" @change="onChange('outputFormat')">
                    <a-option v-for="fmt in formats" :key="fmt" :value="fmt">{{ fmt }}</a-option>
                </a-select>
            </div>

            <a-button v-if="fileListStore.files.length > 0" long type="outline" @click="applyToAll">
                <template #icon><i class="fa-sharp fa-light fa-arrow-down-to-line"></i></template>
                {{ applyLabel }}
            </a-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from "vue";
import { useTTSConfigStore, useFileListStore } from "../store";
import { useI18n } from "vue-i18n";
import { TTSConfig } from "../../global/types";
import { edgeVoices, azureVoices } from "../../global/voices";

const { t } = useI18n();
const ttsConfigStore = useTTSConfigStore();
const fileListStore = useFileListStore();
const isOpen = ref(true);

const formats = ["m4b", "mp3", "m4a"];
// Fields overridable per chapter. Azure key/region and concurrency are global
// (edited in the settings modal), so they're excluded here.
type ChapterField = "service" | "voice" | "pitch" | "speed" | "wordsPerSection" | "outputFormat";
const chapterFields: ChapterField[] = ["service", "voice", "pitch", "speed", "wordsPerSection", "outputFormat"];

const form = reactive<TTSConfig>({ ...ttsConfigStore.config });

const selectedFile = computed(() => fileListStore.getSelected);
const voiceList = computed(() => (form.service === "azure" ? azureVoices : edgeVoices));

function loadForm() {
    const base = ttsConfigStore.config;
    const effective = selectedFile.value?.useCustomTts && selectedFile.value.ttsConfig
        ? { ...base, ...selectedFile.value.ttsConfig }
        : base;
    Object.assign(form, effective);
}

onMounted(async () => {
    await ttsConfigStore.loadConfigFromMain();
    loadForm();
});

// Reload the form when a different chapter is selected, or the global default changes.
watch(selectedFile, loadForm);
watch(() => ttsConfigStore.config, () => { if (!selectedFile.value) loadForm(); }, { deep: true });

function onChange(field: ChapterField) {
    if (selectedFile.value) {
        ttsConfigStore.updateFileTtsConfig(selectedFile.value.key, { [field]: form[field] } as Partial<TTSConfig>);
    } else {
        ttsConfigStore.updateConfig({ [field]: form[field] } as Partial<TTSConfig>);
        ttsConfigStore.saveConfigToMain();
    }
}

function setService(service: "edge" | "azure") {
    if (form.service === service) return;
    form.service = service;
    // Reset the voice to a valid one for the new service.
    form.voice = (service === "azure" ? azureVoices : edgeVoices)[0];
    onChange("service");
    onChange("voice");
}

const applyLabel = computed(() => {
    const n = fileListStore.getChecked.length;
    return n > 0 ? `${t("TTSCONFIG_ApplyToSelected")} (${n})` : t("TTSCONFIG_ApplyToAll");
});

function applyToAll() {
    const override: Partial<TTSConfig> = {};
    chapterFields.forEach((f) => ((override as Record<string, unknown>)[f] = form[f]));
    fileListStore.applyTtsConfigToAll(override);
}

function resetToDefault() {
    if (selectedFile.value) {
        fileListStore.resetFileTtsConfig(selectedFile.value.key);
        loadForm();
    }
}
</script>

<style scoped>
.st-scope {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(124, 108, 255, 0.08);
    border: 1px solid rgba(124, 108, 255, 0.2);
}
.st-scope i {
    color: var(--st-accent-soft);
}
.st-mini-btn {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: 1px solid var(--st-border);
    background: rgba(255, 255, 255, 0.04);
    color: var(--st-text-2);
    cursor: pointer;
    flex-shrink: 0;
}
.st-mini-btn:hover {
    color: var(--st-text-1);
}
.st-divider {
    height: 1px;
    background: var(--st-border);
    margin: 2px 0;
}
</style>
