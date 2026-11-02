import { defineConfig } from 'wxt';

// Build: dist/ (load unpacked). Release: `npm run release` moves the ZIPs that
// `wxt zip` writes next to the build into release/.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'dist',
  outDirTemplate: '',
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}.zip',
    sourcesTemplate: '{{name}}-{{version}}-sources.zip',
  },
  manifest: {
    name: '__MSG_extName__',
    default_locale: 'en',
    short_name: 'CWSAgent',
    description: '__MSG_extDescription__',
    minimum_chrome_version: '116',
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: { default_title: 'CWSAgent', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
  },
});
