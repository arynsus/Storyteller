<template>
    <div class="st-panel flex flex-col grow min-h-0">
        <div class="st-panel-header">
            <div class="st-panel-title"><i class="fa-sharp fa-light fa-scissors"></i><span>{{ controlsTitleResolved }}</span></div>
            <span class="st-pill" :class="chapters.length ? 'st-pill--done' : 'st-pill--ready'">
                {{ chapters.length }} {{ t('REGEXSPLIT_ChaptersDetected') }}
            </span>
        </div>
        <div class="p-4 flex flex-col gap-2 shrink-0 st-controls-block">
            <div class="flex gap-2 items-stretch">
                <a-input
                    class="grow font-mono"
                    :class="{ 'st-input-error': patternError }"
                    :placeholder="t('REGEXSPLIT_RegexInputPlaceholder')"
                    allow-clear
                    v-model="regexPattern"
                >
                    <template #prefix><span class="st-text-3">/</span></template>
                </a-input>
                <div class="st-seg">
                    <button :class="{ 'is-active': flagI }" @click="flagI = !flagI" :title="t('REGEXSPLIT_FlagCaseInsensitive')">i</button>
                    <button :class="{ 'is-active': flagM }" @click="flagM = !flagM" :title="t('REGEXSPLIT_FlagMultiline')">m</button>
                </div>
                <button class="st-preset shrink-0" :title="t('REGEXSPLIT_Presets')" @click="showPresetsModal = true">
                    <i class="fa-sharp fa-light fa-list-tree"></i>
                </button>
            </div>
            <p v-if="patternError" class="text-[12px]" style="color: var(--st-danger);">
                <i class="fa-sharp fa-solid fa-circle-exclamation mr-1"></i>{{ patternError }}
            </p>
        </div>
        <div class="grow min-h-0 overflow-y-auto p-2">
            <div v-if="chapters.length === 0" class="h-full flex flex-col items-center justify-center gap-3 st-text-3">
                <i class="fa-sharp fa-light fa-list-tree text-4xl opacity-60"></i>
                <p class="text-[13px] text-center px-6">{{ emptyHint }}</p>
            </div>
            <div
                v-for="chapter in chapters"
                :key="chapter.index"
                class="st-row"
                :class="{ 'is-selected': selectedIndex === chapter.index }"
                @click="emit('select', chapter.index)"
            >
                <span class="st-chapter-idx shrink-0">{{ chapter.index + 1 }}</span>
                <span class="truncate text-[14px]">{{ chapter.title }}</span>
                <span v-if="chapter.isPreamble" class="st-pill st-pill--warn text-[11px] shrink-0">{{ t('REGEXSPLIT_Preamble') }}</span>
                <span class="grow"></span>
                <span class="st-text-3 text-[12px] shrink-0">{{ chapter.wordcount }} {{ t('FILELIST_Words') }}</span>
            </div>
        </div>

        <RegexPresetsModal :visible="showPresetsModal" @close="showPresetsModal = false" @apply="regexPattern = $event" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChapterPreview, MakeChaptersResult } from "../../global/types";
import { useI18n } from "vue-i18n";
import RegexPresetsModal from "./RegexPresetsModal.vue";

const { t } = useI18n();

const props = withDefaults(
    defineProps<{
        content: string;
        splitFn: (content: string, pattern: string, flags: string) => Promise<MakeChaptersResult>;
        controlsTitle?: string;
        emptyHint?: string;
        /** Debounce delay in ms before re-running the split as the user types. */
        debounceMs?: number;
        /** Highlights a chapter row as selected. */
        selectedIndex?: number | null;
    }>(),
    { controlsTitle: "Regex Split", emptyHint: "Enter a regex pattern to preview detected chapters.", debounceMs: 250, selectedIndex: null }
);

const emit = defineEmits<{
    (e: "update:chapters", chapters: ChapterPreview[]): void;
    (e: "select", index: number): void;
}>();

const regexPattern = ref("");
const flagI = ref(false);
const flagM = ref(false);
const chapters = ref<ChapterPreview[]>([]);
const patternError = ref("");
const showPresetsModal = ref(false);

const controlsTitleResolved = computed(() => props.controlsTitle);

const flags = computed(() => `${flagI.value ? "i" : ""}${flagM.value ? "m" : ""}`);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(
    [() => props.content, regexPattern, flags],
    () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runPreview, props.debounceMs);
    },
    { immediate: true }
);

async function runPreview() {
    patternError.value = "";
    if (!regexPattern.value || !props.content.trim()) {
        chapters.value = [];
        emit("update:chapters", []);
        return;
    }
    const res = await props.splitFn(props.content, regexPattern.value, flags.value);
    if (res.error) {
        chapters.value = [];
        patternError.value =
            res.error === "INVALID_REGEX" || res.error === "EMPTY_PATTERN"
                ? t("REGEXSPLIT_InvalidRegex")
                : `${t("REGEXSPLIT_InvalidRegex")}: ${res.error}`;
        emit("update:chapters", []);
        return;
    }
    chapters.value = res.chapters;
    emit("update:chapters", res.chapters);
}
</script>

<style scoped>
.st-preset {
    padding: 3px 10px;
    border-radius: 8px;
    font-size: 12px;
    border: 1px solid var(--st-border);
    background: rgba(255, 255, 255, 0.03);
    color: var(--st-text-2);
    cursor: pointer;
    transition: all 0.12s ease;
    white-space: nowrap;
}
.st-preset:hover {
    color: var(--st-text-1);
    border-color: rgba(124, 108, 255, 0.4);
    background: rgba(124, 108, 255, 0.08);
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
.st-controls-block {
    border-bottom: 1px solid var(--st-border);
}
:deep(.st-input-error) {
    border-color: var(--st-danger) !important;
}
</style>
