#!/usr/bin/env node
/**
 * Дымовой тест полного бандла CatWar Balconette v0.2.0 (11 модулей, одна страница).
 *
 * jsdom ставится отдельно:
 *   npm i --no-save jsdom && node test/smoke.js
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
const BUNDLE = path.join(__dirname, '..', 'dist', 'catwar-balconette.user.js');

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

  console.log('\n1. Запуск полного бандла');
  check('скрипт стартовал без исключений', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('панель смонтирована в #cwb-root', !!$('#cwb-root'));
  check('#cwb-root — прямой потомок body', $('#cwb-root') && $('#cwb-root').parentElement === window.document.body);
  check('кнопка-шестерёнка есть', !!$('#cwb-root .cwb-gear'));
  check('панель закрыта по умолчанию', !!$('#cwb-root .cwb-overlay[hidden]'));

  console.log('\n2. Игровой DOM не тронут');
  check('#chat_msg на месте и виден', !!$('#tr_chat #chat_msg'));
  check('#chat_form не переехал', !!$('#tr_chat #chat_form'));
  check('input#text жив и внутри #chat_form', !!$('#chat_form #text'));
  check('в #app нет наших узлов', $('#app').querySelectorAll('[id^="cwb-"]').length === 0);

  console.log('\n3. Открытие панели — одна страница');
  $('#cwb-root .cwb-gear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  check('оверлей открылся', !$('#cwb-root .cwb-overlay').hidden);
  check('табов нет', $$('#cwb-root .cwb-tab').length === 0);
  check('примечания к табам нет', !$('#cwb-root .cwb-tab-note'));
  check('uwu-баннера нет', !$('#cwb-root .cwb-uwu-banner'));
  check('кнопок "Сбросить настройки" нет',
    $$('#cwb-root .cwb-btn').every((b) => !/Сбросить настройки/.test(b.textContent)));
  check('карточка «Ядро» на месте', !!$('#cwb-root [data-cwb-mod="__core"]'));

  console.log('\n4. Состав модулей (11 шт.)');
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

  console.log('\n5. Карточка «Ядро»');
  const coreCard = $('#cwb-root [data-cwb-mod="__core"]');
  const coreText = coreCard ? coreCard.textContent : '';
  check('ядро: есть «Уровень логов в консоли»', /Уровень логов в консоли/.test(coreText));
  check('ядро: нет «Положение кнопки настроек»', !/Положение кнопки настроек/.test(coreText));
  check('ядро: нет «Спрятать кнопку-шестерёнку»', !/Спрятать кнопку-шестерёнку/.test(coreText));
  check('ядро: нет «Открывать панель по Ctrl\+Alt\+B»', !/Открывать панель по Ctrl\+Alt\+B/.test(coreText));
  check('ядро: нет «Хук игрового сокета»', !/Хук игрового сокета/.test(coreText));

  console.log('\n6. Срезы схем');
  function hasOpts(id) { return !!$('#cwb-root [data-cwb-mod="' + id + '"] .cwb-opts'); }
  function optsText(id) {
    var el = $('#cwb-root [data-cwb-mod="' + id + '"] .cwb-opts');
    return el ? el.textContent : '';
  }
  check('cell-coords без подпунктов', !hasOpts('cell-coords'));
  check('old-icons без подпунктов', !hasOpts('old-icons'));
  check('history-autoscroll без подпунктов', !hasOpts('history-autoscroll'));
  check('domain-redirect без подпунктов', !hasOpts('domain-redirect'));

  const hw = optsText('hide-weather');
  check('hide-weather: есть «Полоска температуры»', /Полоска температуры/.test(hw));
  check('hide-weather: есть «Иконка игрового часа»', /Иконка игрового часа/.test(hw));
  check('hide-weather: есть «Иконка сезона»', /Иконка сезона/.test(hw));
  check('hide-weather: нет «Небо над полем»', !/Небо над полем/.test(hw));
  check('hide-weather: нет «Вся строка погоды»', !/Вся строка погоды/.test(hw));

  const bg = optsText('static-background');
  check('static-background: есть режим/цвет/ссылка',
    /Чем заменить/.test(bg) && /Цвет/.test(bg) && /Ссылка на картинку/.test(bg));
  check('static-background: нет «Что менять»', !/Что менять/.test(bg));
  check('static-background: нет «Отключить сезонный скин»', !/Отключить сезонный скин/.test(bg));

  const notif = optsText('notifications');
  check('notifications: есть «Новое личное сообщение»', /Новое личное сообщение/.test(notif));
  check('notifications: есть «Упоминание в чате»', /Упоминание в чате/.test(notif));
  check('notifications: есть «Громкость звука»', /Громкость звука/.test(notif));
  check('notifications: есть «Проверить звук»', /Проверить звук/.test(notif));
  check('notifications: есть «Запросить разрешение»', /Запросить разрешение/.test(notif));
  check('notifications: нет «звук при уведомлении»', !/звук при уведомлении/i.test(notif));
  check('notifications: нет «мигать заголовком»', !/мигать заголовком/i.test(notif));

  const lu = optsText('climbing-field');
  check('climbing-field: есть «Кач ЛУ: не нажимать на опасные клетки"', /Кач ЛУ: не нажимать на опасные клетки/.test(lu));
  check('climbing-field: есть «Ставить цифру в клетку кота по треску в чате»', /Ставить цифру в клетку кота по треску в чате/.test(lu));
  check('climbing-field: есть редактор вкладок', /Вкладки и поля/.test(lu));
  check('climbing-field: нет «Живая карта UwU»', !/Живая карта UwU/.test(lu));
  check('climbing-field: нет «Подтягивать ярусы»', !/Подтягивать ярусы/.test(lu));
  check('climbing-field: нет «Своё лазание в шапке»', !/лазание в шапке/.test(lu));
  check('climbing-field: нет «Очищать текущее поле»', !/Очищать текущее поле/.test(lu));

  console.log('\n7. Редиректы');
  const redirSw = $('#cwb-root [data-cwb-mod="domain-redirect"] .cwb-sw input');
  check('domain-redirect включён по умолчанию', !!(redirSw && redirSw.checked));
  const revSw = $('#cwb-root [data-cwb-mod="domain-redirect-reverse"] .cwb-sw input');
  check('domain-redirect-reverse выключен по умолчанию', !!(revSw && !revSw.checked));

  var netLink = window.document.createElement('a');
  netLink.setAttribute('href', 'https://catwar.net/cw3/test');
  window.document.body.appendChild(netLink);
  await sleep(80);
  check('observer переписал href .net → .su',
    netLink.getAttribute('href') === 'https://catwar.su/cw3/test',
    netLink.getAttribute('href'));
  netLink.remove();

  console.log('\n8. Включение / выключение модулей');
  function toggleModule(id) {
    var input = $('#cwb-root [data-cwb-mod="' + id + '"] .cwb-sw input');
    if (!input) throw new Error('не найден переключатель модуля ' + id);
    input.checked = !input.checked;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  toggleModule('climbing-field');
  await sleep(250);
  check('climbing-field: панель #cwb-lu появилась', !!$('#cwb-lu'));
  check('climbing-field: сетка 60 клеток', $$('#cwb-lu-grid td').length === 60);
  check('climbing-field: кнопка «Кач ЛУ» есть', !!$('#cwb-lu-train'));
  check('climbing-field: чекбокс «Переносить на игровую» есть', !!$('#cwb-lu-overlay input'));
  check('climbing-field: чекбокс включён по умолчанию', !!($('#cwb-lu-overlay input') && $('#cwb-lu-overlay input').checked));
  toggleModule('climbing-field');
  await sleep(150);
  check('climbing-field: панель снята', !$('#cwb-lu'));

  toggleModule('old-icons');
  await sleep(100);
  check('old-icons: стиль вставлен', !!$('#cwb-style-old-icons'));
  toggleModule('old-icons');
  await sleep(100);
  check('old-icons: стиль снят', !$('#cwb-style-old-icons'));

  toggleModule('history-autoscroll');
  await sleep(150);
  var vm = window.__mockVm;
  vm.cat.history += 'запись<br>';
  await sleep(400);
  check('history-autoscroll: ошибок нет', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  toggleModule('history-autoscroll');
  await sleep(100);

  console.log('\n9. Живые контролы');
  var vol = $('#cwb-root [data-cwb-mod="notifications"] .cwb-opts input[type=range]');
  check('слайдер громкости найден', !!vol, vol && (vol.min + '..' + vol.max));
  if (vol) {
    vol.focus();
    vol.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(60);
    var volAfter = $('#cwb-root [data-cwb-mod="notifications"] .cwb-opts input[type=range]');
    check('слайдер громкости не пересоздан после input', volAfter === vol);
    check('фокус остался на слайдере', window.document.activeElement === vol);
  }

  console.log('\n10. Хранилище');
  var keys = Object.keys(window.localStorage).filter((k) => k.startsWith('cwb:'));
  check('ключи хранилища в неймспейсе cwb:', keys.length > 0, keys.length + ' шт.');
  check('чужой префикс cwa-da не задет', !keys.some((k) => k.includes('cwa-da')));

  console.log('\n11. Ошибки за сессию');
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
