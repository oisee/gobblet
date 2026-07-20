// Майнер этюдов: из решительных партий базы собирает готовые форсированные выигрыши
// (мат-в-1 и вилка→мат) как задачки «ход и выигрыш». Дедуп по симметрии (canonicalKey).
// Позиция кодируется со СТОПКАМИ (нижние матрёшки): клетки через '/', снизу вверх; '-' пусто.
//   node tools/mine-studies.mjs data/hour-run.json --max=40 --out=data/studies.json
import { readFile, writeFile } from 'node:fs/promises';
import { VARIANTS } from '../src/variants.js';
import { newGame, applyMove, generateMoves, canonicalKey } from '../src/engine.js';
import { moveCompact } from '../src/notation.js';

const SZ = ['', 'S', 'M', 'L', 'X'];
const glyph = (pc) => pc.player === 0 ? SZ[pc.size] : SZ[pc.size].toLowerCase();
const cellStr = (st) => st.length ? st.map(glyph).join('') : '-';
const posStack = (s) => s.board.map(cellStr).join('/');

// Проиграть первые k полуходов из SAN → состояние.
function replay(variant, sans, k) {
  const s = newGame(VARIANTS[variant]);
  for (let i = 0; i < k; i++) {
    const core = sans[i].replace(/[+#]+$/, '');
    let mv = null;
    for (const m of generateMoves(s, s.turn)) { if (moveCompact(s, m) === core) { mv = m; break; } }
    if (!mv) return null;
    applyMove(s, mv);
    if (s.winner !== null && i < k - 1) return null;
  }
  return s;
}

async function main() {
  const argv = process.argv.slice(2);
  const files = argv.filter(a => !a.startsWith('--'));
  const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const m = /^--([^=]+)(=(.*))?$/.exec(a); return [m[1], m[3] ?? true]; }));
  const MAX = parseInt(opt.max, 10) || 40;

  let games = [];
  for (const f of files) games = games.concat(JSON.parse(await readFile(f, 'utf8')).games);
  const decisive = games.filter(g => g.winner !== null);

  const seen = new Set();
  const studies = { mate1: [], fork: [] };
  for (const g of decisive) {
    const sans = g.moves.split(/\s+/).filter(Boolean);

    // мат-в-1: последний ход с '#'
    if (sans.length && sans[sans.length - 1].includes('#') && !sans[sans.length - 1].includes('++')) {
      const s = replay(g.variant, sans, sans.length - 1);
      if (s) { const key = canonicalKey(s); if (!seen.has(key)) { seen.add(key);
        studies.mate1.push({ type: 'mate1', pos: posStack(s), turn: s.turn, solution: sans.slice(sans.length - 1), plies: sans.length }); } }
    }
    // вилка: '++' и позже '#'
    const j = sans.findIndex(x => x.includes('++'));
    if (j >= 0 && sans.slice(j + 1).some(x => x.includes('#'))) {
      const s = replay(g.variant, sans, j);
      if (s) { const key = canonicalKey(s); if (!seen.has(key)) { seen.add(key);
        studies.fork.push({ type: 'fork', pos: posStack(s), turn: s.turn, solution: sans.slice(j, sans.length), plies: sans.length }); } }
    }
  }
  // короче партия → чище этюд
  studies.mate1.sort((a, b) => a.plies - b.plies);
  studies.fork.sort((a, b) => a.plies - b.plies);
  const out = { variant: decisive[0]?.variant, mate1: studies.mate1.slice(0, MAX), fork: studies.fork.slice(0, MAX) };

  const path = opt.out || 'data/studies.json';
  await writeFile(path, JSON.stringify(out, null, 1));
  console.log(`Из ${decisive.length} решительных: мат-в-1 ${studies.mate1.length} уник., вилок ${studies.fork.length} уник. → ${path}`);
  console.log('\nПримеры мат-в-1:');
  for (const st of out.mate1.slice(0, 3)) console.log(`  ${st.turn === 0 ? 'белые' : 'чёрные'} ходят: ${st.solution.join(' ')}   поз: ${st.pos}`);
  console.log('Примеры вилок:');
  for (const st of out.fork.slice(0, 3)) console.log(`  ${st.turn === 0 ? 'белые' : 'чёрные'} ходят: ${st.solution.join(' ')}`);
}
main().catch(e => { console.error(e); process.exit(1); });
