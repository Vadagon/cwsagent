// Writes meta/store/publish.json: the one file CWSAgent reads to fill both the
// Chrome Web Store console and Microsoft Edge Partner Center from a META.md
// meta/ folder (descriptions/, screenshots/, promo/, edge/, data/, listing.json).
// It also copies the release ZIP to meta/store/package.zip (gitignored) so a
// single drop of meta/ carries the package too.
//
//   node scripts/publish-manifest.mjs <meta-dir> [--zip <release.zip>] [--no-copy]
//
// Only Node built-ins. Nothing is uploaded; the output lists what it could not
// decide (review) and what the owner does by hand (manual).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const metaArg = args.find((a, i) => !a.startsWith('--') && !['--zip'].includes(args[i - 1]));
if (!metaArg) {
  console.error('Usage: node scripts/publish-manifest.mjs <meta-dir> [--zip <release.zip>] [--no-copy]');
  process.exit(1);
}
const META = resolve(metaArg);
const at = (...p) => join(META, ...p);
const rel = (abs) => relative(META, abs).split('\\').join('/');
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const warnings = [];
const review = [];

// ---- Release package ---------------------------------------------------------

/** Entry names and a reader for one file, from a ZIP's central directory. */
function readZip(file) {
  const buf = readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(`${file} is not a ZIP`);
  const entries = new Map();
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    entries.set(buf.toString('utf8', p + 46, p + 46 + nameLen), { method, size, local });
    p += 46 + nameLen + extra + comment;
  }
  const read = (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const raw = buf.subarray(start, start + e.size);
    return (e.method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
  };
  return { names: [...entries.keys()], read };
}

function newestZip() {
  const root = resolve(META, '..', 'release');
  if (!existsSync(root)) return null;
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.zip')) found.push({ p, t: statSync(p).mtimeMs });
    }
  };
  walk(root);
  return found.sort((a, b) => b.t - a.t)[0]?.p ?? null;
}

const zipPath = opt('zip') ? resolve(opt('zip')) : newestZip();
let pkgManifest = null;
let pkgLocales = [];
if (zipPath && existsSync(zipPath)) {
  const z = readZip(zipPath);
  pkgManifest = JSON.parse(z.read('manifest.json') ?? 'null');
  pkgLocales = [...new Set(z.names.map((n) => n.match(/^_locales\/([^/]+)\/messages\.json$/)?.[1]).filter(Boolean))].sort();
  if (z.names.some((n) => n.startsWith('meta/'))) warnings.push('The release ZIP contains meta/; META.md says it never ships.');
} else warnings.push('No release ZIP found (pass --zip). Package upload and package-language checks are skipped.');

// ---- Authored inputs ---------------------------------------------------------

const listing = readJson(at('listing.json')) ?? {};
const dashboard = readJson(at('data', 'dashboard.json')) ?? {};
const keywords = readJson(at('data', 'keywords.json'));

/** A URL from a value that may carry a trailing note: "https://x (unverified: …)". */
function url(value, name) {
  if (!value) return undefined;
  const s = String(value).trim();
  const m = s.match(/^https?:\/\/\S+/);
  if (!m) { review.push(`${name}: "${s}" is not a URL.`); return undefined; }
  if (m[0] !== s) review.push(`${name}: note after the URL dropped (“${s.slice(m[0].length).trim()}”); confirm the page.`);
  return m[0].replace(/[),.;]+$/, '');
}

// CWS category codes (listing.json "category") → console label, and the Edge category.
const CATEGORIES = {
  'productivity/communication': ['Communication', 'Communication'],
  'productivity/developer': ['Developer Tools', 'Developer tools'],
  'productivity/education': ['Education', 'Productivity'],
  'productivity/tools': ['Tools', 'Productivity'],
  'productivity/workflow': ['Workflow & Planning', 'Productivity'],
  'lifestyle/art': ['Art & Design', 'Photos'],
  'lifestyle/entertainment': ['Entertainment', 'Entertainment'],
  'lifestyle/games': ['Games', 'Entertainment'],
  'lifestyle/household': ['Household', 'Productivity'],
  'lifestyle/fun': ['Just for Fun', 'Entertainment'],
  'lifestyle/news': ['News & Weather', 'News & weather'],
  'lifestyle/shopping': ['Shopping', 'Shopping'],
  'lifestyle/social': ['Social Networking', 'Social'],
  'lifestyle/travel': ['Travel', 'Productivity'],
  'lifestyle/well_being': ['Well-being', 'Productivity'],
  'make_chrome_yours/accessibility': ['Accessibility', 'Accessibility'],
  'make_chrome_yours/functionality': ['Functionality & UI', 'Productivity'],
  'make_chrome_yours/privacy': ['Privacy & Security', 'Productivity'],
};
const rawCategory = listing.category ? String(listing.category) : null;
const known = rawCategory && (CATEGORIES[rawCategory] ?? Object.values(CATEGORIES).find(([label]) => label.toLowerCase() === rawCategory.toLowerCase()));
if (rawCategory && !known) review.push(`Category "${rawCategory}" is not a known CWS code or label.`);

// ---- Privacy -----------------------------------------------------------------

const isHost = (p) => /:\/\/|^<all_urls>$/.test(p);
const permissions = {};
const hosts = [];
for (const entry of Array.isArray(dashboard.permissions) ? dashboard.permissions : []) {
  if (!entry?.permission || !entry.justification) continue;
  if (isHost(entry.permission)) hosts.push(`${entry.permission}: ${entry.justification}`);
  else permissions[entry.permission] = entry.justification;
}
if (dashboard.permissions && !Array.isArray(dashboard.permissions)) Object.assign(permissions, dashboard.permissions);
const hostPermission = dashboard.hostPermission ?? (hosts.length ? hosts.join('\n\n') : undefined);
if (pkgManifest) {
  const asked = pkgManifest.permissions ?? [];
  const missing = asked.filter((p) => !permissions[p]);
  const extra = Object.keys(permissions).filter((p) => !asked.includes(p));
  if (missing.length) review.push(`No justification for: ${missing.join(', ')}.`);
  if (extra.length) review.push(`Justified but not requested by the package: ${extra.join(', ')}.`);
  const hostAsked = (pkgManifest.host_permissions?.length ?? 0) + (pkgManifest.content_scripts?.length ?? 0);
  if (hostAsked && !hostPermission) review.push('The package requests hosts but there is no host justification.');
}

// Store data-usage boxes. listing.json may hold a list of keys or prose per type.
const DATA_KEYS = {
  pii: 'pii', personallyidentifiable: 'pii', personallyidentifiableinformation: 'pii', health: 'health',
  financial: 'financial', authentication: 'authentication', communications: 'communications',
  location: 'location', webhistory: 'webHistory', useractivity: 'userActivity', websitecontent: 'websiteContent',
};
const privacyIn = listing.privacy ?? {};
let dataCollected;
const dataSource = privacyIn.dataCollected ?? listing.dataCollected;
if (Array.isArray(dataSource)) dataCollected = dataSource;
else if (dataSource && typeof dataSource === 'object') {
  dataCollected = [];
  for (const [k, v] of Object.entries(dataSource)) {
    const key = DATA_KEYS[k.toLowerCase().replace(/[^a-z]/g, '')];
    const yes = v === true || (typeof v === 'string' && !/^no\b/i.test(v.trim()));
    if (!key) { review.push(`dataCollected.${k} has no store box${yes ? ` (it says: “${String(v).slice(0, 80)}”)` : ''}; decide if another box covers it.`); continue; }
    if (yes) {
      dataCollected.push(key);
      if (typeof v === 'string') review.push(`Data usage “${key}” ticked from: “${v.slice(0, 100)}”.`);
    }
  }
}

let remoteCode = privacyIn.remoteCode ?? listing.remoteCode;
if (remoteCode === undefined && pkgManifest?.manifest_version === 3) {
  remoteCode = false;
  review.push('Remote code → No, assumed from Manifest V3; confirm no remotely hosted code runs.');
}

let testInstructions = listing.testInstructions;
if (Array.isArray(testInstructions)) testInstructions = { instructions: testInstructions.map((s, i) => `${i + 1}. ${s}`).join('\n') };
else if (typeof testInstructions === 'string') testInstructions = { instructions: testInstructions };
if (testInstructions?.password) { delete testInstructions.password; warnings.push('testInstructions.password left out; type it in the console.'); }
if (testInstructions?.instructions?.length > 500) review.push(`Test instructions are ${testInstructions.instructions.length} characters; the CWS field holds 500.`);

// ---- Images ------------------------------------------------------------------

/** Width, height and alpha of a PNG, from its header. */
function png(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: [4, 6].includes(b[25]) };
}
function image(relPath, sizes, name) {
  const abs = at(relPath);
  if (!existsSync(abs)) return undefined;
  const info = png(abs);
  if (info && !sizes.some(([w, h]) => info.width === w && info.height === h)) warnings.push(`${relPath}: ${info.width}×${info.height}, expected ${sizes.map(([w, h]) => `${w}×${h}`).join(' or ')}.`);
  if (info?.alpha && name !== 'logo') warnings.push(`${relPath}: has an alpha channel; the store wants 24-bit RGB (CWSAgent converts it).`);
  return relPath;
}
const SHOT = [[1280, 800], [640, 400]];
const shotsIn = (dir) => (existsSync(at(dir)) ? readdirSync(at(dir)) : [])
  .map((f) => f.match(/^(\d+)\.(png|jpe?g)$/i)).filter(Boolean)
  .sort((a, b) => +a[1] - +b[1]).map((m) => image(`${dir}/${m[0]}`, SHOT, 'shot'));

const images = {
  icon: image('store/icon-128.png', [[128, 128]], 'icon'),
  smallTile: image('promo/small-440x280.png', [[440, 280]], 'tile'),
  marquee: image('promo/marquee-1400x560.png', [[1400, 560]], 'tile'),
  edgeLogo: image('edge/logo-300x300.png', [[300, 300]], 'logo'),
  screenshots: shotsIn('screenshots'),
};
if (!images.edgeLogo) review.push('No edge/logo-300x300.png: Partner Center requires a 300×300 logo.');

// ---- Languages -----------------------------------------------------------------

const names = new Intl.DisplayNames(['en'], { type: 'language', languageDisplay: 'standard' });
const EDGE_NAMES = { no: 'Norwegian', fil: 'Filipino' };
const cwsCode = (code) => (code === 'he' ? 'iw' : code.replace(/_/g, '-'));
const edgeName = (code) => EDGE_NAMES[code] ?? names.of(code.replace(/_/g, '-'));

const codes = new Set();
if (existsSync(at('descriptions'))) for (const f of readdirSync(at('descriptions'))) { const m = f.match(/^(.+)\.txt$/); if (m) codes.add(m[1]); }
if (existsSync(at('screenshots'))) for (const f of readdirSync(at('screenshots'))) if (/^[a-z]{2,3}(_[A-Za-z0-9]{2,4})?$/.test(f) && statSync(at('screenshots', f)).isDirectory()) codes.add(f);

// Edge search terms: up to 7, ≤ 30 characters, ≤ 21 words in all, from researched phrases.
function searchTerms(code) {
  if (!keywords) return undefined;
  const base = code.split('_')[0];
  const phrases = code === 'en' || base === 'en'
    ? [keywords.primary, ...(keywords.secondary ?? [])]
    : (keywords.perLanguage ?? []).filter((p) => String(p.locale ?? p.hl).replace('-', '_') === code && ['primary', 'secondary'].includes(p.decision))
      .flatMap((p) => [p.phrase]);
  const out = [];
  let words = 0;
  for (const p of phrases.filter(Boolean)) {
    const w = p.trim().split(/\s+/).length;
    if (p.length > 30 || out.includes(p) || out.length >= 7 || words + w > 21) continue;
    out.push(p); words += w;
  }
  return out.length ? out : undefined;
}

const languages = {};
const notInPackage = [];
const mentionsChrome = [];
for (const code of [...codes].sort()) {
  const descFile = existsSync(at('descriptions', `${code}.txt`)) ? `descriptions/${code}.txt` : undefined;
  const inPackage = pkgLocales.length ? pkgLocales.includes(code) : null;
  if (inPackage === false) notInPackage.push(code);
  if (descFile) {
    const text = readFileSync(at(descFile), 'utf8').trim();
    if (text.length < 250) warnings.push(`${descFile}: ${text.length} characters; Edge needs at least 250.`);
    if (text.length > 10000) warnings.push(`${descFile}: ${text.length} characters; Edge allows 10,000.`);
    if (/\bChrome\b/.test(text)) mentionsChrome.push(code);
  }
  const shots = shotsIn(`screenshots/${code}`);
  languages[code] = {
    chrome: cwsCode(code),
    edge: edgeName(code),
    inPackage,
    description: descFile,
    screenshots: shots.length ? shots : undefined,
    searchTerms: searchTerms(code),
  };
}
if (notInPackage.length) warnings.push(`Not in the package's _locales, so neither store offers them yet: ${notInPackage.join(', ')}.`);
if (mentionsChrome.length) warnings.push(`Descriptions mention “Chrome” (${mentionsChrome.join(', ')}); Edge asks listings not to name other browsers.`);
const missingPkg = pkgLocales.filter((c) => !languages[c]?.description && !(c === pkgManifest?.default_locale && languages.en));
if (missingPkg.length) review.push(`Package languages with no description file: ${missingPkg.join(', ')}.`);

// ---- Stores and package copy -------------------------------------------------------

const chromeItemId = listing.itemId ?? listing.id ?? listing.stores?.chrome?.itemId;
const publisherId = listing.publisherId ?? listing.stores?.chrome?.publisherId;
const edgeProductId = listing.edgeProductId ?? listing.stores?.edge?.productId;
let packageInfo;
if (zipPath && existsSync(zipPath)) {
  const copy = !args.includes('--no-copy');
  if (copy) {
    mkdirSync(at('store'), { recursive: true });
    copyFileSync(zipPath, at('store', 'package.zip'));
    const ignore = at('store', '.gitignore');
    if (!existsSync(ignore)) writeFileSync(ignore, 'package.zip\n');
  }
  packageInfo = {
    zip: copy ? 'store/package.zip' : undefined,
    source: rel(zipPath),
    version: pkgManifest?.version,
    defaultLocale: pkgManifest?.default_locale,
    locales: pkgLocales,
  };
}

const manifest = {
  $schema: 'https://raw.githubusercontent.com/Vadagon/cwsagent/main/publish.schema.json',
  format: 1,
  generatedAt: new Date().toISOString(),
  generatedBy: 'cwsagent/scripts/publish-manifest.mjs',
  extension: listing.itemName ?? basename(resolve(META, '..')),
  package: packageInfo,
  stores: {
    chrome: chromeItemId ? {
      itemId: chromeItemId,
      publisherId,
      editUrl: publisherId ? `https://chrome.google.com/webstore/devconsole/${publisherId}/${chromeItemId}/edit` : undefined,
    } : undefined,
    edge: edgeProductId ? {
      productId: edgeProductId,
      listingsUrl: `https://partner.microsoft.com/en-us/dashboard/microsoftedge/${edgeProductId}/listings`,
    } : undefined,
  },
  details: {
    category: known?.[0],
    edgeCategory: listing.edgeCategory ?? known?.[1],
    officialUrl: listing.officialUrl,
    homepageUrl: url(listing.homepageUrl ?? listing.homepage, 'homepage'),
    supportUrl: url(listing.supportUrl ?? listing.support, 'support'),
    matureContent: listing.matureContent ?? false,
    promoVideo: url(listing.promoVideo, 'promoVideo'),
  },
  privacy: {
    singlePurpose: dashboard.singlePurpose ?? privacyIn.singlePurpose,
    permissions,
    hostPermission,
    remoteCode,
    remoteCodeJustification: privacyIn.remoteCodeJustification,
    dataCollected,
    privacyPolicyUrl: url(privacyIn.privacyPolicyUrl ?? listing.privacyPolicyUrl ?? listing.privacyPolicy, 'privacyPolicy'),
  },
  testInstructions,
  images,
  languages,
  manual: [
    { store: 'chrome', step: 'Upload the package on the Package tab (or the CWS API) when the version changed.' },
    { store: 'chrome', step: 'Tick the three data-use certifications on Privacy.' },
    { store: 'chrome', step: 'Press Save draft on each tab, then Submit for review.' },
    { store: 'chrome', step: 'Distribution: visibility, regions and pricing.' },
    { store: 'edge', step: 'Availability: visibility and markets.' },
    { store: 'edge', step: 'Tick the Privacy certifications.' },
    { store: 'edge', step: 'Publish.' },
  ],
  review,
  warnings,
};

const out = at('store', 'publish.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(manifest, (k, v) => (v === undefined ? undefined : v), 2) + '\n');
console.log(`${rel(out)}: ${Object.keys(languages).length} languages, ${pkgLocales.length} in the package${packageInfo?.zip ? `, package ${packageInfo.source} → ${packageInfo.zip}` : ''}`);
for (const r of review) console.log(`review: ${r}`);
for (const w of warnings) console.log(`warning: ${w}`);
