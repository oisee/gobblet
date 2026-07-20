// Просмотр партии по записи SAN: печатает доску после каждого полухода (ASCII),
// плюс выдаёт компактный дамп позиций для построения диаграмм.
//   node tools/game-view.mjs --moves="Xd4 Xb2 ..." [--variant=classic4] [--json]
import { VARIANTS } from '../src/variants.js';
import { newGame, applyMove, generateMoves, topOf } from '../src/engine.js';
import { moveCompact } from '../src/notation.js';

const argv = process.argv.slice(2);
const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const m = /^--([^=]+)(=(.*))?$/.exec(a); return [m[1], m[3] ?? true]; }));
const variant = opt.variant || 'classic4';
const v = VARIANTS[variant];
const N = v.boardSize;
const sans = (opt.moves || '').split(/\s+/).filter(Boolean);

// символ верхней фишки: белые (0) — ЗАГЛАВНЫЕ, чёрные (1) — строчные
const SZ = ['', 'S', 'M', 'L', 'X'];
function glyph(cell) { const t = topOf(cell); if (!t) return '·'; const g = SZ[t.size]; return t.player === 0 ? g : g.toLowerCase(); }

function boardRows(s) {
  const rows = [];
  for (let r = 0; r < N; r++) {
    let line = (N - r) + ' ';
    for (let c = 0; c < N; c++) line += ' ' + glyph(s.board[r * N + c]).padEnd(2);
    rows.push(line);
  }
  rows.push('   ' + [...'abcd'].slice(0, N).map(x => x.padEnd(3)).join(''));
  return rows;
}

function boardGrid(s) { // плоский массив 'X'/'x'/'·' для диаграмм (json)
  return s.board.map(glyph);
}

const s = newGame(v);
const dump = [{ ply: 0, san: '', grid: boardGrid(s) }];
if (!opt.json) { console.log('старт:'); boardRows(s).forEach(l => console.log('  ' + l)); }

for (let i = 0; i < sans.length; i++) {
  const core = sans[i].replace(/[+#]+$/, '');
  const mover = s.turn;
  let mv = null;
  for (const m of generateMoves(s, mover)) { if (moveCompact(s, m) === core) { mv = m; break; } }
  if (!mv) { console.error(`не распарсил ход ${i + 1}: ${sans[i]}`); break; }
  applyMove(s, mv);
  dump.push({ ply: i + 1, san: sans[i], grid: boardGrid(s), turn: s.turn, winner: s.winner });
  if (!opt.json) {
    console.log(`\n${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '...'} ${sans[i]}  (${mover === 0 ? 'белые' : 'чёрные'})`);
    boardRows(s).forEach(l => console.log('  ' + l));
  }
}
if (opt.json) console.log(JSON.stringify(dump));
