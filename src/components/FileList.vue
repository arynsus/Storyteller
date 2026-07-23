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

        <div class="grow min-h-0 overflow-y-auto px-2 py-2">
            <!-- Empty state -->
            <div v-if="fileListStore.files.length === 0" class="h-full flex flex-col items-center justify-center gap-3 st-text-3">
                <i class="fa-sharp fa-light fa-inbox text-4xl opacity-60"></i>
                <p class="text-[14px]">{{ t('FILELIST_EmptyState') }}</p>
            </div>

            <!-- Rows -->
            <div
                v-for="file in fileListStore.files"
                :key="file.key"
                class="st-row"
                :class="{ 'is-selected': file.selected, 'is-checked': file.checked }"
                @click="selectForPreview(file)"
            >
                <div class="shrink-0" @click.stop>
                    <a-checkbox :model-value="!!file.checked" @change="() => fileListStore.toggleChecked(file.key)" />
                </div>
                <div class="min-w-0 grow">
                    <div class="flex items-center gap-2">
                        <span class="truncate font-medium text-[14px]">{{ file.filename }}</span>
                        <span v-if="file.useCustomTts" class="st-tag" :title="t('FILELIST_CustomTtsTag')">
                            <i class="fa-sharp fa-solid fa-sliders"></i>
                        </span>
                    </div>
                    <div class="st-text-3 text-[12px] mt-0.5">{{ file.wordcount }} {{ t('FILELIST_Words') }}</div>
                </div>

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
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, computed } from "vue";
import { Message } from "@arco-design/web-vue";
import { useFileListStore } from "../store";
import { FileData, ConversionEvent } from "../../global/types";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const fileListStore = useFileListStore();

const checkedCount = computed(() => fileListStore.files.filter((f) => f.checked).length);
const someChecked = computed(() => checkedCount.value > 0);
const allChecked = computed(
    () => fileListStore.files.length > 0 && checkedCount.value === fileListStore.files.length
);
const toggleAll = () => fileListStore.setAllChecked(!allChecked.value);

let unsubscribeConversion: (() => void) | null = null;
let unsubscribeDownload: (() => void) | null = null;

onMounted(() => {
    unsubscribeConversion = window.storyteller.onConversionEvent(handleConversionEvent);
});
onUnmounted(() => {
    unsubscribeConversion?.();
    unsubscribeDownload?.();
});

function handleConversionEvent(res: ConversionEvent) {
    if (res.type === "error" && !res.filename) {
        Message.error({
            id: crypto.randomUUID(),
            content: `${t("MESSAGE_SystemMalfunction")} ${res.error}`,
            duration: 5000,
            position: "bottom",
        });
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
            Message.warning({
                id: crypto.randomUUID(),
                content: `${t("MESSAGE_CoverArtUnavailableBeforeFilename")}${entry.filename}${t("MESSAGE_CoverArtUnavailableAfterFilename")}`,
                duration: 2000,
                position: "bottom",
            });
            break;
        case "error":
            fileListStore.updateFile(entry.key, {
                errors: [...(entry.errors || []), res.error],
                finishedSections: 0,
            });
            fileListStore.updateStatus(entry.key, "readyToStart");
            Message.error({
                id: crypto.randomUUID(),
                content: `${t("MESSAGE_ConversionFailureBeforeFilename")}${entry.filename}${t("MESSAGE_ConversionFailureAfterFilename")}${res.error}`,
                duration: 5000,
                position: "bottom",
            });
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

const selectForPreview = (file: FileData) => fileListStore.toggleSelect(file.key);
const removeFile = (file: FileData) => fileListStore.removeFile(file.key);

const downloadFile = async (url?: string) => {
    if (!url) return;
    const res = await window.storyteller.downloadFile(url);
    if (res.success) {
        Message.success({
            id: crypto.randomUUID(),
            content: `${t("MESSAGE_DownloadFileSuccessBeforeFilename")}${res.filename}${t("MESSAGE_DownloadFileSuccessAfterFilename")}`,
            duration: 2000,
            position: "bottom",
        });
    } else {
        Message.error({
            id: crypto.randomUUID(),
            content: `${t("MESSAGE_DownloadFileFailure")}${res.error}.`,
            duration: 2000,
            position: "bottom",
        });
    }
};
</script>

<style scoped>
.st-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: 12px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.12s ease, border-color 0.12s ease;
}
.st-row:hover {
    background: rgba(255, 255, 255, 0.03);
}
.st-row.is-selected {
    background: rgba(124, 108, 255, 0.1);
    border-color: rgba(124, 108, 255, 0.35);
}
.st-row.is-checked {
    background: rgba(124, 108, 255, 0.06);
}
.st-row.is-checked.is-selected {
    background: rgba(124, 108, 255, 0.14);
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
.st-icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    border: 1px solid var(--st-border);
    background: rgba(255, 255, 255, 0.03);
    color: var(--st-text-2);
    cursor: pointer;
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
.st-icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}
</style>
