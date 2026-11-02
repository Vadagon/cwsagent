# CWSAgent listing kit

Prepared 2 November 2026 from the 0.6.0 source, with localized manifest sources prepared for 0.6.1. **Unverified. Translations have not been native-reviewed.** No local tests, typechecks, builds, linters, validation commands or product UI checks were run. A necessary shared Vercel publication release runs the provider’s ordinary deployment build. HTML-to-PNG rendering created the deliverable artwork only.

Open **index.html** to review English and 55 locale copies, five screenshot scenes per locale and five distinct promo options at both store dimensions. Names retain CWSAgent and its existing Autofill & Extract positioning. Copy is code-authored, not keyword researched; no demand or ranking metrics are claimed.

## Use the package

- `listing.json`: truthful purpose, privacy answers, permission rationale and reviewer instructions.
- `languages/{CWS_locale}/description.txt` and `screenshots/{1..5}.png`: all 55 supported locales.
- `images/screenshots/{1..5}.png`: English default screenshots, 1280×800 RGB PNG.
- `images/icon.png`: existing icon unchanged.
- `locales/{locale}/messages.json`: name/summary, also written to `../public/_locales/` and referenced by the localized WXT manifest. Requires a new package upload; no release ZIP was built or submitted.
- `promo/variants/`: five concepts × 440×280 and 1400×560; overview.jpg contact sheet. **No existing selected promo was found; no new promo was selected.** Choose one in the local review page; that preference remains browser-local. No choice blocks the other work.

Drop this folder on CWSAgent to load supported listing fields, then review and save drafts manually. Meta development/review files are ignored by the package parser. The folder is outside public/ and excluded from WXT’s extension runtime assets.

## Behavior and privacy boundaries

The extension autofills supported Chrome/Edge form fields. Chrome extraction can also export analytics and support messages, which can include personal data. It never saves, submits, ticks certifications, changes visibility or prices. Chrome needs a separate publishing profile; Edge does not. ZIP/folder import is free. Optional ExtensionTower Sync requires a package for that listing.

IndexedDB is origin-scoped: console package/history data belongs to the console origin; the background key belongs to extension-origin storage. The key is never passed to the console page. Do not claim all local data vanishes on uninstall: console-origin data and exported files may remain. Optional ExtensionTower reads go to extensiontower.com; image extraction contacts console image hosts; store actions use the user’s own session. No analytics SDK is integrated. Full explicit privacy input is in extensiontower-publication.json.

## Regeneration

`scripts/prepare.mjs` writes all translated copy, manifest locales and the explicit publication payload. `scripts/render.mjs` creates PNG artwork from the local HTML. These are creation commands, not product verification. Preserve the actual hosted privacy URL in listing.json when regenerating. The shared publisher records account and publication outcomes in data/shared-publication-result.json and EXTENSIONTOWER.md.
