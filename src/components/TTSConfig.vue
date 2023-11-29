<template>
    <a-card :title="t('TTSCONFIG_CardTitle')" id="tts-config-card">
        <template #extra>
            <i v-if="cardIsOpen" class="fa-sharp fa-minus text-white"></i>
            <i v-else class="fa-sharp fa-plus text-white"></i>
        </template>
        <div class="flex flex-col gap-1">
            <div id="voice">
                <p class="form-label">{{ t('TTSCONFIG_FormLabelVoice') }}</p>
                <a-select v-model="edgeTTSConfigStore.config.voice" default-value="zh-CN-XiaoxiaoNeural" :allow-search="true">
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
            <div id="form-words-per-section">
                <p class="form-label">{{ t('TTSCONFIG_FormLabelWordsPerSection') }}</p>
                <a-slider class="grow pl-0.5" :min="100" :max="500" show-input :show-tooltip="false" v-model="edgeTTSConfigStore.config.wordsPerSection" />
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
import { ref, nextTick } from 'vue';
import { useEdgeTTSConfigStore } from '../store';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const edgeTTSConfigStore = useEdgeTTSConfigStore();

const cardIsOpen = ref(true)
const toggleCardOpen = () => {
    cardIsOpen.value = !cardIsOpen.value
}

// A *very* forced way to simulate card collapse for arco design.
nextTick(() => {
    const cardHeader = document.querySelector("#tts-config-card .arco-card-header")
    const cardBody = document.querySelector("#tts-config-card .arco-card-body")
    cardHeader.addEventListener('click', () => {
        toggleCardOpen()
        cardBody.classList.toggle("hidden")
    })
    cardHeader.classList.add("cursor-pointer")
})

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
    "es-ES-ElviraNeural",

    // American Spanish
    "es-AR-ElenaNeural",
    "es-AR-TomasNeural",
    "es-BO-MarceloNeural",
    "es-BO-SofiaNeural",
    "es-CL-CatalinaNeural",
    "es-CL-LorenzoNeural",
    "es-CO-GonzaloNeural",
    "es-CO-SalomeNeural",
    "es-CR-JuanNeural",
    "es-CR-MariaNeural",
    "es-CU-BelkysNeural",
    "es-CU-ManuelNeural",
    "es-DO-EmilioNeural",
    "es-DO-RamonaNeural",
    "es-EC-AndreaNeural",
    "es-EC-LuisNeural",
    "es-ES-AlvaroNeural",
    "es-ES-ElviraNeural",
    "es-GQ-JavierNeural",
    "es-GQ-TeresaNeural",
    "es-GT-AndresNeural",
    "es-GT-MartaNeural",
    "es-HN-CarlosNeural",
    "es-HN-KarlaNeural",
    "es-MX-DaliaNeural",
    "es-MX-JorgeNeural",
    "es-NI-FedericoNeural",
    "es-NI-YolandaNeural",
    "es-PA-MargaritaNeural",
    "es-PA-RobertoNeural",
    "es-PE-AlexNeural",
    "es-PE-CamilaNeural",
    "es-PR-KarinaNeural",
    "es-PR-VictorNeural",
    "es-PY-MarioNeural",
    "es-PY-TaniaNeural",
    "es-SV-LorenaNeural",
    "es-SV-RodrigoNeural",
    "es-US-AlonsoNeural",
    "es-US-PalomaNeural",
    "es-UY-MateoNeural",
    "es-UY-ValentinaNeural",
    "es-VE-PaolaNeural",
    "es-VE-SebastianNeural",
]

</script>

<style>
.form-label {
    font-weight: bold;
    margin-bottom: 8px;
}
</style>