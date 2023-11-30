import { defineStore } from 'pinia';
import { EdgeTTSConfig, FileData, MetadataConfig } from "../global/types";
export const useEdgeTTSConfigStore = defineStore({
    id: 'edgettsconfig',
    state: () => ({
        config: {
            voice: 'zh-CN-XiaoxiaoNeural',
            pitch: 0,
            speed: 0,
            wordsPerSection: 300,
            jobConcurrencyLimit: 1,
            sectionConcurrencyLimit: 1,
        } as EdgeTTSConfig,
    }),
    getters: {
        // getConfig: (state) => state.config,
    },
    actions: {
        updateConfig(newConfig: EdgeTTSConfig) {
            this.config = { ...this.config, ...newConfig };
        },
    },
});


export const useFileListStore = defineStore({
    id: 'filelist',
    state: () => ({
        files: [] as FileData[],
    }),
    getters: {
        getSelected: (state) => state.files.find(file => file.selected),
        getFinished: (state) => state.files.filter(file => file.finished),
        getFileWithKey: (state) => {
            return (key: string) => state.files.find(file => file.key == key)
        }
    },
    actions: {
        addFile(file: FileData) {
            if (!this.getFileWithKey(file.key)) {
                this.files.push(file);
            }
        },
        removeFile(key: string) {
            this.files = this.files.filter(file => file.key !== key);
        },
        updateFile(key: string, updatedData: Partial<FileData>) {
            const index = this.files.findIndex(file => file.key === key);
            if (index !== -1) {
                this.files[index] = { ...this.files[index], ...updatedData };
            }
        },
        clearList() {
            this.files = []
        },
        toggleSelect(key: string) {
            this.files = this.files.map(file => {
                if (file.key === key) {
                    return { ...file, selected: !file.selected };
                }
                return { ...file, selected: false };
            });
        },
        applyMetadataToAll<T extends keyof MetadataConfig>(field: T, value: MetadataConfig[T]) {
            this.files.forEach(file => {
                if (!file.metadata) file.metadata = {} as MetadataConfig;
                file.metadata[field] = value;
            });
        },
        updateMetadata(key: string, metadata: Partial<MetadataConfig>) {
            const file = this.files.find(f => f.key === key);
            if (file) {
                file.metadata = { ...file.metadata, ...metadata };
            }
        },
        serializeChapterNumber(prefix:string) {
            let serialNumber = 1
            this.files.forEach(file => {
                if (file.readyToStart) {
                    file.metadata.chapterNumber = prefix + String(serialNumber)
                    serialNumber++
                }
            })
        },
        updateStatus(key: string, status: string) {
            const file = this.files.find(f => f.key === key);
            if (file) {
                // Reset all relevant fields
                file.splitting = false;
                file.converting = false;
                file.combining = false;
                file.finished = false;
                file.readyToStart = false
                file.inQueue = false

                switch (status) {
                    case 'readyToStart':
                        file.readyToStart = true;
                        break;
                    case 'inQueue':
                        file.inQueue = true;
                        break;
                    case 'splitting':
                        file.splitting = true;
                        break;
                    case 'converting':
                        file.converting = true;
                        break;
                    case 'combining':
                        file.combining = true;
                        break;
                    case 'finished':
                        file.finished = true;
                        break;
                }
            }
        }
    },
});