<template>
    <div class="st-panel w-full grow flex flex-col min-h-0">
        <div class="st-panel-header">
            <div class="st-panel-title">
                <i class="fa-sharp fa-light fa-list-music"></i>
                <span>{{ t('FILELIST_QueueTitle') }}</span>
            </div>
            <div class="flex items-center gap-3">
                <a-checkbox
                    v-if="fileListStore.files.length > 0"
                    :model-value="allChecked"
                    :indeterminate="someChecked && !allChecked"
                    @change="toggleAll"
                >
                    <span class="st-text-3 text-[12px]">{{ t('FILELIST_SelectAll') }}</span>
                </a-checkbox>
                <span class="st-text-3 text-[13px]">
                    <template v-if="checkedCount > 0">{{ checkedCount }} {{ t('FILELIST_SelectedSuffix') }}</template>
                    <template v-else>{{ fileListStore.files.length }} {{ t('FILELIST_ItemsSuffix') }}</template>
                </span>
            </div>
        </div>

        <div
            ref="listContainerRef"
            class="grow min-h-0 overflow-y-auto px-2 py-2"
            @dragover="onContainerDragOver"
            @drop="onContainerDrop"
        >
            <!-- Empty state -->
            <div v-if="fileListStore.files.length === 0" class="h-full flex flex-col items-center justify-center gap-3 st-text-3">
                <i class="fa-sharp fa-light fa-inbox text-4xl opacity-60"></i>
                <p class="text-[14px]">{{ t('FILELIST_EmptyState') }}</p>
            </div>

            <!-- Rows -->
            <template v-for="(file, index) in fileListStore.files" :key="file.key">
                <div v-if="dropInsertionIndex === index" class="st-drop-line"></div>
                <div
                    :ref="(el) => setRowRef(el, index)"
                    @dragover="onRowDragOver(index, $event)"
                    @drop="onRowDrop($event)"
                >
                <div
                    class="st-row"
                    :class="{ 'is-checked': file.checked }"
                    @mousedown="onRowMouseDown($event)"
                    @click="onRowClick(file, index, $event)"
                >
                    <div
                        class="st-drag-handle"
                        draggable="true"
                        @dragstart="onDragStart(index, $event)"
                        @dragend="onDragEnd"
                        @click.stop
                    >
                        <i class="fa-sharp fa-solid fa-grip-dots-vertical"></i>
                    </div>

                    <div class="shrink-0" @click.stop>
                        <a-checkbox :model-value="!!file.checked" @change="() => onCheckboxToggle(file.key, index)" />
                    </div>

                    <div class="min-w-0 grow">
                        <div class="flex items-center gap-2">
                            <span class="truncate font-medium text-[14px]">{{ file.filename }}</span>
                            <span v-if="file.contentModified" class="st-tag" :title="t('FILELIST_ContentModifiedTag')">
                                <i class="fa-sharp fa-solid fa-pen"></i>
                            </span>
                        </div>
                        <div class="st-text-3 text-[12px] mt-0.5 truncate">
                            <template v-if="chapterLabel(file)">{{ chapterLabel(file) }} · </template>{{ file.wordcount }} {{ t('FILELIST_Words') }}
                        </div>
                    </div>

                    <button
                        class="st-status-icon"
                        :class="{ 'is-empty': !file.ttsConfig }"
                        :style="file.ttsConfig ? { '--dot': colorForConfig(file.ttsConfig) } : {}"
                        :disabled="!file.ttsConfig"
                        :title="file.ttsConfig ? t('FILELIST_TTSIconTooltipSet') : t('FILELIST_TTSIconTooltipUnset')"
                        @click.stop="file.ttsConfig && fileListStore.requestTtsLoad(file.key)"
                    >
                        <i class="fa-sharp fa-solid fa-waveform-lines"></i>
                    </button>

                    <button
                        class="st-status-icon"
                        :class="{ 'is-empty': !hasBookInfo(file) }"
                        :style="hasBookInfo(file) ? { '--dot': colorForConfig(bookInfoOf(file)) } : {}"
                        :disabled="!hasBookInfo(file)"
                        :title="hasBookInfo(file) ? t('FILELIST_MetaIconTooltipSet') : t('FILELIST_MetaIconTooltipUnset')"
                        @click.stop="hasBookInfo(file) && fileListStore.requestMetadataLoad(file.key)"
                    >
                        <i class="fa-sharp fa-solid fa-tags"></i>
                    </button>

                    <div class="w-[150px] shrink-0 flex flex-col gap-1">
                        <div class="flex items-center justify-between">
                            <span class="st-pill" :class="pillClass(file)">
                                <i :class="pillIcon(file)"></i>{{ statusLabel(file) }}
                            </span>
                            <span v-if="file.converting" class="st-text-3 text-[12px] tabular-nums">
                                {{ Math.min(file.finishedSections, file.totalSections) }}/{{ file.totalSections }}
                            </span>
                        </div>
                        <div class="st-track" :class="trackClass(file)">
                            <span :style="{ width: `${Math.round(calculateProgress(file) * 100)}%` }"></span>
                        </div>
                    </div>

                    <button class="st-icon-btn" @click.stop="toggleExpand(file.key)">
                        <i class="fa-sharp fa-light" :class="expandedKeys.has(file.key) ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                    </button>

                    <button
                        class="st-icon-btn st-icon-btn--accent"
                        :disabled="!file.readyToStart || !file.ttsConfig"
                        :title="!file.ttsConfig ? t('FILELIST_StartDisabledNoTts') : ''"
                        @click.stop="startFile(file)"
                    >
                        <i class="fa-sharp fa-light fa-play"></i>
                    </button>

                    <div class="w-9 shrink-0 flex justify-end" @click.stop>
                        <button
                            v-if="!file.finished"
                            class="st-icon-btn st-icon-btn--danger"
                            :disabled="!file.readyToStart"
                            @click="removeFile(file)"
                        >
                            <i class="fa-sharp fa-light fa-trash-can"></i>
                        </button>
                        <button v-else class="st-icon-btn st-icon-btn--accent" @click="downloadFile(file.url)">
                            <i class="fa-sharp fa-light fa-download"></i>
                        </button>
                    </div>
                </div>

                <div v-if="expandedKeys.has(file.key)" class="st-row-expand" @click.stop>
                    <div class="flex gap-2 items-end">
                        <div class="w-[100px] shrink-0">
                            <p class="st-label !mb-1">{{ t('FILELIST_ExpandChapterNo') }}</p>
                            <a-input
                                size="small"
                                :disabled="!file.readyToStart"
                                :model-value="file.metadata?.chapterNumber"
                                @input="(v: string) => fileListStore.updateMetadata(file.key, { chapterNumber: v })"
                                @press-enter="toggleExpand(file.key)"
                            />
                        </div>
                        <div class="grow min-w-0">
                            <p class="st-label !mb-1">{{ t('FILELIST_ExpandChapterTitle') }}</p>
                            <a-input
                                size="small"
                                allow-clear
                                :disabled="!file.readyToStart"
                                :model-value="file.metadata?.chapterTitle"
                                @input="(v: string) => fileListStore.updateMetadata(file.key, { chapterTitle: v })"
                                @press-enter="toggleExpand(file.key)"
                            />
                        </div>
                        <a-button size="small" :disabled="!file.readyToStart" @click="contentEditorKey = file.key">
                            <template #icon><i class="fa-sharp fa-light fa-file-pen"></i></template>
                            {{ t('FILELIST_EditContent') }}
                        </a-button>
                    </div>
                </div>
                </div>
            </template>
            <div v-if="dropInsertionIndex === fileListStore.files.length" class="st-drop-line"></div>
        </div>

        <div class="st-queue-footer">
            <a-button class="grow" :disabled="fileListStore.files.length === 0" @click="clearList">
                {{ t('MAINWINDOW_ButtonClear') }}
            </a-button>
            <a-button class="grow" :disabled="downloadDisabled" @click="downloadAudio">
                <template #icon><i class="fa-sharp fa-light fa-download"></i></template>
                {{ t('MAINWINDOW_ButtonDownloadAudio') }}
            </a-button>
            <a-tooltip :content="convertTooltip" :disabled="!convertDisabled">
                <a-button class="grow" type="primary" :disabled="convertDisabled" @click="convertAll">
                    <template #icon><i class="fa-sharp fa-solid fa-play"></i></template>
                    {{ t('MAINWINDOW_ButtonCovert') }}
                </a-button>
            </a-tooltip>
        </div>
    </div>

    <ContentEditorModal
        :visible="contentEditorKey !== null"
        :file-key="contentEditorKey"
        @close="contentEditorKey = null"
    />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from "vue";
import { notify } from "../composables/notify";
import { colorForConfig } from "../composables/colorHash";
import { useFileListStore, useTTSConfigStore } from "../store";
import { FileData, ConversionEvent } from "../../global/types";
import { useI18n } from "vue-i18n";
import ContentEditorModal from "./ContentEditorModal.vue";

const { t } = useI18n();
const fileListStore = useFileListStore();
const ttsConfigStore = useTTSConfigStore();

const checkedCount = computed(() => fileListStore.files.filter((f) => f.checked).length);
const someChecked = computed(() => checkedCount.value > 0);
const allChecked = computed(
    () => fileListStore.files.length > 0 && checkedCount.value === fileListStore.files.length
);
const toggleAll = () => fileListStore.setAllChecked(!allChecked.value);

// ---- selection: plain click selects only this row (or deselects it if it was
// already the sole selection), cmd/ctrl toggles it into the set, shift extends
// the range from the last-clicked row ----
const lastClickedIndex = ref<number | null>(null);

function onRowClick(file: FileData, index: number, event: MouseEvent) {
    if (event.shiftKey && lastClickedIndex.value !== null) {
        fileListStore.selectRange(lastClickedIndex.value, index);
    } else if (event.metaKey || event.ctrlKey) {
        fileListStore.toggleChecked(file.key);
        lastClickedIndex.value = index;
    } else if (file.checked && checkedCount.value === 1) {
        fileListStore.toggleChecked(file.key);
        lastClickedIndex.value = index;
    } else {
        fileListStore.selectOnly(file.key);
        lastClickedIndex.value = index;
    }
}
function onCheckboxToggle(key: string, index: number) {
    fileListStore.toggleChecked(key);
    lastClickedIndex.value = index;
}
// Shift+click extends a range but native mousedown would otherwise start a
// text-selection drag across the rows; block only that default.
function onRowMouseDown(event: MouseEvent) {
    if (event.shiftKey) event.preventDefault();
}
function selectIndex(index: number) {
    const file = fileListStore.files[index];
    if (!file) return;
    fileListStore.selectOnly(file.key);
    lastClickedIndex.value = index;
}

// ---- keyboard nav: only while exactly one row is selected and focus isn't
// in a text field elsewhere in the app ----
function onKeydown(event: KeyboardEvent) {
    if (contentEditorKey.value !== null) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
    if (checkedCount.value !== 1) return;
    const selected = fileListStore.files.find((f) => f.checked);
    if (!selected) return;
    const index = fileListStore.files.findIndex((f) => f.key === selected.key);

    if (event.key === "Enter") {
        event.preventDefault();
        toggleExpand(selected.key);
    } else if (event.key === "ArrowDown") {
        event.preventDefault();
        selectIndex(Math.min(index + 1, fileListStore.files.length - 1));
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectIndex(Math.max(index - 1, 0));
    }
}

// ---- reorder via native HTML5 drag and drop ----
// dragOverInsertionIndex is a gap position in the pre-drag array (0..length,
// where `length` means "after the last row"); reorder() takes a final-array
// target index, so we convert between the two on drop.
const listContainerRef = ref<HTMLElement | null>(null);
const rowRefs = ref<(HTMLElement | null)[]>([]);
function setRowRef(el: Element | null, index: number) {
    rowRefs.value[index] = el as HTMLElement | null;
}

const dragIndex = ref<number | null>(null);
const dropInsertionIndex = ref<number | null>(null);
let autoScrollSpeed = 0;
let autoScrollRAF: number | null = null;

function onDragStart(index: number, event: DragEvent) {
    dragIndex.value = index;
    dropInsertionIndex.value = index;
    event.dataTransfer?.setData("text/plain", String(index));
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        const rowEl = rowRefs.value[index];
        if (rowEl) {
            const rect = rowEl.getBoundingClientRect();
            event.dataTransfer.setDragImage(rowEl, event.clientX - rect.left, event.clientY - rect.top);
        }
    }
}
function onDragEnd() {
    dragIndex.value = null;
    dropInsertionIndex.value = null;
    stopAutoScroll();
}
function onRowDragOver(index: number, event: DragEvent) {
    if (dragIndex.value === null) return;
    event.preventDefault();
    updateAutoScroll(event);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    dropInsertionIndex.value = event.clientY < midpoint ? index : index + 1;
}
function onContainerDragOver(event: DragEvent) {
    if (dragIndex.value === null) return;
    event.preventDefault();
    updateAutoScroll(event);
    // Only overrides the row-level computation when the pointer is below every
    // row (i.e. in the empty space at the bottom of a not-yet-full list).
    const rows = rowRefs.value.filter((el): el is HTMLElement => !!el);
    if (rows.length === 0) return;
    const lastRect = rows[rows.length - 1].getBoundingClientRect();
    if (event.clientY > lastRect.bottom) {
        dropInsertionIndex.value = fileListStore.files.length;
    }
}
function finishDrop() {
    if (dragIndex.value !== null && dropInsertionIndex.value !== null) {
        const from = dragIndex.value;
        const target = dropInsertionIndex.value > from ? dropInsertionIndex.value - 1 : dropInsertionIndex.value;
        fileListStore.reorder(from, target);
    }
    dragIndex.value = null;
    dropInsertionIndex.value = null;
    stopAutoScroll();
}
function onRowDrop(event: DragEvent) {
    event.preventDefault();
    finishDrop();
}
function onContainerDrop(event: DragEvent) {
    event.preventDefault();
    finishDrop();
}
function updateAutoScroll(event: DragEvent) {
    const container = listContainerRef.value;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const threshold = 56;
    const maxSpeed = 14;
    if (event.clientY < rect.top + threshold) {
        autoScrollSpeed = -maxSpeed * ((rect.top + threshold - event.clientY) / threshold);
    } else if (event.clientY > rect.bottom - threshold) {
        autoScrollSpeed = maxSpeed * ((event.clientY - (rect.bottom - threshold)) / threshold);
    } else {
        autoScrollSpeed = 0;
    }
    if (autoScrollSpeed !== 0 && autoScrollRAF === null) {
        const step = () => {
            if (autoScrollSpeed === 0 || dragIndex.value === null) {
                autoScrollRAF = null;
                return;
            }
            if (listContainerRef.value) listContainerRef.value.scrollTop += autoScrollSpeed;
            autoScrollRAF = requestAnimationFrame(step);
        };
        autoScrollRAF = requestAnimationFrame(step);
    }
}
function stopAutoScroll() {
    autoScrollSpeed = 0;
    if (autoScrollRAF !== null) {
        cancelAnimationFrame(autoScrollRAF);
        autoScrollRAF = null;
    }
}

// ---- inline chapter-field expand ----
const expandedKeys = ref<Set<string>>(new Set());
function toggleExpand(key: string) {
    const next = new Set(expandedKeys.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedKeys.value = next;
}
const contentEditorKey = ref<string | null>(null);

function chapterLabel(file: FileData): string {
    const num = file.metadata?.chapterNumber;
    const title = file.metadata?.chapterTitle;
    if (num && title) return `${t("FILELIST_ChapterPrefix")} ${num} — ${title}`;
    if (title) return title;
    if (num) return `${t("FILELIST_ChapterPrefix")} ${num}`;
    return "";
}
function hasBookInfo(file: FileData): boolean {
    return !!(file.metadata?.bookTitle || file.metadata?.author || file.metadata?.coverArt);
}
function bookInfoOf(file: FileData) {
    return { bookTitle: file.metadata?.bookTitle, author: file.metadata?.author, coverArt: file.metadata?.coverArt };
}

// ---- convert / clear (moved here from the sidebar) ----
const pendingFiles = computed(() => fileListStore.files.filter((f) => f.readyToStart));
const readyCount = computed(() => pendingFiles.value.length);
const missingTtsCount = computed(() => pendingFiles.value.filter((f) => !f.ttsConfig).length);
const convertDisabled = computed(() => readyCount.value === 0 || missingTtsCount.value > 0);
const convertTooltip = computed(() => {
    if (readyCount.value === 0) return t("FILELIST_ConvertDisabledEmpty");
    if (missingTtsCount.value > 0) return t("FILELIST_ConvertDisabledMissingTts", { n: missingTtsCount.value });
    return "";
});

const clearList = () => fileListStore.clearList();

// ---- download the audio of selected, finished chapters ----
const checkedFinishedFiles = computed(() => fileListStore.files.filter((f) => f.checked && f.finished));
const downloadDisabled = computed(() => checkedFinishedFiles.value.length === 0);

async function downloadAudio() {
    const filePaths = checkedFinishedFiles.value.map((file) => file.url).filter(Boolean) as string[];
    const result = await window.storyteller.downloadFiles(filePaths);
    if (result.succeeded > 0) {
        notify.success(`${t("MESSAGE_DownloadFilesBeforeSuccessNumber")}${result.succeeded}${t("MESSAGE_DownloadFilesAfterSuccessNumber")}`);
    }
    if (result.failed > 0) {
        notify.error(`${t("MESSAGE_DownloadFilesBeforeFailureNumber")}${result.failed}${t("MESSAGE_DownloadFilesAfterFailureNumber")}`);
    }
}

async function convertAll() {
    const filesToQueue = pendingFiles.value;
    const files = JSON.parse(JSON.stringify(filesToQueue)) as FileData[];
    const config = JSON.parse(JSON.stringify(ttsConfigStore.config));
    filesToQueue.forEach((file) => fileListStore.updateStatus(file.key, "inQueue"));
    await window.storyteller.convertFiles(files, config);
}

async function startFile(file: FileData) {
    fileListStore.updateStatus(file.key, "inQueue");
    const payload = JSON.parse(JSON.stringify(file)) as FileData;
    const config = JSON.parse(JSON.stringify(ttsConfigStore.config));
    await window.storyteller.convertFiles([payload], config);
}

let unsubscribeConversion: (() => void) | null = null;

onMounted(() => {
    unsubscribeConversion = window.storyteller.onConversionEvent(handleConversionEvent);
    window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
    stopAutoScroll();
    unsubscribeConversion?.();
});

function handleConversionEvent(res: ConversionEvent) {
    if (res.type === "error" && !res.filename) {
        notify.error(`${t("MESSAGE_SystemMalfunction")} ${res.error}`, 5000);
        return;
    }

    const filename = "filename" in res ? res.filename : undefined;
    const entry = fileListStore.files.find((e) => e.filename === filename);
    if (!entry) return;

    switch (res.type) {
        case "split-start":
            fileListStore.updateStatus(entry.key, "splitting");
            fileListStore.updateFile(entry.key, { errors: [], warnings: [] });
            break;
        case "split-complete":
            fileListStore.updateStatus(entry.key, "converting");
            fileListStore.updateFile(entry.key, { totalSections: res.totalSections, finishedSections: 0 });
            break;
        case "conversion-progress":
            // Authoritative value from main; never exceeds the total (fixes 57/55).
            fileListStore.updateFile(entry.key, {
                finishedSections: Math.min(res.finishedSections, res.totalSections),
                totalSections: res.totalSections,
            });
            break;
        case "combine-start":
            fileListStore.updateStatus(entry.key, "combining");
            break;
        case "combine-complete":
            fileListStore.updateStatus(entry.key, "finished");
            fileListStore.updateFile(entry.key, { url: res.url });
            break;
        case "cover-art-unavailable":
            fileListStore.updateFile(entry.key, {
                warnings: [...(entry.warnings || []), "cover-art-unavailable"],
            });
            notify.warning(`${t("MESSAGE_CoverArtUnavailableBeforeFilename")}${entry.filename}${t("MESSAGE_CoverArtUnavailableAfterFilename")}`);
            break;
        case "error":
            fileListStore.updateFile(entry.key, {
                errors: [...(entry.errors || []), res.error],
                finishedSections: 0,
            });
            fileListStore.updateStatus(entry.key, "readyToStart");
            notify.error(`${t("MESSAGE_ConversionFailureBeforeFilename")}${entry.filename}${t("MESSAGE_ConversionFailureAfterFilename")}${res.error}`, 5000);
            break;
    }
}

// ---- status presentation ----
function statusLabel(file: FileData): string {
    if (file.errors.length > 0) return t("FILELIST_ProgressStatusError");
    if (file.warnings.length > 0) return t("FILELIST_ProgressStatusWarning");
    if (file.converting) return t("FILELIST_ProgressStatusConverting");
    if (file.inQueue) return t("FILELIST_ProgressStatusInQueue");
    if (file.splitting) return t("FILELIST_ProgressStatusSplitting");
    if (file.combining) return t("FILELIST_ProgressStatusCombining");
    if (file.finished) return t("FILELIST_ProgressStatusFinished");
    return t("FILELIST_ProgressStatusReady");
}
function pillClass(file: FileData): string {
    if (file.errors.length > 0) return "st-pill--error";
    if (file.warnings.length > 0) return "st-pill--warn";
    if (file.finished) return "st-pill--done";
    if (file.converting || file.combining || file.splitting) return "st-pill--active";
    if (file.inQueue) return "st-pill--queue";
    return "st-pill--ready";
}
function pillIcon(file: FileData): string {
    if (file.errors.length > 0) return "fa-sharp fa-solid fa-circle-exclamation";
    if (file.warnings.length > 0) return "fa-sharp fa-solid fa-triangle-exclamation";
    if (file.finished) return "fa-sharp fa-solid fa-circle-check";
    if (file.converting || file.combining || file.splitting) return "fa-sharp fa-solid fa-spinner fa-spin";
    if (file.inQueue) return "fa-sharp fa-solid fa-hourglass-half";
    return "fa-sharp fa-solid fa-circle";
}
function trackClass(file: FileData): string {
    if (file.errors.length > 0) return "st-track--error";
    if (file.warnings.length > 0) return "st-track--warn";
    if (file.finished) return "st-track--done";
    return "";
}
function calculateProgress(file: FileData): number {
    if (file.splitting) return 0.05;
    if (file.converting) return 0.05 + (file.finishedSections / Math.max(1, file.totalSections)) * 0.9;
    if (file.combining) return 0.95;
    if (file.finished) return 1;
    return 0;
}

const removeFile = (file: FileData) => fileListStore.removeFile(file.key);

const downloadFile = async (url?: string) => {
    if (!url) return;
    const res = await window.storyteller.downloadFile(url);
    if (res.success) {
        notify.success(`${t("MESSAGE_DownloadFileSuccessBeforeFilename")}${res.filename}${t("MESSAGE_DownloadFileSuccessAfterFilename")}`);
    } else {
        notify.error(`${t("MESSAGE_DownloadFileFailure")}${res.error}.`);
    }
};
</script>

<style scoped>
.st-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.12s ease, border-color 0.12s ease;
}
.st-row:hover {
    background: rgba(255, 255, 255, 0.03);
}
.st-row.is-checked {
    background: rgba(124, 108, 255, 0.12);
    border-color: rgba(124, 108, 255, 0.35);
}
.st-drop-line {
    height: 2px;
    margin: 2px 12px;
    border-radius: 1px;
    background: var(--st-accent-soft);
    box-shadow: 0 0 6px 0 rgba(124, 108, 255, 0.7);
}
.st-drag-handle {
    width: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--st-text-3);
    cursor: grab;
    flex-shrink: 0;
}
.st-drag-handle:active {
    cursor: grabbing;
}
.st-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    font-size: 10px;
    color: var(--st-accent-soft);
    background: rgba(124, 108, 255, 0.14);
    flex-shrink: 0;
}
.st-status-icon {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    border: 1px solid var(--st-border);
    background: rgba(255, 255, 255, 0.03);
    color: var(--dot, var(--st-text-2));
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.12s ease;
}
.st-status-icon:hover:not(:disabled) {
    border-color: var(--st-border-strong);
    background: rgba(255, 255, 255, 0.06);
}
.st-status-icon.is-empty {
    color: var(--st-text-3);
    opacity: 0.4;
    cursor: default;
}
.st-row-expand {
    padding: 8px 12px 14px 58px;
}
.st-icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    border: 1px solid var(--st-border);
    background: rgba(255, 255, 255, 0.03);
    color: var(--st-text-2);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.12s ease;
}
.st-icon-btn:hover:not(:disabled) {
    color: var(--st-text-1);
    border-color: var(--st-border-strong);
}
.st-icon-btn--danger:hover:not(:disabled) {
    color: var(--st-danger);
    border-color: rgba(255, 92, 114, 0.5);
    background: rgba(255, 92, 114, 0.08);
}
.st-icon-btn--accent {
    color: var(--st-accent-soft);
    border-color: rgba(124, 108, 255, 0.35);
    background: rgba(124, 108, 255, 0.1);
}
.st-icon-btn:disabled,
.st-status-icon:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}
.st-status-icon.is-empty:disabled {
    opacity: 0.4;
}
.st-queue-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--st-border);
}
</style>
