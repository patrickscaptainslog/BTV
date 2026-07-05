// Copies globe textures out of the three-globe package into public/ so the
// display has zero runtime CDN dependencies (kiosks must survive CDN outages).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'three-globe', 'example', 'img');
const dest = join(root, 'public', 'textures');

mkdirSync(dest, { recursive: true });
for (const file of ['earth-topology.png']) {
  copyFileSync(join(src, file), join(dest, file));
}
console.log(`copied globe textures to ${dest}`);
