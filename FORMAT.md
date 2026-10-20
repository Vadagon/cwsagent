# Meta folder format

A *meta folder* holds everything a Chrome Web Store listing needs. Drop it (or a
`.zip` of it) on **CWSAgent** in the developer console and press **Autofill** on each
tab. Nothing is saved or submitted for you: you review and press **Save draft**.

It is the same layout the `extension-marketing` skill writes to `meta/`, plus an
optional `listing.json` for everything the skill doesn't produce. Every file is
optional; whatever is missing is left untouched in the console.

CWSAgent also reads a `cws-listing` ZIP (the CWS Listing Filler format, recognized
by `"format": "cws-listing"` in its `listing.json`), and **Extract** writes this same
meta layout back out (`"format": "cwsagent"`), so an extracted listing can be
edited and dropped again.

```text
meta/
  listing.json                    store details, privacy, test instructions (below)
  descriptions/
    en.txt  de.txt  pt_BR.txt …   full description per language (≤ 16,000 chars)
  screenshots/
    1.png … 5.png                 global screenshots, 1280×800 or 640×400
    de/1.png … de/5.png           localized screenshots for one language
  promo/
    small-440x280.png             small promo tile
    marquee-1400x560.png          marquee promo tile
  icon/
    store-128.png                 store icon, 128×128 (also: icon/128.png, icon/icon-128.png)
  data/
    dashboard.json                category, singlePurpose, permissions (from the skill)
  locales/<code>/messages.json    not applied: title and summary come from the package
```

Folders the skill uses for drafts (`screenshots/raw/`, `*/prompts/`, `competitors/`,
`live/`, variants such as `small-440x280-b.png`) are ignored.

## Languages

File and folder names use Chrome's `_locales` codes (`en`, `pt_BR`, `es_419`,
`zh_CN`, `he`, …). They are matched to the console's language list (`pt-BR`,
`iw`, …) automatically. The console only offers languages the uploaded package
contains; a description for any other language is reported as skipped.

## Images

JPEG or PNG. The store rejects PNGs with an alpha channel, so those are
converted to JPEG before upload. Sizes are checked and reported, not changed.
Screenshots, when present, **replace** the existing set (global or per language).

## listing.json

All keys are optional. Values here override `data/dashboard.json`.

```json
{
  "category": "Tools",
  "officialUrl": "example.com",
  "homepageUrl": "https://example.com",
  "supportUrl": "https://example.com/support",
  "matureContent": false,
  "promoVideo": "https://www.youtube.com/watch?v=XXXXXXXXXXX",

  "languages": {
    "de": { "description": "…overrides descriptions/de.txt…", "promoVideo": "https://www.youtube.com/watch?v=YYYYYYYYYYY" }
  },

  "itemId": "abcdefghijklmnopabcdefghijklmnop",

  "privacy": {
    "singlePurpose": "One sentence: the one job, in user terms.",
    "permissions": { "storage": "Saves the user's settings.", "activeTab": "…" },
    "hostPermission": "Why the extension needs access to these sites.",
    "remoteCode": false,
    "remoteCodeJustification": "Only when remoteCode is true.",
    "dataCollected": ["websiteContent", "userActivity"],
    "privacyPolicyUrl": "https://example.com/privacy"
  },

  "testInstructions": {
    "username": "reviewer@example.com",
    "password": "…",
    "instructions": "Steps for the reviewer (≤ 500 chars)."
  }
}
```

| Key | Console field | Where |
|---|---|---|
| `itemId` | Optional. CWSAgent warns before filling a different item | — |
| `category` | Category: label (`"Developer Tools"`) or code (`"CATEGORY_DEVELOPER_TOOLS"`) | Store listing |
| `officialUrl` | Official URL: one of your verified sites, matched by text | Store listing |
| `homepageUrl`, `supportUrl` | Homepage URL, Support URL | Store listing |
| `matureContent` | Mature content switch | Store listing |
| `promoVideo` | Global promo video | Store listing |
| `languages.<code>.promoVideo` | Localized promo video | Store listing, per language |
| `privacy.singlePurpose` | Single purpose description | Privacy |
| `privacy.permissions.<name>` | `<name> justification` | Privacy |
| `privacy.hostPermission` | Host permission justification | Privacy |
| `privacy.remoteCode` | Remote code radio (+ justification) | Privacy |
| `privacy.dataCollected` | Data usage checkboxes; unlisted ones are unchecked | Privacy |
| `privacy.privacyPolicyUrl` | Privacy policy URL | Privacy |
| `testInstructions.*` | Username, Password, Additional instructions | Test instructions |

`dataCollected` keys: `pii`, `health`, `financial`, `authentication`,
`communications`, `location`, `webHistory`, `userActivity`, `websiteContent`
(or the console's own labels).

From `data/dashboard.json` the extension reads `category`, `singlePurpose` and
`permissions` (`[{ "permission": "storage", "justification": "…" }]`). Entries
whose permission is a match pattern (`https://*/*`, `<all_urls>`) are joined
into the host permission justification; entries with `"unused": true` are skipped.

## What Extract adds

Besides the files above, Extract writes these when you tick them. Autofill
ignores them.

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

The three data-use certifications (you tick them; CWSAgent highlights them),
distribution, pricing and visibility, and anything in `locales/` or a
`cws-listing` `package` block. A `certify` or `distribution` key is reported and
ignored. The test password is filled when given but never written by **Extract**.
