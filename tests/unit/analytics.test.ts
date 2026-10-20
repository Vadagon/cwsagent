import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flatten, metricCsv, rpcBlocks, summarize, toCsv } from '../../lib/analytics';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const fixture = (name: string) => readFileSync(new URL(`../fixtures/analytics/${name}`, import.meta.url), 'utf8');

/** The same block extraction pageBlocks() does, on a fixture's HTML. */
function blocksFromHtml(html: string) {
  return [...html.matchAll(/data:([\s\S]*?), sideChannel:/g)].map((m) => JSON.parse(m[1]!));
}

describe('page data (default 30 days)', () => {
  const rows = flatten(blocksFromHtml(fixture('installs-page.html')), ID);

  it('reads totals and names breakdowns by their metric code', () => {
    expect(rows.filter((r) => r.metric === 'INSTALLS' && !r.dimension).map((r) => r.value)).toEqual([5, 2]);
    expect(rows).toContainEqual({ date: '2026-10-01', metric: 'INSTALLS', dimension: 'COUNTRY', label: 'Japan', value: 1 });
    expect(rows).toContainEqual({ date: '2026-10-01', metric: 'UNINSTALLS', dimension: 'OS_VERSION_AND_SERVICE_PACK', label: 'Windows', value: 1 });
  });

  it('never reads the publisher profile or another item', () => {
    const csv = metricCsv(rows);
    expect(csv).not.toMatch(/owner@example\.com|Street 1|Publisher/);
    expect(rows.some((r) => r.value === 99)).toBe(false);
  });

  it('summarizes totals and breakdowns', () => {
    const s = summarize(rows);
    expect(s).toMatchObject({ from: '2026-10-01', to: '2026-10-02', totals: { INSTALLS: 7, UNINSTALLS: 1 } });
    expect(s.breakdowns.INSTALLS?.COUNTRY).toEqual({ 'United States': 6, Japan: 1 });
  });
});

describe('background data (longest range)', () => {
  const blocks = rpcBlocks(fixture('batchexecute.txt'));

  it('unwraps every wrb.fr payload and skips the rest', () => {
    expect(blocks).toHaveLength(3);
  });

  it('reads weekly users as the latest value, not a sum', () => {
    const rows = flatten(blocks, ID);
    expect(summarize(rows).totals.WEEKLY_USERS).toBe(3902);
    expect(rows).toContainEqual({ date: '2026-09-21', metric: 'WEEKLY_USERS', dimension: 'LANGUAGE', label: 'Arabic', value: 11 });
  });

  it('reads ratings per star per day', () => {
    const rows = flatten(blocks, ID).filter((r) => r.metric === 'RATINGS');
    expect(rows.filter((r) => r.date === '2026-08-10' && r.value > 0).map((r) => `${r.label}:${r.value}`)).toEqual(['1 star:3', '5 stars:2']);
    expect(summarize(rows).totals.RATINGS).toBe(7);
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"\nok']])).toBe('a,b\n"x, y","say ""hi""\nok"\n');
  });
});
