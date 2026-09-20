/**
 * Реестр модулей.
 *
 * Модуль — это объект-описание:
 *
 *   {
 *     id: 'always-day',                  // уникальный, kebab-case
 *     title: 'Всегда день',
 *     description: 'Убирает ночное затемнение поля.',
 *     category: 'field',                 // см. CATEGORIES
 *     pages: ['game'],                   // на каких страницах поднимать
 *     enabledByDefault: false,
 *     defaults: { color: '#ffffff' },    // значения настроек
 *     schema: [                          // как рисовать настройки в панели
 *       { key: 'color', type: 'color', label: 'Цвет' }
 *     ],
 *     styles: function (settings) { return '#cages_div { opacity: 1 !important }'; },
 *     init: function (ctx) { ... },      // необязательно для чисто-CSS модулей
 *     destroy: function (ctx) { ... },   // необязательно: ctx всё уберёт сам
 *     onSettings: function (ctx, key, value) { ... } // иначе модуль перезапустится
 *   }
 *
 * Гарантии реестра:
 *  - включение/выключение на лету, без перезагрузки страницы;
 *  - всё, что модуль создал через ctx (стили, слушатели, обсерверы, таймеры,
 *    $watch, смонтированные узлы), снимается автоматически при выключении.
 */

var log = require('core/log');
var storage = require('core/storage');
var dom = require('core/dom');
var vue = require('core/vue');

var CATEGORIES = [
  { id: 'field', title: 'Игровое поле' },
  { id: 'interface', title: 'Интерфейс' },
  { id: 'info', title: 'Информация' },
  { id: 'chat', title: 'Чат' },
  { id: 'sound', title: 'Звук' },
  { id: 'misc', title: 'Прочее' },
];

var modules = [];         // описания в порядке регистрации
var byId = Object.create(null);
var running = Object.create(null); // id -> ctx
var currentPage = null;
var changeListeners = [];

function storageKey(id) {
  return 'mod.' + id;
}

function readState(id) {
  var raw = storage.get(storageKey(id), null);
  if (!raw || typeof raw !== 'object') return { enabled: null, opt: {} };
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : null,
    opt: raw.opt && typeof raw.opt === 'object' ? raw.opt : {},
  };
}

function writeState(id, state) {
  storage.set(storageKey(id), { enabled: state.enabled, opt: state.opt });
}

function isEnabled(id) {
  var mod = byId[id];
  if (!mod) return false;
  var state = readState(id);
  if (state.enabled === null) return !!mod.enabledByDefault;
  return state.enabled;
}

function settingsOf(id) {
  var mod = byId[id];
  if (!mod) return {};
  return Object.assign({}, mod.defaults || {}, readState(id).opt);
}

function notifyChange(id, kind) {
  changeListeners.forEach(function (cb) {
    try { cb(id, kind); } catch (e) { log.root.error('слушатель реестра упал', e); }
  });
}

function onChange(cb) {
  changeListeners.push(cb);
  return function () {
    var i = changeListeners.indexOf(cb);
    if (i >= 0) changeListeners.splice(i, 1);
  };
}

/* --------------------------------- контекст -------------------------------- */

function createContext(mod) {
  var cleanups = [];
  var styleIds = [];
  var disposed = false;

  function addCleanup(fn) {
    if (typeof fn === 'function') cleanups.push(fn);
    return fn;
  }

  var ctx = {
    id: mod.id,
    module: mod,
    log: log.create(mod.id),
    dom: dom,
    vue: vue,
    storage: storage,
    page: currentPage,

    settings: {
      get: function (key) {
        var all = settingsOf(mod.id);
        return all[key];
      },
      all: function () { return settingsOf(mod.id); },
      set: function (key, value) { setSetting(mod.id, key, value); },
    },

    /** Стиль модуля. suffix нужен, если стилей несколько. */
    injectStyle: function (css, suffix) {
      var id = mod.id + (suffix ? '-' + suffix : '');
      if (styleIds.indexOf(id) < 0) styleIds.push(id);
      return dom.injectStyle(id, css);
    },
    removeStyle: function (suffix) {
      var id = mod.id + (suffix ? '-' + suffix : '');
      dom.removeStyle(id);
      var i = styleIds.indexOf(id);
      if (i >= 0) styleIds.splice(i, 1);
    },
    /** Пересобирает styles(settings) модуля. */
    refreshStyles: function () {
      if (typeof mod.styles !== 'function' && typeof mod.styles !== 'string') return;
      var css = typeof mod.styles === 'function' ? mod.styles(settingsOf(mod.id), ctx) : mod.styles;
      if (css) ctx.injectStyle(String(css));
      else ctx.removeStyle();
    },

    on: function (target, type, handler, options) {
      return addCleanup(dom.on(target, type, handler, options));
    },
    observe: function (target, cb, options) {
      return addCleanup(dom.observe(target, cb, options));
    },
    /**
     * Vue $watch. Подписка переживает ещё не смонтированный Vue: модули
     * поднимаются на DOMContentLoaded, а игра монтируется позже.
     */
    watch: function (path, cb, options) {
      return addCleanup(vue.watchWhenReady(path, cb, options));
    },
    /**
     * Промис готовности Vue. Резолвится инстансом или null — не реджектится.
     * После await обязательно проверять ctx.isDisposed().
     */
    whenVueReady: function (options) {
      return vue.waitForVue(options);
    },
    interval: function (fn, ms) {
      var t = setInterval(fn, ms);
      addCleanup(function () { clearInterval(t); });
      return t;
    },
    timeout: function (fn, ms) {
      var t = setTimeout(fn, ms);
      addCleanup(function () { clearTimeout(t); });
      return t;
    },
    /** Монтирует свой узел (в body по умолчанию) и снимает его при выключении. */
    mount: function (node, parent) {
      (parent || document.body).appendChild(node);
      addCleanup(function () { if (node.parentNode) node.parentNode.removeChild(node); });
      return node;
    },
    addCleanup: addCleanup,

    isDisposed: function () { return disposed; },

    _dispose: function () {
      disposed = true;
      while (cleanups.length) {
        var fn = cleanups.pop();
        try { fn(); } catch (e) { ctx.log.error('очистка упала', e); }
      }
      styleIds.slice().forEach(function (id) { dom.removeStyle(id); });
      styleIds.length = 0;
    },
  };

  return ctx;
}

/* --------------------------- регистрация и запуск -------------------------- */

function register(mod) {
  if (!mod || !mod.id) throw new Error('[CWB] модуль без id');
  if (byId[mod.id]) throw new Error('[CWB] дубликат модуля: ' + mod.id);
  var normalized = Object.assign({
    title: mod.id,
    description: '',
    category: 'misc',
    pages: ['game'],
    enabledByDefault: false,
    defaults: {},
    schema: [],
    order: 100,
  }, mod);
  byId[normalized.id] = normalized;
  modules.push(normalized);
  return normalized;
}

function list() {
  return modules.slice().sort(function (a, b) {
    if (a.category !== b.category) {
      var ia = CATEGORIES.findIndex(function (c) { return c.id === a.category; });
      var ib = CATEGORIES.findIndex(function (c) { return c.id === b.category; });
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title, 'ru');
  });
}

function getModule(id) {
  return byId[id] || null;
}

function matchesPage(mod, page) {
  if (!mod.pages || !mod.pages.length) return true;
  return mod.pages.indexOf('*') >= 0 || mod.pages.indexOf(page) >= 0;
}

function startModule(id) {
  var mod = byId[id];
  if (!mod || running[id]) return false;
  if (!matchesPage(mod, currentPage)) return false;

  var ctx = createContext(mod);
  running[id] = ctx;
  try {
    ctx.refreshStyles();
    if (typeof mod.init === 'function') {
      var result = mod.init(ctx);
      // init может быть async — ловим отказ, чтобы не было unhandled rejection
      if (result && typeof result.catch === 'function') {
        result.catch(function (e) { ctx.log.error('init упал', e); });
      }
    }
    log.root.debug('модуль включён:', id);
  } catch (e) {
    log.root.error('модуль ' + id + ' не запустился', e);
    stopModule(id);
    return false;
  }
  notifyChange(id, 'started');
  return true;
}

function stopModule(id) {
  var ctx = running[id];
  if (!ctx) return false;
  var mod = byId[id];
  delete running[id];
  try {
    if (mod && typeof mod.destroy === 'function') mod.destroy(ctx);
  } catch (e) {
    log.root.error('destroy модуля ' + id + ' упал', e);
  }
  ctx._dispose();
  log.root.debug('модуль выключен:', id);
  notifyChange(id, 'stopped');
  return true;
}

function setEnabled(id, enabled) {
  var mod = byId[id];
  if (!mod) return;
  var state = readState(id);
  state.enabled = !!enabled;
  writeState(id, state);
  if (enabled) startModule(id);
  else stopModule(id);
  notifyChange(id, 'enabled');
}

function toggle(id) {
  setEnabled(id, !isEnabled(id));
}

/**
 * Меняет настройку модуля.
 * Если модуль запущен: обновляем стили и зовём onSettings; если onSettings нет —
 * безопасно перезапускаем модуль целиком.
 */
function setSetting(id, key, value) {
  var mod = byId[id];
  if (!mod) return;
  var state = readState(id);
  state.opt = Object.assign({}, state.opt);
  if (value === undefined || (mod.defaults && value === mod.defaults[key])) delete state.opt[key];
  else state.opt[key] = value;
  writeState(id, state);

  var ctx = running[id];
  if (ctx) {
    ctx.refreshStyles();
    if (typeof mod.onSettings === 'function') {
      try { mod.onSettings(ctx, key, value); } catch (e) { ctx.log.error('onSettings упал', e); }
    } else if (typeof mod.init === 'function') {
      stopModule(id);
      startModule(id);
    }
  }
  notifyChange(id, 'settings');
}

function resetSettings(id) {
  var state = readState(id);
  state.opt = {};
  writeState(id, state);
  if (running[id]) { stopModule(id); startModule(id); }
  notifyChange(id, 'settings');
}

/** Поднимает все включённые модули, подходящие текущей странице. */
function startAll(page) {
  currentPage = page;
  list().forEach(function (mod) {
    if (isEnabled(mod.id) && matchesPage(mod, page)) startModule(mod.id);
  });
}

function stopAll() {
  Object.keys(running).forEach(stopModule);
}

function isRunning(id) {
  return !!running[id];
}

module.exports = {
  CATEGORIES: CATEGORIES,
  register: register,
  list: list,
  get: getModule,
  isEnabled: isEnabled,
  isRunning: isRunning,
  setEnabled: setEnabled,
  toggle: toggle,
  settingsOf: settingsOf,
  setSetting: setSetting,
  resetSettings: resetSettings,
  startAll: startAll,
  stopAll: stopAll,
  startModule: startModule,
  stopModule: stopModule,
  onChange: onChange,
  matchesPage: matchesPage,
  get page() { return currentPage; },
};
