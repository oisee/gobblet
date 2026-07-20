// Впаивает задачник (data/puzzles.json) в docs/guide-ru.html между /*PUZZLES*/…/*END*/.
// Идемпотентно: можно перезапускать после перегенерации этюдов.
//   node tools/make-puzzles.mjs data/hour-run.json --each=10 --out=data/puzzles.json
//   node tools/build-guide.mjs
import { readFile, writeFile } from 'node:fs/promises';

const GUIDE = 'docs/guide-ru.html';
const p = JSON.parse(await readFile('data/puzzles.json', 'utf8'));
const slim = { variant: p.variant || 'classic4', mate1: p.mate1 || [], mate2: p.mate2 || [], mate3: p.mate3 || [] };
const json = JSON.stringify(slim);

let html = await readFile(GUIDE, 'utf8');
if (!/\/\*PUZZLES\*\/[\s\S]*?\/\*END\*\//.test(html)) { console.error('маркер /*PUZZLES*/…/*END*/ не найден в guide'); process.exit(1); }
html = html.replace(/\/\*PUZZLES\*\/[\s\S]*?\/\*END\*\//, '/*PUZZLES*/' + json + '/*END*/');
await writeFile(GUIDE, html);
console.log('впаяно в guide: ' + ['mate1', 'mate2', 'mate3'].map(c => slim[c].length + ' ' + c).join(', '));
