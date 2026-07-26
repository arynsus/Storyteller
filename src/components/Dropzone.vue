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
import { ref } from "vue";
import { useFileListStore } from "../store";
import { notify } from "../composables/notify";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const fileListStore = useFileListStore();
const fileInput = ref<HTMLInputElement>();
const isDragging = ref(false);

// Every dropped/selected file is copied into the app's working area (main
// process) rather than referenced by its original path, so conversion and
// the content editor only ever deal with one app-owned copy.
const handleFilesProcessing = async (files: File[], rejectedCount: number) => {
    if (rejectedCount > 0) {
        notify.warning(`${rejectedCount} ${t("DROPZONE_NonTxtRejected")}`);
    }
    if (files.length > 0) {
        const payload = await Promise.all(
            files.map(async (file) => ({ filename: file.name, content: await file.text() }))
        );
        const res = await window.storyteller.importDroppedFiles(payload);
        if (res.success && res.files) {
            res.files.forEach((f) => fileListStore.addFile(f));
        } else if (!res.success) {
            notify.error(`${t("DROPZONE_ImportFailure")}${res.error}`);
        }
    }
    if (fileInput.value) fileInput.value.value = "";
};

const splitByExtension = (files: File[]): { accepted: File[]; rejectedCount: number } => {
    const accepted = files.filter((file) => file.name.toLowerCase().endsWith(".txt"));
    return { accepted, rejectedCount: files.length - accepted.length };
};

const handleDrop = (event: DragEvent) => {
    isDragging.value = false;
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    const { accepted, rejectedCount } = splitByExtension(droppedFiles);
    handleFilesProcessing(accepted, rejectedCount);
};
const handleFileInput = (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (files) {
        const { accepted, rejectedCount } = splitByExtension(Array.from(files));
        handleFilesProcessing(accepted, rejectedCount);
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
