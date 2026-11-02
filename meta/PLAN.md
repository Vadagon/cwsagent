# CWSAgent listing plan and evidence

2 November 2026. Owner-directed implementation, no runtime verification.

| Claim | Source | Scope |
|---|---|---|
| Fill package fields and translated descriptions/images | lib/package.ts, lib/plan.ts, console App | Supported store fields only; names come from the binary |
| Chrome and Edge forms | entrypoints/console.content, edge.content | Store UI changes remain unverified |
| Extract Chrome copy/images and optional reports/support | lib/extract.ts, analytics.ts, support.ts | No Edge extraction advertised |
| Never saves or submits | README, form runners | User reviews and saves |
| Optional ExtensionTower Sync | entrypoints/background.ts | List/package/image reads with key; paid listing package |
| Key stays in extension worker | background.ts, lib/store.ts | IndexedDB on extension origin; never page script |
| Console storage and extracted files | console App, lib/store.ts, extract.ts | Site data/files may survive extension removal |
| Separate Chrome publishing profile | popup App, README | Installation requirement disclosed |
| No integrated analytics/tracking | network paths and manifest | Store analytics extraction is a user export, not extension telemetry |

Deliverables: 55 localized copy files and package name/summary sources; 275 localized screenshot PNGs; English default copies; ten promo files and contact sheet; review page; truthful privacy/store-form input; owner account membership/Complete grant; explicit public projection/private prepared-package archive. Publication state is in EXTENSIONTOWER.md.

Search intent: keep existing name CWSAgent – Web Store Listing Autofill & Extract. Descriptions include Chrome Web Store, Edge, listing autofill, localized screenshots and listing export naturally. No new search-volume/competitor research was run or invented. No available-in-store or automatic-publishing claim.
