<template>
    <a-modal v-model:visible="isModalVisible" title="Download Files">
        <a-list>
            <a-list-item style="cursor: pointer;" v-for="(file, index) in splittedFiles" :key="index" @click="downloadFile(file.path)">{{ file.filename }}</a-list-item>
        </a-list>
        <template #footer>
            <a-button type="primary" @click="addToList">Add to list</a-button>
        </template>
    </a-modal>
    <div class="flex h-screen w-screen bg-zinc-800 gap-4 gap-maker">
        <div class="flex flex-col w-full gap-4 h-screen gap-maker">
            <a-card class="w-full h-full flex flex-col" :body-style="{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }">
                <a-tooltip content="Example: 第.*?卷 .*?章">
                    <a-input placeholder="Input regex pattern to split chapters." allow-clear v-model="regexPattern" />
                </a-tooltip>
                <a-textarea class="grow" placeholder="Drag in a txt file to load content" @drop.prevent="handleFileDrop" @dragover.prevent v-model="fileContent" />
                <a-button-group class="justify-end gap-2">
                    <a-button type="primary" @click="sendDataToElectron">Split</a-button>
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

function sendDataToElectron() {
    ipcRenderer.send('make-chapters', fileContent.value, regexPattern.value);
}

onMounted(() => {
    ipcRenderer.on('chapters-made', (event, res) => {
        splittedFiles.value = res;
        isModalVisible.value = true;
    });
});

const downloadFile = (url: string) => {
    ipcRenderer.send('download-file', url);
}
ipcRenderer.on('file-downloaded', (event, res) => {
    if (res.success) {
        Message.success({
            id: crypto.randomUUID(),
            content: `${res.filename} downloaded.`,
            duration: 2000,
            position: 'bottom'
        })
    } else {
        Message.error({
            id: crypto.randomUUID(),
            content: `${res.err}.`,
            duration: 2000,
            position: 'bottom'
        })
    }
});

const addToList = () => {
    ipcRenderer.send("add-to-list", JSON.parse(JSON.stringify(splittedFiles.value)))
    isModalVisible.value = false;
}

</script>