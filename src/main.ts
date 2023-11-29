import { createApp } from 'vue';
import "./style.css";
import ArcoVue from '@arco-design/web-vue';
import App from './App.vue';
import router from './router';
import '@arco-design/web-vue/dist/arco.css';
import { Message } from '@arco-design/web-vue';
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n';

// Fontawesome
import './assets/font-awesome/css/all.css'

// Import language files
import en from './locales/en.json';
import zh from './locales/zh.json';
import es from './locales/es.json';

// Create i18n instance with options
const browserLanguage = navigator.language.split('-')[0]
export const i18n = createI18n({
  legacy: false,
  locale: browserLanguage, 
  fallbackLocale: 'en',
  messages: {
    en,
    zh,
    es,
  },
});

// Initialize application
const app = createApp(App)
Message._context = app._context;
app.use(i18n).use(ArcoVue).use(router).use(createPinia()).mount('#app').$nextTick(() => {
  postMessage({ payload: 'removeLoading' }, '*')
});