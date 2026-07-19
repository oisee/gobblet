// Воркер пула: играет одну партию по заданию и возвращает результат.
import { parentPort } from 'node:worker_threads';
import { playGame } from './playgame.mjs';

parentPort.on('message', (task) => {
  try { parentPort.postMessage({ ok: true, result: playGame(task) }); }
  catch (e) { parentPort.postMessage({ ok: false, error: String((e && e.stack) || e) }); }
});
