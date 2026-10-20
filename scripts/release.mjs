// Moves the store ZIP that `wxt zip` wrote into dist/ over to release/.
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const from = 'dist';
const to = 'release';
mkdirSync(to, { recursive: true });
const zips = readdirSync(from).filter((f) => f.endsWith('.zip') && !f.includes('-sources'));
if (!zips.length) {
  console.error('No ZIP in dist/. Run `wxt zip` first.');
  process.exit(1);
}
for (const f of zips) {
  renameSync(join(from, f), join(to, f));
  console.log(`release/${f}`);
}
