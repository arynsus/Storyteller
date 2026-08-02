<template>
    <div class="flex flex-col grow min-h-0 gap-4 p-5">

        <!-- Step 1: no book loaded yet -->
        <template v-if="!book">
            <div class="flex flex-col grow min-h-0 gap-3">
                <div class="st-seg self-center shrink-0">
                    <button :class="{ 'is-active': loadMode === 'file' }" @click="loadMode = 'file'">
                        <i class="fa-sharp fa-light fa-file-arrow-up mr-1"></i>{{ t('EBOOKLOADER_LoadModeFile') }}
                    </button>
                    <button :class="{ 'is-active': loadMode === 'paste' }" @click="loadMode = 'paste'">
                        <i class="fa-sharp fa-light fa-paste mr-1"></i>{{ t('EBOOKLOADER_LoadModePaste') }}
                    </button>
                </div>

                <div
                    v-if="loadMode === 'file'"
                    class="st-dropzone grow flex flex-col items-center justify-center gap-4 px-6 py-5"
                    :class="{ 'is-drag': isDragging }"
                    @drop.prevent="handleDrop"
                    @dragover.prevent="isDragging = true"
                    @dragleave.prevent="isDragging = false"
                    @click="triggerFileInput"
                >
                    <div class="st-dropzone-icon">
                        <i class="fa-sharp fa-light fa-book-open"></i>
                    </div>
                    <div class="flex flex-col items-center">
                        <p class="font-semibold text-[15px]">{{ t('EBOOKLOADER_DragInFileIndicator') }}</p>
                        <p class="st-text-3 text-[13px]">{{ t('EBOOKLOADER_DragInFileSuggestion') }}</p>
                    </div>
                    <p v-if="loadError" class="st-pill st-pill--error">
                        <i class="fa-sharp fa-solid fa-circle-exclamation"></i>{{ loadError }}
                    </p>
                    <input
                        type="file"
                        ref="fileInput"
                        @change="handleFileInput"
                        style="display: none;"
                        accept=".epub,.fb2,.fb2.zip,.fbz,.txt"
                    />
                </div>

                <div v-else class="grow flex flex-col gap-3 min-h-0">
                    <a-textarea
                        class="grow st-paste-textarea"
                        :placeholder="t('EBOOKLOADER_PasteTextPlaceholder')"
                        v-model="pastedText"
                    />
                    <a-button long type="primary" :disabled="!pastedText.trim()" @click="confirmPastedText">
                        <template #icon><i class="fa-sharp fa-light fa-arrow-right"></i></template>
                        {{ t('EBOOKLOADER_ButtonConfirmPastedText') }}
                    </a-button>
                </div>
            </div>
        </template>

        <!-- Step 2: book loaded -->
        <template v-else>
            <div class="flex items-center gap-3 shrink-0">
                <span class="font-semibold text-[15px] truncate">{{ book.title }}</span>
                <span v-if="book.author" class="st-text-3 text-[13px] truncate">— {{ book.author }}</span>
                <span class="st-pill" :class="hasToc ? 'st-pill--done' : 'st-pill--warn'">
                    {{ hasToc ? `${book.chapters.length} ${t('EBOOKLOADER_ChaptersDetected')}` : t('EBOOKLOADER_NoTocDetected') }}
                </span>
                <div class="grow"></div>
                <button
                    class="st-preset"
                    :disabled="!hasToc"
                    :title="!hasToc ? t('EBOOKLOADER_NoTocDetected') : ''"
                    @click="mode = mode === 'toc' ? 'manual' : 'toc'"
                >
                    <i class="fa-sharp fa-light fa-arrows-rotate mr-1"></i>{{ mode === 'toc' ? t('EBOOKLOADER_SwitchToManual') : t('EBOOKLOADER_SwitchToToc') }}
                </button>
                <button class="st-preset" @click="reset"><i class="fa-sharp fa-light fa-rotate-left mr-1"></i>{{ t('EBOOKLOADER_LoadAnother') }}</button>
            </div>

            <div class="flex gap-4 grow min-h-0">
                <!-- Left: fixed-width column, TOC/Regex Split on top, Options below -->
                <div class="flex flex-col gap-4 shrink-0 min-h-0" style="width: 300px;">
                    <div v-if="mode === 'toc'" class="st-panel flex flex-col grow min-h-0">
                        <div class="st-panel-header">
                            <div class="st-panel-title"><i class="fa-sharp fa-light fa-list-tree"></i><span>{{ t('EBOOKLOADER_TocTitle') }}</span></div>
                            <a-checkbox :model-value="allChecked" :indeterminate="someChecked && !allChecked" @change="toggleAllIncluded">
                                <span class="st-text-3 text-[12px]">{{ t('EBOOKLOADER_SelectAll') }}</span>
                            </a-checkbox>
                        </div>
                        <div class="grow min-h-0 overflow-y-auto p-2">
                            <div
                                v-for="ch in book.chapters"
                                :key="ch.index"
                                class="st-row"
                                :class="{ 'is-selected': previewChapterIndex === ch.index }"
                                :style="{ paddingLeft: (12 + ch.level * 16) + 'px' }"
                                @click="selectPreview(ch.index)"
                            >
                                <span class="shrink-0" @click.stop>
                                    <a-checkbox :model-value="includedIndexes.includes(ch.index)" @change="toggleIncluded(ch.index)" />
                                </span>
                                <span class="truncate text-[14px]">{{ ch.title }}</span>
                                <span v-if="ch.warning" class="st-pill st-pill--warn text-[11px] shrink-0">{{ t('EBOOKLOADER_ExtractWarning') }}</span>
                                <span class="grow"></span>
                                <span class="st-text-3 text-[12px] shrink-0">{{ ch.rawText.length }} {{ t('EBOOKLOADER_Chars') }}</span>
                            </div>
                        </div>
                    </div>

                    <RegexChapterSplitter
                        v-else
                        :content="book.fullText"
                        :split-fn="splitFn"
                        :empty-hint="t('EBOOKLOADER_ManualPreviewEmpty')"
                        :controls-title="t('EBOOKLOADER_ManualControlsTitle')"
                        :selected-index="previewChapterIndex"
                        @update:chapters="manualChapters = $event"
                        @select="selectPreview"
                    />

                    <!-- Processing options, fixed to their natural height (capped + scrollable if the window is short) -->
                    <div class="st-panel flex flex-col shrink-0 min-h-0" style="max-height: 40vh;">
                        <div class="st-panel-header">
                            <div class="st-panel-title"><i class="fa-sharp fa-light fa-sliders"></i><span>{{ t('EBOOKLOADER_OptionsTitle') }}</span></div>
                        </div>
                        <div class="grow min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
                            <a-checkbox v-model="options.removeFootnoteMarkers">
                                <span class="text-[13px]">{{ t('EBOOKLOADER_OptionRemoveFootnotes') }}</span>
                            </a-checkbox>
                            <a-checkbox v-model="options.stripIndentSpaces">
                                <span class="text-[13px]">{{ t('EBOOKLOADER_OptionStripIndent') }}</span>
                            </a-checkbox>
                            <a-checkbox v-model="options.collapseBlankLines">
                                <span class="text-[13px]">{{ t('EBOOKLOADER_OptionCollapseBlank') }}</span>
                            </a-checkbox>
                            <div class="flex flex-col gap-2">
                                <span class="st-label !mb-0">{{ t('EBOOKLOADER_OptionPunctuation') }}</span>
                                <div class="st-seg">
                                    <button :class="{ 'is-active': options.normalizePunctuation === 'none' }" @click="options.normalizePunctuation = 'none'">{{ t('EBOOKLOADER_PunctuationNone') }}</button>
                                    <button :class="{ 'is-active': options.normalizePunctuation === 'fullwidth' }" @click="options.normalizePunctuation = 'fullwidth'">{{ t('EBOOKLOADER_PunctuationFullwidth') }}</button>
                                    <button :class="{ 'is-active': options.normalizePunctuation === 'halfwidth' }" @click="options.normalizePunctuation = 'halfwidth'">{{ t('EBOOKLOADER_PunctuationHalfwidth') }}</button>
                                </div>
                            </div>
                            <div class="st-divider"></div>
                            <a-checkbox v-model="options.addTitleHeading">
                                <span class="text-[13px]">{{ t('EBOOKLOADER_OptionTitleHeading') }}</span>
                            </a-checkbox>
                            <div v-if="options.addTitleHeading" class="flex flex-col gap-2">
                                <span class="st-label !mb-0">{{ t('EBOOKLOADER_TitleTemplateLabel') }}</span>
                                <a-input v-model="options.titleTemplate" class="font-mono" />
                            </div>
                            <div class="flex flex-col gap-2">
                                <span class="st-label !mb-0">{{ t('EBOOKLOADER_ParagraphBlankLines') }}</span>
                                <a-input-number v-model="options.paragraphBlankLines" :min="0" :max="5" />
                            </div>
                            <div class="flex flex-col gap-2">
                                <span class="st-label !mb-0">{{ t('EBOOKLOADER_MaxCharsPerFile') }}</span>
                                <a-input-number v-model="options.maxCharsPerFile" :min="0" :step="500" />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right: selected chapter preview, takes the rest of the window -->
                <div class="st-panel flex flex-col grow min-w-0 min-h-0">
                    <div class="st-panel-header">
                        <div class="st-panel-title"><i class="fa-sharp fa-light fa-eye"></i><span>{{ t('EBOOKLOADER_PreviewTitle') }}</span></div>
                    </div>
                    <div class="grow min-h-0 overflow-y-auto">
                        <p v-if="!previewText" class="st-hint p-4">{{ t('EBOOKLOADER_PreviewEmpty') }}</p>
                        <pre v-else class="text-[13px] whitespace-pre-wrap p-4 m-0">{{ previewText }}</pre>
                    </div>
                </div>
            </div>

            <div class="shrink-0">
                <a-button long type="primary" :disabled="finalChapters.length === 0" :loading="committing" @click="addToQueue">
                    <template #icon><i class="fa-sharp fa-light fa-arrow-right-to-bracket"></i></template>
                    {{ t('EBOOKLOADER_ButtonAddToQueue') }} ({{ finalChapters.length }})
                </a-button>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import RegexChapterSplitter from "../components/RegexChapterSplitter.vue";
import { ChapterPreview, EbookProcessOptions, MakeChaptersResult, ParsedEbook } from "../../global/types";
import { DEFAULT_EBOOK_PROCESS_OPTIONS, processChapterText, splitTextIntoParts, sanitizeFilename } from "../../global/ebookProcessing";
import { notify } from "../composables/notify";
import { useI18n } from "vue-i18n";
import wordsCountModule from "words-count";

const wordsCount = (wordsCountModule as unknown as { default: (t: string) => number }).default ?? (wordsCountModule as unknown as (t: string) => number);

const { t } = useI18n();

const emit = defineEmits<{ (e: "added-to-queue"): void }>();

const book = ref<ParsedEbook | null>(null);
const loadError = ref("");
const isDragging = ref(false);
const fileInput = ref<HTMLInputElement>();
const committing = ref(false);
const loadMode = ref<"file" | "paste">("file");
const pastedText = ref("");

const mode = ref<"toc" | "manual">("manual");
const includedIndexes = ref<number[]>([]);
const manualChapters = ref<ChapterPreview[]>([]);
const previewChapterIndex = ref<number | null>(null);
const options = ref<EbookProcessOptions>({ ...DEFAULT_EBOOK_PROCESS_OPTIONS });

const hasToc = computed(() => (book.value?.chapters.length ?? 0) > 1);

const allChecked = computed(
    () => (book.value?.chapters.length ?? 0) > 0 && includedIndexes.value.length === (book.value?.chapters.length ?? 0)
);
const someChecked = computed(() => includedIndexes.value.length > 0);

function toggleAllIncluded() {
    if (!book.value) return;
    includedIndexes.value = allChecked.value ? [] : book.value.chapters.map((c) => c.index);
}

function toggleIncluded(index: number) {
    const i = includedIndexes.value.indexOf(index);
    if (i === -1) includedIndexes.value.push(index);
    else includedIndexes.value.splice(i, 1);
}

// Must be a named script-level function, not an inline template arrow --
// `<script setup>` template expressions compile with prefixIdentifiers (no
// `with` fallback), so a bare `window` reference written inline in the
// template resolves to `_ctx.window` (undefined) instead of the real global.
function splitFn(content: string, pattern: string, flags: string): Promise<MakeChaptersResult> {
    return window.storyteller.makeChapters(content, pattern, flags);
}

// Click a chapter row to preview it; click it again to deselect (falls back
// to the "pick a chapter" hint rather than defaulting to the first chapter).
function selectPreview(index: number) {
    previewChapterIndex.value = previewChapterIndex.value === index ? null : index;
}

// Selecting a chapter for preview only makes sense within the mode it was
// picked in -- reset when switching modes or when the manual split re-runs.
watch(mode, () => {
    previewChapterIndex.value = null;
});
watch(manualChapters, () => {
    previewChapterIndex.value = null;
});

async function loadFile(file: File) {
    loadError.value = "";
    const filePath = (file as unknown as { path?: string }).path;
    if (!filePath) {
        loadError.value = t("EBOOKLOADER_ErrorNoPath");
        return;
    }
    const res = await window.storyteller.loadEbook(filePath);
    if (!res.success || !res.book) {
        loadError.value = `${t("EBOOKLOADER_ErrorLoadFailed")}${res.error ?? ""}`;
        return;
    }
    book.value = res.book;
    includedIndexes.value = res.book.chapters.map((c) => c.index);
    previewChapterIndex.value = null;
    mode.value = res.book.chapters.length > 1 ? "toc" : "manual";
}

// Pasted text has no structure to detect a table of contents from, so it
// goes straight into the same regex-based manual split as an unstructured
// .txt file -- book.fullText is all RegexChapterSplitter needs.
function confirmPastedText() {
    const trimmed = pastedText.value.trim();
    if (!trimmed) return;
    book.value = { format: "txt", title: t("EBOOKLOADER_PastedTextTitle"), author: "", chapters: [], fullText: pastedText.value };
    includedIndexes.value = [];
    previewChapterIndex.value = null;
    mode.value = "manual";
    pastedText.value = "";
}

function reset() {
    book.value = null;
    loadError.value = "";
    includedIndexes.value = [];
    manualChapters.value = [];
    previewChapterIndex.value = null;
    mode.value = "manual";
    loadMode.value = "file";
    pastedText.value = "";
}

function handleDrop(event: DragEvent) {
    isDragging.value = false;
    const file = event.dataTransfer?.files[0];
    if (file) loadFile(file);
}
function handleFileInput(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) loadFile(file);
    if (fileInput.value) fileInput.value.value = "";
}
function triggerFileInput() {
    fileInput.value?.click();
}

// Live preview of whichever chapter is explicitly selected -- pure/local, no
// IPC round trip. No selection means no preview (the panel shows a hint
// instead of silently defaulting to the first chapter).
const previewText = computed(() => {
    if (!book.value || previewChapterIndex.value == null) return "";
    let source: { title: string; rawText: string } | null = null;
    if (mode.value === "toc") {
        const ch = book.value.chapters.find((c) => c.index === previewChapterIndex.value);
        if (ch) source = { title: ch.title, rawText: ch.rawText };
    } else {
        const ch = manualChapters.value.find((c) => c.index === previewChapterIndex.value);
        if (ch) source = { title: ch.title, rawText: ch.content };
    }
    if (!source) return "";
    const processed = processChapterText(source.rawText, source.title, options.value);
    return splitTextIntoParts(processed, options.value.maxCharsPerFile)[0] ?? "";
});

// Final, flattened, processed chapter list ready for the existing addToList IPC.
const finalChapters = computed<ChapterPreview[]>(() => {
    if (!book.value) return [];

    const sources: { title: string; rawText: string }[] =
        mode.value === "toc"
            ? book.value.chapters
                  .filter((c) => includedIndexes.value.includes(c.index))
                  .map((c) => ({ title: c.title, rawText: c.rawText }))
            : manualChapters.value.map((c) => ({ title: c.title, rawText: c.content }));

    const usedNames = new Set<string>();
    const result: ChapterPreview[] = [];
    let globalIndex = 0;

    for (const src of sources) {
        const processed = processChapterText(src.rawText, src.title, options.value);
        const parts = splitTextIntoParts(processed, options.value.maxCharsPerFile);
        const partTotal = parts.length;

        parts.forEach((partText, partIdx) => {
            const partTitle = partTotal > 1 ? `${src.title} (${t("EBOOKLOADER_Part")} ${partIdx + 1}/${partTotal})` : src.title;
            const base = sanitizeFilename(partTitle);
            let unique = base;
            let suffix = 2;
            while (usedNames.has(unique.toLowerCase())) unique = `${base}_${suffix++}`;
            usedNames.add(unique.toLowerCase());

            result.push({
                index: globalIndex++,
                title: partTitle,
                filename: `${unique}.txt`,
                wordcount: wordsCount(partText),
                charcount: partText.length,
                snippet: partText.trim().slice(0, 200),
                content: partText,
            });
        });
    }
    return result;
});

async function addToQueue() {
    if (!finalChapters.value.length) return;
    committing.value = true;
    try {
        const res = await window.storyteller.addToList(JSON.parse(JSON.stringify(finalChapters.value)));
        if (res.success) {
            reset();
            emit("added-to-queue");
        } else {
            notify.error(`${t("MESSAGE_SystemMalfunction")}${res.error ?? ""}`);
        }
    } finally {
        committing.value = false;
    }
}
</script>

<style scoped>
.st-dropzone-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: var(--st-accent-soft);
    background: rgba(124, 108, 255, 0.12);
    border: 1px solid rgba(124, 108, 255, 0.25);
    flex-shrink: 0;
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
    white-space: nowrap;
}
.st-preset:hover {
    color: var(--st-text-1);
    border-color: rgba(124, 108, 255, 0.4);
    background: rgba(124, 108, 255, 0.08);
}
.st-preset:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
}
.st-paste-textarea {
    display: flex;
}
.st-paste-textarea :deep(.arco-textarea) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
}
</style>
