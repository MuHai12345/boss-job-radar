import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  vite: () => ({
    build: {
      modulePreload: false,
    },
  }),
  manifest: {
    name: 'BOSS直聘 AI 岗位雷达',
    description: '识别当前页面是否属于 BOSS直聘的本地求职辅助扩展基线。',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting'],
  },
});
