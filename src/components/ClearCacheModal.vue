<template>
    <a-modal
        :visible="visible"
        :title="t('CACHE_ModalTitle')"
        :mask-closable="!clearing"
        :closable="!clearing"
        :ok-text="t('CACHE_ButtonClear')"
        :cancel-text="t('CACHE_ButtonCancel')"
        :ok-loading="clearing"
        :ok-button-props="{ status: 'danger', disabled: cacheInfoStore.count === 0 }"
        modal-class="st-cache-modal"
        @ok="confirmClear"
        @cancel="$emit('close')"
    >
        <div class="flex flex-col gap-4">
            <div class="st-cache-stat">
                <i class="fa-sharp fa-light fa-broom-wide"></i>
                <div>
                    <p class="st-cache-size">{{ loading ? t('CACHE_Loading') : formattedSize }}</p>
                    <p class="st-text-3 text-[12px]">{{ cacheInfoStore.count }} {{ t('CACHE_FilesSuffix') }}</p>
                </div>
            </div>
            <p class="st-hint">{{ t('CACHE_Hint') }}</p>
            <button class="st-cache-open-link" @click="openFolder">
                <i class="fa-sharp fa-light fa-folder-open"></i>{{ t('CACHE_ButtonOpenFolder') }}
            </button>
        </div>
    </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useCacheInfoStore } from "../store";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const { t } = useI18n();
const cacheInfoStore = useCacheInfoStore();

const loading = ref(false);
const clearing = ref(false);

watch(
    () => props.visible,
    async (v) => {
        if (!v) return;
        loading.value = true;
        await cacheInfoStore.refresh();
        loading.value = false;
    }
);

function formatBytes(bytes: number): string {
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, exponent);
    return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

const formattedSize = computed(() => formatBytes(cacheInfoStore.size));

const openFolder = () => window.storyteller.openOutputCacheFolder();

async function confirmClear() {
    clearing.value = true;
    await window.storyteller.clearOutputCache();
    await cacheInfoStore.refresh();
    clearing.value = false;
    emit("close");
}
</script>

<style scoped>
.st-cache-stat {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--st-border);
}
.st-cache-stat i {
    font-size: 20px;
    color: var(--st-accent-soft);
}
.st-cache-size {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.3;
    margin: 0;
}
.st-cache-open-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    background: transparent;
    border: none;
    color: var(--st-accent-soft);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
}
.st-cache-open-link:hover {
    text-decoration: underline;
}
</style>
