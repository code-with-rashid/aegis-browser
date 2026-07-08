import path from 'node:path';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  vite: () => ({
    resolve: {
      alias: {
        '@': path.resolve(__dirname),
      },
    },
  }),
  manifest: {
    name: 'Aegis',
    description:
      'Local-first, bring-your-own-key browser-automation agent for Chrome & Edge.',
    permissions: ['storage'],
  },
});
