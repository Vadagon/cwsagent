# Listing package format

A *listing package* is a folder, usually `meta/` in your extension's repo, that holds a
Chrome Web Store listing: text, images, privacy answers and test instructions. Drop it, or a
`.zip` of it, on **CWSAgent** in the developer console and press **Autofill** on each tab.
Nothing is saved or submitted for you: you review and press **Save draft**.

Write it by hand, with a coding agent using the [cwsagent-package skill](skills/cwsagent-package/SKILL.md),
or export it from Extension Tower. **Extract** writes the same layout, so a live listing can be
edited and dropped back. A working sample is in [example/](example).

```text
meta/
  listing.json                       details, privacy, test instructions (below)
  images/                            used for every language
    icon.png                         store icon, 128×128
    small-tile.png                   small promo tile, 440×280
    marquee.png                      marquee promo tile, 1400×560
    screenshots/1.png … 5.png        1280×800 or 640×400, in display order
  languages/
    en/description.txt               full description, plain text, ≤ 16,000 characters
    de/description.txt
    de/screenshots/1.png … 5.png     only where this language needs its own screenshots
```

Every file and key is optional. Whatever is missing stays as it is in the console. Files
outside this layout are listed as ignored when the package loads.

## Languages

Folder names are Chrome `_locales` codes (`en`, `pt_BR`, `es_419`, `zh_CN`, `he`, …),
the same as your extension's `_locales/`. They're matched to the console's language list
(`pt-BR`, `iw`, …) automatically. The console only offers languages your uploaded
extension contains; a description for any other language is reported as skipped.

A language without its own `screenshots/` keeps the global ones from `images/`. The
Privacy and Test instructions tabs aren't translated, so their answers live once in `listing.json`.

## Name and short description

They aren't in the package. The Web Store takes the item's name and short description from
the uploaded extension (`manifest.json`, or `_locales/<code>/messages.json` when the manifest
uses `__MSG_…__`). Change them there and upload a new version.

## Images

PNG or JPEG (`.png`, `.jpg`, `.jpeg`), at the exact sizes above. The icon's artwork should sit
inside 96×96 with transparent padding. The store rejects PNGs with an alpha channel in
screenshots and tiles, so CWSAgent converts those to JPEG before upload. Sizes are checked
and reported, not changed. Up to 5 screenshots per set, ordered by number.

Screenshots in a package **replace** the existing set for that language (or the global set),
after you confirm. Leave the folder out to keep what's there.

## listing.json

All keys are optional. [listing.schema.json](listing.schema.json) describes them; the
`$schema` line gives you editor checks.

```json
{
  "$schema": "https://raw.githubusercontent.com/Vadagon/cwsagent/main/listing.schema.json",
  "itemId": "abcdefghijklmnopabcdefghijklmnop",

  "category": "Developer Tools",
  "officialUrl": "example.com",
  "homepageUrl": "https://example.com",
  "supportUrl": "https://example.com/support",
  "matureContent": false,
  "promoVideo": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  "languages": {
    "de": { "promoVideo": "https://www.youtube.com/watch?v=YYYYYYYYYYY" }
  },

  "privacy": {
    "singlePurpose": "One sentence: the one job, in user terms.",
    "permissions": {
      "storage": "Saves the user's settings.",
      "activeTab": "Reads the open page when the user presses the button."
    },
    "hostPermission": "Why the extension needs access to these sites.",
    "remoteCode": false,
    "dataCollected": ["websiteContent"],
    "privacyPolicyUrl": "https://example.com/privacy"
  },

  "testInstructions": {
    "username": "reviewer@example.com",
    "instructions": "Steps for the reviewer (≤ 500 chars)."
  }
}
```

| Key | Console field | Tab |
|---|---|---|
| `itemId` | None. CWSAgent warns before filling a different item | — |
| `category` | Category: label (`"Developer Tools"`) or code (`"CATEGORY_DEVELOPER_TOOLS"`) | Store listing |
| `officialUrl` | Official URL: one of your verified sites, matched by text | Store listing |
| `homepageUrl`, `supportUrl` | Homepage URL, Support URL | Store listing |
| `matureContent` | Mature content switch | Store listing |
| `promoVideo` | Global promo video | Store listing |
| `languages.<code>.promoVideo` | Localized promo video | Store listing, per language |
| `privacy.singlePurpose` | Single purpose description | Privacy |
| `privacy.permissions.<name>` | `<name>` justification, keyed by the exact manifest permission | Privacy |
| `privacy.hostPermission` | Host permission justification: host permissions and content-script matches | Privacy |
| `privacy.remoteCode` | Remote code radio, plus `remoteCodeJustification` when `true` | Privacy |
| `privacy.dataCollected` | Data usage checkboxes; unlisted ones are unticked | Privacy |
| `privacy.privacyPolicyUrl` | Privacy policy URL | Privacy |
| `testInstructions.*` | Username, Password, Additional instructions | Test instructions |

`dataCollected` keys: `pii`, `health`, `financial`, `authentication`, `communications`,
`location`, `webHistory`, `userActivity`, `websiteContent`. Leave the key out to keep the
console's current answers; an empty list unticks them all.

## Test password

`testInstructions.password` is filled when given, but **Extract** never writes it. Keep it out
of any `listing.json` you commit: add it just before zipping, or type it into the console.

## What Extract adds

Besides the package, Extract writes these when you tick them. Autofill skips them.

```text
analytics/
  installs.csv  impressions.csv  users.csv  ratings.csv
                                  date,metric,dimension,label,value (one row per data point)
  summary.json                    per page: date range, totals (latest value for user counts),
                                  breakdowns by country, language, OS, …; ratings headline
support/
  issues.json  issues.csv         date, type, subject, from, status, item version,
                                  browser, message, replies
```

`metric` is the console's own name (`INSTALLS`, `UNINSTALLS`, `IMPRESSIONS`,
`DETAIL_PAGEVIEWS`, `WEEKLY_USERS`, `RATINGS`); `dimension` is empty for totals
or names the breakdown (`COUNTRY`, `LANGUAGE`, `OS_VERSION_AND_SERVICE_PACK`,
`UTM_SOURCE`, `STARS`, …). Support issues contain your users' names and
messages: keep the ZIP private.

## Never applied

The three data-use certifications (you tick them; CWSAgent highlights them), distribution,
pricing and visibility. A `certify` or `distribution` key is reported and ignored.
