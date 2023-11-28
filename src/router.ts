import { createRouter, createWebHashHistory } from 'vue-router';
import MainWindow from './views/MainWindow.vue'; 
import ChapterMakerWindow from './views/ChapterMakerWindow.vue'; 

const routes = [
  {
    path: '/',
    name: 'MainWindow',
    component: MainWindow,
    meta: {
      title: 'Storyteller'
    }
  },
  {
    path: '/chapter-maker',
    name: 'ChapterMakerWindow',
    component: ChapterMakerWindow,
    meta: {
      title: 'Chapter Maker'
    }
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  document.title = to.meta.title as string || 'Storyteller';
  next();
});

export default router;
