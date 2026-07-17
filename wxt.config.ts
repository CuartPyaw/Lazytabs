import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  outDirTemplate: 'LazyTabs',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LazyTabs',
    description: 'Automatically group Chrome tabs by domain rules.',
    permissions: ['storage', 'tabs', 'tabGroups'],
    action: { default_title: 'LazyTabs' },
    commands: {
      'organize-current-window': {
        suggested_key: { default: 'Alt+O' },
        description: 'Organize tabs in the current window',
      },
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
