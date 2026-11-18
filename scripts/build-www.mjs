// Copies the static game into www/ for Capacitor (no bundler needed).
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const out = 'www';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of ['index.html', 'styles.css', 'favicon.svg', 'js', 'fonts']) cpSync(f, `${out}/${f}`, { recursive: true });
console.log('www/ ready');
