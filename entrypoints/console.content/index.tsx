import { createRoot } from 'react-dom/client';
import App from './App';
// Inlined as a string and put inside our own shadow root: the console's styles
// can't reach the widget, and the bundle needs no extension URL to load CSS.
import css from './style.css?inline';

export default defineContentScript({
  matches: ['https://chrome.google.com/webstore/devconsole/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manual',
  main() {
    if (document.getElementById('cwsagent-host')) return; // already mounted
    const host = document.createElement('div');
    host.id = 'cwsagent-host';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css;
    const mount = document.createElement('div');
    shadow.append(style, mount);
    document.documentElement.append(host);
    createRoot(mount).render(<App />);
  },
});
