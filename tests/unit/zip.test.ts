import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crc32, unzip, zip } from '../../lib/zip';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips text and binary entries', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const blob = await zip([
      { path: 'listing.json', data: '{"a":1}' },
      { path: 'descriptions/日本.txt', data: 'héllo' },
      { path: 'img/a.png', data: new Blob([bytes]) },
    ]);
    const out = await unzip(blob);
    expect(out.map((f) => f.path)).toEqual(['listing.json', 'descriptions/日本.txt', 'img/a.png']);
    expect(await out[1]!.blob.text()).toBe('héllo');
    expect(new Uint8Array(await out[2]!.blob.arrayBuffer())).toEqual(bytes);
  });

  it('reads deflated ZIPs written by other tools', async () => {
    const file = new Blob([readFileSync(new URL('../fixtures/cws-listing.zip', import.meta.url))]);
    const out = await unzip(file);
    expect(out.map((f) => f.path)).toContain('images/promo-small.png');
    expect(await out.find((f) => f.path === 'descriptions/en.txt')!.blob.text()).toContain('English');
  });

  it('rejects files that are not ZIPs', async () => {
    await expect(unzip(new Blob(['not a zip']))).rejects.toThrow('Not a ZIP file');
  });
});
