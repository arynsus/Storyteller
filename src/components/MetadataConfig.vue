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

            <div>
                <p class="st-label">{{ t('METADATACONFIG_FormLabelBookTitle') }}</p>
                <a-input :disabled="disabled" v-model="formData.bookTitle" allow-clear />
            </div>
            <div>
                <p class="st-label">{{ t('METADATACONFIG_FormLabelAuthor') }}</p>
                <a-input :disabled="disabled" v-model="formData.author" allow-clear />
            </div>
            <div id="form-cover-art">
                <p class="st-label">{{ t('METADATACONFIG_FormLabelCoverArt') }}</p>
                <div class="flex gap-2">
                    <a-input :disabled="disabled" v-model="formData.coverArt" allow-clear />
                    <input type="file" id="cover-art-file" accept="image/*" @change="handleFilePathLoading"
                        style="display: none;" />
                    <a-tooltip :content="t('METADATACONFIG_FormTooltipUploadCoverArt')">
                        <a-button class="shrink-0" :disabled="disabled" @click="triggerFilePathLoading">
                            <template #icon><i class="fa-sharp fa-light fa-image"></i></template>
                        </a-button>
                    </a-tooltip>
                </div>
            </div>

            <a-button v-if="fileListStore.files.length > 0" type="primary" long @click="applyBookInfo">
                {{ applyLabel }}
            </a-button>

            <div class="st-divider"></div>

            <!-- Bulk utility: chapter number/title are always per-job (edited inline
                 on each queue row), but auto-numbering them in sequence is a genuine
                 bulk operation, so it stays here. -->
            <div>
                <p class="st-label">{{ t('METADATACONFIG_SerializeLabel') }}</p>

                <div class="flex gap-2">
                    <a-input class="!w-[90px] shrink-0" :disabled="fileListStore.files.length === 0"
                        v-model="serializePrefix" :placeholder="t('METADATACONFIG_SerializePrefixPlaceholder')" />
                    <a-tooltip :content="t('METADATACONFIG_FormTooltipSerializeChapterNumber')">
                        <a-button class="grow" :disabled="fileListStore.files.length === 0"
                            @click="serializeChapterNumber">
                            <template #icon><i class="fa-sharp fa-light fa-arrow-down-1-9"></i></template>
                            {{ t('METADATACONFIG_SerializeButton') }}
                        </a-button>
                    </a-tooltip>
                </div>

                <p class="st-hint mt-2">{{ t('METADATACONFIG_ChapterFieldsHint') }}</p>

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

type BookInfo = Pick<MetadataConfig, "bookTitle" | "author" | "coverArt">;
const bookFields: (keyof BookInfo)[] = ["bookTitle", "author", "coverArt"];

// Book info behaves like TTS config: a scratch "config to apply", seeded from
// any job's icon and pushed out to the bulk-apply target via the button.
const formData = ref<BookInfo>({ bookTitle: "", author: "", coverArt: "" });
const loadedFromFilename = ref<string | null>(null);
const serializePrefix = ref("");

const disabled = computed(() => fileListStore.files.length === 0);

watch(
    () => fileListStore.metadataLoadNonce,
    () => {
        const file = fileListStore.metadataLoadKey ? fileListStore.getFileWithKey(fileListStore.metadataLoadKey) : undefined;
        if (file?.metadata) {
            formData.value = {
                bookTitle: file.metadata.bookTitle || "",
                author: file.metadata.author || "",
                coverArt: file.metadata.coverArt || "",
            };
            loadedFromFilename.value = file.filename;
        }
    }
);

onMounted(() => {
    const coverArtInput = document.querySelector("#form-cover-art .arco-input") as HTMLInputElement | null;
    if (coverArtInput) {
        coverArtInput.addEventListener("drop", (event) => {
            event.preventDefault();
            if (coverArtInput.disabled) return;
            const file = (event as DragEvent).dataTransfer?.files[0] as (File & { path: string }) | undefined;
            if (file) {
                formData.value.coverArt = file.path;
                loadedFromFilename.value = null;
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
        loadedFromFilename.value = null;
    }
    target.value = "";
};

const applyLabel = computed(() => {
    const n = fileListStore.getChecked.length;
    return n > 0 ? `${t("METADATACONFIG_ApplyBookInfoSelected")} (${n})` : t("METADATACONFIG_ApplyBookInfoAll");
});
const applyBookInfo = () => {
    fileListStore.applyMetadataFieldsToTargets(bookFields, formData.value);
};
const serializeChapterNumber = () => {
    fileListStore.serializeChapterNumber(serializePrefix.value);
};
</script>

<style scoped>
.st-scope {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(124, 108, 255, 0.08);
    border: 1px solid rgba(124, 108, 255, 0.2);
}

.st-scope i {
    color: var(--st-accent-soft);
}
</style>
