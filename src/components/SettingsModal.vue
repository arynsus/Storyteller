<template>
    <a-modal
        :visible="visible"
        :title="t('SETTINGS_Title')"
        :footer="false"
        :mask-closable="true"
        @cancel="$emit('close')"
        modal-class="st-settings-modal"
    >
        <div class="flex flex-col gap-5 py-1">
            <!-- Language -->
            <div>
                <p class="st-section-title">{{ t('SETTINGS_LanguageSection') }}</p>
                <a-select :model-value="locale" :allow-search="false" @change="changeLanguage">
                    <a-option value="en">English</a-option>
                    <a-option value="zh">简体中文</a-option>
                    <a-option value="es">Español</a-option>
                </a-select>
            </div>

            <div class="st-divider"></div>

            <!-- Performance -->
            <div>
                <p class="st-section-title">{{ t('SETTINGS_PerformanceSection') }}</p>
                <p class="st-hint mb-3">{{ t('SETTINGS_PerformanceHint') }}</p>
                <div class="mb-4">
                    <p class="st-label">{{ t('TTSCONFIG_FormLabelConcurrentJobs') }}</p>
                    <a-slider :min="1" :max="20" show-input :show-tooltip="false" v-model="config.jobConcurrencyLimit" @change="save" />
                </div>
                <div>
                    <p class="st-label">{{ t('TTSCONFIG_FormLabelConcurrentSections') }}</p>
                    <a-slider :min="1" :max="20" show-input :show-tooltip="false" v-model="config.sectionConcurrencyLimit" @change="save" />
                </div>
            </div>

            <div class="st-divider"></div>

            <!-- Output cache -->
            <div>
                <p class="st-section-title">{{ t('SETTINGS_CacheSection') }}</p>
                <p class="st-hint mb-3">{{ t('SETTINGS_CacheThresholdHint') }}</p>
                <div>
                    <p class="st-label">{{ t('SETTINGS_CacheThresholdLabel') }}</p>
                    <a-input-number
                        :min="1"
                        :max="500000"
                        :step="500"
                        v-model="config.cacheClearThresholdMB"
                        @change="save"
                    >
                        <template #suffix>MB</template>
                    </a-input-number>
                </div>
            </div>

            <div class="st-divider"></div>

            <!-- Azure credentials -->
            <div>
                <p class="st-section-title">{{ t('SETTINGS_AzureSection') }}</p>
                <p class="st-hint mb-3">{{ t('SETTINGS_AzureHint') }}</p>
                <div class="mb-3">
                    <p class="st-label">{{ t('TTSCONFIG_FormLabelAzureRegion') }}</p>
                    <a-select v-model="config.azureRegion" :allow-search="true" @change="save">
                        <a-option v-for="region in azureRegions" :key="region.Name" :value="region.Name">{{ region.DisplayName }}</a-option>
                    </a-select>
                </div>
                <div>
                    <p class="st-label">{{ t('TTSCONFIG_FormLabelAzureKey') }}</p>
                    <a-input-password v-model="config.azureKey" @change="save" />
                </div>
            </div>
        </div>
    </a-modal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTTSConfigStore } from "../store";
import { useI18n } from "vue-i18n";
import { azureRegions } from "../../global/azureRegions";

defineProps<{ visible: boolean }>();
defineEmits<{ (e: "close"): void }>();

const { t, locale } = useI18n();
const ttsConfigStore = useTTSConfigStore();
const config = computed(() => ttsConfigStore.config);

const save = () => ttsConfigStore.saveConfigToMain();
const changeLanguage = (language: string) => window.storyteller.changeLanguage(language);
</script>

<style scoped>
.st-section-title {
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 4px;
}
</style>
