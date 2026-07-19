// Сериализатор: инлайнит CSS и все ES-модули в один самодостаточный HTML.
// Zero-dep. Запуск: node build.mjs  ->  dist/gobblet.html
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = (f) => join(root, 'src', f);

// Порядок = порядок зависимостей (листья первыми).
const MODULE_ORDER = ['variants.js', 'i18n.js', 'engine.js', 'notation.js', 'ai.js', 'players.js', 'ui.js', 'main.js'];

// Убираем строки import и ключевое слово export — всё окажется в одной области видимости.
function stripModule(code) {
  return code
    .replace(/^\s*import\s.*$/gm, '')   // import ... ;
    .replace(/^export\s+/gm, '')        // export function/const/...
    .trim();
}

async function main() {
  let html = await readFile(join(root, 'index.html'), 'utf8');
  const css = await readFile(src('styles.css'), 'utf8');

  const parts = [];
  for (const f of MODULE_ORDER) {
    const code = stripModule(await readFile(src(f), 'utf8'));
    parts.push(`/* ===== ${f} ===== */\n${code}`);
  }
  const bundle = `"use strict";\n(function(){\n${parts.join('\n\n')}\n})();`;

  // Заменяем dev-подключения на инлайны.
  html = html.replace(
    /\s*<link rel="stylesheet" href="src\/styles\.css"\s*\/?>\s*/,
    `\n<style>\n${css}\n</style>\n`
  );
  html = html.replace(
    /\s*<script type="module" src="src\/main\.js"><\/script>\s*/,
    `\n  <script>\n${bundle}\n  </script>\n`
  );

  await mkdir(join(root, 'dist'), { recursive: true });
  const out = join(root, 'dist', 'gobblet.html');
  await writeFile(out, html, 'utf8');
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`✓ dist/gobblet.html — ${kb} КБ, самодостаточный, открывается двойным кликом.`);
}

main().catch(e => { console.error(e); process.exit(1); });
