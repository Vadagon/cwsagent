// Reads the console's chart data: Installs & uninstalls, Impressions, Users and
// Ratings. The console embeds the default 30-day data in the page
// (AF_initDataCallback blocks) and fetches other ranges in the background
// (batchexecute). Both carry the same positional JSON, so one generic
// flattener reads them without depending on exact array positions:
//   [date, [... [DIMENSION, value, label] ...]]           breakdowns
//   [date, [... [n, value, "METRIC"] ...]]                totals
//   [date, ..., [one, two, three, four, five]]            ratings per star
// Only blocks whose header names the open item are read, so publisher
// profile data on the same page is never touched.
import { byLabel, clean, sleep } from './dashboard';

export interface MetricRow {
  date: string;
  metric: string;
  dimension: string;
  label: string;
  value: number;
}

type Json = unknown;
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v);
const isName = (v: unknown): v is string => typeof v === 'string' && /^[A-Z][A-Z0-9_]*$/.test(v);
const STARS = ['1 star', '2 stars', '3 stars', '4 stars', '5 stars'];

/** Data blocks embedded in the page, keyed "ds:N". */
export function pageBlocks(doc: Document = document): Json[] {
  const out: Json[] = [];
  for (const s of doc.scripts) {
    const t = s.textContent ?? '';
    if (!t.includes('AF_initDataCallback')) continue;
    const m = t.match(/data:([\s\S]*?), sideChannel:/);
    if (!m?.[1]) continue;
    try { out.push(JSON.parse(m[1])); } catch { /* not JSON: skip */ }
  }
  return out;
}

/** Payloads inside a batchexecute response (")]}'" prefix, length lines, wrb.fr envelopes). */
export function rpcBlocks(text: string): Json[] {
  const out: Json[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('[')) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    for (const env of parsed) {
      if (Array.isArray(env) && env[0] === 'wrb.fr' && typeof env[2] === 'string') {
        try { out.push(JSON.parse(env[2])); } catch { /* skip */ }
      }
    }
  }
  return out;
}

/** The block's header if it belongs to this item: [[itemId, ...], ...]. */
function header(block: Json, itemId: string): unknown[] | null {
  if (!Array.isArray(block) || !Array.isArray(block[0])) return null;
  return block[0][0] === itemId ? (block[0] as unknown[]) : null;
}

function leaves(v: Json, date: string, rows: Omit<MetricRow, 'metric'>[], named: MetricRow[]) {
  if (!Array.isArray(v)) return;
  if (v.length >= 3 && isName(v[0]) && typeof v[1] === 'number' && typeof v[2] === 'string') {
    rows.push({ date, dimension: v[0], label: v[2], value: v[1] });
    return;
  }
  if (v.length >= 3 && typeof v[0] === 'number' && typeof v[1] === 'number' && isName(v[2])) {
    named.push({ date, metric: v[2], dimension: '', label: '', value: v[1] });
    return;
  }
  for (const x of v) leaves(x, date, rows, named);
}

function walk(v: Json, onDated: (date: string, rest: unknown[]) => void) {
  if (!Array.isArray(v)) return;
  if (isDate(v[0])) { onDated(v[0], v.slice(1)); return; }
  for (const x of v) walk(x, onDated);
}

/**
 * Flattens every block for this item into rows. Breakdown blocks name no
 * metric themselves; their header's metric code is matched to the name used by
 * a totals block with the same code (e.g. 1 → INSTALLS).
 */
export function flatten(blocks: Json[], itemId: string): MetricRow[] {
  const codeNames = new Map<unknown, string>();
  const pending: { code: unknown; rows: Omit<MetricRow, 'metric'>[] }[] = [];
  const out: MetricRow[] = [];

  for (const block of blocks) {
    const h = header(block, itemId);
    if (!h) continue;
    const code = h[3];
    const rows: Omit<MetricRow, 'metric'>[] = [];
    walk(block, (date, rest) => {
      const stars = rest[rest.length - 1];
      if (Array.isArray(stars) && stars.length === 5 && stars.every((n) => typeof n === 'number')) {
        stars.forEach((n, i) => out.push({ date, metric: 'RATINGS', dimension: 'STARS', label: STARS[i]!, value: n as number }));
        return;
      }
      const named: MetricRow[] = [];
      for (const r of rest) leaves(r, date, rows, named);
      for (const n of named) { out.push(n); if (code !== undefined) codeNames.set(code, n.metric); }
    });
    if (rows.length) pending.push({ code, rows });
  }
  for (const { code, rows } of pending) {
    const metric = codeNames.get(code) ?? `METRIC_${String(code)}`;
    for (const r of rows) out.push({ ...r, metric });
  }
  // One row per (date, metric, dimension, label): a page may hold the same chart twice.
  const seen = new Set<string>();
  return out
    .filter((r) => { const k = `${r.date}|${r.metric}|${r.dimension}|${r.label}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.metric.localeCompare(b.metric) || a.dimension.localeCompare(b.dimension) || a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

/** User counts are snapshots (weekly/daily users): report the latest, not a sum. */
const isSnapshot = (metric: string) => /USERS/.test(metric);

/** Totals per metric (latest value for user counts), and per dimension label, for summary.json. */
export function summarize(rows: MetricRow[]) {
  const dates = rows.map((r) => r.date).sort();
  const totals: Record<string, number> = {};
  const latest: Record<string, string> = {};
  const breakdowns: Record<string, Record<string, Record<string, number>>> = {};
  for (const r of rows) {
    if (!r.dimension) {
      if (!isSnapshot(r.metric)) totals[r.metric] = (totals[r.metric] ?? 0) + r.value;
      else if (!latest[r.metric] || r.date >= latest[r.metric]!) { latest[r.metric] = r.date; totals[r.metric] = r.value; }
    } else {
      if (isSnapshot(r.metric)) continue; // a sum of weekly snapshots means nothing
      const byDim = ((breakdowns[r.metric] ??= {})[r.dimension] ??= {});
      byDim[r.label] = (byDim[r.label] ?? 0) + r.value;
      if (r.metric === 'RATINGS') totals.RATINGS = (totals.RATINGS ?? 0) + r.value;
    }
  }
  return { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, totals, breakdowns };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header: string[], rows: (string | number)[][]) =>
  [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

export const metricCsv = (rows: MetricRow[]) =>
  toCsv(['date', 'metric', 'dimension', 'label', 'value'], rows.map((r) => [r.date, r.metric, r.dimension, r.label, r.value]));

// ---- Choosing a date range and capturing its data -------------------------------

export type RangeChoice = '30' | '90' | '180' | '365' | 'longest';

export const RANGE_LABELS: Record<RangeChoice, string> = {
  '30': 'Last 30 days', '90': 'Last 90 days', '180': 'Last 180 days', '365': 'Last year', longest: 'All available',
};

const RANGE_MATCH: Record<Exclude<RangeChoice, 'longest'>, RegExp> = {
  '30': /30 days/i, '90': /90 days/i, '180': /180 days/i, '365': /last year/i,
};

/**
 * Selects the chosen option of the page's date range menu, the way a user
 * would, and returns the data the console then fetched in the background.
 * "longest" is the menu's last option (Last 5 years, or All time on Ratings).
 * Returns { blocks: null } when the page's own data already covers the range
 * (the default 30 days), and null when there is no menu or nothing arrived.
 */
export async function chooseRange(choice: RangeChoice): Promise<{ label: string; blocks: Json[] | null } | null> {
  const combo = byLabel<HTMLElement>('[role="combobox"]', /^Date range/);
  const list = document.querySelector('ul[role="listbox"][aria-label^="Date range"]');
  const options = list ? [...list.querySelectorAll<HTMLElement>('li[role="option"]')] : [];
  const target = choice === 'longest' ? options[options.length - 1] : options.find((o) => RANGE_MATCH[choice].test(o.innerText));
  if (!combo || !target) return null;
  const label = clean(target.innerText);
  const isDefault = /30 days/i.test(label);
  if (isDefault && target === options[0] && /30 days/i.test(clean(combo.innerText))) return { label, blocks: null };

  const texts: string[] = [];
  const onMessage = (e: MessageEvent) => {
    if (e.source === window && e.data?.type === 'cwsagent:rpc' && typeof e.data.text === 'string') texts.push(e.data.text);
  };
  window.addEventListener('message', onMessage);
  try {
    const pick = async (li: HTMLElement) => { combo.click(); await sleep(150); li.click(); };
    // Choosing the option that is already selected fetches nothing: step off it first.
    const other = options.find((o) => o !== target);
    if (target.getAttribute('aria-selected') === 'true' && other) {
      await pick(other);
      await sleep(1500);
      texts.length = 0;
    }
    await pick(target);
    // Wait for the first response, then a quiet moment for any follow-ups.
    const start = Date.now();
    let lastCount = 0;
    let quietSince = Date.now();
    while (Date.now() - start < 20000) {
      await sleep(200);
      if (texts.length !== lastCount) { lastCount = texts.length; quietSince = Date.now(); }
      if (texts.length && Date.now() - quietSince > 1200) break;
    }
    if (!texts.length) return null;
    return { label, blocks: texts.flatMap(rpcBlocks) };
  } finally {
    window.removeEventListener('message', onMessage);
  }
}

/** Ratings headline numbers as the page shows them (average, totals). */
export function ratingsHeadline(): Record<string, string> {
  const lines = (document.querySelector('main')?.innerText ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  const after = (label: string) => { const i = lines.indexOf(label); return i >= 0 ? lines[i + 1] : undefined; };
  const total = after('Total ratings');
  const withReviews = after('Ratings with reviews');
  if (total) out.totalRatings = total;
  if (withReviews) out.ratingsWithReviews = withReviews;
  const i = lines.indexOf('Ratings');
  const avg = lines.slice(i + 1, i + 4).find((l) => /^\d(\.\d+)?$/.test(l));
  if (avg) out.average = avg;
  return out;
}
