import { createRouter, createWebHashHistory } from 'vue-router';
import MainWindow from './views/MainWindow.vue'; 
import ChapterMakerWindow from './views/ChapterMakerWindow.vue'; 
import VoiceTesterWindow from './views/VoiceTesterWindow.vue'; 
import { i18n } from './main';

const routes = [
  {
    path: '/',
    name: 'MainWindow',
    component: MainWindow,
    meta: {
      titleKey: "MAINWINDOW_Title"
    }
  },
  {
    path: '/chapter-maker',
    name: 'ChapterMakerWindow',
    component: ChapterMakerWindow,
    meta: {
      titleKey: "CHAPTERMAKER_Title"
    }
  },
  {
    path: '/voice-tester',
    name: 'VoiceTesterWindow',
    component: VoiceTesterWindow,
    meta: {
      titleKey: "VOICETESTER_Title"
    }
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// Update title for each page(window)
router.beforeEach((to, from, next) => {
  const titleKey = to.meta.titleKey;
  document.title = i18n.global.t(String(titleKey)) || 'Storyteller';
  next();
});

export default router;
