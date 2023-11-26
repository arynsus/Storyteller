<template>
    <div class="dropzone w-full h-24 flex flex-col gap-1 justify-center items-center shrink-0" @drop.prevent="handleDrop" @dragover.prevent @click="triggerFileInput">
        <p>Drag in .txt files to start or click to select files.</p>
        <p>One chapter per .txt recommended.</p>
        <input type="file" ref="fileInput" @change="handleFileInput" multiple style="display: none;" accept=".txt">
    </div>
</template>

<script setup lang="ts">
import wordsCount from 'words-count';
import { ref } from 'vue';
import { useFileListStore } from '../store';
import { FileDataClass } from "../../global/types";
import { analyzeMetadata } from "../../global/metadataAnalyzer";

const fileListStore = useFileListStore();

const fileInput = ref<HTMLInputElement>();

const handleFilesProcessing = (files: File[]) => {
    files.forEach(file => {
        file.text().then(text => {
            const wordCount = wordsCount(text);
            const fileData = new FileDataClass(file.name, file.name, file.path, wordCount, analyzeMetadata(file.name))

            // Append unique files to the existing list
            if (!fileListStore.files.some(f => f.key === fileData.key)) {
                fileListStore.addFile(fileData)
            }
        });
    });
    if (fileInput.value) {
        fileInput.value.value = '';
    }
};

const handleDrop = (event: DragEvent) => {
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    handleFilesProcessing(droppedFiles.filter(file => file.name.endsWith('.txt')));
};

const handleFileInput = (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (files) {
        handleFilesProcessing(Array.from(files).filter(file => file.name.endsWith('.txt')));
    }
};

const triggerFileInput = () => {
    fileInput.value?.click();
};

</script>

<style>
.dropzone {
    background-color: var(--color-bg-2);
    margin: 1px 2px 0 2px;
    border: 2px var(--color-text-3) dotted;
    cursor: pointer;
}

.dropzone p {
    color: var(--color-text-2)
}
</style>