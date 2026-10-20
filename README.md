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

**1. Download** the ZIP from [Releases](https://github.com/Vadagon/cwsagent/releases) and unzip it.

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

Always open the publishing window with the same command.

## Use

| Step | Action |
|---|---|
| Autofill | Drop a listing on the widget → **Autofill** on Store listing, Privacy, Test instructions → **Save draft** on each |
| Extract | **Extract** → tick what to save → **Extract** → ZIP lands in Downloads |

CWSAgent never saves, submits, ticks certifications or changes visibility.

## Develop

```bash
npm install
npm run build     # dist/chrome-mv3
npm run release   # release/*.zip
npm test
npm run mock      # mock console at http://127.0.0.1:8767
```

React + TypeScript on [WXT](https://wxt.dev). Not affiliated with Google.
