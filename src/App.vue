<template>
    <router-view></router-view>
</template>

<script setup lang="ts">
import { ipcRenderer } from "electron";
import { useI18n } from 'vue-i18n';

const { locale } = useI18n();

ipcRenderer.on('change-language', (event, language: string) => {
    locale.value = language;
});
</script>