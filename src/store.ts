import { defineStore } from "pinia";
import { toRaw } from "vue";
import { TTSConfig, FileData, MetadataConfig, ChapterTTSFields, resolveEffectiveConfig } from "../global/types";

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
        // "Load into editor" requests fired by clicking a row's status icon.
        // A nonce (rather than just the key) makes re-clicking the same job's
        // icon twice in a row still trigger a reload.
        ttsLoadKey: null as string | null,
        ttsLoadNonce: 0,
        metadataLoadKey: null as string | null,
        metadataLoadNonce: 0,
    }),
    getters: {
        getChecked: (state) => state.files.filter((file) => file.checked),
        getFileWithKey: (state) => (key: string) => state.files.find((file) => file.key === key),
        /** The single checked job, when exactly one is checked — drives the audio player. */
        getSelected: (state) => {
            const checked = state.files.filter((file) => file.checked);
            return checked.length === 1 ? checked[0] : undefined;
        },
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
        reorder(fromIndex: number, toIndex: number) {
            const [moved] = this.files.splice(fromIndex, 1);
            if (moved) this.files.splice(toIndex, 0, moved);
        },
        // ---- Selection: "checked" is the only selection concept in the UI ----
        selectOnly(key: string) {
            this.files.forEach((file) => (file.checked = file.key === key));
        },
        selectRange(fromIndex: number, toIndex: number) {
            const start = Math.min(fromIndex, toIndex);
            const end = Math.max(fromIndex, toIndex);
            this.files.forEach((file, index) => (file.checked = index >= start && index <= end));
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
        // ---- "Load into editor" requests, fired from a row's status icon ----
        requestTtsLoad(key: string) {
            this.ttsLoadKey = key;
            this.ttsLoadNonce++;
        },
        requestMetadataLoad(key: string) {
            this.metadataLoadKey = key;
            this.metadataLoadNonce++;
        },
        // ---- Metadata: book-level fields apply in bulk, chapter fields are per-job ----
        applyMetadataFieldsToTargets(fields: (keyof MetadataConfig)[], source: MetadataConfig) {
            this.bulkTargets().forEach((file) => {
                if (!file.readyToStart) return;
                if (!file.metadata) file.metadata = {};
                fields.forEach((field) => {
                    file.metadata[field] = source[field];
                });
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
            this.bulkTargets().forEach((file) => {
                if (file.readyToStart) {
                    if (!file.metadata) file.metadata = {};
                    file.metadata.chapterNumber = prefix + String(serialNumber);
                    serialNumber++;
                }
            });
        },
        // ---- TTS: a job only becomes startable once a config has been applied ----
        applyTtsConfigToTargets(config: ChapterTTSFields) {
            this.bulkTargets().forEach((file) => {
                if (file.readyToStart) {
                    file.ttsConfig = { ...config };
                }
            });
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
