<template>
    <div class="flex h-screen w-screen bg-zinc-800 gap-4 gap-maker">
        <!-- Content Section -->
        <div class="flex flex-col w-full gap-4 h-screen gap-maker">
            <DropzoneComponent />
            <FileListComponent />
            <AudioPlayerComponent />
        </div>

        <!-- Sidebar -->
        <div class="w-96 flex gap-maker gap-4 flex-col">
            <TTSConfigComponent />
            <MetadataConfigComponent />
            <div class="flex gap-2 justify-end">
                <a-button :disabled="!fileListStore.files || fileListStore.files.length == 0" @click="clearList">Clear</a-button>
                <a-button type="primary" :disabled="!fileListStore.files || fileListStore.files.filter(file => file.readyToStart).length == 0" @click="convertFiles">Convert</a-button>
            </div>
        </div>
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
import { useEdgeTTSConfigStore, useFileListStore } from '../store';
import { FileData } from "../../global/types";

const edgeTTSConfigStore = useEdgeTTSConfigStore();
const fileListStore = useFileListStore();

// Button Functions
const clearList = () => {
    fileListStore.clearList()
}
const convertFiles = () => {
    if (!fileListStore.files || fileListStore.files.filter(file => !file.url).length == 0) {
        return Message.warning({
            id: crypto.randomUUID(),
            content: `There is nothing to convert --!`,
            duration: 2000,
            position: 'bottom'
        })
    }
    const filesToQueue = fileListStore.files.filter(file => file.readyToStart)
    const files = JSON.parse(JSON.stringify(filesToQueue));
    const config = JSON.parse(JSON.stringify(edgeTTSConfigStore.config));
    ipcRenderer.send('convert-files', files, config);
    filesToQueue.forEach(file=>{
        fileListStore.updateStatus(file.key, 'inQueue')
    })
};

ipcRenderer.on('add-to-list', (event, files: FileData[]) => {
    files.forEach(file => {
        fileListStore.addFile(file)
    })
});

ipcRenderer.on('output-cache-cleared', (event, removedNumber: number) => {
    Message.success({
        id: crypto.randomUUID(),
        content: `Output cache folder cleared. ${removedNumber} files removed.`,
        duration: 2000,
        position: 'bottom'
    })
});

</script>

<style>
.gap-maker::before,
.gap-maker::after {
    content: '';
}
</style>