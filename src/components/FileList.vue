<template>
    <div class="w-full h-full flex flex-col grow m-0.5" ref="tableWrapper">
        <a-card class="w-full h-full" :body-style="{ padding: 0 }">

            <a-table :scroll="{ y: tableWrapperHeight }" :scrollbar="true" :data="fileListStore.files" :pagination="false" @row-click="selectForPreview"
                :row-class="record => record.selected ? 'selected-row' : ''">
                <template #empty>
                    <div class="drag-in-file-indicator" :style="{ height: `${tableWrapperHeight - 18}px` }">

                    </div>
                </template>
                <template #columns>
                    <a-table-column :title=" t('FILELIST_TableHeaderFilename') " :ellipsis="true" data-index="filename"> </a-table-column>
                    <a-table-column :title=" t('FILELIST_TableHeaderWordCount') " data-index="wordcount" :width="120"></a-table-column>
                    <a-table-column :title=" t('FILELIST_TableHeaderProgress') " :width="240">
                        <template #cell="{ record }">
                            <Progress :percent="calculateProgress(record)" :status="getProgressBarStatus(record)">
                                <template v-slot:text>
                                    <div v-if="record.errors.length > 0">
                                        {{ t('FILELIST_ProgressStatusError') }}
                                    </div>
                                    <div v-else-if="record.warnings.length > 0">
                                        {{ t('FILELIST_ProgressStatusWarning') }}
                                    </div>
                                    <div v-else-if="record.converting">
                                        {{ t('FILELIST_ProgressStatusConverting') }} {{ record.finishedSections + 1 }} / {{ record.totalSections }}
                                    </div>
                                    <div v-else-if="record.inQueue">
                                        {{ t('FILELIST_ProgressStatusInQueue') }}
                                    </div>
                                    <div v-else-if="record.splitting">
                                        {{ t('FILELIST_ProgressStatusSplitting') }}
                                    </div>
                                    <div v-else-if="record.combining">
                                        {{ t('FILELIST_ProgressStatusCombining') }}
                                    </div>
                                    <div v-else-if="record.finished">
                                        {{ t('FILELIST_ProgressStatusFinished') }}
                                    </div>
                                    <div v-else>
                                        {{ t('FILELIST_ProgressStatusReady') }}
                                    </div>
                                </template>
                            </Progress>
                        </template>
                    </a-table-column>
                    <a-table-column :title=" t('FILELIST_TableHeaderActions') " :width="80">
                        <template #cell="{ record }">
                            <a-button v-if="!record.finished" :disabled="!record.readyToStart" type="primary" shape="round" status="danger" @click="() => removeFile(record)">
                                <template #icon>
                                    <i class="fa-sharp fa-light fa-trash-alt"></i>
                                </template>
                            </a-button>
                            <a-button v-else type="primary" shape="round" @click="() => downloadFile(record.url)">
                                <template #icon>
                                    <i class="fa-sharp fa-light fa-download"></i>
                                </template>
                            </a-button>
                        </template>
                    </a-table-column>
                </template>
            </a-table>

        </a-card>

    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watchEffect } from 'vue';
import { TableData, Message, Progress, Button as AButton } from '@arco-design/web-vue';
import { ipcRenderer } from 'electron';
import { useFileListStore } from '../store';
import { FileData } from "../../global/types";
import { useI18n } from 'vue-i18n';

// Inside your setup function
const { t } = useI18n();

const fileListStore = useFileListStore();

// Table will activate scrollbar once reach maximum height possible to allocate.
const tableWrapper = ref<HTMLElement | null>(null);
const tableWrapperHeight = ref(0);
onMounted(() => {
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    if (tableWrapper.value) {
        resizeObserver.observe(document.body);
    }
    watchEffect((onInvalidate) => {
        onInvalidate(() => {
            if (tableWrapper.value) {
                resizeObserver.unobserve(tableWrapper.value);
            }
        });
    });
});
const updateHeight = () => {
    if (tableWrapper.value) {
        tableWrapperHeight.value = window.innerHeight - 275
    }
};

// Receive websocket message from electron and display.
onMounted(() => {
    const ws = new WebSocket('ws://localhost:8080');
    ws.onmessage = (event) => {
        const res = JSON.parse(event.data);
        if (res.type == "error" && !res.filename) {
            return Message.error({
                id: crypto.randomUUID(),
                content: `${t('MESSAGE_SystemMalfunction')} ${res.error}`,
                duration: 5000,
                position: 'bottom'
            })
        }
        const entryToModify = fileListStore.files.find(entry => entry.filename === res.filename);
        if (entryToModify) {
            let updateData: Partial<Pick<FileData, 'errors' | 'totalSections' | 'finishedSections' | 'url' | 'warnings'>> = {};

            switch (res.type) {
                case 'split-start':
                    fileListStore.updateStatus(entryToModify.key, 'splitting');
                    updateData.errors = [];
                    break;
                case 'split-complete':
                    fileListStore.updateStatus(entryToModify.key, 'converting');
                    updateData.totalSections = res.sections;
                    break;
                case 'conversion-progress':
                    updateData.finishedSections = (entryToModify.finishedSections || 0) + 1;
                    break;
                case 'combine-start':
                    fileListStore.updateStatus(entryToModify.key, 'combining');
                    break;
                case 'combine-complete':
                    fileListStore.updateStatus(entryToModify.key, 'finished');
                    updateData.url = res.url;
                    break;
                case 'cover-art-unavailable':
                    updateData.warnings = entryToModify.warnings ? [...entryToModify.warnings, 'cover-art-unavailable'] : ['cover-art-unavailable'];
                    Message.warning({
                        id: crypto.randomUUID(),
                        content: `${t("MESSAGE_CoverArtUnavailableBeforeFilename")}${entryToModify.filename}${t("MESSAGE_CoverArtUnavailableAfterFilename")}`,
                        duration: 2000,
                        position: 'bottom'
                    });
                    break;
                case 'error':
                    updateData.errors = [...(entryToModify.errors || []), res.error];
                    fileListStore.updateStatus(entryToModify.key, 'readyToStart');
                    updateData.finishedSections = 0;
                    Message.error({
                        id: crypto.randomUUID(),
                        content: `${t("MESSAGE_ConversionFailureBeforeFilename")}${res.error}${t("MESSAGE_ConversionFailureBeforeFilename")}`,
                        duration: 5000,
                        position: 'bottom'
                    })
                    break;
            }
            fileListStore.updateFile(entryToModify.key, updateData);
        };
    }
}
);

// Progress bar color scheme
const getProgressBarStatus = (row: TableData) => {
    if (row.errors.length > 0) {
        return 'danger';
    }
    if (row.warnings.length > 0) {
        return 'warning';
    }
    if (row.finished) {
        return 'success';
    }
    return 'normal'; // Default color
}

const calculateProgress = (row: TableData) => {
    if (row.splitting) {
        return 0.05; // Fixed 5% for splitting
    } else if (row.converting) {
        // Scaling the progress: 5% (initial offset for splitting) + 90% of the converting progress
        return 0.05 + (row.finishedSections / row.totalSections) * 0.9;
    } else if (row.combining) {
        return 0.95; // Fixed 95% for combining
    } else if (row.finished) {
        return 1; // 100% when finished
    }
    return 0; // Default to 0% if none of the conditions are met (e.g., readyToStart)
}


// Highlight specific file for preview or metadata editing
const selectForPreview = (row: TableData) => {
    if (row.key) {
        fileListStore.toggleSelect(row.key)
    }
}

// Button functions
const removeFile = (file: FileData) => {
    fileListStore.removeFile(file.key);
};
const downloadFile = (url: string) => {
    ipcRenderer.send('download-file', url);
}

ipcRenderer.on('file-downloaded', (event, res) => {
    if (res.success) {
        Message.success({
            id: crypto.randomUUID(),
            content: `${t("MESSAGE_DownloadFileSuccessBeforeFilename")}${res.filename}${t("MESSAGE_DownloadFileSuccessAfterFilename")}`,
            duration: 2000,
            position: 'bottom'
        })
    } else {
        Message.error({
            id: crypto.randomUUID(),
            content: `${t("MESSAGE_DownloadFileFailure")}${res.err}.`,
            duration: 2000,
            position: 'bottom'
        })
    }
});
</script>

<style>
.selected-row td {
    background-color: var(--color-fill-1);
    font-weight: bold;
}
</style>