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
    description: '在侧边栏解析、保存和分析 BOSS直聘岗位，保留最近一次工作进度。',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting', 'storage', 'tabs', 'sidePanel'],
    host_permissions: ['http://127.0.0.1:32123/*'],
  },
});
