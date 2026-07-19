// Дебютная книга: по базе(ам) строит дерево первых K полуходов с канонизацией по
// симметрии доски (повороты/зеркала сливаются) и win-rate с точки зрения ходящего.
// «Лесенка» до 6–7 полуходов, как дебютное дерево у шахматных движков.
//
//   node tools/openbook.mjs data/hour-run.json --plies=6 --top=3 --min=8
//   node tools/openbook.mjs data/a.json data/b.json --plies=8
import { readFile } from 'node:fs/promises';
import { VARIANTS } from '../src/variants.js';
import { newGame, applyMove, canonicalKey, generateMoves } from '../src/engine.js';
import { moveCompact } from '../src/notation.js';

// Воспроизвести первые K полуходов из записанных SAN (сопоставление с легальными
// ходами — без поиска, мгновенно). suffix +/++/# в SAN отбрасываем.
function replayEdges(g, K) {
  const v = VARIANTS[g.variant];
  const s = newGame(v);
  const sans = g.moves ? g.moves.split(' ').filter(Boolean) : [];
  const limit = Math.min(K, sans.length);
  const edges = [];
  for (let ply = 0; ply < limit; ply++) {
    const core = sans[ply].replace(/[+#]+$/, '');
    const mover = s.turn;
    let mv = null;
    for (const m of generateMoves(s, mover)) { if (moveCompact(s, m) === core) { mv = m; break; } }
    if (!mv) break; // не распарсили (не должно случаться)
    const from = canonicalKey(s);
    applyMove(s, mv);
    edges.push({ from, to: canonicalKey(s), san: core, mover });
    if (s.winner !== null) break;
  }
  return edges;
}

function buildTree(games, K) {
  const tree = new Map(); // fromCanon -> Map(toCanon -> {san, mover, n, score})
  for (const g of games) {
    const sw = g.result === 'white' ? 1 : g.result === 'draw' ? 0.5 : 0;
    for (const e of replayEdges(g, K)) {
      let node = tree.get(e.from); if (!node) tree.set(e.from, node = new Map());
      let c = node.get(e.to); if (!c) node.set(e.to, c = { san: e.san, to: e.to, mover: e.mover, n: 0, score: 0 });
      c.n++; c.score += sw; // score — очки БЕЛЫХ; для ходящего пересчитаем при выводе
    }
  }
  return tree;
}

function printNode(canon, tree, depth, maxDepth, top, minN, prefix) {
  const node = tree.get(canon);
  if (!node || depth >= maxDepth) return;
  const arr = [...node.values()].filter(c => c.n >= minN);
  for (const c of arr) c.win = c.mover === 0 ? c.score / c.n : 1 - c.score / c.n; // с точки зрения ходящего
  arr.sort((a, b) => b.win - a.win || b.n - a.n);
  for (const c of arr.slice(0, top)) {
    const side = c.mover === 0 ? '□' : '■';
    console.log(`${prefix}${side} ${c.san.padEnd(6)} ${(100 * c.win).toFixed(0).padStart(3)}%  n=${c.n}`);
    printNode(c.to, tree, depth + 1, maxDepth, top, minN, prefix + '   ');
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const files = argv.filter(a => !a.startsWith('--'));
  const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const m = /^--([^=]+)(=(.*))?$/.exec(a); return [m[1], m[3] ?? true]; }));
  if (!files.length) { console.error('Укажи базу(ы): node tools/openbook.mjs <db.json>... [--plies=6] [--top=3] [--min=8]'); process.exit(1); }

  const K = parseInt(opt.plies, 10) || 6;
  const top = parseInt(opt.top, 10) || 3;
  const minN = parseInt(opt.min, 10) || 8;

  let games = [];
  for (const f of files) { const db = JSON.parse(await readFile(f, 'utf8')); games = games.concat(db.games); }
  // --only=hard,medium — оставить партии, где ОБА игрока из набора (оценка дебюта сильной игрой)
  if (opt.only) {
    const set = new Set(String(opt.only).split(','));
    games = games.filter(g => set.has(g.white) && set.has(g.black));
  }
  const variant = games[0].variant;
  console.log(`Партий: ${games.length}${opt.only ? ' (только ' + opt.only + ')' : ''} · вариант: ${variant} · дерево ${K} полуходов · ветвление ${top} · порог n≥${minN}\n`);

  const tree = buildTree(games, K);
  const root = canonicalKey(newGame(VARIANTS[variant]));

  // плоский рейтинг первых ходов белых
  const first = [...(tree.get(root)?.values() || [])].filter(c => c.n >= minN)
    .map(c => ({ san: c.san, win: c.score / c.n, n: c.n })).sort((a, b) => b.win - a.win);
  console.log('Первый ход белых — win-rate белых (канонизировано по симметрии):');
  console.log('─'.repeat(46));
  for (const f of first) console.log(`  ${f.san.padEnd(7)} ${(100 * f.win).toFixed(0).padStart(3)}%   n=${f.n}`);

  console.log('\nДебютное дерево (□ ход белых, ■ ход чёрных; % = за ходящего):');
  console.log('─'.repeat(46));
  printNode(root, tree, 0, K, top, minN, '');
}

main().catch(e => { console.error(e); process.exit(1); });
