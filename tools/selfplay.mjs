// Batch self-play: гоняет пары уровней (в обе стороны) в несколько потоков,
// пишет базу партий (JSON) и печатает ранжирование + перекос по цвету.
//
//   node tools/selfplay.mjs --variant=classic4 --levels=club,medium,hard --games=1
//   node tools/selfplay.mjs --levels=novice,student,club,medium,hard --games=8 --concurrency=8
//
// Флаги: --variant, --levels (через запятую), --games (партий на упорядоченную пару),
//        --concurrency, --seed, --maxPlies, --out=<path>
import { Worker } from 'node:worker_threads';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';
import { AI_LEVELS, LEVEL_ORDER } from '../src/players.js';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { variant: 'classic4', levels: 'club,medium,hard', games: 1, seed: 1, maxPlies: 300 };
  for (const s of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(s);
    if (m) a[m[1]] = m[2];
  }
  a.games = Math.max(1, parseInt(a.games, 10) || 1);
  a.seed = parseInt(a.seed, 10) || 1;
  a.maxPlies = parseInt(a.maxPlies, 10) || 300;
  a.levelList = String(a.levels).split(',').map(s => s.trim()).filter(Boolean);
  a.concurrency = a.concurrency ? Math.max(1, parseInt(a.concurrency, 10)) : Math.max(1, (os.availableParallelism?.() || os.cpus().length) - 1);
  return a;
}

const isDeterministic = (lvl) => { const L = AI_LEVELS[lvl]; return L && !L.tactical && !(L.random > 0); };

function buildTasks(args) {
  const tasks = [];
  let idx = 0;
  for (const white of args.levelList) {
    for (const black of args.levelList) {
      // детерминированная пара воспроизводит одну и ту же партию — хватит 1 игры
      const n = (isDeterministic(white) && isDeterministic(black)) ? 1 : args.games;
      for (let g = 0; g < n; g++) {
        tasks.push({ variantId: args.variant, white, black, seed: args.seed + idx, maxPlies: args.maxPlies });
        idx++;
      }
    }
  }
  return tasks;
}

function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let next = 0, done = 0;
  return new Promise((resolve, reject) => {
    const n = Math.min(concurrency, tasks.length) || 1;
    let alive = n;
    for (let i = 0; i < n; i++) {
      const w = new Worker(join(here, 'selfplay-worker.mjs'));
      const feed = () => {
        if (next >= tasks.length) { w.terminate(); if (--alive === 0) resolve(results); return; }
        const my = next++;
        w.once('message', (msg) => {
          if (!msg.ok) { reject(new Error(msg.error)); w.terminate(); return; }
          results[my] = msg.result;
          done++;
          if (done % 25 === 0 || done === tasks.length) process.stdout.write(`\r  сыграно ${done}/${tasks.length}   `);
          feed();
        });
        w.postMessage(tasks[my]);
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
  // общий перекос по цвету
  let W = 0, B = 0, D = 0;
  // на игрока: как белые / как чёрные {w,d,l}
  const stat = {};
  levels.forEach(l => (stat[l] = { wW: 0, wD: 0, wL: 0, bW: 0, bD: 0, bL: 0 }));
  // матрица: белые(строка) × чёрные(колонка) — очки белых
  const h2h = {};
  levels.forEach(a => { h2h[a] = {}; levels.forEach(b => (h2h[a][b] = { s: 0, n: 0 })); });

  for (const g of games) {
    if (g.result === 'white') W++; else if (g.result === 'black') B++; else D++;
    const sw = g.result === 'white' ? 1 : g.result === 'draw' ? 0.5 : 0;
    const sW = stat[g.white], sB = stat[g.black];
    if (g.result === 'white') { sW.wW++; sB.bL++; }
    else if (g.result === 'black') { sW.wL++; sB.bW++; }
    else { sW.wD++; sB.bD++; }
    const cell = h2h[g.white][g.black]; cell.s += sw; cell.n++;
  }

  const elo = computeElo(games, levels);
  const total = games.length;

  console.log(`\n\n=== Gobblet self-play · ${args.variant} · ${total} партий ===`);
  console.log(`Перекос по цвету:  Белые ${pct(W, total)}   Чёрные ${pct(B, total)}   Ничьи ${pct(D, total)}\n`);

  // таблица игроков
  const rows = levels.map(l => {
    const s = stat[l];
    const wN = s.wW + s.wD + s.wL, bN = s.bW + s.bD + s.bL;
    const score = s.wW + s.bW + 0.5 * (s.wD + s.bD), n = wN + bN;
    return { l, elo: Math.round(elo[l]), n, winPct: pct(s.wW + s.bW, n), wWhite: pct(s.wW, wN), wBlack: pct(s.bW, bN), score };
  }).sort((a, b) => b.elo - a.elo);

  console.log('Уровень      Elo   партий   победы  как белые  как чёрные');
  console.log('─'.repeat(60));
  for (const r of rows) {
    console.log(`${r.l.padEnd(10)}  ${String(r.elo).padStart(4)}   ${String(r.n).padStart(6)}    ${r.winPct}     ${r.wWhite}      ${r.wBlack}`);
  }

  // head-to-head (очки белых в %)
  console.log('\nHead-to-head (очки БЕЛЫХ, строка=белые, колонка=чёрные):');
  const hdr = '            ' + levels.map(l => l.slice(0, 6).padStart(7)).join('');
  console.log(hdr);
  for (const a of levels) {
    let line = a.padEnd(11) + ' ';
    for (const b of levels) {
      const c = h2h[a][b];
      line += (c.n ? (100 * c.s / c.n).toFixed(0) + '%' : '·').padStart(7);
    }
    console.log(line);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bad = args.levelList.filter(l => !LEVEL_ORDER.includes(l));
  if (bad.length) { console.error('Неизвестные уровни:', bad.join(', '), '\nДоступно:', LEVEL_ORDER.join(', ')); process.exit(1); }

  const tasks = buildTasks(args);
  console.log(`Уровни: ${args.levelList.join(', ')} · пар: ${args.levelList.length ** 2} · заданий: ${tasks.length} · потоков: ${args.concurrency}`);
  const t0 = Date.now();
  const games = await runPool(tasks, args.concurrency);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const ts = Date.now();
  const outPath = args.out || join(here, '..', 'data', `selfplay-${args.variant}-${ts}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ meta: { ...args, levelList: undefined, count: games.length, seconds: +secs, ts }, games }));

  report(games, args);
  console.log(`\nВремя: ${secs}s · база: ${outPath}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
