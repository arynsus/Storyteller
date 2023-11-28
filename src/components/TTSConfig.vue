<template>
    <a-card :title="t('TTSCONFIG_CardTitle')">
        <div class="flex flex-col gap-1">
            <div id="voice">
                <p class="form-label">{{ t('TTSCONFIG_FormLabelVoice') }}</p>
                <a-select v-model="edgeTTSConfigStore.config.voice" default-value="zh-CN-XiaoxiaoNeural">
                    <a-option v-for="voice in voices">{{ voice }}</a-option>
                </a-select>
            </div>
            <div id="form-pitch" class="mt-3">
                <p class="form-label">{{ t('TTSCONFIG_FormLabelPitch') }}</p>
                <a-slider class="grow pl-0.5" :min="-50" :max="50" show-input :show-tooltip="false" v-model="edgeTTSConfigStore.config.pitch" />
            </div>
            <div id="form-speed">
                <p class="form-label">{{ t('TTSCONFIG_FormLabelSpeed') }}</p>
                <a-slider class="grow pl-0.5" :min="-50" :max="50" show-input :show-tooltip="false" v-model="edgeTTSConfigStore.config.speed" />
            </div>
            <div id="form-job-concurrency">
                <p class="form-label">{{ t('TTSCONFIG_FormLabelConcurrentJobs') }}</p>
                <a-slider class="grow pl-0.5" :min="1" :max="20" show-input :show-tooltip="false" v-model="edgeTTSConfigStore.config.jobConcurrencyLimit" />
            </div>
            <div id="form-section-concurrency">
                <p class="form-label">{{ t('TTSCONFIG_FormLabelConcurrentSections') }}</p>
                <a-slider class="grow pl-0.5" :min="1" :max="20" show-input :show-tooltip="false" v-model="edgeTTSConfigStore.config.sectionConcurrencyLimit" />
            </div>
        </div>
    </a-card>
</template>
  
<script setup lang="ts">
import { useEdgeTTSConfigStore } from '../store';
import { useI18n } from 'vue-i18n';

// Inside your setup function
const { t } = useI18n();
const edgeTTSConfigStore = useEdgeTTSConfigStore();

const voices = [

    // Continental Chinese
    "zh-CN-XiaoxiaoNeural",
    "zh-CN-XiaoyiNeural",
    "zh-CN-YunjianNeural",
    "zh-CN-YunxiNeural",
    "zh-CN-YunxiaNeural",
    "zh-CN-YunyangNeural",
    "zh-CN-liaoning-XiaobeiNeural",
    "zh-CN-shaanxi-XiaoniNeural",

    // Hong Kong Cantonese
    "zh-HK-HiuGaaiNeural",
    "zh-HK-HiuMaanNeural",
    "zh-HK-WanLungNeural",

    // Taiwan Chinese
    "zh-TW-HsiaoChenNeural",
    "zh-TW-HsiaoYuNeural",
    "zh-TW-YunJheNeural",

    // American English
    "en-US-AnaNeural",
    "en-US-AriaNeural",
    "en-US-ChristopherNeural",
    "en-US-EricNeural",
    "en-US-GuyNeural",
    "en-US-JennyNeural",
    "en-US-MichelleNeural",
    "en-US-RogerNeural",
    "en-US-SteffanNeural",

    // British English
    "en-GB-LibbyNeural",
    "en-GB-MaisieNeural",
    "en-GB-RyanNeural",
    "en-GB-SoniaNeural",
    "en-GB-ThomasNeural",

    // Peninsula Spanish
    "es-ES-AlvaroNeural",
    "es-ES-ElviraNeural"
]

</script>

<style>
.form-label {
    font-weight: bold;
    margin-bottom: 8px;
}
</style>