<template>
    <a-modal
        :visible="visible"
        :title="t('REGEXSPLIT_PresetsModalTitle')"
        modal-class="st-presets-modal"
        :footer="false"
        @cancel="emit('close')"
    >
        <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2 st-presets-list">
                <div v-for="preset in presetsWithSamples" :key="preset.label" class="st-row st-preset-row" @click="applyPreset(preset)">
                    <div class="flex flex-col grow min-w-0 gap-1">
                        <div class="flex items-center gap-2">
                            <span class="text-[14px] font-semibold truncate">{{ preset.label }}</span>
                            <span v-if="!preset.isCustom" class="st-pill st-pill--ready text-[10px]">{{ t('REGEXSPLIT_PresetBuiltin') }}</span>
                        </div>
                        <span class="font-mono text-[12px] st-text-3 truncate">/{{ preset.pattern }}/</span>
                        <span v-if="preset.sample" class="text-[12px] st-text-2 truncate">
                            <i class="fa-sharp fa-light fa-eye mr-1"></i>{{ preset.sample }}
                        </span>
                        <span v-else class="text-[12px] st-text-3 italic">{{ t('REGEXSPLIT_PresetNoSample') }}</span>
                    </div>
                    <button
                        v-if="preset.isCustom"
                        class="st-icon-btn shrink-0"
                        :title="t('REGEXSPLIT_ButtonDeletePreset')"
                        @click.stop="deletePreset(preset.label)"
                    >
                        <i class="fa-sharp fa-light fa-trash-can"></i>
                    </button>
                </div>
            </div>

            <div class="st-divider"></div>

            <div class="flex flex-col gap-2">
                <span class="st-label !mb-0">{{ t('REGEXSPLIT_AddPresetLabel') }}</span>
                <div class="flex gap-2">
                    <a-input v-model="newLabel" class="w-[140px]" :placeholder="t('REGEXSPLIT_PresetNamePlaceholder')" />
                    <a-input v-model="newPattern" class="grow font-mono" :placeholder="t('REGEXSPLIT_PresetPatternPlaceholder')">
                        <template #prefix><span class="st-text-3">/</span></template>
                    </a-input>
                    <a-button type="primary" @click="addPreset">
                        <template #icon><i class="fa-sharp fa-light fa-plus"></i></template>
                        {{ t('REGEXSPLIT_ButtonAddPreset') }}
                    </a-button>
                </div>
                <p v-if="addError" class="text-[12px]" style="color: var(--st-danger);">
                    <i class="fa-sharp fa-solid fa-circle-exclamation mr-1"></i>{{ addError }}
                </p>
            </div>
        </div>
    </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { BUILTIN_REGEX_PRESETS, RegexPreset, generateRegexSample } from "../../global/regexPresets";

const { t } = useI18n();

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
    (e: "close"): void;
    (e: "apply", pattern: string): void;
}>();

const STORAGE_KEY = "storyteller.regexCustomPresets";

const customPresets = ref<RegexPreset[]>(loadCustomPresets());
const newLabel = ref("");
const newPattern = ref("");
const addError = ref("");

function loadCustomPresets(): RegexPreset[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (p): p is RegexPreset => p && typeof p.label === "string" && typeof p.pattern === "string"
        );
    } catch {
        return [];
    }
}

function saveCustomPresets() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customPresets.value));
}

// Samples only need to be (re-)rolled when the preset list itself changes --
// keying off customPresets.value keeps typing in the add-preset inputs from
// re-rendering (and re-rolling) every preset's sample on each keystroke.
const presetsWithSamples = computed(() => {
    const all: (RegexPreset & { isCustom: boolean })[] = [
        ...BUILTIN_REGEX_PRESETS.map((p) => ({ ...p, isCustom: false })),
        ...customPresets.value.map((p) => ({ ...p, isCustom: true })),
    ];
    return all.map((p) => ({ ...p, sample: generateRegexSample(p.pattern) }));
});

watch(
    () => props.visible,
    (v) => {
        if (v) {
            customPresets.value = loadCustomPresets();
            newLabel.value = "";
            newPattern.value = "";
            addError.value = "";
        }
    }
);

function applyPreset(preset: RegexPreset) {
    emit("apply", preset.pattern);
    emit("close");
}

function deletePreset(label: string) {
    customPresets.value = customPresets.value.filter((p) => p.label !== label);
    saveCustomPresets();
}

function addPreset() {
    const label = newLabel.value.trim();
    const pattern = newPattern.value.trim();
    addError.value = "";

    if (!label || !pattern) {
        addError.value = t("REGEXSPLIT_PresetErrorEmpty");
        return;
    }
    try {
        new RegExp(pattern);
    } catch {
        addError.value = t("REGEXSPLIT_InvalidRegex");
        return;
    }
    const isDuplicate = [...BUILTIN_REGEX_PRESETS, ...customPresets.value].some((p) => p.label === label);
    if (isDuplicate) {
        addError.value = t("REGEXSPLIT_PresetErrorDuplicate");
        return;
    }

    customPresets.value = [...customPresets.value, { label, pattern }];
    saveCustomPresets();
    newLabel.value = "";
    newPattern.value = "";
}
</script>

<style scoped>
.st-preset-row {
    align-items: flex-start;
}
.st-icon-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--st-text-3);
    cursor: pointer;
    transition: all 0.12s ease;
}
.st-icon-btn:hover {
    color: var(--st-danger);
    background: rgba(255, 92, 114, 0.1);
    border-color: rgba(255, 92, 114, 0.35);
}
.st-presets-list {
    max-height: 42vh;
    overflow-y: auto;
}
</style>

<style>
/* Modal is teleported to a root outside this component's scope. */
.st-presets-modal.arco-modal {
    width: 560px;
}
</style>
