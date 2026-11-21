// Copies the static game into www/ for Capacitor (no bundler needed).
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const out = 'www';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of ['index.html', 'styles.css', 'favicon.svg', 'js', 'fonts']) cpSync(f, `${out}/${f}`, { recursive: true });
// artist-made dog (if any); the reference rig is for artists only
cpSync('assets', `${out}/assets`, { recursive: true, filter: (f) => !f.endsWith('xolo_reference.glb') });

console.log('www/ ready');
