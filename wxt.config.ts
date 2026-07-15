import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LazyTabs',
    description: 'Automatically group Chrome tabs by domain rules.',
    permissions: ['storage', 'tabs', 'tabGroups'],
    action: { default_title: 'LazyTabs' },
    options_ui: { page: 'options.html', open_in_tab: true },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
