<template>
    <a-modal
        :visible="visible"
        :title="modalTitle"
        modal-class="st-content-editor-modal"
        :mask-closable="!saving"
        :closable="!saving"
        :ok-text="t('CONTENTEDITOR_ButtonSave')"
        :cancel-text="t('CONTENTEDITOR_ButtonCancel')"
        :ok-loading="saving"
        :ok-button-props="{ disabled: loading }"
        @ok="save"
        @cancel="$emit('close')"
    >
        <div class="flex flex-col gap-4">
            <div class="flex gap-2 items-end">
                <div class="w-[90px] shrink-0">
                    <p class="st-label">{{ t('FILELIST_ExpandChapterNo') }}</p>
                    <a-input v-model="chapterNumber" @change="saveMetadata" />
                </div>
                <div class="grow min-w-0">
                    <p class="st-label">{{ t('FILELIST_ExpandChapterTitle') }}</p>
                    <a-input v-model="chapterTitle" allow-clear @change="saveMetadata" />
                </div>
            </div>
            <div>
                <p class="st-label">{{ t('CONTENTEDITOR_ContentLabel') }}</p>
                <a-textarea
                    v-model="content"
                    :disabled="loading"
                    :auto-size="{ minRows: 16, maxRows: 16 }"
                    class="st-content-textarea"
                />
                <p class="st-text-3 text-[12px] mt-1">{{ wordCountLabel }}</p>
            </div>
        </div>
    </a-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import wordsCount from "words-count";
import { useFileListStore } from "../store";
import { notify } from "../composables/notify";
import { useI18n } from "vue-i18n";

const props = defineProps<{ visible: boolean; fileKey: string | null }>();
const emit = defineEmits<{ (e: "close"): void }>();

const { t } = useI18n();
const fileListStore = useFileListStore();

const loading = ref(false);
const saving = ref(false);
const content = ref("");
const chapterNumber = ref("");
const chapterTitle = ref("");

const file = computed(() => (props.fileKey ? fileListStore.getFileWithKey(props.fileKey) : undefined));
const modalTitle = computed(() => file.value?.filename || t("CONTENTEDITOR_Title"));
const wordCountLabel = computed(() => `${wordsCount(content.value)} ${t("FILELIST_Words")}`);

watch(
    () => props.visible,
    async (isVisible) => {
        if (!isVisible || !file.value) return;
        loading.value = true;
        content.value = "";
        chapterNumber.value = file.value.metadata?.chapterNumber || "";
        chapterTitle.value = file.value.metadata?.chapterTitle || "";
        const res = await window.storyteller.readFileContent(file.value.path);
        if (res.success) {
            content.value = res.content || "";
        } else {
            notify.error(`${t("CONTENTEDITOR_LoadFailure")}${res.error}`);
        }
        loading.value = false;
    }
);

function saveMetadata() {
    if (!file.value) return;
    fileListStore.updateMetadata(file.value.key, {
        chapterNumber: chapterNumber.value,
        chapterTitle: chapterTitle.value,
    });
}

async function save() {
    if (!file.value) return;
    saving.value = true;
    const res = await window.storyteller.writeFileContent(file.value.path, content.value);
    saving.value = false;
    if (res.success) {
        fileListStore.updateFile(file.value.key, {
            wordcount: res.wordcount ?? wordsCount(content.value),
            contentModified: true,
        });
        notify.success(`${t("CONTENTEDITOR_SaveSuccessBeforeFilename")}${file.value.filename}${t("CONTENTEDITOR_SaveSuccessAfterFilename")}`);
        emit("close");
    } else {
        notify.error(`${t("CONTENTEDITOR_SaveFailure")}${res.error}`);
    }
}
</script>

<style scoped>
.st-content-textarea :deep(textarea) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    line-height: 1.6;
}
</style>

<style>
/* Modal is teleported to a root outside this component's scope. */
.st-content-editor-modal.arco-modal {
    width: 720px;
}
</style>
