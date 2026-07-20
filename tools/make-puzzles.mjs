// Генератор задачника: из решительных партий берёт позиции и ПРОВЕРЯЕТ солвером
// форсированный мат в 1/2/3 (не «партия кончилась победой», а доказанный выигрыш).
// Хранит полное состояние (доска+резервы+ход) — чтобы позицию можно было загрузить и играть.
//   node tools/make-puzzles.mjs data/hour-run.json --games=800 --each=10 --out=data/puzzles.json
import { readFile, writeFile } from 'node:fs/promises';
import { VARIANTS } from '../src/variants.js';
import { newGame, applyMove, generateMoves, makeMove, unmakeMove, cloneState, canonicalKey } from '../src/engine.js';
import { moveCompact } from '../src/notation.js';

const SZ = ['', 'S', 'M', 'L', 'X'];
const glyph = p => p.player === 0 ? SZ[p.size] : SZ[p.size].toLowerCase();
const posStack = s => s.board.map(st => st.length ? st.map(glyph).join('') : '-').join('/');

// Может ли `me` (его ход) форсированно выиграть не более чем за k своих ходов? Возвращает выигрывающий ход или null.
function meWinsIn(s, me, k) {
  for (const m of generateMoves(s, me)) {
    const u = makeMove(s, m);
    let win = false;
    if (s.winner === me) win = true;                 // выигрыш этим ходом
    else if (s.winner === null && k > 1) win = oppCannotEscape(s, me, k);
    unmakeMove(s, m, u);
    if (win) return m;
  }
  return null;
}
function oppCannotEscape(s, me, k) {
  const opp = 1 - me;
  for (const m of generateMoves(s, opp)) {
    const u = makeMove(s, m);
    let escapes;
    if (s.winner === opp) escapes = true;            // соперник выиграл — ушёл
    else if (s.winner === me) escapes = false;       // ход соперника дал выигрыш мне (вскрытие) — ок
    else escapes = !meWinsIn(s, me, k - 1);
    unmakeMove(s, m, u);
    if (escapes) return false;
  }
  return true;
}
// Кратчайший форсированный мат ≤3 для стороны хода. {k, move} или null.
function shortestMate(s) {
  const me = s.turn;
  for (let k = 1; k <= 3; k++) { const mv = meWinsIn(s, me, k); if (mv) return { k, move: mv }; }
  return null;
}

function replayStates(g, tailPlies) {
  const s = newGame(VARIANTS[g.variant]);
  const sans = g.moves.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < sans.length; i++) {
    const core = sans[i].replace(/[+#]+$/, '');
    let mv = null;
    for (const m of generateMoves(s, s.turn)) { if (moveCompact(s, m) === core) { mv = m; break; } }
    if (!mv) break;
    // сохраняем состояние ДО хода i, если это хвост партии и ходит будущий победитель
    if (i >= sans.length - tailPlies && s.winner === null && s.turn === g.winner) out.push(cloneState(s));
    applyMove(s, mv);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const files = argv.filter(a => !a.startsWith('--'));
  const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const m = /^--([^=]+)(=(.*))?$/.exec(a); return [m[1], m[3] ?? true]; }));
  const GAMES = parseInt(opt.games, 10) || 800, EACH = parseInt(opt.each, 10) || 10, TAIL = parseInt(opt.tail, 10) || 8;

  let games = [];
  for (const f of files) games = games.concat(JSON.parse(await readFile(f, 'utf8')).games);
  const decisive = games.filter(g => g.winner !== null).slice(0, GAMES);

  const byCat = { mate1: [], mate2: [], mate3: [] };
  const seen = new Set();
  for (const g of decisive) {
    for (const s of replayStates(g, TAIL)) {
      const key = canonicalKey(s);
      if (seen.has(key)) continue; seen.add(key);
      const sm = shortestMate(s);
      if (!sm) continue;
      const cat = 'mate' + sm.k;
      if (byCat[cat].length >= EACH * 3) continue; // с запасом, потом отберём короткие
      byCat[cat].push({ cat, k: sm.k, turn: s.turn, pos: posStack(s), san: moveCompact(s, sm.move),
        state: { board: s.board, hands: s.hands, turn: s.turn }, plies: s.board.flat().length });
    }
    if (byCat.mate1.length >= EACH * 3 && byCat.mate2.length >= EACH * 3 && byCat.mate3.length >= EACH * 3) break;
  }
  // предпочитаем позиции с меньшим числом фишек (чище)
  for (const c of Object.keys(byCat)) byCat[c] = byCat[c].sort((a, b) => a.plies - b.plies).slice(0, EACH);

  const out = { variant: decisive[0]?.variant, ...byCat };
  await writeFile(opt.out || 'data/puzzles.json', JSON.stringify(out, null, 1));
  console.log(`Проверено солвером. Мат-в-1: ${byCat.mate1.length}, мат-в-2: ${byCat.mate2.length}, мат-в-3: ${byCat.mate3.length} → ${opt.out || 'data/puzzles.json'}`);
  for (const c of ['mate1', 'mate2', 'mate3']) { console.log('\n' + c + ':'); for (const p of byCat[c].slice(0, 3)) console.log(`  ${p.turn === 0 ? 'белые' : 'чёрные'}: ${p.san}  (фишек ${p.plies})  ${p.pos}`); }
}
main().catch(e => { console.error(e); process.exit(1); });
