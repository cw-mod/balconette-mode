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
    hint: 'В UwU — «Всегда день/ярко» (тот же CSS на #cages_div). Дневное небо — наше. Если там уже включено, наш CSS не дублируем.',
  },
  'grid': {
    hint: 'В UwU — «Границы клеток». Если они включены, нашу сетку не вешаем (два box-shadow на клетке).',
  },
  'static-background': {
    hint: 'В UwU — «Статичный фон локации». Если он включён, фон #cages_div не перебиваем; фон страницы остаётся нашим.',
  },
  'hide-weather': {
    hint: 'В UwU быстрый стиль «Скрыть небо». Если он уже спрятал #tr_sky, наше правило для неба не дублируем.',
  },
  'hide-cat-tooltip': {
    hint: 'В UwU быстрый стиль hideCatTooltip — то же `.cat_tooltip { display:none }`. Если уже скрыто, наш CSS не вешаем.',
  },
  'clock': {
    hint: 'В UwU — свои часы (#uwu-clock). Два виджета сразу перекрываются: отключите одни.',
  },
  'action-title': {
    hint: 'В UwU — «Дублировать время в заголовке вкладки». Если оно включено, заголовок не трогаем.',
  },
  'skill-fractions': {
    hint: 'В UwU — «Точные значения навыков» (тоже .bar-data). Если включено, наши дроби не рисуем.',
  },
  'param-info': {
    hint: 'В UwU — «Подробные параметры» (кнопка над блоком). Наша карточка по клику на навык — рядом, не вместо.',
  },
  'sounds': {
    hint: 'В UwU свой набор звуков (ЛС, конец действия, рот, блок). Не пишем в их стор; при двух модах звуки могут наложиться — выключите дубли там или здесь.',
  },
  'hunt-smell-square': {
    hint: 'В UwU — «Описывать запах на охоте». Если включено, нашу подсказку не вешаем.',
  },
  'climbing-field': {
    hint: 'В UwU — «Минное поле» (#uwu-climbingMainPanel). Кач ЛУ, цифра из [треск] и автоярусы — наши. Если у них включён перенос на поле, наш оверлей не дублируем. Карты можно импортировать из их localStorage.',
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
    parts.push('Сейчас UwU уже скрыл «О коте» — наш стиль пропущен.');
  }
  if (id === 'always-day' && hasAlwaysDay()) {
    parts.push('Сейчас UwU уже держит поле ярким — наш CSS пропущен.');
  }
  if (id === 'grid' && hasCellBorders()) {
    parts.push('Сейчас у UwU включены границы клеток — нашу сетку не вешаем.');
  }
  if (id === 'hide-weather' && hidingSky()) {
    parts.push('Сейчас UwU уже скрыл небо.');
  }
  if (id === 'static-background' && hasFieldBackground()) {
    parts.push('Сейчас фон локации задаёт UwU — #cages_div не трогаем.');
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
    parts.push('Сейчас UwU переносит заливку на поле — наш оверлей выключен.');
  }
  if (id === 'clock' && (setting('showClock') || document.getElementById('uwu-clock'))) {
    parts.push('Рядом уже есть часы UwU.');
  }
  return parts.filter(Boolean).join(' ');
}

function flattenUwuTable(data) {
  var flat = [];
  var y;
  var x;
  if (!Array.isArray(data)) return flat;
  for (y = 0; y < 6; y++) {
    var row = data[y];
    for (x = 0; x < 10; x++) {
      var cell = row && row[x];
      var v = cell && typeof cell === 'object' ? cell.value : cell;
      flat.push(typeof v === 'string' ? v : '');
    }
  }
  return flat;
}

/**
 * Карты минника UwU → наш формат cwb:climbing-maps.
 * Ничего не пишет: вызывающий сам кладёт в наш стор.
 */
function importClimbingMaps() {
  var raw = readJson('uwu_climbingPanelState');
  if (!raw || !Array.isArray(raw.tabs) || !raw.tabs.length) return null;
  var tabs = raw.tabs.map(function (tab, i) {
    var tables = [];
    var list = Array.isArray(tab.tables) ? tab.tables : [];
    list.forEach(function (t, j) {
      tables.push({
        name: String((t && t.name) || ('Поле ' + (j + 1))),
        grid: flattenUwuTable(t && t.data),
      });
    });
    if (!tables.length) tables.push({ name: 'Поле 1', grid: flattenUwuTable(null) });
    var currentTable = typeof tab.currentTableId === 'number' ? tab.currentTableId
      : typeof tab.currentTable === 'number' ? tab.currentTable : 0;
    if (currentTable < 0 || currentTable >= tables.length) currentTable = 0;
    return {
      name: String((tab && tab.name) || ('Вкладка ' + (i + 1))),
      currentTable: currentTable,
      tables: tables,
    };
  });
  var currentTab = typeof raw.currentTabIndex === 'number' ? raw.currentTabIndex
    : typeof raw.currentTab === 'number' ? raw.currentTab : 0;
  if (currentTab < 0 || currentTab >= tabs.length) currentTab = 0;
  return { version: 2, currentTab: currentTab, tabs: tabs };
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
};
