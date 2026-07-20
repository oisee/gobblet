// Batch self-play: гоняет пары уровней (в обе стороны) в несколько потоков,
// пишет базу партий (JSON) и печатает ранжирование + перекос по цвету.
//
//   node tools/selfplay.mjs --levels=club,medium,hard --games=8 --concurrency=8
//   node tools/selfplay.mjs --levels=club,medium,hard --openingPlies=4 --minutes=60
//
// Флаги: --variant, --levels, --games (партий на пару в режиме без времени),
//        --minutes (гонять по времени, а не фикс. число), --openingPlies (случайный дебют),
//        --concurrency, --seed, --maxPlies, --out
import { Worker } from 'node:worker_threads';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { AI_LEVELS, LEVEL_ORDER } from '../src/players.js';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { variant: 'classic4', levels: 'club,medium,hard', games: 1, seed: 1, maxPlies: 300, openingPlies: 0, minutes: 0 };
  for (const s of argv) { const m = /^--([^=]+)(?:=(.*))?$/.exec(s); if (m) a[m[1]] = m[2] !== undefined ? m[2] : true; }
  a.games = Math.max(1, parseInt(a.games, 10) || 1);
  a.seed = parseInt(a.seed, 10) || 1;
  a.maxPlies = parseInt(a.maxPlies, 10) || 300;
  a.openingPlies = parseInt(a.openingPlies, 10) || 0;
  a.minutes = parseFloat(a.minutes) || 0;
  a.levelList = String(a.levels).split(',').map(s => s.trim()).filter(Boolean);
  a.concurrency = a.concurrency ? Math.max(1, parseInt(a.concurrency, 10)) : Math.max(1, (os.availableParallelism?.() || os.cpus().length) - 1);
  return a;
}

const isDeterministic = (lvl) => { const L = AI_LEVELS[lvl]; return L && !L.tactical && !(L.random > 0); };

// Пары уровней (обе стороны).
function pairs(levels) { const out = []; for (const w of levels) for (const b of levels) out.push([w, b]); return out; }

// Генератор заданий: по времени (minutes) — бесконечно; иначе — фикс. число.
function makeNextTask(args) {
  let ps = pairs(args.levelList);
  if (args.mirror) ps = ps.filter(([w, b]) => w === b); // только зеркальные пары
  let idx = 0;
  if (args.minutes > 0) {
    const deadline = Date.now() + args.minutes * 60000;
    return () => {
      if (Date.now() >= deadline) return null;
      const [white, black] = ps[idx % ps.length];
      const task = { variantId: args.variant, white, black, seed: args.seed + idx, maxPlies: args.maxPlies, openingPlies: args.openingPlies, quiesce: !!args.quiesce };
      idx++;
      return task;
    };
  }
  // фикс: список; детерминированные пары без случайного дебюта — 1 партия
  const tasks = [];
  for (const [white, black] of ps) {
    const n = (args.openingPlies === 0 && isDeterministic(white) && isDeterministic(black)) ? 1 : args.games;
    for (let g = 0; g < n; g++) { tasks.push({ variantId: args.variant, white, black, seed: args.seed + tasks.length, maxPlies: args.maxPlies, openingPlies: args.openingPlies, quiesce: !!args.quiesce }); }
  }
  let k = 0;
  const nt = () => (k < tasks.length ? tasks[k++] : null);
  nt.total = tasks.length;
  return nt;
}

function runPool(nextTask, concurrency, onProgress) {
  const results = [];
  return new Promise((resolve, reject) => {
    let alive = concurrency;
    for (let i = 0; i < concurrency; i++) {
      const w = new Worker(join(here, 'selfplay-worker.mjs'));
      const feed = () => {
        const task = nextTask();
        if (!task) { w.terminate(); if (--alive === 0) resolve(results); return; }
        w.once('message', (msg) => {
          if (!msg.ok) { reject(new Error(msg.error)); w.terminate(); return; }
          results.push(msg.result);
          onProgress(results.length);
          feed();
        });
        w.postMessage(task);
      };
      feed();
    }
  });
}

function computeElo(games, levels) {
  const R = {}; levels.forEach(l => (R[l] = 1500));
  const K = 24;
  for (let pass = 0; pass < 80; pass++) {
    for (const g of games) {
      const ea = 1 / (1 + 10 ** ((R[g.black] - R[g.white]) / 400));
      const sa = g.result === 'white' ? 1 : g.result === 'draw' ? 0.5 : 0;
      const d = K * (sa - ea);
      R[g.white] += d; R[g.black] -= d;
    }
  }
  return R;
}

function pct(x, n) { return n ? (100 * x / n).toFixed(0).padStart(3) + '%' : '  —'; }

function report(games, args) {
  const levels = args.levelList;
  let W = 0, B = 0, D = 0;
  const stat = {}; levels.forEach(l => (stat[l] = { wW: 0, wD: 0, wL: 0, bW: 0, bD: 0, bL: 0 }));
  const h2h = {}; levels.forEach(a => { h2h[a] = {}; levels.forEach(b => (h2h[a][b] = { s: 0, n: 0 })); });
  for (const g of games) {
    if (g.result === 'white') W++; else if (g.result === 'black') B++; else D++;
    const sw = g.result === 'white' ? 1 : g.result === 'draw' ? 0.5 : 0;
    const sW = stat[g.white], sB = stat[g.black];
    if (g.result === 'white') { sW.wW++; sB.bL++; } else if (g.result === 'black') { sW.wL++; sB.bW++; } else { sW.wD++; sB.bD++; }
    const cell = h2h[g.white][g.black]; cell.s += sw; cell.n++;
  }
  const elo = computeElo(games, levels);
  const total = games.length;
  console.log(`\n\n=== Gobblet self-play · ${args.variant} · ${total} партий · дебют ${args.openingPlies} случайных полуходов ===`);
  console.log(`Перекос по цвету:  Белые ${pct(W, total)}   Чёрные ${pct(B, total)}   Ничьи ${pct(D, total)}\n`);
  const rows = levels.map(l => {
    const s = stat[l];
    const wN = s.wW + s.wD + s.wL, bN = s.bW + s.bD + s.bL, n = wN + bN;
    return { l, elo: Math.round(elo[l]), n, winPct: pct(s.wW + s.bW, n), wWhite: pct(s.wW, wN), wBlack: pct(s.bW, bN) };
  }).sort((a, b) => b.elo - a.elo);
  console.log('Уровень      Elo   партий   победы  как белые  как чёрные');
  console.log('─'.repeat(60));
  for (const r of rows) console.log(`${r.l.padEnd(10)}  ${String(r.elo).padStart(4)}   ${String(r.n).padStart(6)}    ${r.winPct}     ${r.wWhite}      ${r.wBlack}`);
  console.log('\nHead-to-head (очки БЕЛЫХ, строка=белые, колонка=чёрные):');
  console.log('            ' + levels.map(l => l.slice(0, 6).padStart(7)).join(''));
  for (const a of levels) {
    let line = a.padEnd(11) + ' ';
    for (const b of levels) { const c = h2h[a][b]; line += (c.n ? (100 * c.s / c.n).toFixed(0) + '%' : '·').padStart(7); }
    console.log(line);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bad = args.levelList.filter(l => !LEVEL_ORDER.includes(l));
  if (bad.length) { console.error('Неизвестные уровни:', bad.join(', '), '\nДоступно:', LEVEL_ORDER.join(', ')); process.exit(1); }

  const nextTask = makeNextTask(args);
  const budget = args.minutes > 0 ? `по времени ${args.minutes} мин` : `заданий ${nextTask.total}`;
  console.log(`Уровни: ${args.levelList.join(', ')} · пар: ${args.levelList.length ** 2} · ${budget} · потоков: ${args.concurrency} · дебют: ${args.openingPlies}`);
  const t0 = Date.now();
  let lastPrint = 0;
  const games = await runPool(nextTask, args.concurrency, (done) => {
    const now = Date.now();
    if (now - lastPrint > 2000 || (!args.minutes && done === nextTask.total)) {
      lastPrint = now;
      const mins = ((now - t0) / 60000).toFixed(1);
      process.stdout.write(`\r  сыграно ${done}${args.minutes ? '' : '/' + nextTask.total}   (${mins} мин)      `);
    }
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const ts = Date.now();
  const outPath = args.out || join(here, '..', 'data', `selfplay-${args.variant}-${ts}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ meta: { ...args, levelList: undefined, count: games.length, seconds: +secs, ts }, games }));

  report(games, args);
  console.log(`\nВремя: ${secs}s · партий: ${games.length} · база: ${outPath}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
