<template>
    <div class="flex h-screen w-screen text-white">
        <!-- Icon rail -->
        <nav class="st-rail">
            <div class="st-rail-logo"><img src="/favicon.png" alt="Storyteller" /></div>
            <a-tooltip :content="t('MAINWINDOW_ConverterTab')" position="right">
                <button
                    class="st-rail-btn"
                    :class="{ 'is-active': activeTab === 'converter' }"
                    @click="activeTab = 'converter'"
                ><i class="fa-sharp fa-light fa-waveform-lines"></i></button>
            </a-tooltip>
            <a-tooltip :content="t('EBOOKLOADER_Title')" position="right">
                <button
                    class="st-rail-btn"
                    :class="{ 'is-active': activeTab === 'ebook-loader' }"
                    @click="activeTab = 'ebook-loader'"
                ><i class="fa-sharp fa-light fa-book-open-cover"></i></button>
            </a-tooltip>
            <a-tooltip :content="cacheOverThreshold ? t('MAINWINDOW_HistoryTabOverThreshold') : t('HISTORY_Title')" position="right">
                <button
                    class="st-rail-btn"
                    :class="{ 'is-active': activeTab === 'history', 'st-rail-btn--danger': cacheOverThreshold && activeTab !== 'history' }"
                    @click="activeTab = 'history'"
                ><i class="fa-sharp fa-light fa-clock-rotate-left"></i></button>
            </a-tooltip>
            <div class="grow"></div>
            <NotificationCenter variant="rail" />
            <a-tooltip :content="t('SETTINGS_Title')" position="right">
                <button class="st-rail-btn" @click="settingsVisible = true"><i class="fa-sharp fa-light fa-gear"></i></button>
            </a-tooltip>
        </nav>

        <SettingsModal :visible="settingsVisible" @close="settingsVisible = false" />

        <!-- Main content -->
        <div v-show="activeTab === 'converter'" class="flex flex-col grow min-w-0 gap-4 p-5">
            <DropzoneComponent />
            <FileListComponent />
            <AudioPlayerComponent />
        </div>
        <EbookLoaderTab
            v-show="activeTab === 'ebook-loader'"
            class="grow min-w-0"
            @added-to-queue="activeTab = 'converter'"
        />
        <HistoryTab v-show="activeTab === 'history'" class="grow min-w-0" :active="activeTab === 'history'" />

        <!-- Config sidebar -->
        <aside v-if="activeTab === 'converter'" class="st-sidebar">
            <div class="flex flex-col gap-4 p-5 pl-0">
                <TTSConfigComponent />
                <MetadataConfigComponent />
            </div>
        </aside>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import DropzoneComponent from "../components/Dropzone.vue";
import FileListComponent from "../components/FileList.vue";
import AudioPlayerComponent from "../components/AudioPlayer.vue";
import TTSConfigComponent from "../components/TTSConfig.vue";
import MetadataConfigComponent from "../components/MetadataConfig.vue";
import SettingsModal from "../components/SettingsModal.vue";
import NotificationCenter from "../components/NotificationCenter.vue";
import EbookLoaderTab from "./EbookLoaderTab.vue";
import HistoryTab from "./HistoryTab.vue";
import { useTTSConfigStore, useFileListStore, useCacheInfoStore } from "../store";
import { notify } from "../composables/notify";
import { formatBytes } from "../composables/format";
import { FileData, ConversionEvent } from "../../global/types";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const ttsConfigStore = useTTSConfigStore();
const fileListStore = useFileListStore();
const cacheInfoStore = useCacheInfoStore();

const cacheOverThreshold = computed(
    () => cacheInfoStore.size > ttsConfigStore.config.cacheClearThresholdMB * 1024 * 1024
);

// The clear-cache rail button is gone, so the threshold speaks up twice: the
// History icon turns red, and crossing the line (not merely sitting past it)
// files one notification pointing at where to do something about it.
watch(cacheOverThreshold, (isOver, wasOver) => {
    if (isOver && !wasOver) {
        notify.warning(
            t("MESSAGE_CacheThresholdReached", {
                size: formatBytes(cacheInfoStore.size),
                limit: `${ttsConfigStore.config.cacheClearThresholdMB} MB`,
            })
        );
    }
});

const settingsVisible = ref(false);

const activeTab = ref<"converter" | "ebook-loader" | "history">("converter");

let unsubAddToList: (() => void) | null = null;
let unsubOpenHistory: (() => void) | null = null;
let unsubConversion: (() => void) | null = null;
onMounted(() => {
    cacheInfoStore.refresh();
    unsubAddToList = window.storyteller.onAddToList((files: FileData[]) => {
        files.forEach((file) => fileListStore.addFile(file));
    });
    unsubOpenHistory = window.storyteller.onOpenHistory(() => (activeTab.value = "history"));
    // A finished conversion adds a new file to the output cache.
    unsubConversion = window.storyteller.onConversionEvent((event: ConversionEvent) => {
        if (event.type === "combine-complete") cacheInfoStore.refresh();
    });
});
onUnmounted(() => {
    unsubAddToList?.();
    unsubOpenHistory?.();
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
