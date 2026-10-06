#!/usr/bin/env node
/**
 * Дымовой тест standalone «Кач ЛУ» (catwar-balconette-lu.user.js).
 *
 * jsdom ставится отдельно:
 *   npm i --no-save jsdom && node test/smoke-klu.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('Нужен jsdom: npm i --no-save jsdom');
  process.exit(2);
}

const MOCK = path.join(__dirname, 'mock.html');
const BUNDLE = path.join(__dirname, '..', 'dist', 'catwar-balconette-lu.user.js');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? ' — ' + detail : ''));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  const pageErrors = [];

  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  const html = fs.readFileSync(MOCK, 'utf8')
    .replace(/<script src="\.\.\/dist\/catwar-balconette\.user\.js"><\/script>/,
      () => '<script>\n' + bundle.replace(/<\/script>/gi, '<\\/script>') + '\n</script>');

  const dom = new JSDOM(html, {
    url: 'https://catwar.su/cw3/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  window.addEventListener('error', (e) => pageErrors.push(String(e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => pageErrors.push('unhandled: ' + e.reason));
  const origError = window.console.error;
  window.console.error = function (...args) {
    pageErrors.push(args.map(String).join(' '));
    origError.apply(window.console, args);
  };

  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  await sleep(350);

  const $ = (sel) => window.document.querySelector(sel);
  const $$ = (sel) => [...window.document.querySelectorAll(sel)];

  console.log('\n1. Запуск standalone «Кач ЛУ»');
  check('скрипт стартовал без исключений', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  console.log('\n2. Панель минника');
  check('панель #klu-lu смонтирована', !!$('#klu-lu'));
  check('сетка 60 клеток', $$('#klu-lu-grid td').length === 60);
  check('кнопка «Кач ЛУ» есть', !!$('#klu-lu-train'));
  check('чекбокс «Переносить на игровую» (#klu-lu-overlay) есть', !!$('#klu-lu-overlay input'));
  check('чекбокс «Переносить на игровую» включён по умолчанию', !!($('#klu-lu-overlay input') && $('#klu-lu-overlay input').checked));

  console.log('\n3. Шестерёнка и панель настроек');
  check('шестерёнка #klu-gear есть', !!$('#klu-gear'));
  $('#klu-gear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  check('панель #klu-panel открылась', !!$('#klu-panel.open, #klu-panel'));

  const panel = $('#klu-panel');
  const panelText = panel ? panel.textContent : '';
  check('в настройках 7 чекбоксов',
    $$('#klu-panel input[type=checkbox]').length === 7,
    $$('#klu-panel input[type=checkbox]').length + ' шт.');
  check('в настройках чекбокс «Включить панель Кач ЛУ»', /Включить панель Кач ЛУ/.test(panelText));
  check('в настройках чекбокс «Кач ЛУ: не нажимать на опасные клетки»', /Кач ЛУ: не нажимать на опасные клетки/.test(panelText));
  check('в настройках чекбокс «Подтягивать ярусы деревьев из игры»', /Подтягивать ярусы деревьев из игры/.test(panelText));
  check('в настройках чекбокс «Ставить цифру в клетку кота по треску в чате»', /Ставить цифру в клетку кота по треску в чате/.test(panelText));
  check('в настройках чекбокс «Показывать своё лазание в шапке панели»', /Показывать своё лазание в шапке панели/.test(panelText));
  check('в настройках чекбокс «Показывать координаты клеток при наведении»', /Показывать координаты клеток при наведении/.test(panelText));
  check('в настройках чекбокс «Очищать текущее поле при смене локации»', /Очищать текущее поле при смене локации/.test(panelText));
  check('редактор «Вкладки и поля» есть', /Вкладки и поля/.test(panelText));

  console.log('\n4. Нет cwb-элементов');
  check('нет #cwb-root', !$('#cwb-root'));
  check('нет #cwb-lu', !$('#cwb-lu'));
  check('нет элементов с id, начинающимся на cwb-', $$('[id^="cwb-"]').length === 0, $$('[id^="cwb-"]').length + ' шт.');

  console.log('\n5. Тултип координат');
  check('#klu-coords-tip создан', !!$('#klu-coords-tip'));

  console.log('\n6. Хранилище «klu:»');
  var keys = Object.keys(window.localStorage).filter((k) => k.startsWith('klu:'));
  check('есть ключи klu:', keys.length > 0, keys.slice(0, 5).join(', '));

  console.log('\n7. Ошибки за сессию');
  check('исключений не было', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '-'.repeat(60));
  console.log(`Итог: ${results.length - failed.length}/${results.length} проверок пройдено`);
  if (failed.length) {
    failed.forEach((f) => console.log('  FAIL ' + f.name + (f.detail ? ' — ' + f.detail : '')));
  }
  console.log('-'.repeat(60));

  dom.window.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('Тест упал:', e);
  process.exit(1);
});
