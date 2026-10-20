import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPackage, dataTypeKey, filesFromInput } from '../../lib/reader';
import type { FileEntry } from '../../lib/types';

const FIXTURES = new URL('../fixtures/', import.meta.url).pathname;

function folder(dir: string, prefix: string): FileEntry[] {
  const out: FileEntry[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...folder(full, `${prefix}${name}/`));
    else out.push({ path: prefix + name, blob: new Blob([readFileSync(full)]) });
  }
  return out;
}

const zipFile = (name: string) => new File([readFileSync(join(FIXTURES, name))], name);

describe('meta folder', () => {
  it('finds the listing inside a project folder and reads every part', async () => {
    const files = [...folder(join(FIXTURES, 'meta'), 'my-ext/meta/'), { path: 'my-ext/src/index.ts', blob: new Blob(['x']) }];
    const pkg = await buildPackage(files);
    expect(pkg.format).toBe('meta');
    expect(pkg.itemId).toBe('abcdefghijklmnopabcdefghijklmnop');
    expect(Object.keys(pkg.languages).sort()).toEqual(['de', 'en', 'he', 'ja', 'pt_BR']);
    expect(pkg.languages.de).toMatchObject({ description: 'Fixture deutsche Beschreibung.', promoVideo: expect.stringContaining('youtube'), screenshots: ['screenshots/de/1.png'] });
    expect(pkg.images.screenshots).toEqual(['screenshots/1.png', 'screenshots/2.png']);
    expect(pkg.images.smallTile).toBe('promo/small-440x280.png');
    expect(pkg.details).toMatchObject({ category: 'Developer Tools', matureContent: true, officialUrl: 'example.com' });
    expect(pkg.privacy.dataCollected).toEqual(['websiteContent', 'userActivity']);
    expect(pkg.privacy.permissions).toHaveProperty('storage');
    expect(pkg.blobs['screenshots/1.png']).toBeInstanceOf(Blob);
  });

  it('never carries certifications or distribution, and says so', async () => {
    const pkg = await buildPackage(folder(join(FIXTURES, 'meta'), 'meta/'));
    expect(pkg.privacy).not.toHaveProperty('certify');
    expect(pkg).not.toHaveProperty('distribution');
    expect(pkg.notes.join(' ')).toMatch(/certifications are never ticked/);
    expect(pkg.notes.join(' ')).toMatch(/visibility and pricing are never changed/);
  });

  it('falls back to data/dashboard.json for category and splits host patterns', async () => {
    const pkg = await buildPackage([
      { path: 'meta/data/dashboard.json', blob: new Blob([JSON.stringify({ category: 'Tools', singlePurpose: 'One job.', permissions: [
        { permission: 'storage', justification: 'Settings.' },
        { permission: 'https://*/*', justification: 'Pages.' },
        { permission: 'tabs', justification: 'x', unused: true },
      ] })]) },
    ]);
    expect(pkg.details.category).toBe('Tools');
    expect(pkg.privacy).toMatchObject({ singlePurpose: 'One job.', permissions: { storage: 'Settings.' }, hostPermission: 'Pages.' });
  });

  it('rejects a drop with no listing in it', async () => {
    await expect(buildPackage([{ path: 'src/index.ts', blob: new Blob(['x']) }])).rejects.toThrow('No listing found');
  });
});

describe('ZIPs', () => {
  it('reads a cws-listing ZIP', async () => {
    const pkg = await buildPackage(await filesFromInput([zipFile('cws-listing.zip')]));
    expect(pkg.format).toBe('cws-listing');
    expect(pkg.languages.de?.screenshots).toEqual(['images/screenshots/de/1.png']);
    expect(pkg.images).toMatchObject({ screenshots: ['images/screenshots/1.png'], smallTile: 'images/promo-small.png' });
    expect(pkg.privacy).toMatchObject({ remoteCode: false, dataCollected: ['webHistory'], hostPermission: 'Pages.' });
  });

  it('reads back a ZIP that Save produced', async () => {
    const pkg = await buildPackage(await filesFromInput([zipFile('extracted.zip')]));
    expect(pkg.format).toBe('meta');
    expect(pkg.languages.he?.description).toBeTruthy();
    expect(pkg.images.icon).toBe('icon/store-128.png');
    expect(pkg.images.screenshots).toHaveLength(3);
  });
});

describe('dataTypeKey', () => {
  it('accepts keys and labels', () => {
    expect(dataTypeKey('webHistory')).toBe('webHistory');
    expect(dataTypeKey('Web history')).toBe('webHistory');
    expect(dataTypeKey('personally identifiable information')).toBe('pii');
    expect(dataTypeKey('nope')).toBeNull();
  });
});
