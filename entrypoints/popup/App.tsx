// Says whether the widget is running on the current tab and, when the console
// blocks extensions, how to start a publishing window where it doesn't.
import { useEffect, useState } from 'react';

const CONSOLE = 'https://chrome.google.com/webstore/devconsole';
const FLAG = '--apps-gallery-url=https://webstore.invalid/';
const COMMANDS = {
  mac: `open -na "Google Chrome" --args --user-data-dir="$HOME/Chrome Publishing" ${FLAG} ${CONSOLE}`,
  win: `"%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="%USERPROFILE%\\Chrome Publishing" ${FLAG} ${CONSOLE}`,
  linux: `google-chrome --user-data-dir="$HOME/.chrome-publishing" ${FLAG} ${CONSOLE}`,
};
type Os = keyof typeof COMMANDS;
type View = { kind: 'loading' } | { kind: 'active'; detail: string } | { kind: 'blocked' } | { kind: 'elsewhere' };

const PAGES: Record<string, string> = {
  listing: 'Store listing', privacy: 'Privacy', test: 'Test instructions', distribution: 'Distribution', item: 'Item page', other: 'Developer console',
};

export default function App() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [os, setOs] = useState<Os>(/Mac/i.test(navigator.platform) ? 'mac' : /Win/i.test(navigator.platform) ? 'win' : 'linux');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      // The content-script match grants host access to the console, so its URL
      // is visible without the "tabs" permission; other tabs show no URL.
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url?.startsWith(CONSOLE) || tab.id === undefined) return setView({ kind: 'elsewhere' });
      try {
        const status = await browser.tabs.sendMessage(tab.id, { type: 'cwsagent:status' }) as { active?: boolean; page?: string; package?: string | null };
        if (!status?.active) throw new Error('no reply');
        setView({ kind: 'active', detail: `${PAGES[status.page ?? 'other'] ?? 'Console'} · ${status.package ? `“${status.package}” loaded` : 'no listing loaded yet'}` });
      } catch {
        // No content script answered on a console tab: still loading, or Chrome
        // refused to inject it (the Web Store restriction).
        setView(tab.status === 'loading' ? { kind: 'active', detail: 'The page is still loading.' } : { kind: 'blocked' });
      }
    })();
  }, []);

  if (view.kind === 'loading') return null;

  if (view.kind === 'active') {
    return (
      <>
        <p className="status ok">Running on this page</p>
        <p className="muted">{view.detail}</p>
      </>
    );
  }

  if (view.kind === 'elsewhere') {
    return (
      <>
        <p>Works on the Chrome Web Store developer console. Open an item there and use the button in the bottom-right corner.</p>
        <button className="primary" onClick={() => { browser.tabs.create({ url: CONSOLE }); window.close(); }}>Open the developer console</button>
        <p className="muted" style={{ marginTop: 10 }}>
          <button className="link" onClick={() => setView({ kind: 'blocked' })}>Not showing on the console?</button>
        </p>
      </>
    );
  }

  return (
    <>
      <p className="status warn">Chrome is blocking extensions on the developer console</p>
      <p>Chrome won't let any extension run on <b>chrome.google.com</b> unless it was started with a special setting. Start a separate publishing window with it, so your everyday Chrome stays as it is:</p>
      <div className="tabs" role="group" aria-label="Your system">
        {(['mac', 'win', 'linux'] as Os[]).map((o) => (
          <button key={o} aria-pressed={o === os} onClick={() => { setOs(o); setCopied(false); }}>{{ mac: 'macOS', win: 'Windows', linux: 'Linux' }[o]}</button>
        ))}
      </div>
      <pre>{COMMANDS[os]}</pre>
      <button className="primary" onClick={async () => { await navigator.clipboard.writeText(COMMANDS[os]); setCopied(true); }}>{copied ? 'Copied' : 'Copy command'}</button>
      <ol className="muted">
        <li>Run it in Terminal. Your current Chrome can stay open; this starts a separate one.</li>
        <li>In that window, open chrome://extensions, turn on Developer mode, choose Load unpacked and pick the unzipped CWSAgent folder. Then sign in to the console.</li>
        <li>Always open that window with the same command.</li>
      </ol>
    </>
  );
}
