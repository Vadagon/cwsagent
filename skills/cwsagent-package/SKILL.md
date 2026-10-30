---
name: cwsagent-package
description: Write or update a Chrome Web Store listing package (meta/ folder) that the CWSAgent extension autofills into the developer console. Use when asked to prepare, localize or update a Web Store listing, store descriptions, screenshots, promo tiles, privacy answers or permission justifications for a Chrome extension.
---

# CWSAgent listing package

You write files. The user drops the folder (or a ZIP of it) on CWSAgent in the Chrome Web Store
developer console, presses **Autofill** on each tab, reviews and presses **Save draft** themselves.
Nothing you write is published without that review.

The full format is in [FORMAT.md](https://github.com/Vadagon/cwsagent/blob/main/FORMAT.md) and
`listing.json` has a [JSON Schema](https://github.com/Vadagon/cwsagent/blob/main/listing.schema.json).
Read both before writing. A working sample is in [example/](https://github.com/Vadagon/cwsagent/tree/main/example).

## Where the package goes

`meta/` at the root of the extension's repository, unless the user names another folder.
If `meta/` already exists, update it in place: keep files the user wrote, change only what was asked.
If it uses another layout (for example the extension-marketing skill's `descriptions/`, `screenshots/`,
`promo/`), move the files into this layout; CWSAgent reads only this one.

```text
meta/
  listing.json
  images/icon.png  images/small-tile.png  images/marquee.png
  images/screenshots/1.png … 5.png
  languages/<locale>/description.txt
  languages/<locale>/screenshots/1.png …      only where that language differs
```

Every file is optional. Leave out anything you can't do well: CWSAgent leaves missing fields
untouched in the console.

## Steps

1. **Read the extension.** `manifest.json` (permissions, host permissions, content-script matches,
   `default_locale`), `_locales/*/messages.json`, the README and the code paths each permission is
   used in. Privacy answers must match what the code does, not what would sound good.
2. **Get the copy.** In order of preference:
   - The user's own text, or an existing `meta/`.
   - **Extension Tower**, when the user gives you an API key (`et_api_…`): use its MCP server, or its
     REST API described at `https://extensiontower.com/api/v1/openapi` and
     `https://extensiontower.com/api/v1/agent-guide`. Read the extension's drafts for every language
     and write them into the package unchanged. Never print the key or save it in the package or repo.
   - A ZIP the user made with CWSAgent's **Extract**: unzip it into `meta/` and edit.
   - Otherwise draft it yourself from the extension's real behaviour, and tell the user it's a draft.
3. **Write `listing.json`.** Start with `"$schema": "https://raw.githubusercontent.com/Vadagon/cwsagent/main/listing.schema.json"`.
   - `privacy.singlePurpose`: one sentence, the one job in user terms.
   - `privacy.permissions`: one justification per permission in the manifest, saying what the
     user gets from it. Skip permissions the manifest doesn't request.
   - `privacy.hostPermission`: covers host permissions and content-script matches together.
   - `privacy.remoteCode`: `false` unless the extension runs code it downloads.
   - `privacy.dataCollected`: only types the extension actually collects or transmits. An empty
     list unticks every box, so leave the key out if you don't know.
   - `testInstructions.instructions`: ≤ 500 characters, concrete reviewer steps.
4. **Write descriptions** to `languages/<locale>/description.txt`, using Chrome `_locales` codes (`en`, `de`,
   `pt_BR`, `es_419`, `zh_CN`). Plain text, ≤ 16,000 characters, no Markdown: the store shows it
   as typed. Translate the meaning, keep feature names and keywords that users search for in that
   language. Only write languages the extension's uploaded package contains; the console offers no others.
5. **Images**, if asked: PNG or JPEG at exact sizes in `images/`. Screenshots 1280×800 (or 640×400),
   numbered in display order; `small-tile` 440×280; `marquee` 1400×560; `icon` 128×128 with the
   artwork inside 96×96. Per-language screenshots go in `languages/<locale>/screenshots/`. Use real UI. Don't put Google or Chrome logos on tiles.
6. **Check** before handing over:
   - `listing.json` parses and validates against the schema.
   - Every justification names a permission that's in the manifest.
   - Description lengths are within the limit; no empty description files.
   - Image sizes match; screenshots are numbered 1…n without gaps.
7. **Hand over.** Tell the user what the package fills and what it leaves alone. To load it they
   drop `meta/` (or `cd meta && zip -r ../listing.zip .`) on the CWS Agent card. Its Loaded listing view lists
   any file it ignored.

## Rules

- **The store name and short description are not in the package.** The Web Store takes them from
  the uploaded extension (`manifest.json` / `_locales/<locale>/messages.json`). To change them, edit
  those files and the user uploads a new version. Say so when the user asks for a new title.
- **Never write the test account password into a file that gets committed.** Leave
  `testInstructions.password` out and tell the user to add it before zipping, or keep `meta/` out of git.
- Don't add `certify` or `distribution`: CWSAgent never ticks the data-use certifications or changes
  visibility and pricing, and reports those keys as ignored.
- Don't invent URLs. `homepageUrl`, `supportUrl` and `privacyPolicyUrl` must be pages that exist.
- Images in a package replace the existing set for that language. Only include screenshots the
  user wants to replace.
