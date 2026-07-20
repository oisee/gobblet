// Ранжирование дебютов по исходу, с приведением к КАНОНУ (симметрия доски + транспозиции):
// дебюты, отличающиеся поворотом/зеркалом/порядком ходов, сливаются в один.
//   node tools/rank-openings.mjs data/overnight-*.json --plies=3 --only=medium,hard --min=30
import { readFile } from 'node:fs/promises';
import { VARIANTS } from '../src/variants.js';
import { newGame, applyMove, generateMoves, canonicalKey } from '../src/engine.js';
import { moveCompact } from '../src/notation.js';

function openingKey(g, K) {
  const s = newGame(VARIANTS[g.variant]);
  const sans = g.moves.split(/\s+/).filter(Boolean);
  const n = Math.min(K, sans.length);
  for (let i = 0; i < n; i++) {
    const core = sans[i].replace(/[+#]+$/, '');
    let mv = null;
    for (const m of generateMoves(s, s.turn)) { if (moveCompact(s, m) === core) { mv = m; break; } }
    if (!mv) return null;
    applyMove(s, mv);
    if (s.winner !== null) return null; // партия кончилась в дебюте — не берём
  }
  return { key: canonicalKey(s), rep: sans.slice(0, n).join(' ') };
}

async function main() {
  const argv = process.argv.slice(2);
  const files = argv.filter(a => !a.startsWith('--'));
  const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const m = /^--([^=]+)(=(.*))?$/.exec(a); return [m[1], m[3] ?? true]; }));
  const K = parseInt(opt.plies, 10) || 3, MIN = parseInt(opt.min, 10) || 30;

  let games = [];
  for (const f of files) games = games.concat(JSON.parse(await readFile(f, 'utf8')).games);
  if (opt.only) { const set = new Set(String(opt.only).split(',')); games = games.filter(g => set.has(g.white) && set.has(g.black)); }

  const groups = new Map(); // key -> {rep,n,w,b,d}
  for (const g of games) {
    const ok = openingKey(g, K); if (!ok) continue;
    let e = groups.get(ok.key); if (!e) groups.set(ok.key, e = { rep: ok.rep, n: 0, w: 0, b: 0, d: 0 });
    e.n++; if (g.result === 'white') e.w++; else if (g.result === 'black') e.b++; else e.d++;
  }
  const all = [...groups.values()].filter(e => e.n >= MIN);
  all.forEach(e => { e.wp = e.w / e.n; e.bp = e.b / e.n; e.dp = e.d / e.n; });

  console.log(`Дебюты глубиной ${K} полуходов${opt.only ? ' (' + opt.only + ')' : ''}: ${games.length} партий → ${groups.size} канонических, ${all.length} с n≥${MIN}\n`);
  const line = e => `${e.rep.padEnd(3 + K * 4)}  n=${String(e.n).padStart(4)}  бел ${(100 * e.wp).toFixed(0).padStart(3)}%  чёр ${(100 * e.bp).toFixed(0).padStart(3)}%  ничьи ${(100 * e.dp).toFixed(0).padStart(3)}%`;

  console.log('▶ Лучшие для БЕЛЫХ (по win% белых):');
  [...all].sort((a, b) => b.wp - a.wp).slice(0, 10).forEach(e => console.log('  ' + line(e)));
  console.log('\n▶ Лучшие для ЧЁРНЫХ (по win% чёрных):');
  [...all].sort((a, b) => b.bp - a.bp).slice(0, 10).forEach(e => console.log('  ' + line(e)));
  console.log('\n▶ Самые частые дебюты:');
  [...all].sort((a, b) => b.n - a.n).slice(0, 8).forEach(e => console.log('  ' + line(e)));

  const wp = all.map(e => e.wp).sort((a, b) => a - b);
  console.log(`\nРазброс win% белых по дебютам: ${(100 * wp[0]).toFixed(0)}%…${(100 * wp[wp.length - 1]).toFixed(0)}% (медиана ${(100 * wp[wp.length >> 1]).toFixed(0)}%) — насколько дебют вообще влияет.`);
}
main().catch(e => { console.error(e); process.exit(1); });
