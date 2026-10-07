import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const [html, css, js, readme] = await Promise.all([
  readFile(join(here, 'index.html'), 'utf8'),
  readFile(join(here, 'crossword-shell.css'), 'utf8'),
  readFile(join(here, 'crossword-shell.js'), 'utf8'),
  readFile(join(here, 'README.md'), 'utf8'),
]);

assert.match(html, /viewport-fit=cover/);
assert.match(html, /data-crossword-shell/);
assert.match(css, /100dvh/);
assert.match(css, /env\(safe-area-inset-top\)/);
assert.match(css, /min-aspect-ratio: 4 \/ 3/);
assert.match(css, /max-aspect-ratio: 3 \/ 4/);
assert.match(css, /prefers-reduced-motion/);
assert.match(js, /settings\.rows\) \|\| 7/);
assert.match(js, /settings\.columns\) \|\| 8/);

for (const event of ['cell', 'tile', 'shuffle', 'hint', 'erase', 'pause', 'mute']) {
  assert.match(js, new RegExp("emit\\('" + event + "'"), 'missing crossword:' + event);
}

for (const forbidden of ['local' + 'Storage', 'session' + 'Storage', 'indexed' + 'DB', 'Bridge.']) {
  assert.equal(js.includes(forbidden), false, 'runtime must not contain ' + forbidden);
}

assert.match(readme, /confirmed reward/);
assert.match(readme, /canonical Playgama storage wrapper/);

console.log('Crossword shell static checks passed.');
