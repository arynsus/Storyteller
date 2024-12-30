<template>
    <div class="flex h-screen w-screen bg-zinc-800 gap-4 gap-maker">
        <!-- Content Section -->
        <div class="flex flex-col w-3/4 gap-4 h-screen gap-maker">
            <DropzoneComponent />
            <FileListComponent />
            <AudioPlayerComponent />
        </div>

        <!-- Sidebar -->
        <a-scrollbar style="height:100%;overflow: auto;" outer-class="w-1/4">
            <div class="flex gap-maker gap-4 flex-col">
                <TTSConfigComponent />
                <MetadataConfigComponent />
                <div class="flex gap-2 justify-end">
                    <a-button :disabled="!fileListStore.files || fileListStore.files.length == 0" @click="clearList">{{ t('MAINWINDOW_ButtonClear') }}</a-button>
                    <a-button type="primary" :disabled="!fileListStore.files || fileListStore.files.filter(file => file.readyToStart).length == 0" @click="convertFiles">{{ t('MAINWINDOW_ButtonCovert')
                    }}</a-button>
                </div>
                <div class="flex gap-2 justify-end">
                    <a-button :disabled="fileListStore.getFinished.length == 0" @click="downloadAllFiles">{{ t('MAINWINDOW_ButtonDownloadAll') }}</a-button>
                </div>
            </div>
        </a-scrollbar>
    </div>
</template>

<script setup lang="ts">
import DropzoneComponent from '../components/Dropzone.vue';
import FileListComponent from '../components/FileList.vue';
import AudioPlayerComponent from '../components/AudioPlayer.vue';
import TTSConfigComponent from '../components/TTSConfig.vue';
import MetadataConfigComponent from '../components/MetadataConfig.vue';
import { Message } from '@arco-design/web-vue';
import { ipcRenderer } from "electron";
import { useTTSConfigStore, useFileListStore } from '../store';
import { FileData } from "../../global/types";
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const ttsConfigStore = useTTSConfigStore();
const fileListStore = useFileListStore();

// Button Functions
const clearList = () => {
    fileListStore.clearList()
}
const convertFiles = () => {
    const filesToQueue = fileListStore.files.filter(file => file.readyToStart)
    const files = JSON.parse(JSON.stringify(filesToQueue));
    const config = JSON.parse(JSON.stringify(ttsConfigStore.config));
    ipcRenderer.send('convert-files', files, config);
    filesToQueue.forEach(file => {
        fileListStore.updateStatus(file.key, 'inQueue')
    })
};

// Receive split results from Chapter Maker for TTS conversion.
ipcRenderer.on('add-to-list', (event, files: FileData[]) => {
    files.forEach(file => {
        fileListStore.addFile(file)
    })
});

// Inform output cache clearing result.
ipcRenderer.on('output-cache-cleared', (event, removedNumber: number) => {
    Message.success({
        id: crypto.randomUUID(),
        content: `${t('MESSAGE_OutputCacheClearBeforeNumber')}${removedNumber}${t('MESSAGE_OutputCacheClearAfterNumber')}`,
        duration: 2000,
        position: 'bottom'
    })
});

// Download all converted files.
const downloadAllFiles = () => {
    const filePaths = JSON.parse(JSON.stringify(fileListStore.getFinished.map(file => file.url)))
    ipcRenderer.send('download-files', filePaths)
}

// Inform download files result.
ipcRenderer.on('files-downloaded', (event, result) => {
    if (result.succeeded > 0) {
        Message.success({
            id: crypto.randomUUID(),
            content: `${t('MESSAGE_DownloadFilesBeforeSuccessNumber')}${result.succeeded}${t('MESSAGE_DownloadFilesAfterSuccessNumber')}`,
            duration: 2000,
            position: 'bottom'
        })
    }
    if (result.failed > 0) {
        Message.error({
            id: crypto.randomUUID(),
            content: `${t('MESSAGE_DownloadFilesBeforeFailureNumber')}${result.failed}${t('MESSAGE_DownloadFilesAfterFailureNumber')}`,
            duration: 2000,
            position: 'bottom'
        })
    }
});

</script>

<style>
.gap-maker::before,
.gap-maker::after {
    content: '';
}
</style>