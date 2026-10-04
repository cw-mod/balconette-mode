/**
 * Поле для лазательных умений («минное поле»).
 *
 * Как в UwU / Shed: сетка 10×6, вкладки и поля/локации внутри вкладки,
 * цифры 0–7 = громкость треска, X = мина, = = переход. Карты в cwb:climbing-maps
 * и не сбрасываются при обновлении страницы. Опаска things/564.png на
 * .cage_items ставит X сама.
 * Плюс: дублируем пометки на клетках #cages и автоматически ставим цифру
 * в клетку, где стоит кот (громкость из чата или ярус field.map[y][x].tree).
 * Режим «Кач ЛУ» глушит клик и клавиатуру (WASD / QEZX) по опасным клеткам
 * на игровом поле (мина / tree<0 / tree_images/unsafe / опаска 564).
 * Обычный ход и набор в инпутах/чате не трогаем.
 *
 * Не считает шанс залезть. Не пишет в Vue-стейт. Не трогает чат-DOM.
 */

var dom = require('core/dom');
var socket = require('core/socket');

var ROWS = 6;
var COLS = 10;
var STORAGE_KEY = 'climbing-maps';
var LEGACY_KEY = 'climbing-grid';
var DEFAULT_TAB_NAMES = ['Вкладка 1', 'Вкладка 2'];
var DEFAULT_FIELDS = 5;
var MAX_TABS = 24;
var MAX_FIELDS = 24;
var UNSAFE_RE = /tree_images\/unsafe/i;
/** Моргающая опаска на поле — предмет things/564.png на .cage_items (сохранёнка «опаска»). */
var DANGER_THING_RE = /things\/564(?:\.png)?/i;
var DANGER_TYPE = 564;
/** Ходы игры: Key.add("w/a/s/d/q/e/z/x") → field.go(dx, dy). Стрелок и numpad нет. */
var MOVE_BY_CODE = {
  KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0],
  KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyX: [1, 1],
};
var MOVE_BY_KEYCODE = {
  87: [0, -1], 65: [-1, 0], 83: [0, 1], 68: [1, 0],
  81: [-1, -1], 69: [1, -1], 90: [-1, 1], 88: [1, 1],
};
var MOVE_BY_KEY = {
  w: [0, -1], W: [0, -1], ц: [0, -1], Ц: [0, -1],
  a: [-1, 0], A: [-1, 0], ф: [-1, 0], Ф: [-1, 0],
  s: [0, 1], S: [0, 1], ы: [0, 1], Ы: [0, 1],
  d: [1, 0], D: [1, 0], в: [1, 0], В: [1, 0],
  q: [-1, -1], Q: [-1, -1], й: [-1, -1], Й: [-1, -1],
  e: [1, -1], E: [1, -1], у: [1, -1], У: [1, -1],
  z: [-1, 1], Z: [-1, 1], я: [-1, 1], Я: [-1, 1],
  x: [1, 1], X: [1, 1], ч: [1, 1], Ч: [1, 1],
};
var CRACK = [
  'Без звука',
  'Едва различимый треск',
  'Тихий треск',
  'Приглушённый треск',
  'Громкий треск',
  'Очень громкий треск',
  'Очень громкий треск',
  'Очень громкий треск',
];
var SYNC = { deep: true, sync: true, flush: 'sync' };

function emptyGrid() {
  var g = [];
  for (var i = 0; i < ROWS * COLS; i++) g.push('');
  return g;
}

function normalizeGrid(raw) {
  if (Array.isArray(raw) && raw.length === ROWS && Array.isArray(raw[0])) {
    var flat = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var cell = raw[y] && raw[y][x];
        var v = cell && typeof cell === 'object' ? cell.value : cell;
        flat.push(typeof v === 'string' ? v : '');
      }
    }
    return flat;
  }
  if (!Array.isArray(raw) || raw.length !== ROWS * COLS) return emptyGrid();
  return raw.map(function (v) { return typeof v === 'string' ? v : ''; });
}

function emptyTable(name) {
  return { name: name || 'Поле 1', grid: emptyGrid() };
}

function emptyTab(name, fieldCount) {
  var n = fieldCount == null ? DEFAULT_FIELDS : fieldCount;
  var tables = [];
  for (var i = 0; i < n; i++) tables.push(emptyTable('Поле ' + (i + 1)));
  return { name: name || 'Вкладка 1', currentTable: 0, tables: tables };
}

function defaultMaps() {
  return {
    version: 2,
    currentTab: 0,
    tabs: DEFAULT_TAB_NAMES.map(function (name) { return emptyTab(name, DEFAULT_FIELDS); }),
  };
}

function normalizeTab(tab, i) {
  if (!tab || typeof tab !== 'object') return emptyTab('Вкладка ' + (i + 1), 1);
  var name = String(tab.name || ('Вкладка ' + (i + 1)));
  var tables = [];
  if (Array.isArray(tab.tables) && tab.tables.length) {
    tab.tables.forEach(function (t, j) {
      if (!t || typeof t !== 'object') {
        tables.push(emptyTable('Поле ' + (j + 1)));
        return;
      }
      tables.push({
        name: String(t.name || ('Поле ' + (j + 1))),
        grid: normalizeGrid(t.grid || t.data),
      });
    });
  } else {
    tables.push({ name: 'Поле 1', grid: normalizeGrid(tab.grid) });
  }
  var currentTable = typeof tab.currentTable === 'number' ? tab.currentTable
    : typeof tab.currentTableId === 'number' ? tab.currentTableId : 0;
  if (currentTable < 0 || currentTable >= tables.length) currentTable = 0;
  return { name: name, currentTable: currentTable, tables: tables };
}

function normalizeMaps(raw) {
  if (!raw || !Array.isArray(raw.tabs) || !raw.tabs.length) return defaultMaps();
  var tabs = raw.tabs.map(normalizeTab);
  var currentTab = typeof raw.currentTab === 'number' ? raw.currentTab
    : typeof raw.current === 'number' ? raw.current
      : typeof raw.currentTabIndex === 'number' ? raw.currentTabIndex : 0;
  if (currentTab < 0 || currentTab >= tabs.length) currentTab = 0;
  return { version: 2, currentTab: currentTab, tabs: tabs };
}

function loadMaps(storage) {
  var raw = storage.get(STORAGE_KEY, null);
  if (raw && Array.isArray(raw.tabs) && raw.tabs.length) return normalizeMaps(raw);
  var maps = defaultMaps();
  var legacy = storage.get(LEGACY_KEY, null);
  if (Array.isArray(legacy) && legacy.length === ROWS * COLS) {
    maps.tabs[0].tables[0].grid = normalizeGrid(legacy);
    storage.set(STORAGE_KEY, maps);
  }
  return maps;
}

function clipName(value, fallback) {
  var next = String(value == null ? '' : value).trim();
  if (!next) return fallback;
  return next.slice(0, 32);
}

/** Редактор вкладок и полей — как tabManager в UwU на странице настроек. */
function renderMapsEditor() {
  var storage = require('core/storage');
  var wrap = dom.el('div', { class: 'cwb-maps-editor' });

  function persist(maps) {
    storage.set(STORAGE_KEY, maps);
    draw();
  }

  function ask(message, initial) {
    var raw = window.prompt(message, initial == null ? '' : initial);
    if (raw == null) return null;
    return clipName(raw, '');
  }

  function draw() {
    var maps = normalizeMaps(storage.get(STORAGE_KEY, null));
    wrap.textContent = '';
    wrap.appendChild(dom.el('h4', { text: 'Вкладки' }));
    var tabRow = dom.el('div', { class: 'cwb-maps-row' });
    maps.tabs.forEach(function (tab, i) {
      var nameBtn = dom.el('button', {
        type: 'button',
        class: i === maps.currentTab ? 'active' : '',
        text: tab.name,
      });
      nameBtn.addEventListener('click', function () {
        maps.currentTab = i;
        persist(maps);
      });
      var renameBtn = dom.el('button', { type: 'button', class: 'cwb-maps-ico', text: '✎', title: 'Переименовать вкладку' });
      renameBtn.addEventListener('click', function () {
        var next = ask('Введите новое имя вкладки:', tab.name);
        if (!next) return;
        maps.tabs[i].name = next;
        persist(maps);
      });
      var delBtn = dom.el('button', { type: 'button', class: 'cwb-maps-ico', text: 'X', title: 'Удалить вкладку' });
      delBtn.addEventListener('click', function () {
        maps.tabs.splice(i, 1);
        if (maps.currentTab >= maps.tabs.length) maps.currentTab = Math.max(0, maps.tabs.length - 1);
        persist(maps);
      });
      tabRow.appendChild(dom.el('div', { class: 'cwb-maps-item' }, [nameBtn, renameBtn, delBtn]));
    });
    var addTab = dom.el('button', { type: 'button', class: 'cwb-btn', text: '+' });
    addTab.addEventListener('click', function () {
      if (maps.tabs.length >= MAX_TABS) return;
      var name = ask('Введите имя вкладки:');
      if (!name) return;
      maps.tabs.push(emptyTab(name, 0));
      maps.currentTab = maps.tabs.length - 1;
      persist(maps);
    });
    tabRow.appendChild(addTab);
    wrap.appendChild(tabRow);

    wrap.appendChild(dom.el('h4', { text: 'Локации / Таблицы' }));
    var fieldRow = dom.el('div', { class: 'cwb-maps-row' });
    var tab = maps.tabs[maps.currentTab];
    if (tab) {
      tab.tables.forEach(function (table, i) {
        var nameBtn = dom.el('button', {
          type: 'button',
          class: i === tab.currentTable ? 'active' : '',
          text: table.name,
        });
        nameBtn.addEventListener('click', function () {
          tab.currentTable = i;
          persist(maps);
        });
        var renameBtn = dom.el('button', { type: 'button', class: 'cwb-maps-ico', text: '✎', title: 'Переименовать поле' });
        renameBtn.addEventListener('click', function () {
          var next = ask('Введите новое имя поля:', table.name);
          if (!next) return;
          tab.tables[i].name = next;
          persist(maps);
        });
        var delBtn = dom.el('button', { type: 'button', class: 'cwb-maps-ico', text: 'X', title: 'Удалить поле' });
        delBtn.addEventListener('click', function () {
          tab.tables.splice(i, 1);
          if (tab.currentTable >= tab.tables.length) tab.currentTable = Math.max(0, tab.tables.length - 1);
          persist(maps);
        });
        fieldRow.appendChild(dom.el('div', { class: 'cwb-maps-item' }, [nameBtn, renameBtn, delBtn]));
      });
      var addField = dom.el('button', { type: 'button', class: 'cwb-btn', text: '+' });
      addField.addEventListener('click', function () {
        if (tab.tables.length >= MAX_FIELDS) return;
        var name = ask('Введите имя поля:');
        if (!name) return;
        tab.tables.push(emptyTable(name));
        tab.currentTable = tab.tables.length - 1;
        persist(maps);
      });
      fieldRow.appendChild(addField);
    }
    wrap.appendChild(fieldRow);

    var uwu = require('core/uwu');
    var importRow = dom.el('div', { class: 'cwb-maps-row' });
    var importBtn = dom.el('button', {
      type: 'button',
      class: 'cwb-btn',
      text: 'Импорт карт из UwU',
    });
    importBtn.addEventListener('click', function () {
      var imported = uwu.importClimbingMaps();
      if (!imported) {
        window.alert('Карт UwU в localStorage нет (ключ uwu_climbingPanelState). Если у них включено единое хранилище GM — мы его прочитать не можем.');
        return;
      }
      if (!window.confirm('Заменить наши карты ЛУ картами из UwU? Пишем только в cwb:climbing-maps, их стор не трогаем.')) return;
      persist(normalizeMaps(imported));
    });
    importRow.appendChild(importBtn);
    if (uwu.present()) {
      importRow.appendChild(dom.el('span', {
        class: 'cwb-opt-hint',
        text: uwu.importClimbingMaps()
          ? 'Найдены карты UwU в localStorage.'
          : 'UwU рядом, но карт минника в localStorage нет.',
      }));
    }
    wrap.appendChild(importRow);
  }

  draw();
  return wrap;
}

function idx(x, y) { return (y - 1) * COLS + (x - 1); }

function cellCoords(td) {
  var tr = td.parentElement;
  if (!tr || !tr.parentElement) return null;
  return {
    y: Array.prototype.indexOf.call(tr.parentElement.children, tr) + 1,
    x: Array.prototype.indexOf.call(tr.children, td) + 1,
  };
}

function normalizeMark(value) {
  if (value === 'mine' || value === 'X' || value === 'x' || value === '-') return 'mine';
  if (value === 'transit' || value === '=') return 'transit';
  if (/^[0-7]$/.test(String(value))) return String(value);
  return '';
}

function markFromTree(tree) {
  if (typeof tree !== 'number') return '';
  if (tree < 0) return 'mine';
  if (tree > 7) return '7';
  return String(tree);
}

function fillKind(mark) {
  if (mark === 'mine') return 'mine';
  if (mark === 'transit') return 'transit';
  if (mark) return 'safe';
  return '';
}

/**
 * Треск в чате:
 *   42["msg", { text: "[треск]", login: "ветвь …", mute: 1, volume: 0..7 }]
 * Цифра — только msg.volume. Тост 42["info","Я слышу …"] дублирует звук, но
 * «очень громкий» общий у volume 5 и 6, поэтому из текста его не мапим.
 * Не берём любые системные реплики и не берём «оглушительный» без volume.
 */
function crackMarkFromChat(msg) {
  if (!msg) return '';
  var text = String(msg.text || '').replace(/<[^>]*>/g, '');
  var isBracket = /\[треск\]/i.test(text);
  var isHear = /^я слышу\s+.+\s+треск/i.test(text.trim());
  if (!isBracket && !isHear) return '';
  if (msg.volume != null && msg.volume !== '') {
    var vol = Number(msg.volume);
    if (!isNaN(vol) && vol >= 0 && vol <= 7) return String(vol);
  }
  var t = text.toLowerCase();
  if (/оглушительн/.test(t)) return '';
  if (/очень громк/.test(t)) return '';
  if (/едва различим/.test(t)) return '1';
  if (/приглуш[её]нн/.test(t)) return '3';
  if (/тихий/.test(t)) return '2';
  if (/громк/.test(t)) return '4';
  return '';
}

function labelOf(mark) {
  if (mark === 'mine') return 'X';
  if (mark === 'transit') return '=';
  return mark;
}

function styleBlob(node) {
  if (!node) return '';
  var s = (node.getAttribute && node.getAttribute('style')) || '';
  if (node.style) {
    s += ' ' + (node.style.cssText || '') + ' ' + (node.style.backgroundImage || '') + ' ' + (node.style.background || '');
  }
  try {
    var cs = window.getComputedStyle(node);
    if (cs) s += ' ' + (cs.backgroundImage || '') + ' ' + (cs.background || '');
  } catch (e) { /* jsdom / detached */ }
  return String(s).replace(/&quot;/g, '"');
}

function looksDangerous(text) {
  var s = String(text || '').replace(/&quot;/g, '"');
  return UNSAFE_RE.test(s) || DANGER_THING_RE.test(s);
}

function cellLooksUnsafe(td, cage) {
  if (cage && typeof cage.tree === 'number' && cage.tree < 0) return true;
  if (cage && cage.class && /tree-unsafe/.test(String(cage.class))) return true;
  if (cage && looksDangerous(cage.itemStyle || cage.style)) return true;
  if (cage && Array.isArray(cage.items)) {
    for (var k = 0; k < cage.items.length; k++) {
      var it = cage.items[k];
      if (it && (it.type === DANGER_TYPE || Number(it.type) === DANGER_TYPE)) return true;
    }
  }
  if (!td) return false;
  if (td.classList && td.classList.contains('tree-unsafe')) return true;
  if (looksDangerous(styleBlob(td))) return true;
  try {
    if (looksDangerous(td.innerHTML || '')) return true;
  } catch (e) { /* noop */ }
  var items = td.querySelector && td.querySelector('.cage_items');
  if (items && looksDangerous(styleBlob(items))) return true;
  var imgs = td.querySelectorAll ? td.querySelectorAll('img') : [];
  for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].getAttribute('src') || '';
    if (looksDangerous(src)) return true;
  }
  return false;
}

function moveDelta(e) {
  if (!e) return null;
  if (e.code && MOVE_BY_CODE[e.code]) return MOVE_BY_CODE[e.code];
  if (e.key && MOVE_BY_KEY[e.key]) return MOVE_BY_KEY[e.key];
  if (e.keyCode && MOVE_BY_KEYCODE[e.keyCode]) return MOVE_BY_KEYCODE[e.keyCode];
  return null;
}

function isTypingContext(el) {
  if (!el) return false;
  if (el.nodeType === 3) el = el.parentElement;
  if (!el || !el.closest) return false;
  if (el.closest('#chat_form, #text, #cwb-lu, #cwb-root, input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
    return true;
  }
  var tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
}

function cageTdAt(x, y) {
  if (x < 1 || x > COLS || y < 1 || y > ROWS) return null;
  var tds = document.querySelectorAll('#cages td.cage');
  return tds[(y - 1) * COLS + (x - 1)] || null;
}

module.exports = {
  id: 'climbing-field',
  title: 'Поле для ЛУ',
  description: 'Минное поле 10×6 со вкладками и полями-локациями: цифры треска, мины и переходы. Карты сохраняются между обновлениями.',
  category: 'field',
  pages: ['game'],
  enabledByDefault: false,
  order: 25,

  defaults: {
    overlay: true,
    autoFromServer: true,
    autoFromChat: true,
    showSkill: true,
    blockDangerous: true,
    collapsed: false,
    x: null,
    y: null,
    clearOnLocation: false,
  },

  schema: [
    {
      key: 'overlay',
      type: 'boolean',
      label: 'Дублировать пометки на игровом поле',
      hint: 'Если в UwU включён перенос заливки на поле — наш оверлей не дублируем.',
    },
    {
      key: 'blockDangerous',
      type: 'boolean',
      label: 'Кач ЛУ: не нажимать на опасные клетки',
      hint: 'Глушит клик и ходьбу с клавиатуры (WASD, QEZX) по минам, опаскам и unsafe. Выключите, чтобы ходить как обычно.',
    },
    {
      key: 'autoFromServer',
      type: 'boolean',
      label: 'Подтягивать ярусы деревьев из игры',
      hint: 'Если сервер прислал field.map[y][x].tree — пустые клетки заполнятся сами.',
    },
    {
      key: 'autoFromChat',
      type: 'boolean',
      label: 'Ставить цифру в клетку кота по треску в чате',
      hint: 'Сообщение [треск] (msg.volume 0–7) → клетка, где стоит ваш кот. Не любые системные реплики.',
    },
    {
      key: 'showSkill',
      type: 'boolean',
      label: 'Показывать своё лазание в шапке панели',
    },
    {
      key: 'clearOnLocation',
      type: 'boolean',
      label: 'Очищать текущее поле при смене локации',
      hint: 'По умолчанию выключено: карты хранятся во вкладках и полях и переживают обновление страницы.',
    },
    {
      key: 'mapsEditor',
      type: 'custom',
      label: 'Вкладки и поля',
      hint: 'Добавить, удалить или переименовать вкладки и таблицы-поля внутри выбранной вкладки.',
      render: renderMapsEditor,
    },
  ],

  styles: function () {
    return [
      '#cwb-lu{position:fixed;z-index:2147482500;width:260px;box-sizing:border-box;background:rgba(32,28,24,.94);',
      'color:#f3e7d3;border:1px solid #5a4e3e;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);',
      'font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;user-select:none;}',
      '#cwb-lu-head{display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:move;',
      'background:#3a332b;border-radius:10px 10px 0 0;}',
      '#cwb-lu-head strong{flex:1;min-width:0;font-size:13px;}',
      '#cwb-lu-skill{opacity:.75;font-size:11px;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#cwb-lu-fold{background:none;border:none;color:#f3e7d3;cursor:pointer;font-size:16px;padding:0 4px;}',
      '#cwb-lu-body{padding:5px;}',
      '#cwb-lu-body[hidden]{display:none;}',
      '#cwb-lu-grid{border-collapse:collapse;margin:0 auto;table-layout:fixed;width:250px;height:190px;}',
      '#cwb-lu-grid td{position:relative;width:10%;height:calc(100% / 6);padding:0;box-sizing:border-box;',
      'border:1px solid #6a5d4c;text-align:center;',
      'font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;cursor:pointer;background:#2a241e;}',
      '#cwb-lu-grid td:focus{outline:2px solid #e8c27a;outline-offset:-2px;}',
      '#cwb-lu-grid td[data-cwb-here]{box-shadow:inset 0 0 0 2px #e8c27a;}',
      '#cwb-lu-grid td[data-cwb-here]::before{content:"";position:absolute;left:1px;top:1px;width:5px;height:5px;',
      'border-radius:50%;background:#e8c27a;pointer-events:none;z-index:1;}',
      '#cwb-lu-help{margin-top:6px;font-size:11px;opacity:.7;}',
      '#cwb-lu-nav h3{margin:4px 0 3px;font-size:12px;font-weight:700;}',
      '#cwb-lu-nav h3:first-child{margin-top:0;}',
      '#cwb-lu-tabs,#cwb-lu-fields{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 6px;align-items:center;}',
      '#cwb-lu-tabs button,#cwb-lu-fields button{min-width:22px;height:20px;padding:0 6px;border:1px solid #6a5d4c;',
      'border-radius:4px;background:#2a241e;color:#f3e7d3;cursor:pointer;font:11px/18px inherit;}',
      '#cwb-lu-tabs button.active,#cwb-lu-fields button.active{background:#e8c27a;color:#2a1f12;border-color:#e8c27a;}',
      '#cwb-lu-empty{text-align:center;margin:12px 0;opacity:.8;}',
      '#cwb-lu-grid[hidden],#cwb-lu-tools[hidden],#cwb-lu-empty[hidden]{display:none;}',
      '#cwb-lu-train{display:block;width:100%;margin:6px 0 0;height:22px;padding:0 6px;border:1px solid #6a5d4c;',
      'border-radius:4px;background:#3a332b;color:#f3e7d3;cursor:pointer;font:11px/20px inherit;}',
      '#cwb-lu-train.active{background:#e8c27a;color:#2a1f12;border-color:#e8c27a;}',
      '#cwb-lu-tools{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;}',
      '#cwb-lu-tools button{min-width:22px;height:20px;padding:0 5px;border:1px solid #6a5d4c;',
      'border-radius:4px;background:#3a332b;color:#f3e7d3;cursor:pointer;font:11px/18px inherit;}',
      '#cages td.cage{position:relative;width:100px;}',
      '#cages td.cage[data-cwb-lu-fill]::before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;',
      'z-index:5;pointer-events:none;}',
      '#cages td.cage[data-cwb-lu-fill="safe"]::before{background:rgba(46,130,50,.28);}',
      '#cages td.cage[data-cwb-lu-fill="mine"]::before{background:rgba(180,16,16,.32);}',
      '#cages td.cage[data-cwb-lu-fill="transit"]::before{background:rgba(255,236,140,.3);}',
      '#cages td.cage[data-cwb-lu-block]{cursor:not-allowed;}',
      '#cages td.cage[data-cwb-lu]::after{content:attr(data-cwb-lu);position:absolute;right:2px;bottom:2px;',
      'z-index:40;font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;padding:1px 3px;border-radius:3px;',
      'background:rgba(0,0,0,.78);color:#ffe9a8;pointer-events:none;}',
      '#cages td.cage[data-cwb-lu="X"]::after{background:rgba(160,0,0,.85);color:#fff;}',
      '#cages td.cage[data-cwb-lu="="]::after{background:rgba(255,255,255,.75);color:#222;}',
    ].join('');
  },

  init: function (ctx) {
    var maps = loadMaps(ctx.storage);
    var focused = -1;
    var lastHereKey = '';
    var lastChatId = null;
    var chatPrimed = false;
    var lastErrorText = '';
    var lastLoc = null;

    function currentTab() {
      if (!maps.tabs.length) return null;
      if (maps.currentTab < 0 || maps.currentTab >= maps.tabs.length) maps.currentTab = 0;
      return maps.tabs[maps.currentTab];
    }

    function currentTable() {
      var tab = currentTab();
      if (!tab || !tab.tables.length) return null;
      if (tab.currentTable < 0 || tab.currentTable >= tab.tables.length) tab.currentTable = 0;
      return tab.tables[tab.currentTable];
    }

    function currentGrid() {
      var cur = currentTable();
      if (!cur) return emptyGrid();
      if (!cur.grid) cur.grid = emptyGrid();
      return cur.grid;
    }

    function hasCurrentField() {
      return !!currentTable();
    }

    var skillEl = dom.el('span', { id: 'cwb-lu-skill' });
    var foldBtn = dom.el('button', { id: 'cwb-lu-fold', type: 'button', title: 'Свернуть', text: '−' });
    var head = dom.el('div', { id: 'cwb-lu-head' }, [
      dom.el('strong', { text: 'Поле для ЛУ' }),
      skillEl,
      foldBtn,
    ]);

    var table = dom.el('table', { id: 'cwb-lu-grid' });
    var tbody = document.createElement('tbody');
    table.appendChild(tbody);
    var cells = [];
    for (var y = 1; y <= ROWS; y++) {
      var tr = document.createElement('tr');
      for (var x = 1; x <= COLS; x++) {
        var td = document.createElement('td');
        td.tabIndex = 0;
        td.dataset.i = String(idx(x, y));
        tr.appendChild(td);
        cells.push(td);
      }
      tbody.appendChild(tr);
    }

    var tabsEl = dom.el('div', { id: 'cwb-lu-tabs' });
    var fieldsEl = dom.el('div', { id: 'cwb-lu-fields' });
    var nav = dom.el('div', { id: 'cwb-lu-nav' }, [
      dom.el('h3', { text: 'Вкладка' }),
      tabsEl,
      dom.el('h3', { text: 'Локация' }),
      fieldsEl,
    ]);
    var emptyEl = dom.el('div', { id: 'cwb-lu-empty', text: 'Добавьте поле/таблицу в настройках' });
    var trainBtn = dom.el('button', {
      type: 'button',
      id: 'cwb-lu-train',
      text: 'Кач ЛУ',
      title: 'В каче ЛУ не ходить на опасные клетки',
    });
    var tools = dom.el('div', { id: 'cwb-lu-tools' });
    ['0', '1', '2', '3', '4', '5', '6', '7', 'X', '=', 'очистить'].forEach(function (label) {
      tools.appendChild(dom.el('button', { type: 'button', 'data-mark': label, text: label }));
    });

    var body = dom.el('div', { id: 'cwb-lu-body' }, [
      nav,
      emptyEl,
      table,
      trainBtn,
      tools,
      dom.el('div', { id: 'cwb-lu-help', text: 'Клавиши 0–7, «-» мина, «=» переход. Вкладки и поля настраиваются в панели модов. «Кач ЛУ» глушит клик и WASD по опасным клеткам на поле.' }),
    ]);

    var panel = dom.el('div', { id: 'cwb-lu' }, [head, body]);
    var s = ctx.settings.all();
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      panel.style.left = s.x + 'px';
      panel.style.top = s.y + 'px';
    } else {
      panel.style.right = '16px';
      panel.style.top = '120px';
    }
    body.hidden = !!s.collapsed;
    foldBtn.textContent = s.collapsed ? '+' : '−';
    ctx.mount(panel);

    function save() {
      ctx.storage.set(STORAGE_KEY, maps);
    }

    function myPos() {
      var id = ctx.vue.get('cat.id');
      var cats = ctx.vue.get('field.cats');
      if (!id || !cats) return null;
      var me = cats[id] || cats[String(id)];
      if (me && me.x && me.y) return { x: me.x, y: me.y };
      var keys = Object.keys(cats);
      for (var k = 0; k < keys.length; k++) {
        var c = cats[keys[k]];
        if (c && (c.id === id || String(c.id) === String(id)) && c.x && c.y) return { x: c.x, y: c.y };
      }
      return null;
    }

    function paintPanel() {
      var pos = myPos();
      var here = pos ? String(idx(pos.x, pos.y)) : '';
      lastHereKey = pos ? pos.x + ',' + pos.y : '';
      cells.forEach(function (td, i) {
        var mark = currentGrid()[i] || '';
        td.dataset.value = mark;
        td.textContent = labelOf(mark);
        td.title = mark === 'mine' ? 'Опасная клетка' :
          mark === 'transit' ? 'Переход' :
            mark !== '' ? (CRACK[Number(mark)] || '') : '';
        td.style.background = mark === 'mine' ? '#5b0000' :
          mark === 'transit' ? '#d8d2c4' :
            mark !== '' ? '#3d4a2a' : '#2a241e';
        td.style.color = mark === 'transit' ? '#222' : '#f3e7d3';
        if (here && td.dataset.i === here) td.dataset.cwbHere = '1';
        else delete td.dataset.cwbHere;
      });
    }

    function fieldHidden() {
      if (ctx.vue.get('hunt.mode')) return true;
      var smell = ctx.vue.get('field.smellMap');
      return !!(smell && typeof smell === 'object');
    }

    function clearFieldMarks(td) {
      delete td.dataset.cwbLu;
      delete td.dataset.cwbLuFill;
      delete td.dataset.cwbLuBlock;
    }

    function cellIsDangerous(td, c) {
      if (!c) c = cellCoords(td);
      if (!c || c.x < 1 || c.x > COLS || c.y < 1 || c.y > ROWS) return false;
      if (currentGrid()[idx(c.x, c.y)] === 'mine') return true;
      var map = ctx.vue.get('field.map');
      var cage = map && map[c.y] && map[c.y][c.x];
      return cellLooksUnsafe(td, cage);
    }

    function paintTrain() {
      var on = !!ctx.settings.get('blockDangerous');
      trainBtn.classList.toggle('active', on);
      trainBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      trainBtn.title = on
        ? 'Кач ЛУ включён: клик и клавиатура по опасным клеткам заблокированы'
        : 'Кач ЛУ выключен: обычное передвижение';
    }

    function paintField() {
      paintTrain();
      var tds = ctx.dom.qsa('#cages td.cage');
      var hidden = fieldHidden();
      var overlayOn = ctx.settings.get('overlay') && !hidden && !require('core/uwu').transferringClimbing();
      var blockOn = ctx.settings.get('blockDangerous') && !hidden;
      if (!overlayOn && !blockOn) {
        tds.forEach(clearFieldMarks);
        return;
      }
      tds.forEach(function (td) {
        var c = cellCoords(td);
        if (!c || c.x < 1 || c.x > COLS || c.y < 1 || c.y > ROWS) {
          clearFieldMarks(td);
          return;
        }
        var mark = currentGrid()[idx(c.x, c.y)];
        if (overlayOn && mark) {
          td.dataset.cwbLu = labelOf(mark);
          td.dataset.cwbLuFill = fillKind(mark);
        } else {
          delete td.dataset.cwbLu;
          delete td.dataset.cwbLuFill;
        }
        if (blockOn && cellIsDangerous(td, c)) td.dataset.cwbLuBlock = '1';
        else delete td.dataset.cwbLuBlock;
      });
    }

    function paintSkill() {
      if (!ctx.settings.get('showSkill')) { skillEl.textContent = ''; return; }
      var d = ctx.vue.get('parameter.data.tree');
      if (!d || d.isHidden) { skillEl.textContent = 'ЛУ скрыто'; return; }
      var tip = String(d.tooltip || '');
      var m = /\(([^)]+)\)/.exec(tip);
      skillEl.textContent = 'ЛУ ' + (d.level != null ? d.level : '?') + (m ? ' · ' + m[1] : '');
    }

    function paintNav() {
      tabsEl.textContent = '';
      fieldsEl.textContent = '';
      maps.tabs.forEach(function (tab, i) {
        var btn = dom.el('button', {
          type: 'button',
          'data-tab': String(i),
          text: tab.name || ('Вкладка ' + (i + 1)),
        });
        if (i === maps.currentTab) btn.className = 'active';
        tabsEl.appendChild(btn);
      });
      var tab = currentTab();
      if (tab) {
        tab.tables.forEach(function (field, i) {
          var btn = dom.el('button', {
            type: 'button',
            'data-field': String(i),
            text: field.name || ('Поле ' + (i + 1)),
          });
          if (i === tab.currentTable) btn.className = 'active';
          fieldsEl.appendChild(btn);
        });
      }
      var ready = hasCurrentField();
      emptyEl.hidden = ready;
      table.hidden = !ready;
      tools.hidden = !ready;
    }

    function switchTab(i) {
      if (typeof i !== 'number' || i < 0 || i >= maps.tabs.length) return;
      maps.currentTab = i;
      save();
      paintAll();
    }

    function switchField(i) {
      var tab = currentTab();
      if (!tab || typeof i !== 'number' || i < 0 || i >= tab.tables.length) return;
      tab.currentTable = i;
      save();
      paintAll();
    }

    function paintAll() {
      paintNav();
      paintPanel();
      paintField();
      paintSkill();
    }

    function setMark(i, value) {
      if (i < 0 || i >= currentGrid().length) return;
      currentGrid()[i] = normalizeMark(value);
      save();
      paintAll();
    }

    function applyToCell(x, y, value, overwrite) {
      if (x < 1 || x > COLS || y < 1 || y > ROWS) return;
      var i = idx(x, y);
      if (!overwrite && currentGrid()[i]) return;
      setMark(i, value);
    }

    function applyCrackNow(mark, overwrite) {
      if (!mark || !ctx.settings.get('autoFromChat')) return;
      var pos = myPos();
      if (!pos) return;
      applyToCell(pos.x, pos.y, mark, overwrite !== false);
    }

    function ingestChatMsg(msg) {
      if (!msg) return;
      var id = msg.id;
      if (id != null && id === lastChatId) return;
      var mark = crackMarkFromChat(msg);
      if (id != null) lastChatId = id;
      if (mark) applyCrackNow(mark);
    }

    function scanChatHead() {
      if (!ctx.settings.get('autoFromChat')) return;
      var messages = ctx.vue.get('chat.messages');
      if (!Array.isArray(messages) || !messages.length) return;
      var headMsg = messages[0];
      if (!chatPrimed) {
        chatPrimed = true;
        lastChatId = headMsg && headMsg.id;
        return;
      }
      ingestChatMsg(headMsg);
    }

    function readErrorCrack() {
      if (!ctx.settings.get('autoFromChat')) return;
      var err = document.getElementById('error');
      if (!err) return;
      var text = String(err.textContent || '').trim();
      if (!text || text === lastErrorText) return;
      lastErrorText = text;
      var mark = crackMarkFromChat({ text: text });
      if (mark) applyCrackNow(mark, false);
    }

    function fillFromServer() {
      if (!ctx.settings.get('autoFromServer')) return;
      var map = ctx.vue.get('field.map');
      if (!map) return;
      var changed = false;
      for (var y = 1; y <= ROWS; y++) {
        for (var x = 1; x <= COLS; x++) {
          var cage = map[y] && map[y][x];
          var mark = cage ? markFromTree(cage.tree) : '';
          if (!mark) continue;
          var i = idx(x, y);
          var g = currentGrid();
          if (mark === 'mine') {
            if (g[i] !== 'mine') { g[i] = 'mine'; changed = true; }
          } else if (!g[i]) {
            g[i] = mark;
            changed = true;
          }
        }
      }
      if (changed) { save(); paintAll(); }
    }

    function scanUnsafeDom() {
      if (fieldHidden()) return;
      var map = ctx.vue.get('field.map');
      var tds = ctx.dom.qsa('#cages td.cage');
      var changed = false;
      tds.forEach(function (td) {
        var c = cellCoords(td);
        if (!c || c.x < 1 || c.x > COLS || c.y < 1 || c.y > ROWS) return;
        var cage = map && map[c.y] && map[c.y][c.x];
        if (!cellLooksUnsafe(td, cage)) return;
        var i = idx(c.x, c.y);
        if (currentGrid()[i] === 'mine') return;
        currentGrid()[i] = 'mine';
        changed = true;
      });
      if (changed) { save(); paintAll(); }
    }

    function syncFromField() {
      fillFromServer();
      scanUnsafeDom();
    }

    function syncCatHere() {
      var pos = myPos();
      var key = pos ? pos.x + ',' + pos.y : '';
      if (key === lastHereKey) return;
      paintPanel();
    }

    function onLocation() {
      var loc = ctx.vue.get('field.location');
      var key = loc && (loc.name || loc.bg);
      if (lastLoc == null) { lastLoc = key; return; }
      if (key === lastLoc) return;
      lastLoc = key;
      if (ctx.settings.get('clearOnLocation')) {
        var locTable = currentTable();
        if (locTable) locTable.grid = emptyGrid();
        save();
      }
      fillFromServer();
      scanUnsafeDom();
      paintAll();
    }

    cells.forEach(function (td) {
      ctx.on(td, 'focus', function () { focused = parseInt(td.dataset.i, 10); });
      ctx.on(td, 'click', function () { td.focus(); });
      ctx.on(td, 'dblclick', function () { setMark(parseInt(td.dataset.i, 10), ''); });
      ctx.on(td, 'keydown', function (e) {
        var i = parseInt(td.dataset.i, 10);
        if (e.key >= '0' && e.key <= '7') { setMark(i, e.key); e.preventDefault(); }
        else if (e.key === '-' || e.key === 'х' || e.key === 'Х' || e.key === 'x' || e.key === 'X') {
          setMark(i, 'mine'); e.preventDefault();
        } else if (e.key === '=' || e.key === '+') { setMark(i, 'transit'); e.preventDefault(); }
        else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === ' ') {
          setMark(i, ''); e.preventDefault();
        }
      });
    });

    ctx.on(tabsEl, 'click', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-tab]');
      if (!btn || !tabsEl.contains(btn)) return;
      switchTab(parseInt(btn.getAttribute('data-tab'), 10));
    });
    ctx.on(fieldsEl, 'click', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-field]');
      if (!btn || !fieldsEl.contains(btn)) return;
      switchField(parseInt(btn.getAttribute('data-field'), 10));
    });

    ctx.on(trainBtn, 'click', function (e) {
      e.stopPropagation();
      ctx.settings.set('blockDangerous', !ctx.settings.get('blockDangerous'));
      paintTrain();
      paintField();
    });

    ctx.on(tools, 'click', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-mark]');
      if (!btn) return;
      var mark = btn.getAttribute('data-mark');
      if (mark === 'очистить') {
        var clearTable = currentTable();
        if (clearTable) clearTable.grid = emptyGrid();
        save();
        fillFromServer();
        scanUnsafeDom();
        paintAll();
        return;
      }
      if (focused < 0) focused = 0;
      setMark(focused, mark === 'X' ? 'mine' : mark === '=' ? 'transit' : mark);
    });

    ctx.on(foldBtn, 'click', function (e) {
      e.stopPropagation();
      var next = !body.hidden;
      body.hidden = next;
      foldBtn.textContent = next ? '+' : '−';
      ctx.settings.set('collapsed', next);
    });

    // Как #chat_float_handle: только зажатая ЛКМ на шапке, не hover.
    // pointermove/up/cancel — на document, иначе pointerup теряется и панель
    // начинает ехать уже от наведения.
    var drag = null;

    function isFoldTarget(t) {
      return !!(t && (t === foldBtn || (t.closest && t.closest('#cwb-lu-fold'))));
    }

    function stopDrag() {
      if (!drag) return;
      drag = null;
      ctx.settings.set('x', parseInt(panel.style.left, 10) || 0);
      ctx.settings.set('y', parseInt(panel.style.top, 10) || 0);
    }

    ctx.on(head, 'pointerdown', function (e) {
      if (isFoldTarget(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var left = parseFloat(panel.style.left);
      var top = parseFloat(panel.style.top);
      var rect = panel.getBoundingClientRect();
      var startX = isFinite(left) ? left : rect.left;
      var startY = isFinite(top) ? top : rect.top;
      drag = { x0: e.clientX, y0: e.clientY, px: startX, py: startY };
      if (!isFinite(left) || !isFinite(top)) {
        panel.style.left = startX + 'px';
        panel.style.top = startY + 'px';
        panel.style.right = 'auto';
      }
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      e.preventDefault();
    });
    ctx.on(document, 'pointermove', function (e) {
      if (!drag) return;
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) {
        stopDrag();
        return;
      }
      var x = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, drag.px + (e.clientX - drag.x0)));
      var y = Math.max(0, Math.min(window.innerHeight - 40, drag.py + (e.clientY - drag.y0)));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
    });
    ctx.on(document, 'pointerup', stopDrag);
    ctx.on(document, 'pointercancel', stopDrag);

    function blockDangerousClick(e) {
      if (!ctx.settings.get('blockDangerous') || fieldHidden()) return;
      var path = e.target;
      if (!path || !path.closest) return;
      if (path.closest('#cwb-lu')) return;
      var td = path.closest('#cages td.cage');
      if (!td || !cellIsDangerous(td)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }

    function blockDangerousKey(e) {
      if (!ctx.settings.get('blockDangerous') || fieldHidden()) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      var delta = moveDelta(e);
      if (!delta) return;
      if (isTypingContext(e.target)) return;
      var pos = myPos();
      if (!pos) return;
      var dest = { x: pos.x + delta[0], y: pos.y + delta[1] };
      var td = cageTdAt(dest.x, dest.y);
      if (!cellIsDangerous(td, dest)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }

    ['pointerdown', 'mousedown', 'click', 'touchstart'].forEach(function (type) {
      ctx.on(document, type, blockDangerousClick, true);
    });
    ['keydown', 'keypress'].forEach(function (type) {
      ctx.on(document, type, blockDangerousKey, true);
    });

    ctx.addCleanup(function () {
      ctx.dom.qsa('#cages td.cage[data-cwb-lu], #cages td.cage[data-cwb-lu-fill], #cages td.cage[data-cwb-lu-block]').forEach(clearFieldMarks);
    });

    paintNav();
    paintTrain();
    save();
    ctx.addCleanup(ctx.storage.watch(STORAGE_KEY, function (next) {
      if (ctx.isDisposed() || !next || typeof next !== 'object') return;
      maps = normalizeMaps(next);
      paintAll();
    }));

    return ctx.whenVueReady().then(function (vm) {
      if (!vm || ctx.isDisposed()) return;
      lastLoc = (ctx.vue.get('field.location') || {}).name || null;
      fillFromServer();
      scanUnsafeDom();
      paintAll();
      ctx.watch('field.map', function () {
        if (ctx.isDisposed()) return;
        syncFromField();
        paintField();
      }, SYNC);
      ctx.watch('field.cats', function () {
        if (ctx.isDisposed()) return;
        syncCatHere();
        scanChatHead();
      }, SYNC);
      ctx.watch('chat.messages', function () {
        if (ctx.isDisposed()) return;
        scanChatHead();
      }, SYNC);
      ctx.watch('field.location', onLocation, SYNC);
      ctx.watch('field.smellMap', paintField);
      ctx.watch('hunt.mode', paintField);
      ctx.watch('parameter.data.tree', paintSkill, { deep: true });

      var cagesHost = document.getElementById('cages_div')
        || document.getElementById('cages_overflow')
        || document.getElementById('cages');
      if (cagesHost) {
        ctx.observe(cagesHost, function () {
          if (ctx.isDisposed()) return;
          scanUnsafeDom();
          paintField();
        }, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
      }
      var errorEl = document.getElementById('error');
      if (errorEl) {
        ctx.observe(errorEl, function () {
          if (ctx.isDisposed()) return;
          readErrorCrack();
        }, { childList: true, characterData: true, subtree: true });
      }

      ctx.addCleanup(socket.on('msg', function (payload) {
        if (ctx.isDisposed()) return;
        ingestChatMsg(payload);
      }));
      ctx.addCleanup(socket.on('info', function (payload) {
        if (ctx.isDisposed()) return;
        var mark = crackMarkFromChat({ text: String(payload || '') });
        if (mark) applyCrackNow(mark, false);
      }));
      ctx.addCleanup(socket.on('tree cage', function (t) {
        if (ctx.isDisposed() || !t) return;
        var mark = markFromTree(t.value);
        if (!mark) return;
        if (mark !== 'mine' && !ctx.settings.get('autoFromServer')) return;
        applyToCell(t.x, t.y, mark, mark === 'mine');
      }));

      ctx.interval(function () {
        if (ctx.isDisposed()) return;
        scanChatHead();
        readErrorCrack();
        syncFromField();
        syncCatHere();
        paintTrain();
      }, 50);

      if (ctx.vue.onChatMessage) {
        ctx.addCleanup(ctx.vue.onChatMessage(function (fresh) {
          if (!ctx.settings.get('autoFromChat') || !fresh) return;
          fresh.forEach(ingestChatMsg);
        }));
      }
    });
  },

  onSettings: function (ctx, key) {
    if (key === 'x' || key === 'y' || key === 'collapsed' || key === 'blockDangerous' || key === 'mapsEditor') return;
    var registry = require('core/registry');
    registry.stopModule('climbing-field');
    registry.startModule('climbing-field');
  },
};
