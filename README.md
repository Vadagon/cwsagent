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
| **With [Extension Tower](https://extensiontower.com)** | See every language, image and store answer side by side and edit them. Open the item's Store listing in the Chrome Web Store console: the CWS Agent card finds it in your account and **Sync** fills it. Without a connection the card asks for your API token. The popup also lists your extensions, with **Chrome** and **Edge** buttons that open that store's dashboard, sync the listing and fill it. |
| **From your live listing** | **Extract** it, edit the files, drop the ZIP back. |

The package holds only what you put in it. Anything missing stays as it is in the console.

## Private by design

- **Runs on your computer**, inside your own Chrome, only on the Web Store developer console and Partner Center's Edge pages. No account needed.
- **Sends nothing out**: no analytics, no tracking. Your listings, stats and user messages never leave your browser.
- Network traffic is between you and Google's own console (uploading your images, saving your draft, Extract downloading your listing's images), plus Extension Tower only if you connect it: then CWSAgent reads your extension list from extensiontower.com to find the open item, checks that listing's languages, and on **Sync** downloads it.
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
3. Review and press **Save & Continue** or **Save draft** yourself. Partner Center saves each language separately.

On Edge, images belong to each language, uploads are PNG (converted when needed), up to 6 screenshots are used, and descriptions over 10,000 characters are reported, not cut. Edge asks descriptions not to mention other browsers; the panel points it out.

### Chrome Web Store

From the popup, **Chrome** opens the item, or looks for it in your item list (by ID, then by name) and opens it. If it isn't there, the same dialog offers a new listing or picking it yourself.

A card sits under the heading of each item's Store listing, Privacy and Test instructions tabs. It finds the item in your Extension Tower account by its link, its ID or store URL, then a unique name. If the account isn't connected, paste your API token into the card.

| Step | Action |
|---|---|
| Sync | **Sync** loads the listing from Extension Tower and fills the open tab (replacing screenshots asks first) → **Save draft** on each tab |
| Autofill a package | Drop a listing on the card, or use **Settings** → Upload → **Autofill** on each tab → **Save draft** |
| Extract | **Settings** → **Extract** → tick what to save → **Extract** → ZIP lands in Downloads |

CWSAgent never saves, submits, ticks certifications or changes visibility.

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
