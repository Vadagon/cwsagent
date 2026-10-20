import { defineConfig } from 'wxt';

// Build: dist/chrome-mv3 (load unpacked). Release: `npm run release` moves the
// store ZIP from dist/ to release/.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'dist',
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}.zip',
    sourcesTemplate: '{{name}}-{{version}}-sources.zip',
  },
  manifest: {
    name: 'CWSAgent – Web Store Listing Autofill & Extract',
    short_name: 'CWSAgent',
    description: 'Fill or extract a Web Store listing in one drop: descriptions in every language, screenshots, tiles, privacy answers.',
    minimum_chrome_version: '116',
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: { default_title: 'CWSAgent', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
  },
});
