# CWSAgent

Open-source Chrome extension that fills your Chrome Web Store and Microsoft Edge Add-ons listings
from one folder or ZIP, or from your [Extension Tower](https://extensiontower.com) account. You, your
coding agent or Extension Tower write the listing; CWSAgent puts it into the store's dashboard.

| | |
|---|---|
| **Autofill** | Drop a listing package → fills descriptions in every language, icon, tiles, screenshots, privacy and test instructions |
| **Extract** | Saves a live listing as a package ZIP. Optional: installs, impressions, users, ratings, user support |

## Make a listing package

A package is a plain folder: `listing.json` for details and privacy answers, `images/` for the icon,
tiles and screenshots, and `languages/<code>/` for each language's description and screenshots
([FORMAT.md](FORMAT.md), [example](example), [listing.schema.json](listing.schema.json)).
Keep it in your extension's repo as `meta/` and drop the folder, or a ZIP of it, on the CWS Agent card.

| Way | How |
|---|---|
| **With your coding agent** | Add the [cwsagent-package skill](skills/cwsagent-package/SKILL.md) to Claude Code, Codex or any agent that reads skills, then ask it to *"make a CWSAgent listing package for this extension"*. Agents without skills: point them at the SKILL.md URL. |
| **With [Extension Tower](https://extensiontower.com)** | See every language, image and store answer side by side and edit them. Open the item's Store listing in the Chrome Web Store console: the CWS Agent card finds it in your account and **Sync** fills it. Connect or create an account from the card's ExtensionTower logo or Settings icon. The popup also lists your extensions, with **Chrome** and **Edge** buttons that open that store's dashboard, sync the listing and fill it. |
| **From your live listing** | **Extract** it, edit the files, drop the ZIP back. |

The package holds only what you put in it. Anything missing stays as it is in the console.

## Both stores from a `meta/` folder

For a `meta/` folder in the Extension Tower META.md layout (`descriptions/`, `screenshots/`, `promo/`,
`edge/`, `data/dashboard.json`, `listing.json`), generate the publish manifest first:

```bash
node scripts/publish-manifest.mjs path/to/extension/meta --zip path/to/release/ext-v1.zip
```

It writes `meta/store/publish.json` ([schema](publish.schema.json)) and copies the ZIP to
`meta/store/package.zip` (gitignored). It prints a **review** list (answers it inferred, such as
data-usage boxes or remote code) and **warnings** (sizes, locales missing from the package). Without
`--zip` it takes the newest ZIP under `../release/`. Store ids come from `listing.json`: `id`,
`publisherId`, `edgeProductId`.

Then drop the whole `meta/` folder on the CWSAgent card in each console (each site keeps its own copy):

| Store | Page | CWSAgent does | You do |
|---|---|---|---|
| Chrome | Store listing | Category, URLs, small tile, marquee, global screenshots, then every package language: description and localized screenshots | Save draft |
| Chrome | Privacy | Single purpose, each permission, host access, remote code, data usage, privacy URL | Tick the 3 certifications, Save draft |
| Chrome | Test instructions | Reviewer steps | Save draft, then **Submit for review** |
| Chrome | Package | Not handled: upload there, or with the CWS API | Upload when the version changed |
| Edge | Packages | **Upload package** puts `store/package.zip` in the upload and waits for validation | Save & Continue |
| Edge | Availability | Not handled | Visibility, markets |
| Edge | Properties | Category, website, support URL, mature content | Save & Continue |
| Edge | Privacy | Same answers as Chrome | Certifications, Save & Continue |
| Edge | Store listings | **Fill all languages**: opens each language, fills description, search terms, 300×300 logo, tiles, screenshots, presses Save draft and Close, next. Logo and tiles (and screenshots when no language has its own) are uploaded on the first language and set with Duplicate for all languages; then it fills failed or Incomplete languages again (up to 3 passes). Stopped runs carry on where they ended | **Publish** |

Partner Center keeps edits per language only after Save draft, so the all-languages run saves each
language's draft after you confirm. Nothing is submitted or published, and certifications are never
ticked. Languages the package's `_locales` lacks are skipped: neither store offers them. The
Edge page mechanics (Packages upload, search terms, the languages table) are new and not yet run on
a live account.

## Private by design

- **Runs on your computer**, inside your own Chrome, only on the Web Store developer console and Partner Center's Edge pages. No account needed.
- **Sends nothing out**: no analytics, no tracking. Your listings, stats and user messages never leave your browser.
- Network traffic is between you and Google's own console (uploading your images, saving your draft, Extract downloading your listing's images), plus Extension Tower only if you connect it: then CWSAgent reads your extension list from extensiontower.com to find the open item, reads that listing's package to show what it holds, and on **Sync** downloads its images too.
- **Your API key stays inside the extension.** It's kept in the extension's own storage and used only by its background worker, never on the console page.
- **No permissions requested**. It only runs on the developer console pages, and the [code is open](entrypoints) for anyone to check.

## Install

> [!IMPORTANT]
> Chrome blocks all extensions on the Web Store. CWSAgent only works in a Chrome
> profile started with `--apps-gallery-url`. Use a **separate profile** for this:
> in it, every installed extension can access Web Store pages.

**1. Download** [**cwsagent-chrome.zip**](https://github.com/Vadagon/cwsagent/releases/latest/download/cwsagent-chrome.zip) (latest release) and unzip it into a folder you'll keep.

**2. Start a publishing window** (your normal Chrome can stay open):

<details open><summary>macOS</summary>

```bash
open -na "Google Chrome" --args --user-data-dir="$HOME/Chrome Publishing" --apps-gallery-url=https://webstore.invalid/ https://chrome.google.com/webstore/devconsole
```
</details>

<details><summary>Windows</summary>

```bat
"%ProgramFiles%\Google\Chrome\Application\chrome.exe" --user-data-dir="%USERPROFILE%\Chrome Publishing" --apps-gallery-url=https://webstore.invalid/ https://chrome.google.com/webstore/devconsole
```
</details>

<details><summary>Linux</summary>

```bash
google-chrome --user-data-dir="$HOME/.chrome-publishing" --apps-gallery-url=https://webstore.invalid/ https://chrome.google.com/webstore/devconsole
```
</details>

**3. Load it:** `chrome://extensions` → **Developer mode** → **Load unpacked** → pick the unzipped folder.

Always open the publishing window with the same command. To update, download the ZIP again, replace the folder, and press reload on CWSAgent in `chrome://extensions`.

## Use

### Microsoft Edge Add-ons

Partner Center doesn't block extensions, so no publishing window is needed there.

1. In the popup, press **Edge** next to an extension. The first time, CWSAgent looks for it by name in Partner Center, links it and opens it. If it isn't there, a dialog offers **Create new listing** (upload the package; CWSAgent links the new extension) or **Choose it myself** (open it, then press **Link**).
2. The panel syncs the listing from Extension Tower. Open **Properties**, **Privacy** or a language's **Edit details** under Store listings and press **Autofill**.
3. Review and press **Save & Continue** yourself on Properties and Privacy. On a language page, Autofill replaces the images, writes the description last and presses **Save draft**: Partner Center saves each language separately.

On Edge, images belong to each language, uploads are PNG (converted when needed), up to 6 screenshots are used, and descriptions over 10,000 characters are reported, not cut. Edge asks descriptions not to mention other browsers; the panel points it out.

### Chrome Web Store

From the popup, **Chrome** opens the item, or looks for it in your item list (by ID, then by name) and opens it. If it isn't there, the same dialog offers a new listing or picking it yourself.

A card sits under the heading of each item's Store listing, Privacy and Test instructions tabs. It finds the item in your Extension Tower account by its link, its ID or store URL, then a unique name. To connect, press the card's ExtensionTower logo or Settings icon and paste your API token; you can create an account from there too.

| Step | Action |
|---|---|
| Sync | **Sync** loads the listing from Extension Tower and fills the open tab (replacing screenshots asks first) → **Save draft** on each tab |
| Autofill a package | Drop a ZIP or folder on the card, or choose one → **Autofill** on each tab → **Save draft** |
| Extract | **Settings** → **Extract** → tick what to save → **Extract** → ZIP lands in Downloads |

CWSAgent never saves, submits, ticks certifications or changes visibility. (On Edge, a language page's Autofill and the all-languages run are the exception to saving: they press Save draft for each language after you confirm.)

## Development

Pull requests are welcome! Fixes for console layout changes, new languages,
better extraction or UI improvements: open an issue or send a PR.

```bash
git clone https://github.com/Vadagon/cwsagent.git
cd cwsagent
npm install
npm run dev       # dev mode with reload
npm run build     # → dist/ (load unpacked)
npm test          # unit tests
npm run mock      # mock console at http://127.0.0.1:8767, no real listing needed
```

Releases are built by GitHub Actions: pushing a `v*` tag publishes the ZIPs.

React + TypeScript on [WXT](https://wxt.dev). Not affiliated with Google.

## Listing kit — 2 November 2026

The owner-requested listing deliverables are in [meta/](meta/README.md): 55 locale drafts, five screenshots per locale, five unselected promo concepts at both dimensions and a [local review page](meta/index.html). Manifest name/description sources are localized for 0.6.1, unbuilt and unverified. Account grants, privacy and public-page release state are recorded in [meta/EXTENSIONTOWER.md](meta/EXTENSIONTOWER.md). No store submission occurred.
