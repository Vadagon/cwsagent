# CWSAgent

Autofill and extract Chrome Web Store listings, right inside the developer console.

A small widget sits in the corner of the [Chrome Web Store developer console](https://chrome.google.com/webstore/devconsole):

- **Autofill**: drop a listing folder or ZIP on it, then press Autofill on the
  item's Store listing, Privacy and Test instructions pages. It fills the
  description in every language, uploads the icon, promo tiles and screenshots,
  and answers the privacy form.
- **Extract**: saves an item's listing as one ZIP in your Downloads: every
  language, full-size images, privacy answers, test instructions. Optionally it
  also saves installs, impressions, users, ratings and user support issues, for
  a date range you pick.

The ZIP that Extract saves is the same format Autofill reads, so you can copy a
listing from one item to another, keep backups, or edit it (by hand or with an
AI tool) and drop it back. The format is described in [FORMAT.md](FORMAT.md);
[`example/`](example) is a small listing to try.

CWSAgent never presses **Save draft**, **Submit for review** or **Publish**. It
never ticks the data-use certifications (it highlights them for you) and never
changes distribution, pricing or visibility. Before replacing existing
screenshots it asks first. It makes no network requests of its own and has no
server: everything stays in your browser.

## Before you install: Chrome blocks extensions on the Web Store

Chrome does not let **any** extension run on `chrome.google.com/webstore`,
which includes the developer console. Installed normally, CWSAgent shows
nothing there.

Chrome decides which site counts as "the Web Store" from a startup setting,
`--apps-gallery-url`. Starting Chrome with that setting pointing at an address
that doesn't exist lifts the block, for that Chrome window only.

> **Security note.** While Chrome runs with this setting, *every* extension
> installed in that profile can read and change the Web Store pages, not just
> CWSAgent. That is why the steps below use a **separate Chrome profile** just
> for publishing, with only the extensions you trust. Your everyday Chrome keeps
> the normal protection. In the publishing window, "Add to Chrome" on the store
> doesn't work; install extensions from your everyday Chrome.

## Install

### 1. Get the extension

Either download the latest `cwsagent-<version>-chrome.zip` from
[Releases](https://github.com/Vadagon/cwsagent/releases) and unzip it into a folder you'll keep,

or build it yourself (Node 22 or newer):

```bash
git clone https://github.com/Vadagon/cwsagent.git
cd cwsagent
npm install
npm run build
```

The extension is then in `dist/chrome-mv3/`.

### 2. Start a publishing window

Run the command for your system. It opens a separate Chrome profile named
"Chrome Publishing" with the Web Store block lifted, straight on the developer
console. Your current Chrome can stay open.

**macOS** (Terminal):

```bash
open -na "Google Chrome" --args --user-data-dir="$HOME/Chrome Publishing" --apps-gallery-url=https://webstore.invalid/ https://chrome.google.com/webstore/devconsole
```

**Windows** (Command Prompt):

```bat
"%ProgramFiles%\Google\Chrome\Application\chrome.exe" --user-data-dir="%USERPROFILE%\Chrome Publishing" --apps-gallery-url=https://webstore.invalid/ https://chrome.google.com/webstore/devconsole
```

**Linux**:

```bash
google-chrome --user-data-dir="$HOME/.chrome-publishing" --apps-gallery-url=https://webstore.invalid/ https://chrome.google.com/webstore/devconsole
```

Always open the publishing window with the same command. The setting only
applies to a Chrome that is *started* with it: if a window of that profile is
already open, close it completely first.

### 3. Load CWSAgent in that window

1. Go to `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the unzipped folder (or `dist/chrome-mv3`).
3. Sign in to your Chrome Web Store developer account and open one of your items.

The widget appears in the bottom-right corner. If it doesn't, click the CWSAgent
toolbar icon: it tells you whether the console is still blocked and shows the
start command again.

To update later, replace the folder (or `git pull && npm run build`) and click
the reload icon on CWSAgent's card in `chrome://extensions`.

## Use

**Autofill**

1. Drop a listing folder or ZIP on the widget, or click it to choose one. The
   listing stays loaded until you forget it in Settings, so you can move between
   pages and items.
2. On **Store listing**, press **Autofill**. It switches through each language,
   fills it and returns to where you started. **Stop** ends a run between steps.
3. Check the page and press **Save draft**. Then do the same on **Privacy** and
   **Test instructions**. The console reloads between pages, so save each one
   before moving on.

**Extract**

Press **Extract**, tick what to save, and press Extract again. Listing data is
preselected; stats (installs & uninstalls, impressions, users), ratings and user
support are opt-in, with a date range from 30 days to everything available.
Your choices are remembered. CWSAgent walks through the pages it needs and
downloads one ZIP. Choosing a date range changes the charts on those pages, as
you would by hand; support issues are expanded to read them and collapsed again,
and the reply box and status menus are never touched. Support issues include
your users' names and messages, so keep those ZIPs private.

**Header buttons**: Settings (what Autofill fills; upload or forget a listing),
Info (what the loaded listing contains, links to the other pages, shown once a
listing is loaded) and History (results of past runs, with Copy buttons for
anything that failed, shown once something has run).

## How it works

- `entrypoints/console.content/`: the widget, a React app in its own shadow
  root, so the console's styles can't affect it.
- `entrypoints/capture.content.ts`: a tiny listener in the page that copies the
  console's chart data responses to the widget during Extract (for date ranges
  longer than the default 30 days). It reads only; it changes and sends nothing.
- `entrypoints/popup/`: the toolbar popup with the setup help.
- `lib/`: reading listings (folder, ZIP, and the older `cws-listing` ZIP format),
  driving the console's form controls by their visible labels, extracting, and
  reading analytics and support.

The extension asks for no permissions; its only access is a content script on
`chrome.google.com/webstore/devconsole/*`. It works with the console's page as
it is: when Google changes the console's layout, parts of it can stop working
until they're updated here.

## Development

```bash
npm install
npm run dev        # WXT dev mode with reload
npm run build      # → dist/chrome-mv3
npm run release    # → release/cwsagent-<version>-chrome.zip
npm test           # unit tests (ZIP, listing reader, analytics)
npm run compile    # type check
npm run mock       # after a build: a mock developer console on http://127.0.0.1:8767
```

The mock console (`tests/mock/`) copies the real console's structure and runs
the **built** content scripts, so you can try Autofill and Extract without
touching a real listing:
`http://127.0.0.1:8767/webstore/devconsole/pub/abcdefghijklmnopabcdefghijklmnop/edit`.
Its Support URL field refuses input on purpose, to show how failures are reported.

Built with [WXT](https://wxt.dev), React and TypeScript. Icons are Google
Material Icons (Apache 2.0).

CWSAgent is not affiliated with or endorsed by Google.
