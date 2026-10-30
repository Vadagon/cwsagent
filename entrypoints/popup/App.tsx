// The toolbar popup: Extension Tower connection and the account's extensions,
// each with a button per store that opens its dashboard and updates the
// listing there. Also says when Chrome blocks CWSAgent on the Web Store
// console and how to start a publishing window where it doesn't.
import { useEffect, useState } from 'react';
import { towerConnect, towerDisconnect, towerList, towerOpen, towerState, type Store, type TowerExtension, type TowerState } from '../../lib/tower';

const CONSOLE = 'https://chrome.google.com/webstore/devconsole';
const FLAG = '--apps-gallery-url=https://webstore.invalid/';
const SETUP_URL = 'https://github.com/Vadagon/cwsagent#install';
const GUIDE_URL = 'https://github.com/Vadagon/cwsagent#make-a-listing-package';
const TOWER_URL = 'https://extensiontower.com/dashboard';
const COMMANDS = {
  mac: `open -na "Google Chrome" --args --user-data-dir="$HOME/Chrome Publishing" ${FLAG} ${CONSOLE}`,
  win: `"%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="%USERPROFILE%\\Chrome Publishing" ${FLAG} ${CONSOLE}`,
  linux: `google-chrome --user-data-dir="$HOME/.chrome-publishing" ${FLAG} ${CONSOLE}`,
};
type Os = keyof typeof COMMANDS;
type Tab = { kind: 'loading' } | { kind: 'active'; detail: string } | { kind: 'blocked' } | { kind: 'elsewhere' };

const PAGES: Record<string, string> = {
  listing: 'Store listing', privacy: 'Privacy', test: 'Test instructions', distribution: 'Distribution', item: 'Item page', other: 'Developer console',
};
const STORES: { store: Store; label: string }[] = [{ store: 'chrome', label: 'Chrome' }, { store: 'edge', label: 'Edge' }];

export default function App() {
  const [tab, setTab] = useState<Tab>({ kind: 'loading' });
  const [setup, setSetup] = useState(false);
  const [state, setState] = useState<TowerState | null>(null);
  const [extensions, setExtensions] = useState<TowerExtension[] | null>(null);
  const [error, setError] = useState('');

  const loadTower = async () => {
    try {
      const s = await towerState();
      setState(s);
      if (s.connected) setExtensions((await towerList()).extensions);
    } catch (e) { setError((e as Error).message); }
  };

  useEffect(() => {
    (async () => {
      // The content-script match grants host access to the console, so its URL
      // is visible without the "tabs" permission; other tabs show no URL.
      const [current] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!current?.url?.startsWith(CONSOLE) || current.id === undefined) return setTab({ kind: 'elsewhere' });
      try {
        const status = await browser.tabs.sendMessage(current.id, { type: 'cwsagent:status' }) as { active?: boolean; page?: string; package?: string | null };
        if (!status?.active) throw new Error('no reply');
        setTab({ kind: 'active', detail: `${PAGES[status.page ?? 'other'] ?? 'Console'} · ${status.package ? `“${status.package}” loaded` : 'no listing loaded yet'}` });
      } catch {
        // No content script answered on a console tab: still loading, or Chrome
        // refused to inject it (the Web Store restriction).
        setTab(current.status === 'loading' ? { kind: 'active', detail: 'The page is still loading.' } : { kind: 'blocked' });
      }
    })();
    loadTower();
  }, []);

  if (tab.kind === 'loading' || !state) return null;
  if (tab.kind === 'blocked' || setup) return <Setup blocked={tab.kind === 'blocked'} onBack={setup ? () => setSetup(false) : undefined} />;

  const connect = async (key: string) => {
    setError('');
    try { await towerConnect(key); await loadTower(); } catch (e) { setError((e as Error).message); }
  };
  const open = async (extension: TowerExtension, store: Store) => {
    try { await towerOpen(extension, store); window.close(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      {tab.kind === 'active' && <p className="status ok">Running on this page <span className="muted">· {tab.detail}</span></p>}
      {!state.connected ? (
        <>
          <p className="title">Extension Tower</p>
          <form className="key" onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem('key') as HTMLInputElement;
            connect(input.value);
            input.value = '';
          }}>
            <input name="key" type="password" placeholder="API key" autoComplete="off" spellCheck={false} aria-label="Extension Tower API key" />
            <button className="primary" type="submit">Connect</button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
          <p className="muted"><a href={TOWER_URL} target="_blank" rel="noreferrer">Get a key</a> · <a href={GUIDE_URL} target="_blank" rel="noreferrer">Use a listing package instead</a></p>
        </>
      ) : (
        <>
          {!state.chromeSeen && (
            <div className="notice" role="note">
              <b>Chrome blocks CWSAgent on the Web Store console</b>
              <span>Enable access before updating on Chrome.</span>
              <span><a href={SETUP_URL} target="_blank" rel="noreferrer">How to enable</a> · <button className="link" onClick={() => setSetup(true)}>Show the command</button></span>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {extensions === null ? <p className="muted">Loading…</p> : extensions.length === 0 ? (
            <p>No extensions in your Extension Tower account yet.</p>
          ) : (
            <ul className="list">
              {extensions.map((x) => (
                <li key={x.id}>
                  {x.icon ? <img src={x.icon} alt="" width={28} height={28} /> : <span className="blank" />}
                  <span className="name" title={x.name}>{x.name}</span>
                  <span className="stores">
                    {STORES.map(({ store, label }) => (
                      <button key={store} className="store" onClick={() => open(x, store)}
                        title={store === 'edge' && !state.links.edge[x.id] ? `Link ${x.name} on Edge, then update it` : `Update ${x.name} on ${label}`}>
                        {label}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted foot">
            <button className="link" onClick={async () => { await towerDisconnect(); setExtensions(null); await loadTower(); }}>Disconnect</button>
            {' · '}<a href={GUIDE_URL} target="_blank" rel="noreferrer">Listing packages</a>
          </p>
        </>
      )}
    </>
  );
}

function Setup({ blocked, onBack }: { blocked: boolean; onBack?: () => void }) {
  const [os, setOs] = useState<Os>(/Mac/i.test(navigator.platform) ? 'mac' : /Win/i.test(navigator.platform) ? 'win' : 'linux');
  const [copied, setCopied] = useState(false);
  return (
    <>
      <p className="status warn">{blocked ? 'Chrome is blocking extensions on the developer console' : 'Enable CWSAgent on the developer console'}</p>
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
      <p className="muted"><a href={SETUP_URL} target="_blank" rel="noreferrer">Full setup guide</a>{onBack && <> · <button className="link" onClick={onBack}>Back</button></>}</p>
    </>
  );
}
