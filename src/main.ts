import { createApp } from 'vue';
import "./style.css";
import ArcoVue from '@arco-design/web-vue';
import App from './App.vue';
import router from './router';
import '@arco-design/web-vue/dist/arco.css';
import { Message } from '@arco-design/web-vue';
import { createPinia } from 'pinia'

// Fontawesome图标
import './assets/font-awesome/css/all.css'

const app = createApp(App)
Message._context = app._context;
app.use(ArcoVue).use(router).use(createPinia()).mount('#app').$nextTick(() => {
  postMessage({ payload: 'removeLoading' }, '*')
});