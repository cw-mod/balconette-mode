// ==UserScript==
// @name         CatWar Кач ЛУ
// @name:ru      CatWar Кач ЛУ
// @namespace    catwar-balconette-lu
// @version      1.2.0
// @description  Минное поле для лазательных умений: вкладки/поля, автопометки по треску и ярусам, блокировка опасных клеток, перенос пометок на игровую, координаты клеток при наведении.
// @description:ru Минное поле для лазательных умений: вкладки/поля, автопометки по треску и ярусам, блокировка опасных клеток, перенос пометок на игровую, координаты клеток при наведении.
// @author       balconette
// @license      MIT
// @homepageURL  https://cw-mod.github.io/balconette-mode/
// @supportURL   https://github.com/cw-mod/balconette-mode/issues
// @updateURL    https://cw-mod.github.io/balconette-mode/catwar-balconette-lu.meta.js
// @downloadURL  https://cw-mod.github.io/balconette-mode/catwar-balconette-lu.user.js
// @match        *://*.catwar.su/*
// @match        *://*.catwar.net/*
// @exclude      *://catwar.su/ws/*
// @exclude      *://*.catwar.su/ws/*
// @exclude      *://catwar.net/ws/*
// @exclude      *://*.catwar.net/ws/*
// @grant        none
// @run-at       document-start
// @noframes
// ==/UserScript==

/* eslint-disable */
/* Собрано автоматически: src/standalone/klu.js + шапка. Не редактировать руками. */

(function () {
  'use strict';

  /* @run-at document-start — чтобы хук сокета встал ДО загрузки бандла игры. */

  /* ================================ СТРАНИЦА ================================ */

  function detectPage() {
    var p = location.pathname.replace(/\/+$/, '') || '/';
    if (p === '/cw3') return 'game';
    if (p.indexOf('/cw3/') === 0) return 'cw3-other';
    return 'site';
  }

  var PAGE = detectPage();

  function logInfo() { try { console.info.apply(console, ['[КачЛУ]'].concat([].slice.call(arguments))); } catch (e) {} }
  function logWarn() { try { console.warn.apply(console, ['[КачЛУ]'].concat([].slice.call(arguments))); } catch (e) {} }

  /* ============================== DOM-УТИЛИТЫ ============================== */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'text') node.textContent = String(value);
        else if (key === 'class' || key === 'className') node.className = String(value);
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function qs(selector, root) {
    try { return (root || document).querySelector(selector); } catch (e) { return null; }
  }
  function qsa(selector, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); } catch (e) { return []; }
  }
  function on(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== 'function') return function () {};
    target.addEventListener(type, handler, options);
    return function () { try { target.removeEventListener(type, handler, options); } catch (e) {} };
  }
  function observe(target, callback, options) {
    if (!target) return function () {};
    var obs;
    try {
      obs = new MutationObserver(callback);
      obs.observe(target, options || { childList: true, subtree: true });
    } catch (e) { return function () {}; }
    return function () { try { obs.disconnect(); } catch (e) {} };
  }
  function injectCss(css) {
    var style = document.getElementById('klu-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'klu-style';
      (document.head || document.documentElement || document.body).appendChild(style);
    }
    style.textContent = css;
  }

  /* =============================== ХРАНИЛИЩЕ =============================== */

  var LS_PREFIX = 'klu:';
  var listeners = Object.create(null);

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(LS_PREFIX + key);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    var str;
    try { str = JSON.stringify(value); } catch (e) { return false; }
    try { localStorage.setItem(LS_PREFIX + key, str); } catch (e) { return false; }
    notify(key, value);
    return true;
  }
  function notify(key, value) {
    var list = listeners[key];
    if (list) list.slice().forEach(function (cb) { try { cb(value, key); } catch (e) {} });
  }
  function lsWatch(key, cb) {
    (listeners[key] || (listeners[key] = [])).push(cb);
    return function () {
      var l = listeners[key];
      if (!l) return;
      var i = l.indexOf(cb);
      if (i >= 0) l.splice(i, 1);
    };
  }
  window.addEventListener('storage', function (e) {
    if (!e || !e.key || e.key.indexOf(LS_PREFIX) !== 0) return;
    var key = e.key.slice(LS_PREFIX.length);
    var value;
    try { value = e.newValue === null ? undefined : JSON.parse(e.newValue); } catch (err) { return; }
    notify(key, value);
  });

  var S = { get: lsGet, set: lsSet, watch: lsWatch };

  /* ============================= НАСТРОЙКИ ================================= */

  var SETTINGS_KEY = 'settings';
  var DEFAULTS = {
    enabled: true,          // панель Кач ЛУ целиком
    overlay: true,          // «Переносить на игровую» — пометки на клетках поля
    blockDangerous: true,   // режим «Кач ЛУ»: не ходить на опасное
    autoFromServer: true,   // ярусы деревьев из игры
    autoFromChat: true,     // цифра по треску в чате
    showSkill: true,        // своё лазание в шапке
    showCoords: true,       // координаты клетки при наведении
    clearOnLocation: false,
    collapsed: false,
    x: null,
    y: null,
  };

  function settingsAll() {
    var out = Object.assign({}, DEFAULTS);
    var stored = lsGet(SETTINGS_KEY, null);
    if (stored && typeof stored === 'object') {
      Object.keys(DEFAULTS).forEach(function (k) {
        if (typeof stored[k] !== 'undefined') out[k] = stored[k];
      });
    }
    return out;
  }
  function settingsGet(key) { return settingsAll()[key]; }
  function settingsSet(key, value) {
    var next = settingsAll();
    next[key] = value;
    lsSet(SETTINGS_KEY, next);
  }

  /* ====================== ХУК ИГРОВОГО СОКЕТА (чтение) ===================== */

  var Socket = (function () {
    var PATH_MARKER = '/ws/cw3/socket.io';
    var installed = false;
    var listeners = [];

    function emit(event, payload) {
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i].event === event) {
          try { listeners[i].cb(payload); } catch (e) { /* noop */ }
        }
      }
    }

    /* Кадры Socket.IO 2: 42[...] в т.ч. внутри "<len>:42[...]" (polling). */
    function parseFrame(data) {
      if (typeof data !== 'string') return;
      var rest = data;
      var framed = /^\d+:/.test(rest);
      while (rest.length) {
        var chunk = rest;
        if (framed) {
          var m = /^(\d+):/.exec(rest);
          if (!m) break;
          var len = parseInt(m[1], 10);
          chunk = rest.substr(m[0].length, len);
          rest = rest.slice(m[0].length + len);
        } else {
          rest = '';
        }
        if (chunk.indexOf('42') !== 0) continue;
        try {
          var parsed = JSON.parse(chunk.slice(2));
          if (Array.isArray(parsed) && parsed.length) emit(String(parsed[0]), parsed[1]);
        } catch (e) { /* не наш кадр */ }
      }
    }

    function install() {
      if (installed) return true;
      var Native = window.WebSocket;
      if (typeof Native !== 'function') return false;
      function Hooked(url, protocols) {
        var ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
        try {
          if (String(url).indexOf(PATH_MARKER) >= 0) {
            ws.addEventListener('message', function (e) { parseFrame(e.data); });
            logInfo('сокет перехвачен:', url);
          }
        } catch (e) { /* noop */ }
        return ws;
      }
      Hooked.prototype = Native.prototype;
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { Hooked[k] = i; });
      try { window.WebSocket = Hooked; installed = true; return true; }
      catch (e) { return false; }
    }

    function onEvent(event, cb) {
      var entry = { event: event, cb: cb };
      listeners.push(entry);
      return function () {
        var i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    return { install: install, on: onEvent };
  })();

  /* =============================== МОСТ К VUE ============================== */

  var vueCache = { vm: null };

  function probeVue() {
    var appEl = document.getElementById('app');
    if (appEl) {
      if (appEl.__vue__) return appEl.__vue__; // Vue 2
      if (appEl.__vue_app__ && appEl.__vue_app__._instance && appEl.__vue_app__._instance.proxy) {
        return appEl.__vue_app__._instance.proxy; // Vue 3
      }
    }
    var kids = document.body ? document.body.children : [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].__vue__) return kids[i].__vue__;
      if (kids[i].__vue_app__ && kids[i].__vue_app__._instance && kids[i].__vue_app__._instance.proxy) {
        return kids[i].__vue_app__._instance.proxy;
      }
    }
    return null;
  }

  function waitForVue(opts) {
    opts = opts || {};
    var timeout = typeof opts.timeout === 'number' ? opts.timeout : 30000;
    return new Promise(function (resolve) {
      if (vueCache.vm) { resolve(vueCache.vm); return; }
      var started = Date.now();
      var timer = setInterval(function () {
        var vm = probeVue();
        if (vm) { vueCache.vm = vm; clearInterval(timer); logInfo('Vue найден'); resolve(vm); return; }
        if (Date.now() - started > timeout) {
          clearInterval(timer);
          logWarn('Vue не найден за ' + timeout + ' мс — авто-функции ограничены, ручная сетка работает');
          resolve(null);
        }
      }, 250);
    });
  }

  function vmHas(vm, key) {
    if (!vm || key == null) return false;
    try {
      if (vm.$data && key in vm.$data) return true;
      return key in vm;
    } catch (e) { return false; }
  }

  function resolveVm(seg) {
    var root = vueCache.vm;
    if (!root) return null;
    if (vmHas(root, seg)) return root;
    var found = null;
    (function walk(vm) {
      if (found || !vm) return;
      var kids;
      try { kids = vm.$children || []; } catch (e) { kids = []; }
      for (var i = 0; i < kids.length; i++) {
        if (vmHas(kids[i], seg)) { found = kids[i]; return; }
        walk(kids[i]);
        if (found) return;
      }
    })(root);
    return found || root;
  }

  function vueGet(path) {
    var root = vueCache.vm;
    if (!root) return undefined;
    var parts = String(path).split('.');
    var vm = resolveVm(parts[0]);
    if (!vm) return undefined;
    var cur = vm;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      try { cur = cur[parts[i]]; } catch (e) { return undefined; }
    }
    return cur;
  }

  function vueWatch(path, cb, opts) {
    opts = opts || {};
    var un = null;
    var dead = false;
    waitForVue({ timeout: 30000 }).then(function (root) {
      if (dead || !root) return;
      var vm = resolveVm(String(path).split('.')[0]) || root;
      var wopts = {};
      if (opts.deep) wopts.deep = true;
      if (opts.flush) wopts.flush = opts.flush;
      try { un = vm.$watch(path, cb, wopts); } catch (e) { un = null; logWarn('$watch не встал:', path, e); }
      if (dead && un) { try { un(); } catch (e2) {} un = null; }
    });
    return function () {
      dead = true;
      if (un) { try { un(); } catch (e) {} un = null; }
    };
  }

  /* ====================== КАРТЫ МИННИКА (10×6) ============================= */

  var ROWS = 6;
  var COLS = 10;
  var MAPS_KEY = 'climbing-maps';
  var LEGACY_KEY = 'climbing-grid';
  var DEFAULT_TAB_NAMES = ['Вкладка 1', 'Вкладка 2'];
  var DEFAULT_FIELDS = 5;
  var MAX_TABS = 24;
  var MAX_FIELDS = 24;

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

  function emptyGrid() {
    var g = [];
    for (var i = 0; i < ROWS * COLS; i++) g.push('');
    return g;
  }

  function normalizeMark(value) {
    if (value === 'mine' || value === 'X' || value === 'x' || value === '-') return 'mine';
    if (value === 'transit' || value === '=') return 'transit';
    if (/^[0-7]$/.test(String(value))) return String(value);
    return '';
  }

  function normalizeGrid(raw) {
    if (Array.isArray(raw) && raw.length === ROWS && Array.isArray(raw[0])) {
      var flat = [];
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          var cell = raw[y] && raw[y][x];
          var v = cell && typeof cell === 'object' ? cell.value : cell;
          flat.push(normalizeMark(typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '')));
        }
      }
      return flat;
    }
    if (!Array.isArray(raw) || raw.length !== ROWS * COLS) return emptyGrid();
    return raw.map(function (v) { return normalizeMark(typeof v === 'string' ? v : ''); });
  }

  function emptyTable(name) { return { name: name || 'Поле 1', grid: emptyGrid() }; }

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
        if (!t || typeof t !== 'object') { tables.push(emptyTable('Поле ' + (j + 1))); return; }
        tables.push({ name: String(t.name || ('Поле ' + (j + 1))), grid: normalizeGrid(t.grid || t.data) });
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
    var currentTab = typeof raw.currentTab === 'number' ? raw.currentTab : 0;
    if (currentTab < 0 || currentTab >= tabs.length) currentTab = 0;
    return { version: 2, currentTab: currentTab, tabs: tabs };
  }

  function loadMaps() {
    var raw = S.get(MAPS_KEY, null);
    if (raw && Array.isArray(raw.tabs) && raw.tabs.length) return normalizeMaps(raw);
    var maps = defaultMaps();
    var legacy = lsGet(LEGACY_KEY, null);
    if (Array.isArray(legacy) && legacy.length === ROWS * COLS) {
      maps.tabs[0].tables[0].grid = normalizeGrid(legacy);
      S.set(MAPS_KEY, maps);
    }
    return maps;
  }

  function clipName(value, fallback) {
    var next = String(value == null ? '' : value).trim();
    if (!next) return fallback;
    return next.slice(0, 32);
  }

  /* ============================ ОБЩИЕ ХЕЛПЕРЫ ============================== */

  function idx(x, y) { return (y - 1) * COLS + (x - 1); }

  function cellCoords(td) {
    var tr = td.parentElement;
    if (!tr || !tr.parentElement) return null;
    return {
      y: Array.prototype.indexOf.call(tr.parentElement.children, tr) + 1,
      x: Array.prototype.indexOf.call(tr.children, td) + 1,
    };
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

  function labelOf(mark) {
    if (mark === 'mine') return 'X';
    if (mark === 'transit') return '=';
    return mark;
  }

  /* Треск: цифра — только msg.volume (0..7). «Очень громкий» общий у 5 и 6,
     «оглушительный» без volume — не мапим. */
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

  var UNSAFE_RE = /tree_images\/unsafe/i;
  var DANGER_THING_RE = /things\/564(?:\.png)?/i; // моргающая опаска
  var DANGER_TYPE = 564;

  function styleBlob(node) {
    if (!node) return '';
    var s = (node.getAttribute && node.getAttribute('style')) || '';
    if (node.style) {
      s += ' ' + (node.style.cssText || '') + ' ' + (node.style.backgroundImage || '') + ' ' + (node.style.background || '');
    }
    try {
      var cs = window.getComputedStyle(node);
      if (cs) s += ' ' + (cs.backgroundImage || '') + ' ' + (cs.background || '');
    } catch (e) { /* detached */ }
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
    try { if (looksDangerous(td.innerHTML || '')) return true; } catch (e) {}
    var items = td.querySelector && td.querySelector('.cage_items');
    if (items && looksDangerous(styleBlob(items))) return true;
    var imgs = td.querySelectorAll ? td.querySelectorAll('img') : [];
    for (var i = 0; i < imgs.length; i++) {
      if (looksDangerous(imgs[i].getAttribute('src') || '')) return true;
    }
    return false;
  }

  /* Ходы игры: WASD + QEZX (и ЦФЫВ/ЙУЯЧ). */
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

  function moveDelta(e) {
    if (!e) return null;
    if (e.code && MOVE_BY_CODE[e.code]) return MOVE_BY_CODE[e.code];
    if (e.key && MOVE_BY_KEY[e.key]) return MOVE_BY_KEY[e.key];
    if (e.keyCode && MOVE_BY_KEYCODE[e.keyCode]) return MOVE_BY_KEYCODE[e.keyCode];
    return null;
  }

  function isTypingContext(node) {
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentElement;
    if (!node || !node.closest) return false;
    if (node.closest('#chat_form, #text, #klu-lu, #klu-panel, #klu-gear, input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
    var tag = (node.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!node.isContentEditable;
  }

  function cageTdAt(x, y) {
    if (x < 1 || x > COLS || y < 1 || y > ROWS) return null;
    var tds = qsa('#cages td.cage');
    return tds[(y - 1) * COLS + (x - 1)] || null;
  }

  var SYNC = { deep: true, sync: true, flush: 'sync' };

  /* ============================ МОДУЛЬ Кач ЛУ ============================== */

  function initModule(ctx) {
    var maps = loadMaps();
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
    function hasCurrentField() { return !!currentTable(); }

    /* ------------------------------ DOM панели ------------------------------ */

    var skillEl = el('span', { id: 'klu-lu-skill' });
    var foldBtn = el('button', { id: 'klu-lu-fold', type: 'button', title: 'Свернуть', text: '−' });
    var head = el('div', { id: 'klu-lu-head' }, [
      el('strong', { text: 'Поле для ЛУ' }),
      skillEl,
      foldBtn,
    ]);

    var table = el('table', { id: 'klu-lu-grid' });
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

    var tabsEl = el('div', { id: 'klu-lu-tabs' });
    var fieldsEl = el('div', { id: 'klu-lu-fields' });

    /* «Переносить на игровую» — прямо в панели минника, над вкладками/локациями */
    var overlayCb = el('input', { type: 'checkbox' });
    overlayCb.checked = !!ctx.settings.get('overlay');
    overlayCb.addEventListener('change', function () {
      ctx.settings.set('overlay', overlayCb.checked);
      paintField();
    });
    var overlayRow = el('label', {
      id: 'klu-lu-overlay',
      title: 'Дублировать пометки (безопасно/мина/переход) и цифры на клетках игрового поля',
    }, [overlayCb, document.createTextNode(' Переносить на игровую')]);

    var nav = el('div', { id: 'klu-lu-nav' }, [
      overlayRow,
      el('h3', { text: 'Вкладка' }),
      tabsEl,
      el('h3', { text: 'Локация' }),
      fieldsEl,
    ]);

    var emptyEl = el('div', { id: 'klu-lu-empty', text: 'Добавь поле или таблицу в настройках' });
    var trainBtn = el('button', { type: 'button', id: 'klu-lu-train', text: 'Кач ЛУ', title: 'В каче ЛУ не ходить на опасные клетки' });
    var tools = el('div', { id: 'klu-lu-tools' });
    ['0', '1', '2', '3', '4', '5', '6', '7', 'X', '=', 'очистить'].forEach(function (label) {
      tools.appendChild(el('button', { type: 'button', 'data-mark': label, text: label }));
    });

    var body = el('div', { id: 'klu-lu-body' }, [
      nav,
      emptyEl,
      table,
      trainBtn,
      tools,
      el('div', { id: 'klu-lu-help', text: 'Клавиши 0–7, «-» мина, «=» переход. Вкладки и поля — в настройках (⚙). «Кач ЛУ» не даёт кликнуть и пойти WASD на опасные клетки.' }),
    ]);

    var panel = el('div', { id: 'klu-lu' }, [head, body]);
    var s0 = ctx.settings.all();
    if (typeof s0.x === 'number' && typeof s0.y === 'number') {
      panel.style.left = s0.x + 'px';
      panel.style.top = s0.y + 'px';
    } else {
      panel.style.right = '16px';
      panel.style.top = '120px';
    }
    body.hidden = !!s0.collapsed;
    foldBtn.textContent = s0.collapsed ? '+' : '−';
    ctx.mount(panel);

    function save() { S.set(MAPS_KEY, maps); }

    /* ----------------------------- позиция кота ----------------------------- */

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

    /* ------------------------------ отрисовка ------------------------------- */

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
        if (here && td.dataset.i === here) td.dataset.kluHere = '1';
        else delete td.dataset.kluHere;
      });
    }

    function fieldHidden() {
      if (ctx.vue.get('hunt.mode')) return true;
      var smell = ctx.vue.get('field.smellMap');
      return !!(smell && typeof smell === 'object');
    }

    function clearFieldMarks(td) {
      delete td.dataset.kluLu;
      delete td.dataset.kluLuFill;
      delete td.dataset.kluLuBlock;
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
      var tds = qsa('#cages td.cage');
      var hidden = fieldHidden();
      var overlayOn = ctx.settings.get('overlay') && !hidden;   // «Переносить на игровую»
      var blockOn = ctx.settings.get('blockDangerous') && !hidden;
      if (!overlayOn && !blockOn) { tds.forEach(clearFieldMarks); return; }
      tds.forEach(function (td) {
        var c = cellCoords(td);
        if (!c || c.x < 1 || c.x > COLS || c.y < 1 || c.y > ROWS) { clearFieldMarks(td); return; }
        var mark = currentGrid()[idx(c.x, c.y)];
        if (overlayOn && mark) {
          td.dataset.kluLu = labelOf(mark);
          td.dataset.kluLuFill = fillKind(mark);
        } else {
          delete td.dataset.kluLu;
          delete td.dataset.kluLuFill;
        }
        if (blockOn && cellIsDangerous(td, c)) td.dataset.kluLuBlock = '1';
        else delete td.dataset.kluLuBlock;
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
        var btn = el('button', { type: 'button', 'data-tab': String(i), text: tab.name || ('Вкладка ' + (i + 1)) });
        if (i === maps.currentTab) btn.className = 'active';
        tabsEl.appendChild(btn);
      });
      var tab = currentTab();
      if (tab) {
        tab.tables.forEach(function (field, i) {
          var btn = el('button', { type: 'button', 'data-field': String(i), text: field.name || ('Поле ' + (i + 1)) });
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

    /* ----------------------------- правки сетки ----------------------------- */

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

    /* -------------------------- автозаполнение ------------------------------ */

    function fillFromServer() {
      if (!ctx.settings.get('autoFromServer')) return;
      var map = ctx.vue.get('field.map');
      if (!map) return;
      var changed = false;
      for (var yy = 1; yy <= ROWS; yy++) {
        for (var xx = 1; xx <= COLS; xx++) {
          var cage = map[yy] && map[yy][xx];
          var mark = cage ? markFromTree(cage.tree) : '';
          if (!mark) continue;
          var i = idx(xx, yy);
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
      var tds = qsa('#cages td.cage');
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

    /* ------------------------------ события -------------------------------- */

    cells.forEach(function (td) {
      ctx.on(td, 'focus', function () { focused = parseInt(td.dataset.i, 10); });
      ctx.on(td, 'click', function () { td.focus(); });
      ctx.on(td, 'dblclick', function () { setMark(parseInt(td.dataset.i, 10), ''); });
      ctx.on(td, 'keydown', function (e) {
        var i = parseInt(td.dataset.i, 10);
        if (e.key >= '0' && e.key <= '7') { setMark(i, e.key); e.preventDefault(); }
        else if (e.key === '-' || e.key === 'х' || e.key === 'Х' || e.key === 'x' || e.key === 'X') { setMark(i, 'mine'); e.preventDefault(); }
        else if (e.key === '=' || e.key === '+') { setMark(i, 'transit'); e.preventDefault(); }
        else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === ' ') { setMark(i, ''); e.preventDefault(); }
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

    /* Перетаскивание: только зажатая ЛКМ на шапке. */
    var drag = null;

    function isFoldTarget(t) {
      return !!(t && (t === foldBtn || (t.closest && t.closest('#klu-lu-fold'))));
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
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) { stopDrag(); return; }
      var x = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, drag.px + (e.clientX - drag.x0)));
      var y = Math.max(0, Math.min(window.innerHeight - 40, drag.py + (e.clientY - drag.y0)));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
    });
    ctx.on(document, 'pointerup', stopDrag);
    ctx.on(document, 'pointercancel', stopDrag);

    /* ---------------- координаты клетки при наведении ---------------- */
    /* Работает в двух местах: сетка панели минника и клетки #cages.
       Формат «x, y»: x — столбец 1–10, y — ряд 1–6. Тулип свой, без
       задержки системного title, следует за курсором. */

    var coordsTip = el('div', { id: 'klu-coords-tip' });
    ctx.mount(coordsTip);

    function hideCoordsTip() { coordsTip.style.display = 'none'; }

    function positionCoordsTip(e) {
      var pad = 12;
      var tx = e.clientX + pad;
      var ty = e.clientY + pad;
      var r = coordsTip.getBoundingClientRect();
      if (tx + r.width > window.innerWidth - 2) tx = e.clientX - r.width - pad;
      if (ty + r.height > window.innerHeight - 2) ty = e.clientY - r.height - pad;
      coordsTip.style.left = tx + 'px';
      coordsTip.style.top = ty + 'px';
    }

    function showCoordsTip(x, y, e) {
      if (!ctx.settings.get('showCoords')) { hideCoordsTip(); return; }
      coordsTip.textContent = x + ', ' + y;
      coordsTip.style.display = 'block';
      positionCoordsTip(e);
    }

    ctx.on(document, 'mouseover', function (e) {
      var t = e.target;
      if (!t || !t.closest) { hideCoordsTip(); return; }
      var ptd = t.closest('#klu-lu-grid td');
      if (ptd && ptd.dataset.i != null) {
        var pi = parseInt(ptd.dataset.i, 10);
        if (!isNaN(pi)) {
          showCoordsTip((pi % COLS) + 1, Math.floor(pi / COLS) + 1, e);
          return;
        }
      }
      var gtd = t.closest('#cages td.cage');
      if (gtd) {
        var c = cellCoords(gtd);
        if (c) { showCoordsTip(c.x, c.y, e); return; }
      }
      hideCoordsTip();
    });
    ctx.on(document, 'mousemove', function (e) {
      if (coordsTip.style.display === 'block') positionCoordsTip(e);
    });
    ctx.on(document, 'mousedown', hideCoordsTip);
    ctx.on(window, 'blur', hideCoordsTip);

    /* ------------------- блокировка опасных клеток ------------------------- */

    function blockDangerousClick(e) {
      if (!ctx.settings.get('blockDangerous') || fieldHidden()) return;
      var path = e.target;
      if (!path || !path.closest) return;
      if (path.closest('#klu-lu') || path.closest('#klu-panel') || path.closest('#klu-gear')) return;
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

    /* ------------------------------ подписки ------------------------------- */

    ctx.addCleanup(function () {
      qsa('#cages td.cage[data-klu-lu], #cages td.cage[data-klu-lu-fill], #cages td.cage[data-klu-lu-block]').forEach(clearFieldMarks);
    });

    paintNav();
    paintTrain();
    save();

    ctx.addCleanup(S.watch(MAPS_KEY, function (next) {
      if (ctx.isDisposed() || !next || typeof next !== 'object') return;
      maps = normalizeMaps(next);
      paintAll();
    }));

    // правки настроек применяются на лету (и синхронизируют чекбокс, если поменяли где-то ещё)
    ctx.addCleanup(S.watch(SETTINGS_KEY, function () {
      if (ctx.isDisposed()) return;
      overlayCb.checked = !!ctx.settings.get('overlay');
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

      ctx.addCleanup(Socket.on('msg', function (payload) {
        if (ctx.isDisposed()) return;
        ingestChatMsg(payload);
      }));
      ctx.addCleanup(Socket.on('info', function (payload) {
        if (ctx.isDisposed()) return;
        var mark = crackMarkFromChat({ text: String(payload || '') });
        if (mark) applyCrackNow(mark, false);
      }));
      ctx.addCleanup(Socket.on('tree cage', function (t) {
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
    });
  }

  /* ========================= ЖИЗНЕННЫЙ ЦИКЛ МОДУЛЯ ========================= */

  var modCtx = null;

  function createContext() {
    var cleanups = [];
    var disposed = false;
    function addCleanup(fn) { if (typeof fn === 'function') cleanups.push(fn); return fn; }
    var ctx = {
      log: { info: logInfo, warn: logWarn },
      dom: { qs: qs, qsa: qsa },
      storage: S,
      settings: { get: settingsGet, all: settingsAll, set: function (k, v) { settingsSet(k, v); } },
      vue: { get: vueGet },
      on: function (t, type, h, o) { return addCleanup(on(t, type, h, o)); },
      observe: function (t, cb, o) { return addCleanup(observe(t, cb, o)); },
      watch: function (path, cb, o) { return addCleanup(vueWatch(path, cb, o)); },
      whenVueReady: function () { return waitForVue({ timeout: 30000 }); },
      interval: function (fn, ms) { var t = setInterval(fn, ms); addCleanup(function () { clearInterval(t); }); return t; },
      mount: function (node, parent) {
        (parent || document.body).appendChild(node);
        addCleanup(function () { if (node.parentNode) node.parentNode.removeChild(node); });
        return node;
      },
      addCleanup: addCleanup,
      isDisposed: function () { return disposed; },
    };
    ctx._dispose = function () {
      disposed = true;
      while (cleanups.length) {
        var fn = cleanups.pop();
        try { fn(); } catch (e) {}
      }
    };
    return ctx;
  }

  function startModule() {
    if (PAGE !== 'game' || modCtx) return;
    var ctx = createContext();
    try {
      var result = initModule(ctx);
      if (result && typeof result.catch === 'function') {
        result.catch(function (e) { logWarn('ошибка в асинхронной части модуля', e); });
      }
      modCtx = ctx;
    } catch (e) {
      logWarn('модуль не запустился', e);
      ctx._dispose();
    }
  }

  function stopModule() {
    if (!modCtx) return;
    var ctx = modCtx;
    modCtx = null;
    ctx._dispose();
  }

  /* ======================== РЕДАКТОР ВКЛАДОК И ПОЛЕЙ ======================== */

  function renderMapsEditor() {
    var wrap = el('div', { class: 'klu-maps-editor' });

    function persist(maps) { S.set(MAPS_KEY, maps); draw(); }

    function ask(message, initial) {
      var raw = window.prompt(message, initial == null ? '' : initial);
      if (raw == null) return null;
      return clipName(raw, '');
    }

    function draw() {
      var maps = normalizeMaps(S.get(MAPS_KEY, null));
      wrap.textContent = '';

      wrap.appendChild(el('h4', { text: 'Вкладки' }));
      var tabRow = el('div', { class: 'klu-maps-row' });
      maps.tabs.forEach(function (tab, i) {
        var nameBtn = el('button', { type: 'button', class: i === maps.currentTab ? 'active' : '', text: tab.name });
        nameBtn.addEventListener('click', function () { maps.currentTab = i; persist(maps); });
        var renameBtn = el('button', { type: 'button', class: 'klu-maps-ico', text: '✎', title: 'Переименовать вкладку' });
        renameBtn.addEventListener('click', function () {
          var next = ask('Новое имя вкладки:', tab.name);
          if (!next) return;
          maps.tabs[i].name = next;
          persist(maps);
        });
        var delBtn = el('button', { type: 'button', class: 'klu-maps-ico', text: 'X', title: 'Удалить вкладку' });
        delBtn.addEventListener('click', function () {
          maps.tabs.splice(i, 1);
          if (maps.currentTab >= maps.tabs.length) maps.currentTab = Math.max(0, maps.tabs.length - 1);
          persist(maps);
        });
        tabRow.appendChild(el('div', { class: 'klu-maps-item' }, [nameBtn, renameBtn, delBtn]));
      });
      var addTab = el('button', { type: 'button', class: 'klu-btn', text: '+' });
      addTab.addEventListener('click', function () {
        if (maps.tabs.length >= MAX_TABS) return;
        var name = ask('Имя вкладки:');
        if (!name) return;
        maps.tabs.push(emptyTab(name, 0));
        maps.currentTab = maps.tabs.length - 1;
        persist(maps);
      });
      tabRow.appendChild(addTab);
      wrap.appendChild(tabRow);

      wrap.appendChild(el('h4', { text: 'Локации / Таблицы' }));
      var fieldRow = el('div', { class: 'klu-maps-row' });
      var tab = maps.tabs[maps.currentTab];
      if (tab) {
        tab.tables.forEach(function (table2, i) {
          var nameBtn = el('button', { type: 'button', class: i === tab.currentTable ? 'active' : '', text: table2.name });
          nameBtn.addEventListener('click', function () { tab.currentTable = i; persist(maps); });
          var renameBtn = el('button', { type: 'button', class: 'klu-maps-ico', text: '✎', title: 'Переименовать поле' });
          renameBtn.addEventListener('click', function () {
            var next = ask('Новое имя поля:', table2.name);
            if (!next) return;
            tab.tables[i].name = next;
            persist(maps);
          });
          var delBtn = el('button', { type: 'button', class: 'klu-maps-ico', text: 'X', title: 'Удалить поле' });
          delBtn.addEventListener('click', function () {
            tab.tables.splice(i, 1);
            if (tab.currentTable >= tab.tables.length) tab.currentTable = Math.max(0, tab.tables.length - 1);
            persist(maps);
          });
          fieldRow.appendChild(el('div', { class: 'klu-maps-item' }, [nameBtn, renameBtn, delBtn]));
        });
        var addField = el('button', { type: 'button', class: 'klu-btn', text: '+' });
        addField.addEventListener('click', function () {
          if (tab.tables.length >= MAX_FIELDS) return;
          var name = ask('Имя поля:');
          if (!name) return;
          tab.tables.push(emptyTable(name));
          tab.currentTable = tab.tables.length - 1;
          persist(maps);
        });
        fieldRow.appendChild(addField);
      }
      wrap.appendChild(fieldRow);

      wrap.appendChild(el('div', {
        class: 'klu-opt-hint',
        text: 'Карты хранятся локально в этом браузере и не сбрасываются при обновлении страницы.',
      }));
    }

    draw();
    return wrap;
  }

  /* ============================ ПАНЕЛЬ НАСТРОЕК ============================= */

  var panelEl = null;

  function optRow(key, label, hint) {
    var cb = el('input', { type: 'checkbox' });
    cb.checked = !!settingsGet(key);
    cb.addEventListener('change', function () { settingsSet(key, cb.checked); });
    var kids = [el('label', null, [cb, document.createTextNode(' ' + label)])];
    if (hint) kids.push(el('div', { class: 'klu-opt-hint', text: hint }));
    return el('div', { class: 'klu-opt' }, kids);
  }

  function suppressKeys(root) {
    ['keydown', 'keyup', 'keypress'].forEach(function (t) {
      root.addEventListener(t, function (e) { e.stopPropagation(); });
    });
  }

  function buildPanel() {
    var gear = el('button', { id: 'klu-gear', type: 'button', title: 'Кач ЛУ — настройки', text: '⚙' });
    gear.addEventListener('click', function (e) {
      e.stopPropagation();
      panelEl.classList.toggle('open');
    });
    document.body.appendChild(gear);

    panelEl = el('div', { id: 'klu-panel' });
    panelEl.appendChild(el('h3', { text: 'Кач ЛУ' }));

    panelEl.appendChild(el('h4', { text: 'Настройки' }));
    var enabledRow = optRow('enabled', 'Включить панель Кач ЛУ', 'Выключает минное поле целиком. Настройки и карты сохраняются.');
    panelEl.appendChild(enabledRow);
    // у «enabled» отдельная логика старта/стопа
    enabledRow.querySelector('input').addEventListener('change', function (e) {
      if (e.target.checked) startModule(); else stopModule();
    });
    // «Переносить на игровую» живёт в панели минника — тут его нет
    panelEl.appendChild(optRow('blockDangerous', 'Кач ЛУ: не нажимать на опасные клетки', 'Блокирует клик и WASD/QEZX по минам, опаскам и unsafe. Выключи, если хочешь ходить как обычно.'));
    panelEl.appendChild(optRow('autoFromServer', 'Подтягивать ярусы деревьев из игры', ''));
    panelEl.appendChild(optRow('autoFromChat', 'Ставить цифру в клетку кота по треску в чате', ''));
    panelEl.appendChild(optRow('showSkill', 'Показывать своё лазание в шапке панели', ''));
    panelEl.appendChild(optRow('showCoords', 'Показывать координаты клеток при наведении', 'В сетке панели и на клетках игрового поля, формат «x, y».'));
    panelEl.appendChild(optRow('clearOnLocation', 'Очищать текущее поле при смене локации', 'Карты лежат во вкладках и не пропадают после обновления.'));

    panelEl.appendChild(el('hr'));

    panelEl.appendChild(el('h4', { text: 'Вкладки и поля' }));
    panelEl.appendChild(renderMapsEditor());

    suppressKeys(panelEl);
    document.body.appendChild(panelEl);
  }

  /* ================================= СТИЛИ ================================== */

  var CSS = [
    /* шестерёнка и панель настроек */
    '#klu-gear{position:fixed;right:14px;bottom:14px;z-index:2147482600;width:36px;height:36px;box-sizing:border-box;border-radius:50%;border:1px solid #5a4e3e;background:rgba(32,28,24,.94);color:#f3e7d3;font-size:18px;line-height:1;cursor:pointer;opacity:.75;padding:0;}',
    '#klu-gear:hover{opacity:1;}',
    '#klu-panel{position:fixed;right:14px;bottom:58px;z-index:2147482601;width:300px;max-height:72vh;overflow:auto;box-sizing:border-box;background:rgba(32,28,24,.96);color:#f3e7d3;border:1px solid #5a4e3e;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:10px;display:none;}',
    '#klu-panel.open{display:block;}',
    '#klu-panel h3{margin:0 0 6px;font-size:14px;}',
    '#klu-panel h4{margin:10px 0 4px;font-size:12px;}',
    '#klu-panel hr{border:0;border-top:1px solid #5a4e3e;margin:8px 0;}',
    '.klu-opt{margin:6px 0;}',
    '.klu-opt label{display:flex;align-items:center;gap:6px;cursor:pointer;}',
    '.klu-opt-hint{opacity:.65;font-size:11px;margin:2px 0 0 22px;}',
    '.klu-btn{height:22px;padding:0 8px;border:1px solid #6a5d4c;border-radius:4px;background:#3a332b;color:#f3e7d3;cursor:pointer;font:11px/20px inherit;}',
    '.klu-btn:hover{filter:brightness(1.15);}',
    '.klu-maps-row{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin:0 0 6px;}',
    '.klu-maps-item{display:flex;gap:2px;align-items:center;}',
    '.klu-maps-item button{min-width:20px;height:20px;padding:0 5px;border:1px solid #6a5d4c;border-radius:4px;background:#2a241e;color:#f3e7d3;cursor:pointer;font:11px/18px inherit;}',
    '.klu-maps-item button.active{background:#e8c27a;color:#2a1f12;border-color:#e8c27a;}',
    '.klu-maps-ico{opacity:.8;}',

    /* тулип координат */
    '#klu-coords-tip{position:fixed;left:0;top:0;z-index:2147483000;display:none;pointer-events:none;padding:2px 6px;border-radius:4px;background:rgba(0,0,0,.85);color:#ffe9a8;border:1px solid #5a4e3e;font:700 11px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;}',

    /* панель минника */
    '#klu-lu{position:fixed;z-index:2147482500;width:260px;box-sizing:border-box;background:rgba(32,28,24,.94);color:#f3e7d3;border:1px solid #5a4e3e;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;user-select:none;}',
    '#klu-lu-head{display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:move;background:#3a332b;border-radius:10px 10px 0 0;}',
    '#klu-lu-head strong{flex:1;min-width:0;font-size:13px;}',
    '#klu-lu-skill{opacity:.75;font-size:11px;max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#klu-lu-fold{background:none;border:none;color:#f3e7d3;cursor:pointer;font-size:16px;padding:0 4px;}',
    '#klu-lu-body{padding:5px;}',
    '#klu-lu-body[hidden]{display:none;}',
    '#klu-lu-overlay{display:flex;align-items:center;gap:5px;margin:0 0 6px;font-size:11px;cursor:pointer;opacity:.9;}',
    '#klu-lu-overlay:hover{opacity:1;}',
    '#klu-lu-grid{border-collapse:collapse;margin:0 auto;table-layout:fixed;width:250px;height:190px;}',
    '#klu-lu-grid td{position:relative;width:10%;height:calc(100% / 6);padding:0;box-sizing:border-box;border:1px solid #6a5d4c;text-align:center;font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;cursor:pointer;background:#2a241e;}',
    '#klu-lu-grid td:focus{outline:2px solid #e8c27a;outline-offset:-2px;}',
    '#klu-lu-grid td[data-klu-here]{box-shadow:inset 0 0 0 2px #e8c27a;}',
    '#klu-lu-grid td[data-klu-here]::before{content:"";position:absolute;left:1px;top:1px;width:5px;height:5px;border-radius:50%;background:#e8c27a;pointer-events:none;z-index:1;}',
    '#klu-lu-help{margin-top:6px;font-size:11px;opacity:.7;}',
    '#klu-lu-nav h3{margin:4px 0 3px;font-size:12px;font-weight:700;}',
    '#klu-lu-nav h3:first-child{margin-top:0;}',
    '#klu-lu-tabs,#klu-lu-fields{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 6px;align-items:center;}',
    '#klu-lu-tabs button,#klu-lu-fields button{min-width:22px;height:20px;padding:0 6px;border:1px solid #6a5d4c;border-radius:4px;background:#2a241e;color:#f3e7d3;cursor:pointer;font:11px/18px inherit;}',
    '#klu-lu-tabs button.active,#klu-lu-fields button.active{background:#e8c27a;color:#2a1f12;border-color:#e8c27a;}',
    '#klu-lu-empty{text-align:center;margin:12px 0;opacity:.8;}',
    '#klu-lu-grid[hidden],#klu-lu-tools[hidden],#klu-lu-empty[hidden]{display:none;}',
    '#klu-lu-train{display:block;width:100%;margin:6px 0 0;height:22px;padding:0 6px;border:1px solid #6a5d4c;border-radius:4px;background:#3a332b;color:#f3e7d3;cursor:pointer;font:11px/20px inherit;}',
    '#klu-lu-train.active{background:#e8c27a;color:#2a1f12;border-color:#e8c27a;}',
    '#klu-lu-tools{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;}',
    '#klu-lu-tools button{min-width:22px;height:20px;padding:0 5px;border:1px solid #6a5d4c;border-radius:4px;background:#3a332b;color:#f3e7d3;cursor:pointer;font:11px/18px inherit;}',

    /* заливка и цифры на игровом поле («Переносить на игровую») */
    '#cages td.cage{position:relative;width:100px;}',
    '#cages td.cage[data-klu-lu-fill]::before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;z-index:5;pointer-events:none;}',
    '#cages td.cage[data-klu-lu-fill="safe"]::before{background:rgba(46,130,50,.28);}',
    '#cages td.cage[data-klu-lu-fill="mine"]::before{background:rgba(180,16,16,.32);}',
    '#cages td.cage[data-klu-lu-fill="transit"]::before{background:rgba(255,236,140,.3);}',
    '#cages td.cage[data-klu-lu-block]{cursor:not-allowed;}',
    '#cages td.cage[data-klu-lu]::after{content:attr(data-klu-lu);position:absolute;right:2px;bottom:2px;z-index:40;font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;padding:1px 3px;border-radius:3px;background:rgba(0,0,0,.78);color:#ffe9a8;pointer-events:none;}',
    '#cages td.cage[data-klu-lu="X"]::after{background:rgba(160,0,0,.85);color:#fff;}',
    '#cages td.cage[data-klu-lu="="]::after{background:rgba(255,255,255,.75);color:#222;}',
  ].join('');

  /* ================================= СТАРТ ================================== */

  if (PAGE === 'game') {
    try { Socket.install(); } catch (e) {}
  }

  // отладка: window.__klu в консоли
  try {
    window.__klu = {
      version: '1.2.0',
      page: PAGE,
      vueOk: function () { return !!vueCache.vm; },
      maps: function () { return S.get(MAPS_KEY, null); },
    };
  } catch (e) {}

  function boot() {
    injectCss(CSS);
    buildPanel();
    if (PAGE === 'game' && settingsGet('enabled')) startModule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
