#!/usr/bin/env node
/**
 * Сборка юзерскрипта без внешних зависимостей.
 *
 * Каждый файл из src/ (кроме header.txt) оборачивается в фабрику CommonJS-lite:
 *   __def('core/storage', function (require, module, exports) { ...тело файла... });
 * Порядок файлов в бандле не важен: require() ленивый.
 *
 * Запуск: node build.js [--watch]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'dist');
const DOCS_DIR = path.join(ROOT, 'docs');
const OUT_FILE = path.join(OUT_DIR, 'catwar-balconette.user.js');
const META_FILE = path.join(OUT_DIR, 'catwar-balconette.meta.js');
const HEADER_FILE = path.join(SRC, 'header.txt');
const ENTRY = 'core/bootstrap';

function userscriptMeta(header) {
  const match = String(header).match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
  return (match ? match[0] : header).trimEnd() + '\n';
}

/** Рекурсивный обход src/ за .js файлами. */
function collect(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

function moduleName(file) {
  return path.relative(SRC, file).replace(/\\/g, '/').replace(/\.js$/, '');
}

function indent(text, pad) {
  return text
    .split('\n')
    .map((line) => (line.length ? pad + line : line))
    .join('\n');
}

function build() {
  const header = fs.readFileSync(HEADER_FILE, 'utf8').trimEnd();
  const versionMatch = header.match(/^\/\/\s*@version\s+(\S+)/m);
  const version = versionMatch ? versionMatch[1] : '0.0.0';

  const files = collect(SRC);
  if (!files.length) throw new Error('В src/ не найдено ни одного .js файла');

  const names = files.map(moduleName);
  if (!names.includes(ENTRY)) throw new Error(`Нет точки входа src/${ENTRY}.js`);

  const parts = files.map((file) => {
    const name = moduleName(file);
    const body = fs.readFileSync(file, 'utf8').replace(/\s+$/, '');
    return [
      `  /* ${'='.repeat(70)} */`,
      `  /* src/${name}.js */`,
      `  __def(${JSON.stringify(name)}, function (require, module, exports) {`,
      indent(body, '    '),
      '  });',
      '',
    ].join('\n');
  });

  const out = [
    header,
    '',
    '/* eslint-disable */',
    '/* Собрано автоматически из src/ скриптом build.js. Не редактировать руками. */',
    '',
    '(function () {',
    "  'use strict';",
    '',
    `  var CWB_VERSION = ${JSON.stringify(version)};`,
    `  var CWB_MODULE_IDS = ${JSON.stringify(names.filter((n) => n.startsWith('modules/')).map((n) => n.slice('modules/'.length)))};`,
    '',
    '  var __factories = Object.create(null);',
    '  var __cache = Object.create(null);',
    '',
    '  function __def(name, factory) { __factories[name] = factory; }',
    '',
    '  function require(name) {',
    '    if (name === "cwb:meta") return { version: CWB_VERSION, moduleIds: CWB_MODULE_IDS.slice() };',
    '    if (__cache[name]) return __cache[name].exports;',
    '    var factory = __factories[name];',
    '    if (!factory) throw new Error("[CWB] неизвестный модуль: " + name);',
    '    var module = { exports: {} };',
    '    __cache[name] = module;',
    '    factory(require, module, module.exports);',
    '    return module.exports;',
    '  }',
    '',
    parts.join('\n'),
    '  try {',
    `    require(${JSON.stringify(ENTRY)}).start();`,
    '  } catch (err) {',
    '    console.error("[CWB] не удалось запустить скрипт:", err);',
    '  }',
    '})();',
    '',
  ].join('\n');

  // Проверка синтаксиса до записи на диск.
  new vm.Script(out, { filename: 'catwar-balconette.user.js' });

  const meta = userscriptMeta(header);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, out, 'utf8');
  fs.writeFileSync(META_FILE, meta, 'utf8');

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(path.join(DOCS_DIR, 'catwar-balconette.user.js'), out, 'utf8');
  fs.writeFileSync(path.join(DOCS_DIR, 'catwar-balconette.meta.js'), meta, 'utf8');
  const landing = path.join(DOCS_DIR, 'index.html');
  if (fs.existsSync(landing)) {
    const html = fs.readFileSync(landing, 'utf8').replace(/Версия\s+[\d.]+/g, 'Версия ' + version);
    fs.writeFileSync(landing, html, 'utf8');
  }

  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
  console.log(`[build] ${path.relative(ROOT, OUT_FILE)} — ${files.length} модулей, ${kb} КБ, версия ${version}`);
}

function watch() {
  let timer = null;
  const rerun = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (err) {
        console.error('[build] ошибка:', err.message);
      }
    }, 80);
  };
  fs.watch(SRC, { recursive: true }, rerun);
  console.log('[build] слежу за src/ …');
}

try {
  build();
  if (process.argv.includes('--watch')) watch();
} catch (err) {
  console.error('[build] ошибка:', err.message);
  process.exitCode = 1;
}
