# CWSAgent

Autofill and extract Chrome Web Store listings from the developer console.

| | |
|---|---|
| **Autofill** | Drop a listing folder or ZIP → fills descriptions in every language, icon, tiles, screenshots, privacy and test instructions |
| **Extract** | Saves a listing to one ZIP. Optional: installs, impressions, users, ratings, user support |

Extract's ZIP is the format Autofill reads ([FORMAT.md](FORMAT.md), [example](example)).

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

| Step | Action |
|---|---|
| Autofill | Drop a listing on the widget → **Autofill** on Store listing, Privacy, Test instructions → **Save draft** on each |
| Extract | **Extract** → tick what to save → **Extract** → ZIP lands in Downloads |

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
