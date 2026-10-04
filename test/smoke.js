#!/usr/bin/env node
/**
 * Дымовой тест: гоняет собранный юзерскрипт по test/mock.html в jsdom.
 *
 * Проверяет ровно то, что нельзя проверить глазами без игры:
 *  - скрипт поднимается без исключений;
 *  - панель настроек монтируется в свой контейнер;
 *  - модули включаются и выключаются на лету;
 *  - после выключения не остаётся ни стилей, ни узлов;
 *  - игровой DOM (особенно чат) не тронут.
 *
 * jsdom ставится отдельно и в зависимостях проекта не числится:
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

  // Бандл вклеиваем прямо в разметку: у file:// в jsdom непрозрачный origin,
  // и localStorage там бросает SecurityError. Заодно не ходим в сеть.
  const bundle = fs.readFileSync(BUNDLE, 'utf8');
  // Замена функцией, а не строкой: в бандле есть последовательности вида $&,
  // которые String.replace со строкой раскрыл бы как совпадение.
  const html = fs.readFileSync(MOCK, 'utf8')
    .replace(/<script src="\.\.\/dist\/catwar-balconette\.user\.js"><\/script>/,
      () => '<script>\n' + bundle.replace(/<\/script>/gi, '<\\/script>') + '\n</script>');

  const dom = new JSDOM(html, {
    url: 'https://catwar.test/cw3/',
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

  console.log('\n1. Запуск скрипта');
  check('скрипт стартовал без исключений', pageErrors.length === 0, pageErrors.join(' | '));
  check('панель смонтирована в #cwb-root', !!$('#cwb-root'));
  check('#cwb-root — прямой потомок body', $('#cwb-root') && $('#cwb-root').parentElement === window.document.body);
  check('кнопка-шестерёнка есть', !!$('#cwb-root .cwb-gear'));
  check('панель закрыта по умолчанию', !!$('#cwb-root .cwb-overlay[hidden]'));

  console.log('\n2. Игровой DOM не тронут');
  check('#chat_msg на месте и виден', !!$('#tr_chat #chat_msg'));
  check('#chat_form не переехал', !!$('#tr_chat #chat_form'));
  check('input#text жив и внутри #chat_form', !!$('#chat_form #text'));
  check('в #app нет наших узлов', $('#app').querySelectorAll('[id^="cwb-"]').length === 0);

  function switchTab(id) {
    const btn = $('#cwb-root .cwb-tab[data-cwb-tab="' + id + '"]');
    if (!btn) throw new Error('не найдена вкладка ' + id);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }

  console.log('\n3. Открытие панели');
  $('#cwb-root .cwb-gear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  check('оверлей открылся', !$('#cwb-root .cwb-overlay').hidden);
  const tabNew = $('#cwb-root .cwb-tab[data-cwb-tab="new"]');
  const tabOverlay = $('#cwb-root .cwb-tab[data-cwb-tab="overlay"]');
  check('вкладка «Новые» на месте', !!(tabNew && /Новые/.test(tabNew.textContent)));
  check('вкладка «Надстройки над UwU» на месте', !!(tabOverlay && /Надстройки/.test(tabOverlay.textContent)));
  check('по умолчанию открыта «Новые»', tabNew && tabNew.getAttribute('aria-selected') === 'true');
  const cards = window.document.querySelectorAll('#cwb-root [data-cwb-mod]');
  check('на вкладке «Новые» есть карточки', cards.length >= 8, cards.length + ' шт.');
  check('ядро на вкладке «Новые»', !!$('#cwb-root [data-cwb-mod="__core"]'));
  check('уникальный модуль на «Новых»', !!$('#cwb-root [data-cwb-mod="history-autoscroll"]'));
  check('надстройка не на «Новых»', !$('#cwb-root [data-cwb-mod="climbing-field"]'));
  const coreOpts = $('#cwb-root [data-cwb-mod="__core"] .cwb-opts');
  check('опции ядра сразу видны', !!(coreOpts && !coreOpts.hidden));
  check('шестерёнки-аккордеона нет', !$('#cwb-root .cwb-mod-cog'));
  switchTab('overlay');
  await sleep(40);
  check('climbing-field на надстройках', !!$('#cwb-root [data-cwb-mod="climbing-field"]'));
  check('опции надстройки сразу видны', !!$('#cwb-root [data-cwb-mod="grid"] .cwb-opts'));
  switchTab('new');
  await sleep(40);

  console.log('\n4. Включение модулей');
  function toggleModule(id) {
    let input = $('#cwb-root [data-cwb-mod="' + id + '"] .cwb-sw input');
    if (!input) {
      switchTab('overlay');
      input = $('#cwb-root [data-cwb-mod="' + id + '"] .cwb-sw input');
    }
    if (!input) {
      switchTab('new');
      input = $('#cwb-root [data-cwb-mod="' + id + '"] .cwb-sw input');
    }
    if (!input) throw new Error('не найден переключатель модуля ' + id);
    input.checked = !input.checked;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  ['grid', 'always-day', 'clock', 'highlight-moves', 'hide-weather', 'hide-cat-tooltip', 'static-background', 'history-autoscroll', 'old-icons']
    .forEach(toggleModule);
  switchTab('overlay');
  await sleep(200);

  check('#cwb-style-grid вставлен', !!$('#cwb-style-grid'));
  check('правило сетки содержит td.cage', ($('#cwb-style-grid') || {}).textContent?.includes('td.cage'));
  check('#cwb-style-always-day содержит opacity:1',
    ($('#cwb-style-always-day') || {}).textContent?.includes('opacity: 1 !important'));
  check('виджет часов смонтирован', !!$('#cwb-clock'));
  check('часы вне #app', $('#cwb-clock') && !$('#app').contains($('#cwb-clock')));
  check('часы показывают время', /\d{1,2}:\d{2}/.test(($('#cwb-clock') || {}).textContent || ''));
  check('#cwb-style-hide-weather прячет #tr_sky',
    ($('#cwb-style-hide-weather') || {}).textContent?.includes('#tr_sky'));
  check('#cwb-style-hide-cat-tooltip прячет .cat_tooltip',
    ($('#cwb-style-hide-cat-tooltip') || {}).textContent?.includes('.cat_tooltip'));
  var mockTip = $('.cat_tooltip');
  check('окно «О коте» скрыто стилем',
    !!(mockTip && window.getComputedStyle(mockTip).display === 'none'));
  check('#cwb-style-old-icons сгенерирован', !!$('#cwb-style-old-icons'));
  check('настройки записались в localStorage', !!window.localStorage.getItem('cwb:mod.grid'));

  console.log('\n5. Изменение настройки на лету');
  const widthInput = $('#cwb-root [data-cwb-mod="grid"] .cwb-opts input[type=number]');
  if (widthInput) {
    widthInput.value = '4';
    widthInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(80);
    check('толщина сетки применилась', ($('#cwb-style-grid') || {}).textContent?.includes('0 0 0 4px'));
  } else {
    check('поле толщины найдено', false, 'контрол не отрисован');
  }

  console.log('\n5b. Настройки модулей всегда открыты');
  const clockCard = $('#cwb-root [data-cwb-mod="clock"]');
  const clockOpts = clockCard?.querySelector('.cwb-opts');
  check('настройки часов сразу видны', !!(clockOpts && !clockOpts.hidden));
  const clockFontInput = clockOpts?.querySelector('input[type=number]');
  if (clockFontInput) {
    clockFontInput.focus();
    clockFontInput.value = '22';
    clockFontInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(80);
    const clockOptsAfter = $('#cwb-root [data-cwb-mod="clock"] .cwb-opts');
    check('после смены fontSize опции часов на месте', !!(clockOptsAfter && !clockOptsAfter.hidden));
    check('фокус остался на поле fontSize', window.document.activeElement === clockOptsAfter?.querySelector('input[type=number]'));
  } else {
    check('поле fontSize часов найдено', false);
  }

  console.log('\n6. Поиск по модулям');
  const search = $('#cwb-root .cwb-search');
  search.value = 'часы';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(80);
  const found = window.document.querySelectorAll('#cwb-root [data-cwb-mod]');
  check('поиск отфильтровал список', found.length === 1 && found[0].dataset.cwbMod === 'clock',
    [...found].map((n) => n.dataset.cwbMod).join(','));
  search.value = '';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(80);

  console.log('\n7. Выключение модулей — чистота уборки');
  ['grid', 'always-day', 'clock', 'highlight-moves', 'hide-weather', 'hide-cat-tooltip', 'static-background', 'history-autoscroll', 'old-icons']
    .forEach(toggleModule);
  await sleep(200);

  const leftovers = [...window.document.querySelectorAll('style[id^="cwb-style-"]')]
    .map((n) => n.id)
    .filter((id) => id !== 'cwb-style-core-ui');
  check('не осталось модульных <style>', leftovers.length === 0, leftovers.join(', '));
  check('виджет часов снят', !$('#cwb-clock'));
  var tipAfter = $('.cat_tooltip');
  check('окно «О коте» снова видно',
    !!(tipAfter && window.getComputedStyle(tipAfter).display !== 'none'));
  check('стиль панели на месте', !!$('#cwb-style-core-ui'));

  console.log('\n8. Хранилище');
  const keys = Object.keys(window.localStorage).filter((k) => k.startsWith('cwb:'));
  check('ключи хранилища в неймспейсе cwb:', keys.length > 0, keys.length + ' шт.');
  check('чужой префикс cwa-da не задет', !keys.some((k) => k.includes('cwa-da')));

  console.log('\n9. Работа с Vue-стейтом');
  const vm = window.__mockVm;
  vm.weather.hour = 23;
  vm.weather.sky = 3;            // ночное небо, дневная пара — 1
  vm.cat.history = 'старт<br>';

  toggleModule('always-day');
  const daySkyInput = $('#cwb-root [data-cwb-mod="always-day"] .cwb-opts .cwb-sw input');
  daySkyInput.checked = true;
  daySkyInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(300);
  check('always-day подменил ночное небо на дневное', vm.weather.sky === 1, 'sky=' + vm.weather.sky);

  vm.weather.sky = 6;            // зимняя ночь -> 5
  await sleep(500);              // фейковый $watch опрашивает раз в 200 мс
  check('подмена работает и по watch', vm.weather.sky === 5, 'sky=' + vm.weather.sky);

  // Сетка должна гаснуть в режиме нюха: отличительного класса у таблицы нет,
  // признак — field.smellMap.
  toggleModule('grid');
  await sleep(150);
  check('сетка включена до нюха', !!$('#cwb-style-grid'));
  vm.field.smellMap = [[1, 0], [0, 1]];
  await sleep(500);
  check('в режиме нюха сетка снята', !$('#cwb-style-grid'));
  vm.field.smellMap = null;
  await sleep(500);
  check('после выхода из нюха сетка вернулась', !!$('#cwb-style-grid'));
  toggleModule('grid');

  toggleModule('history-autoscroll');
  await sleep(150);
  // jsdom не считает реальную геометрию, поэтому проверяем только,
  // что модуль нашёл контейнер и не свалился.
  vm.cat.history += 'новая запись<br>';
  await sleep(400);
  check('history-autoscroll отработал без ошибок', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  check('#ist по-прежнему на месте', !!$('#history_block #ist'));

  toggleModule('always-day');
  toggleModule('history-autoscroll');
  await sleep(150);
  check('после выключения стилей не осталось',
    !$('#cwb-style-always-day') && !$('#cwb-style-history-autoscroll'));

  console.log('\n10. Модули партии 2');
  var batch2 = [
    'mouth-cat-ids', 'mouth-item-ids', 'param-info', 'copy-id',
    'cell-coords', 'layout-swap', 'sounds', 'notifications', 'action-title',
    'climbing-field',
  ];
  batch2.forEach(toggleModule);
  await sleep(350);

  check('mouth-cat-ids пометил кота', !!$('#itemList .catrot[data-cwb-id="8001"]'));
  check('mouth-item-ids пометил предмет', !!$('#itemList .itemInMouth[data-cwb-label]'));
  check('layout-swap включён (compact)', !!$('#block_deys[data-cwb-layout-swap]'));
  var layoutStyle = $('#cwb-style-layout-swap');
  check('layout-swap CSS: селектор data-cwb-layout-swap',
    (layoutStyle || {}).textContent?.includes('[data-cwb-layout-swap]'));
  check('layout-swap CSS: правила compact',
    (layoutStyle || {}).textContent?.includes('#app.compact'));
  check('layout-swap CSS: правила обычного режима',
    (layoutStyle || {}).textContent?.includes('#app:not(.compact)'));

  // Обычный режим: та же структура #block_deys, но без класса compact на #app.
  var appEl = $('#app');
  var savedCompact = appEl.className;
  appEl.className = '';
  toggleModule('layout-swap');
  await sleep(120);
  check('layout-swap выключен после переключения', !$('#block_deys[data-cwb-layout-swap]'));
  toggleModule('layout-swap');
  await sleep(120);
  check('layout-swap включён (обычный режим)', !!$('#block_deys[data-cwb-layout-swap]'));
  appEl.className = savedCompact;
  await sleep(80);

  check('cell-coords стиль вставлен', !!$('#cwb-style-cell-coords'));

  // param-info: клик по навыку tree
  var treeBox = $('#tree');
  if (treeBox) {
    treeBox.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }));
    await sleep(80);
    check('param-info показал карточку', !!$('#cwb-param-info'));
    $('#cwb-param-info .cwb-param-close')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  } else {
    check('param-info: блок #tree найден', false);
  }

  // copy-id не должен глушить клик по иконке предмета (игровое меню).
  var mouthItem = $('#itemList .itemInMouth');
  var mouthClickReached = false;
  if (mouthItem) {
    mouthItem.addEventListener('click', function () { mouthClickReached = true; });
    mouthItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(80);
    check('copy-id не глушит клик по предмету', mouthClickReached);
    check('copy-id не ставит тост на иконке предмета', !$('#cwb-copy-toast') || $('#cwb-copy-toast').style.opacity === '0');
  }

  var idLine = window.document.querySelector('#thdey li');
  if (idLine) {
    idLine.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(80);
    check('copy-id копирует со строки Уникальный ID', !!$('#cwb-copy-toast'));
  }

  var origTitle = window.document.title;
  vm.cat.actionMess = 'Вылизаться';
  vm.cat.actionEnds = Math.floor(Date.now() / 1000) + 75;
  await sleep(200);
  check('action-title пишет остаток в заголовок', /мин|с \//.test(window.document.title) || /\d+\s*с/.test(window.document.title), window.document.title);
  vm.cat.actionMess = '';
  vm.cat.actionEnds = 0;
  await sleep(200);
  check('action-title возвращает заголовок', window.document.title === origTitle || window.document.title === 'Игровая / CatWar');

  var luPanel = $('#cwb-lu');
  check('climbing-field: панель на месте', !!luPanel);
  check('climbing-field: сетка 60 клеток', window.document.querySelectorAll('#cwb-lu-grid td').length === 60);
  await sleep(250);
  var luCell = window.document.querySelector('#cwb-lu-grid td[data-i="12"]');
  check('climbing-field: ярус с сервера попал в панель', !!(luCell && luCell.textContent === '4'));
  var fieldMark = window.document.querySelector('#cages td.cage[data-cwb-lu]');
  check('climbing-field: пометка на игровом поле', !!fieldMark);
  var fieldFill = window.document.querySelector('#cages td.cage[data-cwb-lu-fill]');
  check('climbing-field: data-атрибут заливки', !!fieldFill, fieldFill && fieldFill.getAttribute('data-cwb-lu-fill'));
  var luMineCell = window.document.querySelector('#cwb-lu-grid td[data-i="24"]');
  check('climbing-field: опасная клетка (tree<0) даёт X',
    !!(luMineCell && luMineCell.textContent === 'X'), luMineCell && luMineCell.textContent);
  var luDangerCss = window.document.querySelector('#cwb-lu-grid td[data-i="31"]');
  check('climbing-field: опаска things/564.png со стиля клетки даёт X',
    !!(luDangerCss && luDangerCss.textContent === 'X'), luDangerCss && luDangerCss.textContent);
  var luDangerType = window.document.querySelector('#cwb-lu-grid td[data-i="32"]');
  check('climbing-field: опаска cage.items.type=564 даёт X',
    !!(luDangerType && luDangerType.textContent === 'X'), luDangerType && luDangerType.textContent);
  var luTabs = window.document.querySelectorAll('#cwb-lu-tabs button[data-tab]');
  var luFields = window.document.querySelectorAll('#cwb-lu-fields button[data-field]');
  var luNavTitles = window.document.querySelectorAll('#cwb-lu-nav h3');
  check('climbing-field: вкладки на месте', luTabs.length >= 2, luTabs.length);
  check('climbing-field: поля/локации на месте', luFields.length >= 5, luFields.length);
  check('climbing-field: подписи Вкладка и Локация',
    luNavTitles.length >= 2 && luNavTitles[0].textContent === 'Вкладка' && luNavTitles[1].textContent === 'Локация',
    Array.prototype.map.call(luNavTitles, function (n) { return n.textContent; }).join('/'));
  var luStyle = $('#cwb-style-climbing-field');
  check('climbing-field: сетка фиксированной ширины как в uwu',
    !!(luStyle && luStyle.textContent.indexOf('table-layout:fixed') >= 0
      && luStyle.textContent.indexOf('width:250px') >= 0),
    luStyle && luStyle.textContent.slice(0, 80));
  var luTrain = $('#cwb-lu-train');
  check('climbing-field: кнопка Кач ЛУ на месте', !!luTrain);
  check('climbing-field: кач ЛУ включён по умолчанию', !!(luTrain && luTrain.classList.contains('active')));
  function fireMoveKey(key, target, type) {
    var ev = new window.KeyboardEvent(type || 'keydown', {
      key: key,
      code: 'Key' + String(key).toUpperCase(),
      bubbles: true,
      cancelable: true,
    });
    (target || window.document.body).dispatchEvent(ev);
    return ev;
  }
  function putCat(x, y) {
    vm.field.cats[1].x = x;
    vm.field.cats[1].y = y;
  }
  var mineField = window.document.querySelector('#cages td.cage[data-cwb-lu="X"]');
  var mineReached = false;
  if (mineField) {
    mineField.addEventListener('click', function () { mineReached = true; });
    var mineEv = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    mineField.dispatchEvent(mineEv);
    check('climbing-field: кач ЛУ глушит клик по мине', !mineReached && mineEv.defaultPrevented);
    check('climbing-field: опасная клетка помечена для блока', mineField.getAttribute('data-cwb-lu-block') === '1');
  } else {
    check('climbing-field: мина на игровом поле найдена', false);
  }
  var safeField = window.document.querySelector('#cages td.cage:not([data-cwb-lu-block])');
  var safeReached = false;
  if (safeField) {
    safeField.addEventListener('click', function () { safeReached = true; });
    safeField.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('climbing-field: кач ЛУ не глушит безопасную клетку', safeReached);
  } else {
    check('climbing-field: безопасная клетка для клика найдена', false);
  }
  // Кот в моке (2,2). (5,3) = tree<0, (2,4) = things/564.
  var safeWasd = fireMoveKey('w', window.document.body);
  check('climbing-field: кач ЛУ не глушит WASD на безопасную', !safeWasd.defaultPrevented);
  putCat(5, 2);
  var mineWasd = fireMoveKey('s', window.document.body);
  check('climbing-field: кач ЛУ глушит WASD на мину', mineWasd.defaultPrevented);
  var minePress = fireMoveKey('s', window.document.body, 'keypress');
  check('climbing-field: кач ЛУ глушит keypress на мину', minePress.defaultPrevented);
  putCat(4, 2);
  var mineDiag = fireMoveKey('x', window.document.body);
  check('climbing-field: кач ЛУ глушит диагональ QEZX на мину', mineDiag.defaultPrevented);
  putCat(2, 3);
  var mineThing = fireMoveKey('s', window.document.body);
  check('climbing-field: кач ЛУ глушит WASD на опаску 564', mineThing.defaultPrevented);
  var chatInput = $('#text');
  if (chatInput) {
    chatInput.focus();
    var chatWasd = fireMoveKey('s', chatInput);
    check('climbing-field: кач ЛУ не глушит клавиши в чате', !chatWasd.defaultPrevented);
  } else {
    check('climbing-field: input#text для проверки чата найден', false);
  }
  putCat(2, 2);
  if (luTrain) {
    luTrain.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(40);
    check('climbing-field: кач ЛУ выключается кнопкой', !luTrain.classList.contains('active'));
    mineReached = false;
    if (mineField) {
      mineField.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      check('climbing-field: без кача ЛУ клик по мине доходит', mineReached);
      check('climbing-field: без кача атрибут блока снят', mineField.getAttribute('data-cwb-lu-block') == null);
    }
    putCat(5, 2);
    var offWasd = fireMoveKey('s', window.document.body);
    check('climbing-field: без кача ЛУ WASD на мину доходит', !offWasd.defaultPrevented);
    putCat(2, 2);
    luTrain.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(40);
    check('climbing-field: кач ЛУ включается обратно', luTrain.classList.contains('active'));
  }
  if (luCell) {
    luCell.focus();
    luCell.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'X', bubbles: true }));
    await sleep(40);
    check('climbing-field: клавиша X ставит мину', luCell.textContent === 'X');
  }

  // Кот в моке на (2,2) → data-i="11". Треск из HAR: text "[треск]", volume = цифра.
  // onChatMessage лениво фиксирует длину ленты на первом изменении — прогреваем.
  var luCatCell = window.document.querySelector('#cwb-lu-grid td[data-i="11"]');
  check('climbing-field: маркер кота на панели',
    !!(luCatCell && luCatCell.getAttribute('data-cwb-here') === '1'));
  vm.chat.messages.unshift({ id: 2000, text: 'prime', login: 'X', volume: 1, cat: 2 });
  await sleep(400);
  var luCatBefore = luCatCell ? luCatCell.textContent : '';
  vm.chat.messages.unshift({
    id: 2001, text: '[треск]', login: 'ветвь Небесного дуба', volume: 3, mute: 1, cat: 1,
  });
  await sleep(400);
  check('climbing-field: [треск] ставит volume на клетку кота',
    !!(luCatCell && luCatCell.textContent === '3'), luCatCell && luCatCell.textContent);
  vm.chat.messages.unshift({ id: 2002, text: 'привет', login: 'Чужой', volume: 5, cat: 2 });
  await sleep(400);
  check('climbing-field: обычный чат не ставит цифру',
    !!(luCatCell && luCatCell.textContent === '3'));
  vm.chat.messages.unshift({ id: 2003, volume: 4, text: 'без кота' });
  await sleep(400);
  check('climbing-field: системное без [треск] не ставит цифру',
    !!(luCatCell && luCatCell.textContent === '3'), luCatBefore);
  vm.chat.messages.unshift({
    id: 2004, text: '[треск]', login: 'ветвь Небесного дуба', volume: 6, mute: 1, cat: 1,
  });
  await sleep(400);
  check('climbing-field: volume 6 остаётся шестёркой',
    !!(luCatCell && luCatCell.textContent === '6'), luCatCell && luCatCell.textContent);
  var errorEl = window.document.getElementById('error');
  if (errorEl) {
    errorEl.textContent = 'Я слышу очень громкий треск.';
    await sleep(200);
  }
  check('climbing-field: тост «очень громкий» не затирает 6 пятёркой',
    !!(luCatCell && luCatCell.textContent === '6'), luCatCell && luCatCell.textContent);

  var luEmpty = window.document.querySelector('#cwb-lu-grid td[data-i="0"]');
  if (luEmpty) {
    luEmpty.focus();
    luEmpty.dispatchEvent(new window.KeyboardEvent('keydown', { key: '7', bubbles: true }));
    await sleep(40);
    check('climbing-field: ручная пометка на пустой клетке', luEmpty.textContent === '7');
  } else {
    check('climbing-field: пустая клетка для карты найдена', false);
  }
  var storedMaps = window.localStorage.getItem('cwb:climbing-maps');
  check('climbing-field: карта пишется в localStorage', !!(storedMaps && storedMaps.indexOf('"7"') >= 0));
  vm.field.location = { name: 'Другая локация', bg: 2 };
  await sleep(80);
  luEmpty = window.document.querySelector('#cwb-lu-grid td[data-i="0"]');
  check('climbing-field: смена локации не сбрасывает карту', !!(luEmpty && luEmpty.textContent === '7'));
  var tab1 = window.document.querySelector('#cwb-lu-tabs button[data-tab="1"]');
  if (tab1) {
    tab1.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(80);
    luEmpty = window.document.querySelector('#cwb-lu-grid td[data-i="0"]');
    check('climbing-field: другая вкладка — своя карта', !!(luEmpty && luEmpty.textContent === ''));
    var tab0 = window.document.querySelector('#cwb-lu-tabs button[data-tab="0"]');
    if (tab0) tab0.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(80);
    luEmpty = window.document.querySelector('#cwb-lu-grid td[data-i="0"]');
    check('climbing-field: возврат на вкладку восстанавливает пометку', !!(luEmpty && luEmpty.textContent === '7'));
    var field1 = window.document.querySelector('#cwb-lu-fields button[data-field="1"]');
    if (field1) {
      field1.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await sleep(80);
      luEmpty = window.document.querySelector('#cwb-lu-grid td[data-i="0"]');
      check('climbing-field: другое поле — своя карта', !!(luEmpty && luEmpty.textContent === ''));
      var field0 = window.document.querySelector('#cwb-lu-fields button[data-field="0"]');
      if (field0) field0.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await sleep(80);
      luEmpty = window.document.querySelector('#cwb-lu-grid td[data-i="0"]');
      check('climbing-field: возврат на поле восстанавливает пометку', !!(luEmpty && luEmpty.textContent === '7'));
    } else {
      check('climbing-field: второе поле найдено', false);
    }
  } else {
    check('climbing-field: вторая вкладка найдена', false);
  }

  if ($('#cwb-root .cwb-overlay').hidden) {
    $('#cwb-root .cwb-gear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(40);
  }
  switchTab('overlay');
  await sleep(40);
  var mapsEditor = $('#cwb-root .cwb-maps-editor');
  check('climbing-field: редактор вкладок и полей сразу виден', !!mapsEditor);
  check('climbing-field: в редакторе есть Вкладки', !!(mapsEditor && mapsEditor.textContent.indexOf('Вкладки') >= 0));
  check('climbing-field: в редакторе есть Локации / Таблицы', !!(mapsEditor && mapsEditor.textContent.indexOf('Локации / Таблицы') >= 0));
  check('climbing-field: кнопка импорта карт UwU', !!(mapsEditor && /Импорт карт из UwU/.test(mapsEditor.textContent)));

  function luPointer(type, opts) {
    var init = Object.assign({
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
      button: 0, buttons: 0, clientX: 0, clientY: 0,
    }, opts || {});
    if (typeof window.PointerEvent === 'function') return new window.PointerEvent(type, init);
    var ev = new window.MouseEvent(type, init);
    ev.pointerId = init.pointerId;
    ev.pointerType = init.pointerType;
    ev.buttons = init.buttons;
    return ev;
  }

  var luHead = $('#cwb-lu-head');
  var luFold = $('#cwb-lu-fold');
  if (luPanel && luHead) {
    var leftBeforeHover = luPanel.style.left;
    luHead.dispatchEvent(luPointer('pointermove', { clientX: 240, clientY: 90, buttons: 0 }));
    check('climbing-field: hover по шапке не двигает панель', luPanel.style.left === leftBeforeHover);

    luPanel.style.left = '40px';
    luPanel.style.top = '80px';
    luPanel.style.right = 'auto';
    luHead.dispatchEvent(luPointer('pointerdown', { clientX: 50, clientY: 90, buttons: 1 }));
    window.document.dispatchEvent(luPointer('pointermove', { clientX: 90, clientY: 110, buttons: 1 }));
    check('climbing-field: drag только при зажатой ЛКМ', luPanel.style.left === '80px', luPanel.style.left);
    window.document.dispatchEvent(luPointer('pointerup', { clientX: 90, clientY: 110, buttons: 0 }));
    var leftAfterUp = luPanel.style.left;
    window.document.dispatchEvent(luPointer('pointermove', { clientX: 200, clientY: 200, buttons: 0 }));
    check('climbing-field: pointerup отпускает drag', luPanel.style.left === leftAfterUp);

    luHead.dispatchEvent(luPointer('pointerdown', { clientX: 50, clientY: 90, buttons: 1 }));
    window.document.dispatchEvent(luPointer('pointercancel', { clientX: 50, clientY: 90, buttons: 0 }));
    var leftAfterCancel = luPanel.style.left;
    window.document.dispatchEvent(luPointer('pointermove', { clientX: 300, clientY: 300, buttons: 0 }));
    check('climbing-field: pointercancel отпускает drag', luPanel.style.left === leftAfterCancel);

    if (luFold) {
      var leftBeforeFold = luPanel.style.left;
      luFold.dispatchEvent(luPointer('pointerdown', { clientX: 50, clientY: 90, buttons: 1 }));
      window.document.dispatchEvent(luPointer('pointermove', { clientX: 140, clientY: 140, buttons: 1 }));
      check('climbing-field: кнопка сворачивания не начинает drag', luPanel.style.left === leftBeforeFold);
    }
  } else {
    check('climbing-field: шапка для drag найдена', false);
  }

  toggleModule('climbing-field');
  await sleep(120);
  toggleModule('climbing-field');
  await sleep(350);
  luEmpty = window.document.querySelector('#cwb-lu-grid td[data-i="0"]');
  check('climbing-field: после перезапуска модуля карта на месте',
    !!(luEmpty && luEmpty.textContent === '7'), luEmpty && luEmpty.textContent);

  vm.game.notReadMess = 1;
  await sleep(400);
  check('sounds/notifications: рост notReadMess без ошибок', pageErrors.length === 0);

  vm.chat.messages.unshift({ id: 999, text: '<span class="myname">Мок</span>', cat: 2, login: 'X' });
  await sleep(400);
  check('упоминание в чате без ошибок', pageErrors.length === 0);

  console.log('\n10b. skill-fractions');
  toggleModule('skill-fractions');
  await sleep(250);
  check('skill-fractions: стиль вставлен', !!$('#cwb-style-skill-fractions'));
  var treeFrac = $('#tree .bar-data[data-cwb-skill-fraction]');
  check('skill-fractions: дробь на #tree', !!(treeFrac && treeFrac.textContent === '5/20'), treeFrac && treeFrac.textContent);
  check('skill-fractions: подпись не перехватывает клики',
    treeFrac && window.getComputedStyle(treeFrac).pointerEvents === 'none');
  var sfSelect = $('#cwb-root [data-cwb-mod="skill-fractions"] select');
  if (sfSelect) {
    sfSelect.value = 'level+fraction';
    sfSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(200);
    treeFrac = $('#tree .bar-data[data-cwb-skill-fraction]');
    check('skill-fractions: формат уровень+дробь',
      !!(treeFrac && /3/.test(treeFrac.textContent) && /5\/20/.test(treeFrac.textContent)),
      treeFrac && treeFrac.textContent);
  } else {
    check('skill-fractions: селект формата найден', false);
  }
  vm.parameter.data.tree.tooltip = 'Лазание (12/20)';
  await sleep(350);
  treeFrac = $('#tree .bar-data[data-cwb-skill-fraction]');
  check('skill-fractions: обновление по watch',
    !!(treeFrac && /12\/20/.test(treeFrac.textContent)), treeFrac && treeFrac.textContent);
  toggleModule('skill-fractions');
  await sleep(200);
  check('skill-fractions: узлы сняты', !$('#tree .bar-data[data-cwb-skill-fraction]'));
  check('skill-fractions: стиль снят', !$('#cwb-style-skill-fractions'));

  batch2.forEach(toggleModule);
  await sleep(250);
  check('batch2: стили сняты', !$('#cwb-style-mouth-cat-ids') && !$('#cwb-style-cell-coords'));
  check('batch2: layout-swap снят', !$('#block_deys[data-cwb-layout-swap]'));
  check('batch2: карточка param-info снята', !$('#cwb-param-info'));

  console.log('\n10c. Совместимость с UwU');
  window.confirm = function () { return true; };
  window.alert = function () {};
  window.localStorage.setItem('uwu_settings', JSON.stringify({
    alwaysDay: true,
    cellsBorders: true,
    duplicateTimeInBrowserTab: true,
    showExactSkillsValues: true,
    describeHuntingSmell: true,
    climbingPanel: true,
  }));
  window.localStorage.setItem('uwu_fastStyles', JSON.stringify({
    hideCatTooltip: true,
    hideSky: true,
  }));
  var uwuGrid = [];
  for (var uy = 0; uy < 6; uy++) {
    uwuGrid[uy] = [];
    for (var ux = 0; ux < 10; ux++) {
      uwuGrid[uy][ux] = { value: uy === 0 && ux === 0 ? '7' : '' };
    }
  }
  window.localStorage.setItem('uwu_climbingPanelState', JSON.stringify({
    currentTabIndex: 0,
    tabs: [{
      name: 'UwU вкладка',
      currentTableId: 0,
      tables: [{ name: 'UwU поле', data: uwuGrid }],
    }],
  }));
  if ($('#cwb-root .cwb-overlay').hidden) {
    $('#cwb-root .cwb-gear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(40);
  }
  switchTab('new');
  await sleep(20);
  switchTab('overlay');
  await sleep(60);
  var banner = $('#cwb-root .cwb-uwu-banner');
  check('баннер видит UwU', !!(banner && /UwU рядом/.test(banner.textContent)),
    banner && banner.textContent);
  ['hide-cat-tooltip', 'always-day', 'grid'].forEach(toggleModule);
  await sleep(80);
  check('hide-cat-tooltip не дублирует CSS UwU', !$('#cwb-style-hide-cat-tooltip'));
  check('always-day не дублирует CSS UwU', !$('#cwb-style-always-day'));
  check('grid не дублирует CSS UwU', !$('#cwb-style-grid'));
  var importBtn = [...window.document.querySelectorAll('#cwb-root .cwb-maps-editor button')]
    .find((b) => /Импорт карт из UwU/.test(b.textContent));
  if (importBtn) {
    importBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(80);
    var imported = window.localStorage.getItem('cwb:climbing-maps');
    check('импорт карт UwU пишет в cwb:climbing-maps',
      !!(imported && imported.indexOf('UwU вкладка') >= 0 && imported.indexOf('"7"') >= 0));
    check('импорт не пишет в стор UwU', !!window.localStorage.getItem('uwu_climbingPanelState'));
  } else {
    check('кнопка импорта карт UwU найдена', false);
  }
  ['hide-cat-tooltip', 'always-day', 'grid'].forEach(toggleModule);

  console.log('\n10d. Редирект catwar.net');
  switchTab('new');
  await sleep(40);
  check('domain-redirect на «Новых»', !!$('#cwb-root [data-cwb-mod="domain-redirect"]'));
  var redirSw = $('#cwb-root [data-cwb-mod="domain-redirect"] .cwb-sw input');
  check('domain-redirect включён по умолчанию', !!(redirSw && redirSw.checked));

  var netLink = window.document.createElement('a');
  netLink.setAttribute('href', 'https://catwar.net/cw3/probe');
  window.document.body.appendChild(netLink);
  await sleep(40);
  check('observer переписал href .net → .su',
    netLink.getAttribute('href') === 'https://catwar.su/cw3/probe',
    netLink.getAttribute('href'));

  var netImg = window.document.createElement('img');
  netImg.setAttribute('src', 'https://catwar.net/x.png');
  window.document.body.appendChild(netImg);
  await sleep(40);
  check('observer переписал src', netImg.getAttribute('src') === 'https://catwar.su/x.png',
    netImg.getAttribute('src'));

  var netSet = window.document.createElement('img');
  netSet.setAttribute('srcset', 'https://catwar.net/a.png 1x, https://catwar.net/b.png 2x');
  window.document.body.appendChild(netSet);
  await sleep(40);
  check('observer переписал srcset',
    netSet.getAttribute('srcset') === 'https://catwar.su/a.png 1x, https://catwar.su/b.png 2x',
    netSet.getAttribute('srcset'));

  var netStyle = window.document.createElement('div');
  netStyle.setAttribute('style', 'background:url(https://catwar.net/bg.jpg)');
  window.document.body.appendChild(netStyle);
  await sleep(40);
  var styleVal = netStyle.getAttribute('style') || '';
  check('observer переписал style', /catwar\.su/.test(styleVal) && !/catwar\.net/.test(styleVal), styleVal);

  netLink.setAttribute('href', 'https://catwar.net/click-me');
  netLink.addEventListener('click', function (e) { e.preventDefault(); });
  netLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  check('клик переписал href', netLink.getAttribute('href') === 'https://catwar.su/click-me',
    netLink.getAttribute('href'));

  try {
    window.open('https://catwar.net/popup');
    check('window.open не бросил', true);
  } catch (e) {
    check('window.open не бросил', false, String(e && e.message || e));
  }

  try {
    var xhr = new window.XMLHttpRequest();
    xhr.open('GET', 'https://catwar.net/api/ping');
    check('XHR.open не бросил', true);
  } catch (e) {
    check('XHR.open не бросил', false, String(e && e.message || e));
  }

  toggleModule('domain-redirect');
  await sleep(40);
  var leftoverLink = window.document.createElement('a');
  leftoverLink.setAttribute('href', 'https://catwar.net/after-off');
  window.document.body.appendChild(leftoverLink);
  await sleep(40);
  check('после выключения новые href не трогаем',
    leftoverLink.getAttribute('href') === 'https://catwar.net/after-off',
    leftoverLink.getAttribute('href'));
  leftoverLink.remove();
  netLink.remove();
  netImg.remove();
  netSet.remove();
  netStyle.remove();

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
