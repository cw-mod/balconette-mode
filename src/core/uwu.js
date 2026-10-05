/**
 * Совместимость с CatWar UwU: только чтение.
 *
 * Чужой GM_* из их песочницы Tampermonkey недоступен. Читаем localStorage
 * ключи `uwu_*` и ищем их узлы в DOM. В их стор не пишем.
 */

var log = require('core/log').create('uwu');

var STORE_KEYS = [
  'uwu_settings',
  'uwu_fastStyles',
  'uwu_fastStyles_hideCatTooltip',
  'uwu_climbingPanelState',
  'uwu_climbingPanelStatus',
  'uwu_clock',
  'uwu_layoutSettings',
];

var DOM_IDS = [
  'uwusettings',
  'uwu-climbingMainPanel',
  'uwu-climbingPanel',
  'uwu-clock',
  'uwu-fast-style-hideCatTooltip',
  'uwu-fast-style-hideSky',
  'cellsBordersStyle',
];

/**
 * Модули, у которых в UwU есть прямой аналог. Остальные — вкладка «Новые».
 * hint показывается в карточке надстройки.
 */
var OVERLAY = {
  'always-day': {
    hint: 'В UwU — «Всегда день/ярко». Дневное небо — наше. Если у них уже включено, наше поле не трогаем.',
  },
  'grid': {
    hint: 'В UwU — «Границы клеток». Если они включены, нашу сетку не рисуем.',
  },
  'static-background': {
    hint: 'В UwU — «Статичный фон локации». Если он включён, фон поля не трогаем, фон страницы остаётся нашим.',
  },
  'hide-weather': {
    hint: 'В UwU быстрый стиль «Скрыть небо». Если небо уже спрятано, наше не дублируем.',
  },
  'hide-cat-tooltip': {
    hint: 'В UwU есть быстрый стиль «скрыть окно О коте». Если уже скрыто, наше не вешаем.',
  },
  'clock': {
    hint: 'В UwU — свои часы. Два виджета сразу налезают друг на друга: выключи одни.',
  },
  'action-title': {
    hint: 'В UwU — «Дублировать время в заголовке вкладки». Если оно включено, заголовок не трогаем.',
  },
  'skill-fractions': {
    hint: 'В UwU — «Точные значения навыков». Если включено, наши дроби не рисуем.',
  },
  'param-info': {
    hint: 'В UwU — «Подробные параметры» (кнопка над блоком). Наша карточка по клику на навык — рядом, не вместо.',
  },
  'sounds': {
    hint: 'В UwU свой набор звуков (ЛС, конец действия, рот, блок). В их настройки не лезем. Если оба мода включены, звуки могут наложиться — выключи дубли там или здесь.',
  },
  'hunt-smell-square': {
    hint: 'В UwU — «Описывать запах на охоте». Если включено, нашу подсказку не вешаем.',
  },
  'climbing-field': {
    hint: 'В UwU — «Минное поле». Кач ЛУ, цифра из [треск] и автоярусы — наши. Поле красим из нашей карты, даже если у них включён перенос. Карты можно забрать из их localStorage.',
  },
};

function readLocal(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

/** UwU кладёт в localStorage JSON.stringify(value). Иногда строка ещё раз обёрнута. */
function readJson(key) {
  var raw = readLocal(key);
  if (raw == null || raw === '') return null;
  try {
    var val = JSON.parse(raw);
    if (typeof val === 'string') {
      try { val = JSON.parse(val); } catch (e2) { /* оставить строку */ }
    }
    return val;
  } catch (e) {
    log.debug('не разобрали', key);
    return null;
  }
}

function settings() {
  var s = readJson('uwu_settings');
  return s && typeof s === 'object' ? s : {};
}

function fastStyles() {
  var s = readJson('uwu_fastStyles');
  return s && typeof s === 'object' ? s : {};
}

function setting(key) {
  return !!settings()[key];
}

function fastStyle(key) {
  if (fastStyles()[key]) return true;
  // старый одиночный ключ
  if (key === 'hideCatTooltip' && readLocal('uwu_fastStyles_hideCatTooltip')) return true;
  return false;
}

function hasDom() {
  for (var i = 0; i < DOM_IDS.length; i++) {
    if (document.getElementById(DOM_IDS[i])) return true;
  }
  return !!document.querySelector('[id^="uwu-"], [class*="uwu-"]');
}

function hasStore() {
  for (var i = 0; i < STORE_KEYS.length; i++) {
    if (readLocal(STORE_KEYS[i]) != null) return true;
  }
  try {
    var ls = window.localStorage;
    for (var j = 0; j < ls.length; j++) {
      var k = ls.key(j);
      if (k && k.indexOf('uwu_') === 0) return true;
    }
  } catch (e) { /* noop */ }
  return false;
}

function present() {
  return hasDom() || hasStore();
}

function sourceLabel() {
  var dom = hasDom();
  var store = hasStore();
  if (dom && store) return 'DOM и localStorage';
  if (dom) return 'DOM';
  if (store) return 'localStorage';
  return '';
}

function hidingCatTooltip() {
  return fastStyle('hideCatTooltip') || !!document.getElementById('uwu-fast-style-hideCatTooltip');
}

function hidingSky() {
  return fastStyle('hideSky') || !!document.getElementById('uwu-fast-style-hideSky');
}

function hasAlwaysDay() {
  return setting('alwaysDay');
}

function hasCellBorders() {
  return setting('cellsBorders') || !!document.getElementById('cellsBordersStyle');
}

function hasFieldBackground() {
  return setting('gameFieldBackgroundUser');
}

function hasTitleTimer() {
  return setting('duplicateTimeInBrowserTab');
}

function hasExactSkills() {
  return setting('showExactSkillsValues');
}

function hasHuntSmell() {
  return setting('describeHuntingSmell');
}

function transferringClimbing() {
  var box = document.getElementById('uwu-transferCheckbox');
  if (box) return !!box.checked;
  var status = readJson('uwu_climbingPanelStatus');
  return !!(status && status.isChecked);
}

function hasClimbingPanel() {
  return setting('climbingPanel') || !!document.getElementById('uwu-climbingMainPanel');
}

function isOverlay(id) {
  return !!OVERLAY[id];
}

function tabOf(mod) {
  if (!mod) return 'new';
  if (mod.compat === 'overlay' || mod.compat === 'new') return mod.compat;
  return isOverlay(mod.id) ? 'overlay' : 'new';
}

function hintFor(id) {
  var meta = OVERLAY[id];
  if (!meta) return '';
  var parts = [meta.hint];
  if (!present()) return parts.join(' ');
  if (id === 'hide-cat-tooltip' && hidingCatTooltip()) {
    parts.push('Сейчас UwU уже скрыл «О коте» — наше не вешаем.');
  }
  if (id === 'always-day' && hasAlwaysDay()) {
    parts.push('Сейчас UwU уже держит поле ярким — наше не дублируем.');
  }
  if (id === 'grid' && hasCellBorders()) {
    parts.push('Сейчас у UwU включены границы клеток — нашу сетку не вешаем.');
  }
  if (id === 'hide-weather' && hidingSky()) {
    parts.push('Сейчас UwU уже скрыл небо.');
  }
  if (id === 'static-background' && hasFieldBackground()) {
    parts.push('Сейчас фон локации задаёт UwU — поле не трогаем.');
  }
  if (id === 'action-title' && hasTitleTimer()) {
    parts.push('Сейчас заголовок пишет UwU — наш таймер выключен.');
  }
  if (id === 'skill-fractions' && hasExactSkills()) {
    parts.push('Сейчас дроби рисует UwU — наши не дублируем.');
  }
  if (id === 'hunt-smell-square' && hasHuntSmell()) {
    parts.push('Сейчас подсказку запаха рисует UwU.');
  }
  if (id === 'climbing-field' && transferringClimbing()) {
    parts.push('У UwU включён перенос — поле всё равно красим из нашей карты.');
  }
  if (id === 'clock' && (setting('showClock') || document.getElementById('uwu-clock'))) {
    parts.push('Рядом уже есть часы UwU.');
  }
  return parts.filter(Boolean).join(' ');
}

/** JSON.parse до трёх раз: UwU иногда кладёт уже строку, а экспорт — строку строки. */
function parseMaybe(value) {
  var v = value;
  var n;
  for (n = 0; n < 3 && typeof v === 'string'; n++) {
    var s = v.trim();
    if (!s) return null;
    try { v = JSON.parse(s); } catch (e) { return null; }
  }
  return v;
}

/** Массив, строка с JSON-массивом или объект с ключами "0","1",… */
function asList(value) {
  var v = typeof value === 'string' ? parseMaybe(value) : value;
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  var keys = Object.keys(v).filter(function (k) { return /^\d+$/.test(k); });
  if (!keys.length) return [];
  keys.sort(function (a, b) { return Number(a) - Number(b); });
  var list = [];
  for (var i = 0; i < keys.length; i++) list.push(v[keys[i]]);
  return list;
}

function cellText(cell) {
  var v = cell;
  if (v && typeof v === 'object') {
    if (v.value != null) v = v.value;
    else if (v.val != null) v = v.val;
    else return '';
  }
  if (typeof v === 'number' && isFinite(v)) v = String(v);
  return typeof v === 'string' ? v : '';
}

function isCellRow(item) {
  if (Array.isArray(item)) return true;
  var nested = asList(item);
  return nested.length > 1;
}

/**
 * Сетка UwU: 6 рядов по 10 клеток `{ value }`, либо плоский список из 60.
 * «mine» / «transit» оставляем как есть — панель сама рисует X и =.
 */
function flattenUwuTable(data) {
  var src = typeof data === 'string' ? parseMaybe(data) : data;
  var flat = [];
  var y;
  var x;
  if (Array.isArray(src) && src.length === 60 && !isCellRow(src[0])) {
    for (x = 0; x < 60; x++) flat.push(cellText(src[x]));
    return flat;
  }
  var rows = asList(src);
  if (!rows.length) return flat;
  for (y = 0; y < 6; y++) {
    var cells = asList(rows[y]);
    for (x = 0; x < 10; x++) flat.push(cellText(cells[x]));
  }
  return flat;
}

function tableName(t, j) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return 'Поле ' + (j + 1);
  var name = t.name || t.title || t.location || t.label;
  name = name == null ? '' : String(name).trim();
  return name || ('Поле ' + (j + 1));
}

function clampIndex(n, len) {
  if (typeof n !== 'number' || n < 0 || n >= len) return 0;
  return n;
}

/**
 * Состояние панели или весь экспорт настроек UwU
 * (`{ uwu_climbingPanelState, uwu_climbingPanelStatus, ... }`).
 */
function mapsFromUnknown(value, statusFallback) {
  var val = parseMaybe(value);
  if (!val || typeof val !== 'object') return null;
  var state = val;
  var status = statusFallback || null;
  if (val.uwu_climbingPanelState != null) {
    state = parseMaybe(val.uwu_climbingPanelState);
    if (!status && val.uwu_climbingPanelStatus != null) status = parseMaybe(val.uwu_climbingPanelStatus);
  }
  if (!state || typeof state !== 'object') return null;
  var tabList = asList(state.tabs);
  if (!tabList.length) return null;

  var currentTab = typeof state.currentTabIndex === 'number' ? state.currentTabIndex
    : typeof state.currentTab === 'number' ? state.currentTab : 0;
  var liveTable = typeof state.currentTableId === 'number' ? state.currentTableId : null;
  if (status && typeof status === 'object') {
    if (typeof status.currentTabIndex === 'number') currentTab = status.currentTabIndex;
    if (typeof status.currentTableId === 'number') liveTable = status.currentTableId;
  }

  var tabs = tabList.map(function (tab, i) {
    var tables = [];
    asList(tab && tab.tables).forEach(function (t, j) {
      var gridSrc = t && (t.data != null ? t.data : t.grid != null ? t.grid : t.cells);
      tables.push({
        name: tableName(t, j),
        grid: flattenUwuTable(gridSrc),
      });
    });
    if (!tables.length) tables.push({ name: 'Поле 1', grid: flattenUwuTable(null) });
    var currentTable = typeof tab.currentTableId === 'number' ? tab.currentTableId
      : typeof tab.currentTable === 'number' ? tab.currentTable : 0;
    if (i === currentTab && liveTable != null) currentTable = liveTable;
    currentTable = clampIndex(currentTable, tables.length);
    return {
      name: String((tab && tab.name) || ('Вкладка ' + (i + 1))).trim() || ('Вкладка ' + (i + 1)),
      currentTable: currentTable,
      tables: tables,
    };
  });
  currentTab = clampIndex(currentTab, tabs.length);
  return { version: 2, currentTab: currentTab, tabs: tabs };
}

function climbingMapsHaveMarks(maps) {
  if (!maps || !Array.isArray(maps.tabs)) return false;
  for (var i = 0; i < maps.tabs.length; i++) {
    var tables = maps.tabs[i].tables || [];
    for (var j = 0; j < tables.length; j++) {
      var grid = tables[j].grid || [];
      for (var k = 0; k < grid.length; k++) {
        if (grid[k]) return true;
      }
    }
  }
  return false;
}

/**
 * Карты минника UwU → наш формат cwb:climbing-maps.
 * Сначала localStorage. Если на странице открыты настройки UwU и в поле
 * «Экспорт» клеток больше (единое хранилище не пишет свежие карты в localStorage),
 * берём экспорт. Ничего не пишет: вызывающий сам кладёт в наш стор.
 */
function importClimbingMaps() {
  var fromStore = mapsFromUnknown(readJson('uwu_climbingPanelState'), readJson('uwu_climbingPanelStatus'));
  var fromDom = null;
  try {
    var field = document.getElementById('exportSettings');
    if (field && field.value) fromDom = mapsFromUnknown(field.value);
  } catch (e) { /* нет DOM */ }
  if (!fromStore) return fromDom;
  if (fromDom && !climbingMapsHaveMarks(fromStore) && climbingMapsHaveMarks(fromDom)) return fromDom;
  return fromStore;
}

/** Вставка из поля «Экспорт» UwU или голый объект панели. */
function climbingMapsFromExport(text) {
  if (text == null || !String(text).trim()) return null;
  return mapsFromUnknown(String(text));
}

module.exports = {
  OVERLAY: OVERLAY,
  present: present,
  sourceLabel: sourceLabel,
  settings: settings,
  fastStyles: fastStyles,
  setting: setting,
  fastStyle: fastStyle,
  hidingCatTooltip: hidingCatTooltip,
  hidingSky: hidingSky,
  hasAlwaysDay: hasAlwaysDay,
  hasCellBorders: hasCellBorders,
  hasFieldBackground: hasFieldBackground,
  hasTitleTimer: hasTitleTimer,
  hasExactSkills: hasExactSkills,
  hasHuntSmell: hasHuntSmell,
  transferringClimbing: transferringClimbing,
  hasClimbingPanel: hasClimbingPanel,
  isOverlay: isOverlay,
  tabOf: tabOf,
  hintFor: hintFor,
  importClimbingMaps: importClimbingMaps,
  climbingMapsFromExport: climbingMapsFromExport,
  climbingMapsHaveMarks: climbingMapsHaveMarks,
};
