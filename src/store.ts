import { defineStore } from "pinia";
import { toRaw } from "vue";
import { TTSConfig, FileData, MetadataConfig, resolveEffectiveConfig } from "../global/types";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface AppNotification {
    id: string;
    type: NotificationType;
    content: string;
    timestamp: number;
    read: boolean;
}

const NOTIFICATION_HISTORY_LIMIT = 100;

export const useNotificationStore = defineStore("notifications", {
    state: () => ({
        notifications: [] as AppNotification[],
    }),
    getters: {
        unreadCount: (state) => state.notifications.filter((n) => !n.read).length,
    },
    actions: {
        push(type: NotificationType, content: string) {
            this.notifications.unshift({
                id: crypto.randomUUID(),
                type,
                content,
                timestamp: Date.now(),
                read: false,
            });
            if (this.notifications.length > NOTIFICATION_HISTORY_LIMIT) {
                this.notifications.length = NOTIFICATION_HISTORY_LIMIT;
            }
        },
        markAllRead() {
            this.notifications.forEach((n) => (n.read = true));
        },
        remove(id: string) {
            this.notifications = this.notifications.filter((n) => n.id !== id);
        },
        clear() {
            this.notifications = [];
        },
    },
});

export const useTTSConfigStore = defineStore("ttsconfig", {
    state: () => ({
        config: {
            service: "edge",
            voice: "zh-CN-XiaoxiaoNeural",
            pitch: 0,
            speed: 0,
            wordsPerSection: 300,
            jobConcurrencyLimit: 1,
            sectionConcurrencyLimit: 1,
            outputFormat: "m4b",
            cacheClearThresholdMB: 50,
            azureKey: "",
            azureRegion: "",
        } as TTSConfig,
    }),
    getters: {
        getConfig: (state) => state.config,
    },
    actions: {
        async loadConfigFromMain() {
            const cfg = await window.storyteller.getConfig();
            if (cfg) this.config = { ...this.config, ...cfg };
        },
        async saveConfigToMain() {
            if (!this.config) return;
            const saved = await window.storyteller.saveConfig(toRaw(this.config));
            if (saved) this.config = saved;
        },
        updateConfig(newConfig: Partial<TTSConfig>) {
            this.config = { ...this.config, ...newConfig };
        },
    },
});

export const useCacheInfoStore = defineStore("cacheinfo", {
    state: () => ({
        size: 0,
        count: 0,
    }),
    actions: {
        async refresh() {
            const info = await window.storyteller.getOutputCacheInfo();
            this.size = info.size;
            this.count = info.count;
        },
    },
});

export const useFileListStore = defineStore("filelist", {
    state: () => ({
        files: [] as FileData[],
    }),
    getters: {
        getSelected: (state) => state.files.find((file) => file.selected),
        getFinished: (state) => state.files.filter((file) => file.finished),
        getChecked: (state) => state.files.filter((file) => file.checked),
        getFileWithKey: (state) => (key: string) => state.files.find((file) => file.key === key),
    },
    actions: {
        addFile(file: FileData) {
            if (!this.getFileWithKey(file.key)) {
                this.files.push(file);
            }
        },
        removeFile(key: string) {
            this.files = this.files.filter((file) => file.key !== key);
        },
        updateFile(key: string, updatedData: Partial<FileData>) {
            const index = this.files.findIndex((file) => file.key === key);
            if (index !== -1) {
                this.files[index] = { ...this.files[index], ...updatedData };
            }
        },
        clearList() {
            this.files = [];
        },
        toggleSelect(key: string) {
            this.files = this.files.map((file) =>
                file.key === key ? { ...file, selected: !file.selected } : { ...file, selected: false }
            );
        },
        toggleChecked(key: string) {
            const file = this.files.find((f) => f.key === key);
            if (file) file.checked = !file.checked;
        },
        setAllChecked(value: boolean) {
            this.files.forEach((file) => (file.checked = value));
        },
        /** Files to target for bulk operations: checked ones if any, else all. */
        bulkTargets(): FileData[] {
            const checked = this.files.filter((f) => f.checked);
            return checked.length > 0 ? checked : this.files;
        },
        applyMetadataFieldsToTargets(fields: (keyof MetadataConfig)[], source: MetadataConfig) {
            this.bulkTargets().forEach((file) => {
                if (!file.metadata) file.metadata = {};
                fields.forEach((field) => {
                    file.metadata[field] = source[field];
                });
            });
        },
        applyMetadataToAll<T extends keyof MetadataConfig>(field: T, value: MetadataConfig[T]) {
            this.bulkTargets().forEach((file) => {
                if (!file.metadata) file.metadata = {};
                file.metadata[field] = value;
            });
        },
        updateMetadata(key: string, metadata: Partial<MetadataConfig>) {
            const file = this.files.find((f) => f.key === key);
            if (file) {
                file.metadata = { ...file.metadata, ...metadata };
            }
        },
        serializeChapterNumber(prefix: string) {
            let serialNumber = 1;
            this.files.forEach((file) => {
                if (file.readyToStart) {
                    if (!file.metadata) file.metadata = {};
                    file.metadata.chapterNumber = prefix + String(serialNumber);
                    serialNumber++;
                }
            });
        },
        // ---- Per-chapter TTS overrides (#3) ----
        updateFileTtsConfig(key: string, partial: Partial<TTSConfig>) {
            const file = this.files.find((f) => f.key === key);
            if (file) {
                file.ttsConfig = { ...(file.ttsConfig || {}), ...partial };
                file.useCustomTts = true;
            }
        },
        applyTtsConfigToAll(config: Partial<TTSConfig>) {
            this.bulkTargets().forEach((file) => {
                if (file.readyToStart) {
                    file.ttsConfig = { ...config };
                    file.useCustomTts = true;
                }
            });
        },
        resetFileTtsConfig(key: string) {
            const file = this.files.find((f) => f.key === key);
            if (file) {
                file.ttsConfig = undefined;
                file.useCustomTts = false;
            }
        },
        effectiveConfig(key: string, globalConfig: TTSConfig): TTSConfig {
            const file = this.files.find((f) => f.key === key);
            if (!file) return globalConfig;
            return resolveEffectiveConfig(globalConfig, file);
        },
        updateStatus(key: string, status: string) {
            const file = this.files.find((f) => f.key === key);
            if (!file) return;
            file.splitting = false;
            file.converting = false;
            file.combining = false;
            file.finished = false;
            file.readyToStart = false;
            file.inQueue = false;

            switch (status) {
                case "readyToStart":
                    file.readyToStart = true;
                    break;
                case "inQueue":
                    file.inQueue = true;
                    break;
                case "splitting":
                    file.splitting = true;
                    break;
                case "converting":
                    file.converting = true;
                    break;
                case "combining":
                    file.combining = true;
                    break;
                case "finished":
                    file.finished = true;
                    break;
            }
        },
    },
});
