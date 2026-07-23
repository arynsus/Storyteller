<template>
    <router-view></router-view>
</template>

<script setup lang="ts">
import { watch, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import router from "./router";
import { i18n } from "./main";

const { locale } = useI18n();

// User changes language from the Electron menu.
const unsubscribe = window.storyteller.onLanguageChange((language: string) => {
    locale.value = language;
    localStorage.setItem("language", language);
});
onUnmounted(() => unsubscribe());

// Apply cached language setting on startup.
onMounted(() => {
    const workingLanguage = localStorage.getItem("language");
    if (workingLanguage) {
        locale.value = workingLanguage;
        window.storyteller.changeLanguage(workingLanguage);
    }
});

// Update the window title when locale changes.
watch(locale, () => {
    const currentRoute = router.currentRoute.value;
    if (currentRoute?.meta?.titleKey) {
        document.title = i18n.global.t(String(currentRoute.meta.titleKey)) || "Storyteller";
    }
});
</script>
