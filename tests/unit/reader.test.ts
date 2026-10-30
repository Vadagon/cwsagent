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

describe('package folder', () => {
  it('finds the package inside a project folder and reads every part', async () => {
    const files = [...folder(join(FIXTURES, 'package'), 'my-ext/meta/'), { path: 'my-ext/src/index.ts', blob: new Blob(['x']) }];
    const pkg = await buildPackage(files);
    expect(pkg.name).toBe('meta');
    expect(pkg.itemId).toBe('abcdefghijklmnopabcdefghijklmnop');
    expect(Object.keys(pkg.languages).sort()).toEqual(['de', 'en', 'he', 'ja', 'pt_BR']);
    expect(pkg.languages.de).toMatchObject({ description: 'Fixture deutsche Beschreibung.', promoVideo: expect.stringContaining('youtube'), screenshots: ['languages/de/screenshots/1.png'] });
    expect(pkg.images.screenshots).toEqual(['images/screenshots/1.png', 'images/screenshots/2.png']);
    expect(pkg.images.smallTile).toBe('images/small-tile.png');
    expect(pkg.details).toMatchObject({ category: 'Developer Tools', matureContent: true, officialUrl: 'example.com' });
    expect(pkg.privacy.dataCollected).toEqual(['websiteContent', 'userActivity']);
    expect(pkg.privacy.permissions).toHaveProperty('storage');
    expect(pkg.blobs['images/screenshots/1.png']).toBeInstanceOf(Blob);
  });

  it('never carries certifications or distribution, and says so', async () => {
    const pkg = await buildPackage(folder(join(FIXTURES, 'package'), 'meta/'));
    expect(pkg.privacy).not.toHaveProperty('certify');
    expect(pkg).not.toHaveProperty('distribution');
    expect(pkg.notes.join(' ')).toMatch(/certifications are never ticked/);
    expect(pkg.notes.join(' ')).toMatch(/visibility and pricing are never changed/);
  });

  it('orders screenshots by number, keeps five, and names files outside the format', async () => {
    const png = (path: string) => ({ path, blob: new Blob(['p']) });
    const pkg = await buildPackage([
      ...[10, 2, 1, 3, 4, 5].map((n) => png(`images/screenshots/${n}.png`)),
      png('images/icon.jpg'),
      png('languages/fr/screenshots/1.jpeg'),
      { path: 'languages/fr/description.txt', blob: new Blob(['  \n']) },
      png('screenshots/1.png'),
    ]);
    expect(pkg.images.screenshots).toEqual([1, 2, 3, 4, 5].map((n) => `images/screenshots/${n}.png`));
    expect(pkg.images.icon).toBe('images/icon.jpg');
    expect(pkg.languages.fr).toEqual({ screenshots: ['languages/fr/screenshots/1.jpeg'] });
    expect(pkg.notes.join(' ')).toMatch(/only the first 5/);
    expect(pkg.notes.join(' ')).toMatch(/description\.txt is empty/);
    expect(pkg.notes.join(' ')).toMatch(/ignored: screenshots\/1\.png/);
  });

  it('rejects a drop with no package in it', async () => {
    await expect(buildPackage([{ path: 'src/index.ts', blob: new Blob(['x']) }])).rejects.toThrow('No listing found');
  });
});

describe('ZIPs', () => {
  it('reads the package as a ZIP', async () => {
    const pkg = await buildPackage(await filesFromInput([zipFile('package.zip')]));
    expect(pkg.languages.de?.screenshots).toEqual(['languages/de/screenshots/1.png']);
    expect(pkg.images).toMatchObject({ screenshots: ['images/screenshots/1.png', 'images/screenshots/2.png'], smallTile: 'images/small-tile.png' });
  });

  it('reads back a ZIP that Extract produced', async () => {
    const pkg = await buildPackage(await filesFromInput([zipFile('extracted.zip')]));
    expect(pkg.languages.he?.description).toBeTruthy();
    expect(pkg.images.icon).toBe('images/icon.png');
    expect(pkg.images.screenshots).toHaveLength(3);
    expect(pkg.notes).toEqual([]);
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
