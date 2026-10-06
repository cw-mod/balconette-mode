#!/usr/bin/env node
/**
 * Дымовой тест ЛУ-варианта: гоняет dist/catwar-balconette-lu.user.js по test/mock.html в jsdom.
 *
 * Проверяет специфику ЛУ-сборки:
 *  - панель настроек — одна страница, без табов и uwu-баннера;
 *  - в карточках нет кнопки «Сбросить настройки»;
 *  - нужные модули присутствуют, лишних (часы, таймер заголовка, «О коте», Информация и т.д.) нет;
 *  - domain-redirect включён по умолчанию, обратный (su → .net) выключен;
 *  - уведомления: громкость 0..1 и кнопка «Проверить звук»;
 *  - панель ЛУ: чекбокс «Переносить на игровую», пометки на игровом поле;
 *  - смена настройки не пересоздаёт контрол (слайдер можно тянуть).
 *
 * jsdom ставится отдельно: npm i --no-save jsdom && node test/smoke-lu.js
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
  await sleep(300);

  const $ = (sel) => window.document.querySelector(sel);
  const $$ = (sel) => [...window.document.querySelectorAll(sel)];

  console.log('\n1. Запуск ЛУ-бандла');
  check('скрипт стартовал без исключений', pageErrors.length === 0, pageErrors.join(' | '));
  check('панель смонтирована в #cwb-root', !!$('#cwb-root'));
  check('кнопка-шестерёнка есть', !!$('#cwb-root .cwb-gear'));

  console.log('\n2. Панель — одна страница без табов');
  $('#cwb-root .cwb-gear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  check('панель открылась', !$('#cwb-root .cwb-overlay').hidden);
  check('табов нет', $$('#cwb-root .cwb-tab').length === 0);
  check('подписи-примечания к табам нет', !$('#cwb-root .cwb-tab-note'));
  check('uwu-баннера нет', !$('#cwb-root .cwb-uwu-banner'));
  check('карточка «Ядро» на месте', !!$('#cwb-root [data-cwb-mod="__core"]'));

  console.log('\n3. Состав модулей');
  const present = new Set($$('#cwb-root [data-cwb-mod]').map((n) => n.dataset.cwbMod));
  const wanted = [
    'climbing-field', 'cell-coords', 'layout-swap', 'old-icons', 'history-autoscroll',
    'pm-ids', 'notifications', 'domain-redirect', 'domain-redirect-reverse',
    'static-background', 'hide-weather',
  ];
  wanted.forEach((id) => check('модуль ' + id + ' есть', present.has(id)));
  const banned = [
    'clock', 'action-title', 'hide-cat-tooltip', 'param-info', 'skill-fractions',
    'hunt-smell-square', 'sounds', 'mouth-cat-ids', 'mouth-item-ids', 'copy-id',
    'highlight-moves', 'always-day', 'grid',
  ];
  banned.forEach((id) => check('модуля ' + id + ' нет', !present.has(id)));

  console.log('\n4. Схемы модулей (срезы для ЛУ)');
  check('кнопок «Сбросить настройки» нет', $$('#cwb-root .cwb-btn').every((b) => !/Сбросить настройки/.test(b.textContent)));
  check('у cell-coords нет подпунктов', !$('#cwb-root [data-cwb-mod="cell-coords"] .cwb-opts'));
  check('у old-icons нет подпунктов', !$('#cwb-root [data-cwb-mod="old-icons"] .cwb-opts'));
  check('у history-autoscroll нет подпунктов', !$('#cwb-root [data-cwb-mod="history-autoscroll"] .cwb-opts'));
  check('у domain-redirect нет подпунктов', !$('#cwb-root [data-cwb-mod="domain-redirect"] .cwb-opts'));
  const notifOpts = $('#cwb-root [data-cwb-mod="notifications"] .cwb-opts');
  check('у уведомлений есть опции', !!notifOpts);
  const vol = notifOpts && notifOpts.querySelector('input[type=range]');
  check('громкость — слайдер 0..1', !!(vol && vol.min === '0' && vol.max === '1'), vol && (vol.min + '..' + vol.max));
  check('у уведомлений нет «звук при уведомлении»', !(notifOpts && /Звук при уведомлении/.test(notifOpts.textContent)));
  check('у уведомлений нет «мигать заголовком»', !(notifOpts && /Мигать заголовком/.test(notifOpts.textContent)));
  check('кнопка «Проверить звук» есть', !!(notifOpts && [...notifOpts.querySelectorAll('button')].some((b) => /Проверить звук/.test(b.textContent))));
  const weatherOpts = $('#cwb-root [data-cwb-mod="hide-weather"] .cwb-opts');
  check('в погоде нет «Небо над полем»', !(weatherOpts && /Небо над полем/.test(weatherOpts.textContent)));
  check('в погоде нет «Вся строка погоды»', !(weatherOpts && /Вся строка погоды/.test(weatherOpts.textContent)));
  check('в погоде есть «Полоска температуры»', !!(weatherOpts && /Полоска температуры/.test(weatherOpts.textContent)));
  const bgOpts = $('#cwb-root [data-cwb-mod="static-background"] .cwb-opts');
  check('в фоне нет «Что менять»', !(bgOpts && /Что менять/.test(bgOpts.textContent)));
  check('в фоне нет «Отключить сезонный скин»', !(bgOpts && /Отключить сезонный скин/.test(bgOpts.textContent)));
  check('в фоне есть выбор цвета', !!(bgOpts && bgOpts.querySelector('input[type=color]')));
  const luOpts = $('#cwb-root [data-cwb-mod="climbing-field"] .cwb-opts');
  check('в поле ЛУ нет «Живая карта UwU»', !(luOpts && /Живая карта UwU/.test(luOpts.textContent)));
  check('в поле ЛУ нет «Подтягивать ярусы»', !(luOpts && /Подтягивать ярусы/.test(luOpts.textContent)));
  check('в поле ЛУ нет «своё лазание»', !(luOpts && /лазание в шапке/.test(luOpts.textContent)));
  check('в поле ЛУ нет «Очищать текущее поле»', !(luOpts && /Очищать текущее поле/.test(luOpts.textContent)));
  check('в поле ЛУ есть «по треску в чате»', !!(luOpts && /треску в чате/.test(luOpts.textContent)));
  check('редактор вкладок и полей есть', !!$('#cwb-root .cwb-maps-editor'));

  console.log('\n5. Редиректы');
  const redirSw = $('#cwb-root [data-cwb-mod="domain-redirect"] .cwb-sw input');
  check('domain-redirect включён по умолчанию', !!(redirSw && redirSw.checked));
  const revSw = $('#cwb-root [data-cwb-mod="domain-redirect-reverse"] .cwb-sw input');
  check('domain-redirect-reverse выключен по умолчанию', !!(revSw && !revSw.checked));

  console.log('\n6. Панель ЛУ');
  await sleep(300);
  check('панель ЛУ смонтирована', !!$('#cwb-lu'));
  check('сетка 60 клеток', $$('#cwb-lu-grid td').length === 60);
  check('кнопка Кач ЛУ есть', !!$('#cwb-lu-train'));
  const overlayBox = $('#cwb-lu-overlay input');
  check('чекбокс «Переносить на игровую» в панели', !!overlayBox);
  check('чекбокс включён по умолчанию', !!(overlayBox && overlayBox.checked));
  check('пометки на игровом поле', !!window.document.querySelector('#cages td.cage[data-cwb-lu]'));

  console.log('\n7. Живые контролы не пересоздаются');
  if (vol) {
    vol.focus();
    vol.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(60);
    const volAfter = $('#cwb-root [data-cwb-mod="notifications"] .cwb-opts input[type=range]');
    check('слайдер громкости жив после input', volAfter === vol || (volAfter && volAfter.value === vol.value));
    check('фокус остался на слайдере', window.document.activeElement === vol);
  } else {
    check('слайдер громкости найден', false);
  }

  console.log('\n8. Ошибки за сессию');
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
