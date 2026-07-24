<template>
    <div class="st-panel">
        <div class="st-panel-header cursor-pointer" @click="isOpen = !isOpen">
            <div class="st-panel-title">
                <i class="fa-sharp fa-light fa-tags"></i>
                <span>{{ t('METADATACONFIG_CardTitle') }}</span>
            </div>
            <i class="fa-sharp fa-light" :class="isOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
        </div>

        <div v-show="isOpen" class="p-4 flex flex-col gap-4">
            <p v-if="!selectedFile" class="st-text-3 text-[13px]">{{ t('METADATACONFIG_SelectHint') }}</p>

            <!-- Book-level fields: usually shared across every chapter -->
            <div>
                <p class="st-label">{{ t('METADATACONFIG_FormLabelBookTitle') }}</p>
                <a-input :disabled="!selectedFile" v-model="formData.bookTitle" @change="confirmMetadataChange('bookTitle')" allow-clear />
            </div>
            <div>
                <p class="st-label">{{ t('METADATACONFIG_FormLabelAuthor') }}</p>
                <a-input :disabled="!selectedFile" v-model="formData.author" @change="confirmMetadataChange('author')" allow-clear />
            </div>
            <div id="form-cover-art">
                <p class="st-label">{{ t('METADATACONFIG_FormLabelCoverArt') }}</p>
                <div class="flex gap-2">
                    <a-input :disabled="!selectedFile" v-model="formData.coverArt" @change="confirmMetadataChange('coverArt')" allow-clear />
                    <input type="file" id="cover-art-file" accept="image/*" @change="handleFilePathLoading" style="display: none;" />
                    <a-tooltip :content="t('METADATACONFIG_FormTooltipUploadCoverArt')">
                        <a-button class="shrink-0" :disabled="!selectedFile" @click="triggerFilePathLoading">
                            <template #icon><i class="fa-sharp fa-light fa-image"></i></template>
                        </a-button>
                    </a-tooltip>
                </div>
            </div>

            <a-button type="outline" long :disabled="!selectedFile || fileListStore.files.length === 0" @click="applyBookInfo">
                <template #icon><i class="fa-sharp fa-light fa-arrow-down-to-line"></i></template>
                {{ applyLabel }}
            </a-button>

            <div class="st-divider"></div>

            <!-- Per-chapter fields -->
            <div>
                <p class="st-label">{{ t('METADATACONFIG_FormLabelChapterNoAndTitle') }}</p>
                <div class="flex gap-2">
                    <a-input class="!w-[70px] shrink-0" :disabled="!selectedFile" v-model="formData.chapterNumber" @change="confirmMetadataChange('chapterNumber')" />
                    <a-input class="grow" :disabled="!selectedFile" v-model="formData.chapterTitle" @change="confirmMetadataChange('chapterTitle')" allow-clear />
                    <a-tooltip :content="t('METADATACONFIG_FormTooltipSerializeChapterNumber')">
                        <a-button class="shrink-0" :disabled="!selectedFile" @click="serializeChapterNumber">
                            <template #icon><i class="fa-sharp fa-light fa-arrow-down-1-9"></i></template>
                        </a-button>
                    </a-tooltip>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from "vue";
import { useFileListStore } from "../store";
import { MetadataConfig } from "../../global/types";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const fileListStore = useFileListStore();
const isOpen = ref(true);

const formData = ref<MetadataConfig>({ bookTitle: "", chapterTitle: "", chapterNumber: "", author: "", coverArt: "" });

const selectedFile = computed(() => fileListStore.getSelected);
watch(selectedFile, (newFile) => {
    formData.value = newFile?.metadata
        ? { ...newFile.metadata }
        : { bookTitle: "", chapterTitle: "", chapterNumber: "", author: "", coverArt: "" };
});

onMounted(() => {
    const coverArtInput = document.querySelector("#form-cover-art .arco-input") as HTMLInputElement | null;
    if (coverArtInput) {
        coverArtInput.addEventListener("drop", (event) => {
            event.preventDefault();
            if (coverArtInput.disabled) return;
            const file = (event as DragEvent).dataTransfer?.files[0] as (File & { path: string }) | undefined;
            if (file) {
                formData.value.coverArt = file.path;
                confirmMetadataChange("coverArt");
            }
        });
        coverArtInput.addEventListener("dragover", (event) => event.preventDefault());
    }
});

const triggerFilePathLoading = () => document.getElementById("cover-art-file")?.click();
const handleFilePathLoading = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target?.files && target.files.length > 0) {
        formData.value.coverArt = (target.files[0] as File & { path: string }).path;
        confirmMetadataChange("coverArt");
    }
    target.value = "";
};

const applyLabel = computed(() => {
    const n = fileListStore.getChecked.length;
    return n > 0 ? `${t("METADATACONFIG_ApplyBookInfoSelected")} (${n})` : t("METADATACONFIG_ApplyBookInfoAll");
});
const applyBookInfo = () => {
    fileListStore.applyMetadataFieldsToTargets(["bookTitle", "author", "coverArt"], formData.value);
};
const serializeChapterNumber = () => {
    fileListStore.serializeChapterNumber(formData.value.chapterNumber || "");
    if (fileListStore.getSelected?.metadata) formData.value = { ...fileListStore.getSelected!.metadata };
};
const confirmMetadataChange = <T extends keyof MetadataConfig>(field: T) => {
    if (selectedFile.value) {
        fileListStore.updateMetadata(selectedFile.value.key, { [field]: formData.value[field] });
    }
};
</script>
