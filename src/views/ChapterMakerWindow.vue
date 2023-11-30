<template>
    <a-modal v-model:visible="isModalVisible" :title="t('CHAPTERMAKER_DownloadFilesCardTitle')">
        <a-scrollbar style="overflow: auto; height: 300px;">
            <a-list>
                <a-list-item style="cursor: pointer;" v-for="(file, index) in splittedFiles" :key="index" @click="downloadFile(file.path)">{{ file.filename }}</a-list-item>
            </a-list>
        </a-scrollbar>
        <template #footer>
            <a-button type="primary" @click="addToList">{{ t('CHAPTERMAKER_ButtonAddToList') }}</a-button>
        </template>
    </a-modal>
    <div class="flex h-screen w-screen bg-zinc-800 gap-4 gap-maker">
        <div class="flex flex-col w-full gap-4 h-screen gap-maker">
            <a-card class="w-full h-full flex flex-col" :body-style="{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }">
                <a-tooltip :content="t('CHAPTERMAKER_RegexExample')">
                    <a-input :placeholder="t('CHAPTERMAKER_RegexInputPlaceholder')" allow-clear v-model="regexPattern" />
                </a-tooltip>
                <a-textarea class="grow" :placeholder="t('CHAPTERMAKER_DragInFileIndicator')" @drop.prevent="handleFileDrop" @dragover.prevent v-model="fileContent" />
                <a-button-group class="justify-end gap-2">
                    <a-button type="primary" @click="startMakingChapters">{{ t('CHAPTERMAKER_ButtonSplit') }}</a-button>
                </a-button-group>
            </a-card>
        </div>
    </div>
</template>

<script setup lang="ts">

import { ref, onMounted } from 'vue';
import { ipcRenderer } from 'electron';
import { FileData } from '../../global/types';
import { Message } from '@arco-design/web-vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const fileContent = ref<string>('');
const regexPattern = ref<string>('');
const splittedFiles = ref<FileData[]>([]);
const isModalVisible = ref(false);

function handleFileDrop(event: DragEvent) {
    const file = event.dataTransfer?.files[0];
    if (file && file.type === "text/plain") {
        const reader = new FileReader();
        reader.onload = (e) => {
            fileContent.value = String(e.target?.result);
        };
        reader.readAsText(file);
    }
}

function startMakingChapters() {
    ipcRenderer.send('make-chapters', fileContent.value, regexPattern.value);
}
ipcRenderer.on('chapters-made', (event, res) => {
    splittedFiles.value = res;
    isModalVisible.value = true;
});

// Send the split results to main list for TTS conversion.
const addToList = () => {
    ipcRenderer.send("add-to-list", JSON.parse(JSON.stringify(splittedFiles.value)))
    isModalVisible.value = false;
}

// Download splited files
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