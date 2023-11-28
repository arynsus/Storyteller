<template>
    <a-card :title="t('TTSCONFIG_CardTitle')" class="grow">
        <div class="flex flex-col gap-3">
            <div id="form-book-title">
                <p class="form-label">{{ t('METADATACONFIG_FormLabelBookTitle') }}</p>
                <div class="grow pl-0.5 flex gap-1">
                    <a-input :disabled="!selectedFile" v-model="formData.bookTitle" @change="confirmMetadataChange('bookTitle')" />
                    <a-tooltip content="Apply to all unconverted files.">
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
                </div>
            </div>
            <div id="form-author">
                <p class="form-label">{{ t('METADATACONFIG_FormLabelAuthor') }}</p>
                <div class="grow pl-0.5 flex gap-1">
                    <a-input :disabled="!selectedFile" v-model="formData.author" @change="confirmMetadataChange('author')" />
                    <a-tooltip content="Apply to all unconverted files.">
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
                    <a-tooltip content="Load a local file path.">
                        <a-button class="shrink-0" :disabled="!selectedFile" type="secondary" @click="triggerFilePathLoading">
                            <template #icon>
                                <i class="fa-sharp fa-solid fa-upload"></i>
                            </template>
                        </a-button>
                    </a-tooltip>

                    <a-tooltip content="Apply to all unconverted files.">
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
import { ref, watch, onMounted, computed } from 'vue';
import { useFileListStore } from '../store';
import { MetadataConfig } from '../../global/types';
import { useI18n } from 'vue-i18n';

// Inside your setup function
const { t } = useI18n();
const fileListStore = useFileListStore();
const formData = ref<MetadataConfig>({
    bookTitle: '',
    chapterTitle: '',
    chapterNumber: '',
    author: '',
    coverArt: ''
})

// Replace selectedFile ref with a computed property
const selectedFile = computed(() => fileListStore.getSelected);

// Update formData when the selected file changes
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

// Function to trigger file input click
const triggerFilePathLoading = () => {
    const fileInput = document.getElementById('cover-art-file');
    if(fileInput) {
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

const applyToAllFiles = <T extends keyof MetadataConfig>(field: T) => {
    fileListStore.applyMetadataToAll(field, formData.value[field]);
}

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