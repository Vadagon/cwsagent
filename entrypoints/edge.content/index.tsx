import { createRoot } from 'react-dom/client';
import App from './App';
// Same look as the Chrome console panel, in its own shadow root.
import css from '../console.content/style.css?inline';

export default defineContentScript({
  matches: ['https://partner.microsoft.com/*/dashboard/microsoftedge/*'],
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
