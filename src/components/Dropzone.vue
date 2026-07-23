<template>
    <div
        class="st-dropzone w-full flex items-center justify-center gap-4 shrink-0 px-6 py-5"
        :class="{ 'is-drag': isDragging }"
        @drop.prevent="handleDrop"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @click="triggerFileInput"
    >
        <div class="st-dropzone-icon">
            <i class="fa-sharp fa-light fa-file-arrow-up"></i>
        </div>
        <div class="flex flex-col">
            <p class="font-semibold text-[15px]">{{ t('DROPZONE_dragInFilesIndicator') }}</p>
            <p class="st-text-3 text-[13px]">{{ t('DROPZONE_dragInFilesSuggestion') }}</p>
        </div>
        <input type="file" ref="fileInput" @change="handleFileInput" multiple style="display: none;" accept=".txt" />
    </div>
</template>

<script setup lang="ts">
import wordsCount from "words-count";
import { ref } from "vue";
import { useFileListStore } from "../store";
import { FileDataClass } from "../../global/types";
import { analyzeMetadata } from "../../global/metadataAnalyzer";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const fileListStore = useFileListStore();
const fileInput = ref<HTMLInputElement>();
const isDragging = ref(false);

const handleFilesProcessing = (files: File[]) => {
    files.forEach((file) => {
        file.text().then((text) => {
            const wordCount = wordsCount(text);
            const fileData = new FileDataClass(file.name, file.name, (file as File & { path: string }).path, wordCount, analyzeMetadata(file.name));
            if (!fileListStore.files.some((f) => f.key === fileData.key)) {
                fileListStore.addFile(fileData);
            }
        });
    });
    if (fileInput.value) fileInput.value.value = "";
};

const handleDrop = (event: DragEvent) => {
    isDragging.value = false;
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    handleFilesProcessing(droppedFiles.filter((file) => file.name.endsWith(".txt")));
};
const handleFileInput = (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (files) {
        handleFilesProcessing(Array.from(files).filter((file) => file.name.endsWith(".txt")));
    }
};
const triggerFileInput = () => fileInput.value?.click();
</script>

<style scoped>
.st-dropzone-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: var(--st-accent-soft);
    background: rgba(124, 108, 255, 0.12);
    border: 1px solid rgba(124, 108, 255, 0.25);
    flex-shrink: 0;
}
</style>
