# CWSAgent → ExtensionTower

2 November 2026. Local implementation, Firebase publication and shared Vercel release completed; manual verification pending. **Unverified. Translations have not been native-reviewed.** No local tests, typechecks, builds, linters, validation or product/browser checks were run. The shared Vercel publication release uses the provider’s normal deployment build. Artwork capture created deliverables only. No store submission or git push.

## Actual identity and account

- Product: `products/CWSAgent`, embedded separate git repository (Vadagon/cwsagent). English name retained: **CWSAgent – Web Store Listing Autofill & Extract**.
- No published CWS/Edge listing ID was established in the source or this task. This is an **unpublished workspace listing**, never a claim of store availability. Existing documented installation is the GitHub unpacked release and separate Chrome publishing profile.
- Existing Firebase project `extensiontower`, Enterprise Native database `workspace`, `europe-west3`, confirmed 2 November. Existing Main app retained; no new app/project created.
- Fresh Auth lookup confirmed `verbalike@gmail.com`, UID `bDESBAJRFTfjOiP9UoVsKQDzaZA3`, email verified, enabled.
- Created opaque unpublished workspace ID **egjoponpponakdmofgdkcnlanelhmkpo**, empty store URL. Revision-checked import using existing decoder/encoder; canonical `storeListings` untouched. Existing projects/edits/grants/tier state retained.
- Existing owner grant model enabled **Complete / maximum**, without payment. No other package downgraded or removed.
- Dashboard: https://extensiontower.com/dashboard/egjoponpponakdmofgdkcnlanelhmkpo .

## Prepared inputs and selected assets

- `extensiontower-publication.json`: exact explicit public listing and policy payload, relative paths, all 55 BCP-47 copy keys.
- English name/summary: `locales/en/messages.json`. All names/summaries: `locales/{CWS_locale}/messages.json`, copied into `../public/_locales/` and referenced in wxt.config.ts. Local package version is 0.6.1; existing dist/release remains 0.6.0. No package built or uploaded.
- All full descriptions: `languages/{CWS_locale}/description.txt`. All five translated PNGs: `languages/{CWS_locale}/screenshots/{1..5}.png`, 1280×800 RGB, original schematic HTML artwork. English defaults: `images/screenshots/{1..5}.png`.
- Current/default icon: `images/icon.png`, unchanged copy of existing `public/icons/128.png`.
- **No existing selected promo was found. No new promo was selected.** Five distinct concepts in `promo/variants/{1..5}-small-440x280.png` and `{1..5}-marquee-1400x560.png`; contact sheet `promo/variants/overview.jpg`. Selection in `index.html` records a browser-local preference only. Promo variants are not uploaded as active artwork.
- Review page: `index.html`. Sources: `visuals/index.html`, `visuals/promo.html`, `visuals/strings/`, `scripts/prepare.mjs`, `scripts/render.mjs`.

## Actual Firebase writes

Shared operator outcome: **`data/shared-publication-result.json`**. Publication revision 1, observed workspace revision 255. Saved 55 copies, 275 screenshots (deduplicated immutable public asset hashes) and existing icon. Private prepared package has 332 files; it is owner-only server data in `ownerListingPackages`, outside the nearly-full 250 KB workspace. It preserves every other project/private edit. The new Sync reader requires deployment and refuses a stale package after later private edits.

Public projection is **ownerPublicProductPages/{id}**, separately authorized by **ownerProductPublications/{id}**. It never replaces real store facts or the deployed store projection. It explicitly has `storeAvailable: false`, no ratings/users, and a known GitHub setup link. New copy/artwork is publisher-provided, never fetched-store evidence.

- Product URL: https://extensiontower.com/extensions/egjoponpponakdmofgdkcnlanelhmkpo/en — **deployed, manually unverified**. Locale URLs use payload keys, e.g. /de, /pt-BR, /zh-TW.
- Privacy URL: https://extensiontower.com/pages/z4qDLWIY6Gg5C9qv/privacy — saved through existing `saveExtensionPages`; exact policy renderer is deployed. Hosted response was not checked. `listing.json` contains this actual saved URL.
- New image URLs use `/api/public/owner-products/{id}/assets/{sha256}.png`, backed by immutable PNGs; route/authorization is deployed; exact approved-object reader permissions are provisioned without changing bucket-wide settings.

## Privacy boundary and remaining release

The background API key is in extension-origin IndexedDB and used only by the background worker. Console package/history storage is console-origin IndexedDB; export preferences also use localStorage. Downloaded files and console-site data may survive extension removal. Optional ExtensionTower requests read list/packages/images, without cookies. Image export contacts console image hosts. Developer-console actions use the user's Google/Microsoft session. Chrome optional exports can contain personal support messages and console statistics. No integrated analytics/tracking SDK, no automatic save/submission. Full source mapping is in PLAN.md and the policy input.

Shared implementation and portfolio outcomes: `docs/owner-products.md`. Vercel release **dpl_BmKAZKqm8HyZa18S8L8PDybvHAbx** (shared source 365c696) is READY and aliased to extensiontower.com. It includes the public image route, owner-authored eligibility/locales, exact privacy body and prepared Sync package reader. No page/asset HTTP or browser response was checked. No git push is authorized. No Chrome/Edge draft or submission was performed. Owner reviews translations/artwork and chooses a promo independently of this release.

Shared image permission operation completed: 2,157 approved objects across the four explicit products, existing Vercel service identity READER only. No public ACL or unrelated access. The shared source operator and source commits are in docs/owner-products.md. Manual page/image verification, native translation review and optional promo choice remain outstanding.
