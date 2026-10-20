// Moves the store ZIP that `wxt zip` wrote into dist/ over to release/, and adds
// a copy with a fixed name, so the latest release always has the same download
// link: …/releases/latest/download/cwsagent-chrome.zip
import { copyFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const from = 'dist';
const to = 'release';
const stable = 'cwsagent-chrome.zip';
mkdirSync(to, { recursive: true });
const zips = readdirSync(from).filter((f) => f.endsWith('-chrome.zip'));
if (zips.length !== 1) {
  console.error(`Expected one ZIP in dist/, found ${zips.length}. Run \`wxt zip\` first.`);
  process.exit(1);
}
renameSync(join(from, zips[0]), join(to, zips[0]));
copyFileSync(join(to, zips[0]), join(to, stable));
console.log(`release/${zips[0]}\nrelease/${stable}`);
