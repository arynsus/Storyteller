<template>
    <a-card :title="t('METADATACONFIG_CardTitle')" class="grow" id="metadata-config-card">

        <template #extra>
            <i v-if="cardIsOpen" class="fa-sharp fa-minus text-white"></i>
            <i v-else class="fa-sharp fa-plus text-white"></i>
        </template>
        <div class="flex flex-col gap-3">
            <div id="form-book-title">
                <p class="form-label">{{ t('METADATACONFIG_FormLabelBookTitle') }}</p>
                <div class="grow pl-0.5 flex gap-1">
                    <a-input :disabled="!selectedFile" v-model="formData.bookTitle" @change="confirmMetadataChange('bookTitle')" />
                    <a-tooltip :content="t('METADATACONFIG_FormTooltipAppyToAll')">
                        <a-button class="shrink-0" :disabled="!selectedFile" type="secondary" @click="applyToAllFiles('bookTitle')">
                            <template #icon>
                                <i class="fa-sharp fa-solid fa-ellipsis"></i>
                            </template>
                        </a-button>
                    </a-tooltip>
                </div>
            </div>
            <div id="form-chapter">
                <p class="form-label">{{ t('METADATACONFIG_FormLabelChapterNoAndTitle') }}</p>
                <div class="flex gap-1">
                    <a-input class="pl-0.5" :disabled="!selectedFile" style="width:55px" hide-button v-model="formData.chapterNumber" @change="confirmMetadataChange('chapterNumber')" />
                    <a-input class="grow" :disabled="!selectedFile" v-model="formData.chapterTitle" @change="confirmMetadataChange('chapterTitle')" />
                    <a-tooltip :content="t('METADATACONFIG_FormTooltipSerializeChapterNumber')">
                        <a-button class="shrink-0" :disabled="!selectedFile" type="secondary" @click="serializeChapterNumber">
                            <template #icon>
                                <i class="fa-sharp fa-solid fa-arrow-down-1-9"></i>
                            </template>
                        </a-button>
                    </a-tooltip>
                </div>
            </div>
            <div id="form-author">
                <p class="form-label">{{ t('METADATACONFIG_FormLabelAuthor') }}</p>
                <div class="grow pl-0.5 flex gap-1">
                    <a-input :disabled="!selectedFile" v-model="formData.author" @change="confirmMetadataChange('author')" />
                    <a-tooltip :content="t('METADATACONFIG_FormTooltipAppyToAll')">
                        <a-button class="shrink-0" :disabled="!selectedFile" type="secondary" @click="applyToAllFiles('author')">
                            <template #icon>
                                <i class="fa-sharp fa-solid fa-ellipsis"></i>
                            </template>
                        </a-button>
                    </a-tooltip>
                </div>
            </div>
            <div id="form-cover-art">
                <p class="form-label">{{ t('METADATACONFIG_FormLabelCoverArt') }}</p>
                <div class="grow pl-0.5 flex gap-1">
                    <a-input :disabled="!selectedFile" v-model="formData.coverArt" @change="confirmMetadataChange('coverArt')" />

                    <!-- Hidden File Input -->
                    <input type="file" id="cover-art-file" @change="handleFilePathLoading" style="display: none;" />

                    <!-- Upload Button -->
                    <a-tooltip :content="t('METADATACONFIG_FormTooltipUploadCoverArt')">
                        <a-button class="shrink-0" :disabled="!selectedFile" type="secondary" @click="triggerFilePathLoading">
                            <template #icon>
                                <i class="fa-sharp fa-solid fa-upload"></i>
                            </template>
                        </a-button>
                    </a-tooltip>

                    <a-tooltip :content="t('METADATACONFIG_FormTooltipAppyToAll')">
                        <a-button class="shrink-0" :disabled="!selectedFile" type="secondary" @click="applyToAllFiles('coverArt')">
                            <template #icon>
                                <i class="fa-sharp fa-solid fa-ellipsis"></i>
                            </template>
                        </a-button>
                    </a-tooltip>

                </div>
            </div>
        </div>
    </a-card>
</template>
  
<script setup lang="ts">
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import { useFileListStore } from '../store';
import { MetadataConfig } from '../../global/types';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const fileListStore = useFileListStore();
const formData = ref<MetadataConfig>({
    bookTitle: '',
    chapterTitle: '',
    chapterNumber: '',
    author: '',
    coverArt: ''
})

const cardIsOpen = ref(false)
const toggleCardOpen = () => {
    cardIsOpen.value = !cardIsOpen.value
}

// A *very* forced way to simulate card collapse for arco design.
nextTick(() => {
    const cardHeader = document.querySelector("#metadata-config-card .arco-card-header")
    const cardBody = document.querySelector("#metadata-config-card .arco-card-body")
    cardHeader.addEventListener('click', () => {
        toggleCardOpen()
        cardBody.classList.toggle("hidden")
    })
    cardHeader.classList.add("cursor-pointer")
    cardBody.classList.add("hidden")
})

// Update formData when the selected file changes
const selectedFile = computed(() => fileListStore.getSelected);
watch(selectedFile, (newFile) => {
    if (newFile && newFile.metadata) {
        formData.value = { ...newFile.metadata };
    } else {
        formData.value = { bookTitle: '', chapterTitle: '', chapterNumber: '', author: '', coverArt: '' };
    }
});

// Drag and drop for Cover Art
onMounted(() => {
    const coverArtInput = document.querySelector('#form-cover-art input');
    if (coverArtInput) {
        coverArtInput.addEventListener('drop', (event) => {
            event.preventDefault();
            const dragEvent = event as DragEvent; // Type assertion here
            if (dragEvent && dragEvent.dataTransfer) {
                const file = dragEvent.dataTransfer.files[0];
                formData.value.coverArt = file.path;
                confirmMetadataChange('coverArt')
            }
        });
        coverArtInput.addEventListener('dragover', (event) => {
            event.preventDefault();
        });
    }
});
const triggerFilePathLoading = () => {
    const fileInput = document.getElementById('cover-art-file');
    if (fileInput) {
        fileInput.click();
    }
}
const handleFilePathLoading = (event: Event) => {
    const target = event.target as HTMLInputElement; // Cast to HTMLInputElement
    if (target && target.files && target.files.length > 0) {
        const file = target.files[0];
        // Update formData with the file's path
        formData.value.coverArt = file.path;
        confirmMetadataChange('coverArt')
    }
};

// Apply the input content to all entries awaiting conversion.
const applyToAllFiles = <T extends keyof MetadataConfig>(field: T) => {
    fileListStore.applyMetadataToAll(field, formData.value[field]);
}

const serializeChapterNumber = () => {
    fileListStore.serializeChapterNumber(formData.value.chapterNumber)
    formData.value = fileListStore.getSelected.metadata
}

// Auto-save to File.metadata when input content changes.
const confirmMetadataChange = <T extends keyof MetadataConfig>(field: T) => {
    if (selectedFile.value) {
        fileListStore.updateMetadata(selectedFile.value.key, { [field]: formData.value[field] });
    }
}

</script>

<style>
.form-label {
    font-weight: bold;
    margin-bottom: 8px;
}
</style>