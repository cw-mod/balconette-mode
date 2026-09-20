/**
 * Поле для лазательных умений («минное поле»).
 *
 * Как в UwU / Shed: сетка 10×6, вкладки ярусов, цифры 0–7 = громкость треска,
 * X = мина, = = переход. Карты хранятся в cwb:climbing-maps и не сбрасываются
 * при обновлении страницы. Опаска things/564.png на .cage_items ставит X сама.
 * Плюс: дублируем пометки на клетках #cages и автоматически ставим цифру
 * в клетку, где стоит кот (громкость из чата или ярус field.map[y][x].tree).
 *
 * Не считает шанс залезть. Не пишет в Vue-стейт. Не трогает чат-DOM.
 */

var dom = require('core/dom');
var socket = require('core/socket');

var ROWS = 6;
var COLS = 10;
var STORAGE_KEY = 'climbing-maps';
var LEGACY_KEY = 'climbing-grid';
var DEFAULT_TABS = 6;
var MAX_TABS = 24;
var UNSAFE_RE = /tree_images\/unsafe/i;
/** Моргающая опаска на поле — предмет things/564.png на .cage_items (сохранёнка «опаска»). */
var DANGER_THING_RE = /things\/564(?:\.png)?/i;
var DANGER_TYPE = 564;
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
  if (!Array.isArray(raw) || raw.length !== ROWS * COLS) return emptyGrid();
  return raw.map(function (v) { return typeof v === 'string' ? v : ''; });
}

function defaultMaps() {
  var tabs = [];
  for (var i = 0; i < DEFAULT_TABS; i++) {
    tabs.push({ name: 'Ярус ' + (i + 1), grid: emptyGrid() });
  }
  return { version: 1, current: 0, tabs: tabs };
}

function loadMaps(storage) {
  var raw = storage.get(STORAGE_KEY, null);
  if (raw && Array.isArray(raw.tabs) && raw.tabs.length) {
    raw.tabs.forEach(function (tab, i) {
      if (!tab || typeof tab !== 'object') raw.tabs[i] = { name: 'Ярус ' + (i + 1), grid: emptyGrid() };
      else {
        tab.name = String(tab.name || ('Ярус ' + (i + 1)));
        tab.grid = normalizeGrid(tab.grid);
      }
    });
    if (typeof raw.current !== 'number' || raw.current < 0 || raw.current >= raw.tabs.length) raw.current = 0;
    raw.version = 1;
    return raw;
  }
  var maps = defaultMaps();
  var legacy = storage.get(LEGACY_KEY, null);
  if (Array.isArray(legacy) && legacy.length === ROWS * COLS) {
    maps.tabs[0].grid = normalizeGrid(legacy);
    storage.set(STORAGE_KEY, maps);
  }
  return maps;
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
 * Треск в чате (HAR «хожу по лазалке», 2026-09-20):
 *   42["msg", { text: "[треск]", login: "ветвь …", mute: 1, volume: 1..5 }]
 * Параллельный тост 42["info","Я слышу … треск."] — те же громкости.
 * Не берём любые системные реплики и не берём «оглушительный» без volume.
 */
function crackMarkFromChat(msg) {
  if (!msg) return '';
  var text = String(msg.text || '').replace(/<[^>]*>/g, '');
  var isBracket = /\[треск\]/i.test(text);
  var isHear = /^я слышу\s+.+\s+треск/i.test(text.trim());
  if (!isBracket && !isHear) return '';
  var vol = Number(msg.volume);
  if (!isNaN(vol) && vol >= 0 && vol <= 7) return String(vol);
  var t = text.toLowerCase();
  if (/оглушительн/.test(t)) return '';
  if (/едва различим/.test(t)) return '1';
  if (/очень громк/.test(t)) return '5';
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

module.exports = {
  id: 'climbing-field',
  title: 'Поле для ЛУ',
  description: 'Минное поле 10×6 с вкладками ярусов: цифры треска, мины и переходы. Карты сохраняются между обновлениями.',
  category: 'field',
  pages: ['game'],
  enabledByDefault: false,
  order: 25,

  defaults: {
    overlay: true,
    autoFromServer: true,
    autoFromChat: true,
    showSkill: true,
    collapsed: false,
    x: null,
    y: null,
    clearOnLocation: false,
  },

  schema: [
    { key: 'overlay', type: 'boolean', label: 'Дублировать пометки на игровом поле' },
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
      label: 'Очищать текущую вкладку при смене локации',
      hint: 'По умолчанию выключено: карты хранятся во вкладках «Ярус 1…» и переживают обновление страницы.',
    },
  ],

  styles: function () {
    return [
      '#cwb-lu{position:fixed;z-index:2147482500;min-width:220px;background:rgba(32,28,24,.94);',
      'color:#f3e7d3;border:1px solid #5a4e3e;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);',
      'font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;user-select:none;}',
      '#cwb-lu-head{display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:move;',
      'background:#3a332b;border-radius:10px 10px 0 0;}',
      '#cwb-lu-head strong{flex:1;font-size:13px;}',
      '#cwb-lu-skill{opacity:.75;font-size:11px;}',
      '#cwb-lu-fold{background:none;border:none;color:#f3e7d3;cursor:pointer;font-size:16px;padding:0 4px;}',
      '#cwb-lu-body{padding:8px;}',
      '#cwb-lu-body[hidden]{display:none;}',
      '#cwb-lu-grid{border-collapse:collapse;margin:0 auto;}',
      '#cwb-lu-grid td{position:relative;width:22px;height:22px;border:1px solid #6a5d4c;text-align:center;',
      'font:700 12px/22px ui-monospace,Menlo,Consolas,monospace;cursor:pointer;background:#2a241e;}',
      '#cwb-lu-grid td:focus{outline:2px solid #e8c27a;outline-offset:-2px;}',
      '#cwb-lu-grid td[data-cwb-here]{box-shadow:inset 0 0 0 2px #e8c27a;}',
      '#cwb-lu-grid td[data-cwb-here]::before{content:"";position:absolute;left:1px;top:1px;width:5px;height:5px;',
      'border-radius:50%;background:#e8c27a;pointer-events:none;z-index:1;}',
      '#cwb-lu-help{margin-top:6px;font-size:11px;opacity:.7;}',
      '#cwb-lu-tabs{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 6px;align-items:center;}',
      '#cwb-lu-tabs button{min-width:22px;height:20px;padding:0 6px;border:1px solid #6a5d4c;',
      'border-radius:4px;background:#2a241e;color:#f3e7d3;cursor:pointer;font:11px/18px inherit;}',
      '#cwb-lu-tabs button.active{background:#e8c27a;color:#2a1f12;border-color:#e8c27a;}',
      '#cwb-lu-tabs .cwb-lu-tab-add,#cwb-lu-tabs .cwb-lu-tab-del{opacity:.8;}',
      '#cwb-lu-tools{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;}',
      '#cwb-lu-tools button{min-width:22px;height:20px;padding:0 5px;border:1px solid #6a5d4c;',
      'border-radius:4px;background:#3a332b;color:#f3e7d3;cursor:pointer;font:11px/18px inherit;}',
      '#cages td.cage{position:relative;}',
      '#cages td.cage[data-cwb-lu-fill]::before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;',
      'z-index:5;pointer-events:none;}',
      '#cages td.cage[data-cwb-lu-fill="safe"]::before{background:rgba(46,130,50,.28);}',
      '#cages td.cage[data-cwb-lu-fill="mine"]::before{background:rgba(180,16,16,.32);}',
      '#cages td.cage[data-cwb-lu-fill="transit"]::before{background:rgba(255,236,140,.3);}',
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

    function currentGrid() {
      if (!maps.tabs.length) maps.tabs = defaultMaps().tabs;
      if (maps.current < 0 || maps.current >= maps.tabs.length) maps.current = 0;
      if (!maps.tabs[maps.current].grid) maps.tabs[maps.current].grid = emptyGrid();
      return maps.tabs[maps.current].grid;
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
    var tools = dom.el('div', { id: 'cwb-lu-tools' });
    ['0', '1', '2', '3', '4', '5', '6', '7', 'X', '=', 'очистить'].forEach(function (label) {
      tools.appendChild(dom.el('button', { type: 'button', 'data-mark': label, text: label }));
    });

    var body = dom.el('div', { id: 'cwb-lu-body' }, [
      tabsEl,
      table,
      tools,
      dom.el('div', { id: 'cwb-lu-help', text: 'Клавиши 0–7, «-» мина, «=» переход. Вкладки — разные ярусы, карта не сбрасывается при обновлении.' }),
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
    }

    function paintField() {
      var tds = ctx.dom.qsa('#cages td.cage');
      if (!ctx.settings.get('overlay') || fieldHidden()) {
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
        if (!mark) {
          clearFieldMarks(td);
          return;
        }
        td.dataset.cwbLu = labelOf(mark);
        td.dataset.cwbLuFill = fillKind(mark);
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

    function paintTabs() {
      tabsEl.textContent = '';
      maps.tabs.forEach(function (tab, i) {
        var btn = dom.el('button', {
          type: 'button',
          'data-tab': String(i),
          text: tab.name || ('Ярус ' + (i + 1)),
          title: 'Двойной клик — переименовать',
        });
        if (i === maps.current) btn.className = 'active';
        tabsEl.appendChild(btn);
      });
      tabsEl.appendChild(dom.el('button', {
        type: 'button',
        className: 'cwb-lu-tab-add',
        'data-tab-act': 'add',
        text: '+',
        title: 'Новый ярус',
      }));
      if (maps.tabs.length > 1) {
        tabsEl.appendChild(dom.el('button', {
          type: 'button',
          className: 'cwb-lu-tab-del',
          'data-tab-act': 'del',
          text: '×',
          title: 'Удалить текущий ярус',
        }));
      }
    }

    function switchTab(i) {
      if (typeof i !== 'number' || i < 0 || i >= maps.tabs.length) return;
      maps.current = i;
      save();
      paintAll();
    }

    function addTab() {
      if (maps.tabs.length >= MAX_TABS) return;
      maps.tabs.push({ name: 'Ярус ' + (maps.tabs.length + 1), grid: emptyGrid() });
      maps.current = maps.tabs.length - 1;
      save();
      paintAll();
    }

    function deleteTab() {
      if (maps.tabs.length <= 1) return;
      maps.tabs.splice(maps.current, 1);
      if (maps.current >= maps.tabs.length) maps.current = maps.tabs.length - 1;
      save();
      paintAll();
    }

    function renameTab(i) {
      var tab = maps.tabs[i];
      if (!tab) return;
      var next = window.prompt('Имя яруса', tab.name || ('Ярус ' + (i + 1)));
      if (next == null) return;
      next = String(next).trim();
      if (!next) return;
      tab.name = next.slice(0, 24);
      save();
      paintTabs();
    }

    function paintAll() {
      paintTabs();
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

    function applyCrackNow(mark) {
      if (!mark || !ctx.settings.get('autoFromChat')) return;
      var pos = myPos();
      if (!pos) return;
      applyToCell(pos.x, pos.y, mark, true);
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
      if (mark) applyCrackNow(mark);
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
        maps.tabs[maps.current].grid = emptyGrid();
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
      var btn = e.target.closest && e.target.closest('button');
      if (!btn || !tabsEl.contains(btn)) return;
      var act = btn.getAttribute('data-tab-act');
      if (act === 'add') { addTab(); return; }
      if (act === 'del') { deleteTab(); return; }
      if (btn.hasAttribute('data-tab')) switchTab(parseInt(btn.getAttribute('data-tab'), 10));
    });
    ctx.on(tabsEl, 'dblclick', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-tab]');
      if (!btn) return;
      renameTab(parseInt(btn.getAttribute('data-tab'), 10));
    });

    ctx.on(tools, 'click', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-mark]');
      if (!btn) return;
      var mark = btn.getAttribute('data-mark');
      if (mark === 'очистить') {
        maps.tabs[maps.current].grid = emptyGrid();
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

    ctx.addCleanup(function () {
      ctx.dom.qsa('#cages td.cage[data-cwb-lu], #cages td.cage[data-cwb-lu-fill]').forEach(clearFieldMarks);
    });

    paintTabs();
    save();

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
        if (mark) applyCrackNow(mark);
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
    if (key === 'x' || key === 'y' || key === 'collapsed') return;
    var registry = require('core/registry');
    registry.stopModule('climbing-field');
    registry.startModule('climbing-field');
  },
};
