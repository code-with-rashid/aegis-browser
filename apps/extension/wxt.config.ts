import path from 'node:path';
import { defineConfig } from 'wxt';
import type { WxtUnimportOptions } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  // This monorepo's domain packages (packages/*) are bundled from source (no
  // per-package build step) and use plain identifiers like `storage` that collide with
  // WXT's auto-import presets — unimport's transform was rewriting unrelated code in
  // @aegis/agent to import a nonexistent `wxt/utils/storage` binding. `imports: false`
  // does NOT stop this (WXT still installs the Vite plugin unconditionally in 0.20.x);
  // excluding packages/* from the transform's file filter does.
  imports: {
    // `exclude` is a real option on unimport's underlying unplugin (`include`/`exclude:
    // FilterPattern`) accepted at runtime, but WXT's own `WxtUnimportOptions` type
    // doesn't declare it — hence the cast.
    exclude: [/[\\/]packages[\\/]/],
  } as WxtUnimportOptions,
  vite: () => ({
    resolve: {
      alias: {
        '@': path.resolve(__dirname),
      },
    },
  }),
  manifest: {
    name: 'Aegis',
    description: 'Local-first, bring-your-own-key browser-automation agent for Chrome & Edge.',
    permissions: ['storage', 'sidePanel', 'tabs', 'debugger', 'alarms'],
    host_permissions: ['<all_urls>'],
  },
});
