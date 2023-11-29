<template>
    <router-view></router-view>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { ipcRenderer } from "electron";
import { useI18n } from 'vue-i18n';
import router from './router';
import { i18n } from './main';

const { locale } = useI18n();

// User change language from electron menu.
ipcRenderer.on('change-language', (event, language: string) => {
    locale.value = language;
    localStorage.setItem("language", language)
});

// Apply cached language setting.
const workingLanguage = localStorage.getItem("language")
if (workingLanguage) {
    locale.value = workingLanguage
    // Tell electron to update menu.
    ipcRenderer.send("change-language", workingLanguage)
}

// Update title when locale changes, because router.beforeEach does not handle vue reactivity.
watch(locale, (newLocale) => {
    const currentRoute = router.currentRoute.value;
    if (currentRoute && currentRoute.meta && currentRoute.meta.titleKey) {
        document.title = i18n.global.t(String(currentRoute.meta.titleKey)) || 'Storyteller';
    }
});
</script>