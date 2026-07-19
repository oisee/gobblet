// Пост-анализ базы: воспроизводит партии по сиду и ищет решающий зевок
// (ход проигравшего, после которого оценка сильнее всего качнулась к победителю),
// считая позицию на заданной глубине (по умолчанию — максимальная по варианту).
//
//   node tools/analyze-db.mjs data/selfplay-classic4-<ts>.json --limit=10 --decisive
//   node tools/analyze-db.mjs <file> --depth=4 --limit=5
import { readFile } from 'node:fs/promises';
import { VARIANTS } from '../src/variants.js';
import { newGame, applyMove } from '../src/engine.js';
import { pickMove, maxDepth } from '../src/players.js';
import { topMoves } from '../src/ai.js';
import { moveCompact } from '../src/notation.js';
import { mulberry32 } from './playgame.mjs';

const WIN = 100000;

function evalP0(s, depth) {
  if (s.winner !== null) return s.winner === 0 ? WIN : -WIN;
  const t = topMoves(s, s.turn, depth, 1)[0];
  const sc = t ? t.score : 0;
  return s.turn === 0 ? sc : -sc; // с точки зрения белых (игрок 0)
}

// Воспроизвести партию по сиду, вернуть трассу оценок и ходов.
function replay(g, depth, maxPlies = 300) {
  const v = VARIANTS[g.variant];
  const s = newGame(v);
  const rng = mulberry32(g.seed >>> 0);
  const levels = [g.white, g.black];
  const trace = [];
  while (trace.length < maxPlies && s.winner === null) {
    const mover = s.turn;
    const before = evalP0(s, depth);
    const mv = pickMove(s, levels[mover], rng);
    if (!mv) break;
    const san = moveCompact(s, mv);
    applyMove(s, mv);
    trace.push({ mover, san, before, after: evalP0(s, depth) });
  }
  return trace;
}

// Решающий зевок: ход проигравшего с максимальным сдвигом оценки к победителю.
function criticalMove(trace, winner) {
  if (winner == null) return null;
  const loser = 1 - winner;
  let best = null;
  trace.forEach((step, i) => {
    if (step.mover !== loser) return;
    const swing = winner === 0 ? (step.after - step.before) : (step.before - step.after);
    if (!best || swing > best.swing) best = { ply: i + 1, san: step.san, before: step.before, after: step.after, swing };
  });
  return best;
}

function fmt(e) { return e >= WIN - 100 ? '#W' : e <= -WIN + 100 ? '#B' : (e > 0 ? '+' : '') + e; }

async function main() {
  const argv = process.argv.slice(2);
  const file = argv.find(a => !a.startsWith('--'));
  const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const m = /^--([^=]+)(=(.*))?$/.exec(a); return [m[1], m[3] ?? true]; }));
  if (!file) { console.error('Укажи файл базы: node tools/analyze-db.mjs <db.json> [--limit=N] [--depth=D] [--decisive]'); process.exit(1); }

  const db = JSON.parse(await readFile(file, 'utf8'));
  let games = db.games;
  if (opt.decisive) games = games.filter(g => g.winner !== null);
  const limit = opt.limit ? parseInt(opt.limit, 10) : games.length;
  games = games.slice(0, limit);
  const depth = opt.depth ? parseInt(opt.depth, 10) : maxDepth(VARIANTS[db.games[0].variant]);

  console.log(`Анализ ${games.length} партий на глубину ${depth}…\n`);
  console.log('белые ⚔ чёрные        итог  ходов   решающий зевок (ход проигравшего)');
  console.log('─'.repeat(74));
  for (const g of games) {
    const trace = replay(g, depth);
    const crit = criticalMove(trace, g.winner);
    const res = g.result === 'white' ? 'белые' : g.result === 'black' ? 'чёрные' : 'ничья';
    const critTxt = crit ? `#${crit.ply} ${crit.san}  (${fmt(crit.before)} → ${fmt(crit.after)})` : '—';
    console.log(`${(g.white + ' ⚔ ' + g.black).padEnd(20)}  ${res.padEnd(6)}  ${String(g.plies).padStart(4)}   ${critTxt}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
