#!/usr/bin/env node
/**
 * Сборка юзерскрипта без внешних зависимостей.
 *
 * Полный бандл: каждый .js из src/ (кроме шапок) оборачивается в фабрику CommonJS-lite.
 * Бандл «только ЛУ»: то же ядро src/core/ и один модуль src/modules/climbing-field.js.
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
const HEADER_FILE = path.join(SRC, 'header.txt');
const ENTRY = 'core/bootstrap';

/** full — все модули; lu — ядро и только поле для ЛУ. */
const VARIANTS = [
  { id: 'full', headerFile: HEADER_FILE, baseName: 'catwar-balconette' },
  {
    id: 'lu',
    headerFile: path.join(SRC, 'header-lu.txt'),
    baseName: 'catwar-balconette-lu',
    modules: ['climbing-field'],
  },
];

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

function filesForVariant(variant) {
  const files = collect(SRC);
  if (!variant.modules) return files;
  const allow = new Set(variant.modules.map((id) => 'modules/' + id));
  return files.filter((file) => {
    const name = moduleName(file);
    if (name.startsWith('modules/')) return allow.has(name);
    return name.startsWith('core/');
  });
}

function bundleSource(header, version, variantId, files) {
  const names = files.map(moduleName);
  const moduleIds = names
    .filter((n) => n.startsWith('modules/'))
    .map((n) => n.slice('modules/'.length));

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

  return [
    header,
    '',
    '/* eslint-disable */',
    '/* Собрано автоматически из src/ скриптом build.js. Не редактировать руками. */',
    '',
    '(function () {',
    "  'use strict';",
    '',
    `  var CWB_VERSION = ${JSON.stringify(version)};`,
    `  var CWB_VARIANT = ${JSON.stringify(variantId)};`,
    `  var CWB_MODULE_IDS = ${JSON.stringify(moduleIds)};`,
    '',
    '  var __factories = Object.create(null);',
    '  var __cache = Object.create(null);',
    '',
    '  function __def(name, factory) { __factories[name] = factory; }',
    '',
    '  function require(name) {',
    '    if (name === "cwb:meta") return { version: CWB_VERSION, variant: CWB_VARIANT, moduleIds: CWB_MODULE_IDS.slice() };',
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
}

function buildVariant(variant) {
  const header = fs.readFileSync(variant.headerFile, 'utf8').trimEnd();
  const versionMatch = header.match(/^\/\/\s*@version\s+(\S+)/m);
  const version = versionMatch ? versionMatch[1] : '0.0.0';

  const files = filesForVariant(variant);
  if (!files.length) throw new Error('В src/ не найдено ни одного .js файла для ' + variant.id);

  const names = files.map(moduleName);
  if (!names.includes(ENTRY)) throw new Error(`Нет точки входа src/${ENTRY}.js`);

  const out = bundleSource(header, version, variant.id, files);
  const userName = variant.baseName + '.user.js';
  new vm.Script(out, { filename: userName });

  const meta = userscriptMeta(header);
  const metaName = variant.baseName + '.meta.js';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, userName), out, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, metaName), meta, 'utf8');
  fs.writeFileSync(path.join(DOCS_DIR, userName), out, 'utf8');
  fs.writeFileSync(path.join(DOCS_DIR, metaName), meta, 'utf8');

  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
  console.log(`[build] dist/${userName} — ${files.length} файлов, ${kb} КБ, версия ${version}, вариант ${variant.id}`);
  return version;
}

function build() {
  let pageVersion = '0.0.0';
  for (const variant of VARIANTS) {
    const version = buildVariant(variant);
    if (variant.id === 'full') pageVersion = version;
  }

  const landing = path.join(DOCS_DIR, 'index.html');
  if (fs.existsSync(landing)) {
    const html = fs.readFileSync(landing, 'utf8').replace(/Версия\s+[\d.]+/g, 'Версия ' + pageVersion);
    fs.writeFileSync(landing, html, 'utf8');
  }
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
