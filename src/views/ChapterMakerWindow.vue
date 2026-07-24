<template>
    <div class="flex flex-col h-screen w-screen p-5 gap-4 text-white">
        <header class="flex items-baseline gap-3 shrink-0">
            <h1 class="text-[19px] font-bold tracking-tight">{{ t('CHAPTERMAKER_Title') }}</h1>
            <span class="st-text-3 text-[13px]">{{ t('CHAPTERMAKER_Subtitle') }}</span>
            <div class="grow"></div>
            <NotificationCenter variant="inline" class="self-center" />
        </header>

        <div class="flex gap-4 grow min-h-0">
            <!-- Left: source + regex -->
            <div class="st-panel flex flex-col grow min-w-0 basis-1/2">
                <div class="st-panel-header">
                    <div class="st-panel-title"><i class="fa-sharp fa-light fa-file-lines"></i><span>{{ t('CHAPTERMAKER_SourceTitle') }}</span></div>
                </div>
                <div class="p-4 flex flex-col gap-3 grow min-h-0">
                    <div class="flex flex-col gap-2">
                        <div class="flex gap-2 items-stretch">
                            <a-input
                                class="grow font-mono"
                                :class="{ 'st-input-error': patternError }"
                                :placeholder="t('CHAPTERMAKER_RegexInputPlaceholder')"
                                allow-clear
                                v-model="regexPattern"
                            >
                                <template #prefix><span class="st-text-3">/</span></template>
                            </a-input>
                            <div class="st-seg">
                                <button :class="{ 'is-active': flagI }" @click="flagI = !flagI" :title="t('CHAPTERMAKER_FlagCaseInsensitive')">i</button>
                                <button :class="{ 'is-active': flagM }" @click="flagM = !flagM" :title="t('CHAPTERMAKER_FlagMultiline')">m</button>
                            </div>
                        </div>
                        <div class="flex gap-2 flex-wrap items-center">
                            <span class="st-text-3 text-[12px]">{{ t('CHAPTERMAKER_Presets') }}:</span>
                            <button v-for="p in presets" :key="p.label" class="st-preset" @click="regexPattern = p.pattern">{{ p.label }}</button>
                        </div>
                        <p v-if="patternError" class="text-[12px]" style="color: var(--st-danger);">
                            <i class="fa-sharp fa-solid fa-circle-exclamation mr-1"></i>{{ patternError }}
                        </p>
                    </div>
                    <a-textarea
                        class="grow st-source"
                        :placeholder="t('CHAPTERMAKER_DragInFileIndicator')"
                        @drop.prevent="handleFileDrop"
                        @dragover.prevent
                        v-model="fileContent"
                    />
                </div>
            </div>

            <!-- Right: preview -->
            <div class="st-panel flex flex-col grow min-w-0 basis-1/2">
                <div class="st-panel-header">
                    <div class="st-panel-title"><i class="fa-sharp fa-light fa-eye"></i><span>{{ t('CHAPTERMAKER_PreviewTitle') }}</span></div>
                    <span class="st-pill" :class="chapters.length ? 'st-pill--done' : 'st-pill--ready'">
                        {{ chapters.length }} {{ t('CHAPTERMAKER_ChaptersDetected') }}
                    </span>
                </div>
                <div class="grow min-h-0 overflow-y-auto p-3">
                    <div v-if="chapters.length === 0" class="h-full flex flex-col items-center justify-center gap-3 st-text-3">
                        <i class="fa-sharp fa-light fa-list-tree text-4xl opacity-60"></i>
                        <p class="text-[13px] text-center px-6">{{ t('CHAPTERMAKER_PreviewEmpty') }}</p>
                    </div>
                    <div v-for="chapter in chapters" :key="chapter.index" class="st-chapter">
                        <div class="flex items-center gap-2">
                            <span class="st-chapter-idx">{{ chapter.index + 1 }}</span>
                            <span class="truncate font-medium text-[14px]">{{ chapter.title }}</span>
                            <span v-if="chapter.isPreamble" class="st-pill st-pill--warn text-[11px]">{{ t('CHAPTERMAKER_Preamble') }}</span>
                            <span class="grow"></span>
                            <span class="st-text-3 text-[12px] shrink-0">{{ chapter.wordcount }} {{ t('FILELIST_Words') }}</span>
                        </div>
                        <p class="st-text-3 text-[12px] mt-1 line-clamp-2">{{ chapter.snippet }}</p>
                    </div>
                </div>
                <div class="p-3 border-t" style="border-color: var(--st-border);">
                    <a-button long type="primary" :disabled="chapters.length === 0" @click="addToList">
                        <template #icon><i class="fa-sharp fa-light fa-arrow-right-to-bracket"></i></template>
                        {{ t('CHAPTERMAKER_ButtonAddToList') }}
                    </a-button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import NotificationCenter from "../components/NotificationCenter.vue";
import { ChapterPreview } from "../../global/types";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const fileContent = ref("");
const regexPattern = ref("");
const flagI = ref(false);
const flagM = ref(false);
const chapters = ref<ChapterPreview[]>([]);
const patternError = ref("");

const presets = [
    { label: "第…章", pattern: "第.+章" },
    { label: "Chapter N", pattern: "Chapter\\s+\\d+" },
    { label: "Volume·Chapter", pattern: "Volume.*?Chapter" },
    { label: "1. / 一、", pattern: "^\\s*(\\d+[\\.、]|[一二三四五六七八九十]+[\\.、])" },
];

const flags = computed(() => `${flagI.value ? "i" : ""}${flagM.value ? "m" : ""}`);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch([fileContent, regexPattern, flags], () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runPreview, 250);
});

async function runPreview() {
    patternError.value = "";
    if (!regexPattern.value || !fileContent.value.trim()) {
        chapters.value = [];
        return;
    }
    const res = await window.storyteller.makeChapters(fileContent.value, regexPattern.value, flags.value);
    if (res.error) {
        chapters.value = [];
        patternError.value = res.error === "INVALID_REGEX" || res.error === "EMPTY_PATTERN"
            ? t("CHAPTERMAKER_InvalidRegex")
            : `${t("CHAPTERMAKER_InvalidRegex")}: ${res.error}`;
        return;
    }
    chapters.value = res.chapters;
}

function handleFileDrop(event: DragEvent) {
    const file = event.dataTransfer?.files[0];
    if (file && (file.type === "text/plain" || file.name.endsWith(".txt"))) {
        const reader = new FileReader();
        reader.onload = (e) => (fileContent.value = String(e.target?.result));
        reader.readAsText(file);
    }
}

async function addToList() {
    await window.storyteller.addToList(JSON.parse(JSON.stringify(chapters.value)));
}
</script>

<style scoped>
.st-source :deep(.arco-textarea) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
}
.st-source {
    display: flex;
}
.st-preset {
    padding: 3px 10px;
    border-radius: 8px;
    font-size: 12px;
    border: 1px solid var(--st-border);
    background: rgba(255, 255, 255, 0.03);
    color: var(--st-text-2);
    cursor: pointer;
    transition: all 0.12s ease;
}
.st-preset:hover {
    color: var(--st-text-1);
    border-color: rgba(124, 108, 255, 0.4);
    background: rgba(124, 108, 255, 0.08);
}
.st-chapter {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid transparent;
}
.st-chapter:hover {
    background: rgba(255, 255, 255, 0.03);
    border-color: var(--st-border);
}
.st-chapter-idx {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--st-accent-soft);
    background: rgba(124, 108, 255, 0.14);
    flex-shrink: 0;
}
:deep(.st-input-error) {
    border-color: var(--st-danger) !important;
}
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
