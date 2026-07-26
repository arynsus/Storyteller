<template>
    <div class="flex h-screen w-screen text-white">
        <!-- Icon rail -->
        <nav class="st-rail">
            <div class="st-rail-logo"><i class="fa-sharp fa-solid fa-book-open"></i></div>
            <a-tooltip :content="t('CHAPTERMAKER_Title')" position="right">
                <button class="st-rail-btn" @click="openChapterMaker"><i class="fa-sharp fa-light fa-scissors"></i></button>
            </a-tooltip>
            <div class="grow"></div>
            <NotificationCenter variant="rail" />
            <a-tooltip :content="t('MAINWINDOW_ClearOutputCache')" position="right">
                <button
                    class="st-rail-btn"
                    :class="{ 'st-rail-btn--danger': cacheOverThreshold }"
                    @click="cacheModalVisible = true"
                ><i class="fa-sharp fa-light fa-broom-wide"></i></button>
            </a-tooltip>
            <a-tooltip :content="t('SETTINGS_Title')" position="right">
                <button class="st-rail-btn" @click="settingsVisible = true"><i class="fa-sharp fa-light fa-gear"></i></button>
            </a-tooltip>
        </nav>

        <SettingsModal :visible="settingsVisible" @close="settingsVisible = false" />
        <ClearCacheModal :visible="cacheModalVisible" @close="cacheModalVisible = false" />

        <!-- Main content -->
        <div class="flex flex-col grow min-w-0 gap-4 p-5">
            <DropzoneComponent />
            <FileListComponent />
            <AudioPlayerComponent />
        </div>

        <!-- Config sidebar -->
        <aside class="st-sidebar">
            <div class="flex flex-col gap-4 p-5 pl-0">
                <TTSConfigComponent />
                <MetadataConfigComponent />
            </div>
        </aside>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import DropzoneComponent from "../components/Dropzone.vue";
import FileListComponent from "../components/FileList.vue";
import AudioPlayerComponent from "../components/AudioPlayer.vue";
import TTSConfigComponent from "../components/TTSConfig.vue";
import MetadataConfigComponent from "../components/MetadataConfig.vue";
import SettingsModal from "../components/SettingsModal.vue";
import ClearCacheModal from "../components/ClearCacheModal.vue";
import NotificationCenter from "../components/NotificationCenter.vue";
import { useTTSConfigStore, useFileListStore, useCacheInfoStore } from "../store";
import { FileData, ConversionEvent } from "../../global/types";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const ttsConfigStore = useTTSConfigStore();
const fileListStore = useFileListStore();
const cacheInfoStore = useCacheInfoStore();

const cacheOverThreshold = computed(
    () => cacheInfoStore.size > ttsConfigStore.config.cacheClearThresholdMB * 1024 * 1024
);

const settingsVisible = ref(false);

const openChapterMaker = () => window.storyteller.openWindow("chapter-maker");
const cacheModalVisible = ref(false);

let unsubAddToList: (() => void) | null = null;
let unsubCacheCleared: (() => void) | null = null;
let unsubConversion: (() => void) | null = null;
onMounted(() => {
    cacheInfoStore.refresh();
    unsubAddToList = window.storyteller.onAddToList((files: FileData[]) => {
        files.forEach((file) => fileListStore.addFile(file));
    });
    // Fired when cache is cleared from the app menu (bypasses the modal below).
    unsubCacheCleared = window.storyteller.onOutputCacheCleared(() => cacheInfoStore.refresh());
    // A finished conversion adds a new file to the output cache.
    unsubConversion = window.storyteller.onConversionEvent((event: ConversionEvent) => {
        if (event.type === "combine-complete") cacheInfoStore.refresh();
    });
});
onUnmounted(() => {
    unsubAddToList?.();
    unsubCacheCleared?.();
    unsubConversion?.();
});
</script>

<style scoped>
.st-sidebar {
    width: 400px;
    flex-shrink: 0;
    height: 100vh;
    overflow-y: auto;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent 20%);
    border-left: 1px solid var(--st-border);
}
.st-sidebar > div {
    padding-left: 20px;
}
</style>
