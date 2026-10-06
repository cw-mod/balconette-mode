// ==UserScript==
// @name         CatWar Balconette
// @name:ru      CatWar Balconette
// @namespace    catwar-balconette
// @version      0.2.0
// @description  Поле для ЛУ, координаты клеток, кот ↔ действия, старые иконки, автопрокрутка истории, ID в личных сообщениях, уведомления, редиректы доменов, статичный фон, погода.
// @description:ru Поле для ЛУ, координаты клеток, кот ↔ действия, старые иконки, автопрокрутка истории, ID в личных сообщениях, уведомления, редиректы доменов, статичный фон, погода.
// @author       balconette
// @license      MIT
// @homepageURL  https://cw-mod.github.io/balconette-mode/
// @supportURL   https://github.com/cw-mod/balconette-mode/issues
// @updateURL    https://cw-mod.github.io/balconette-mode/catwar-balconette.meta.js
// @downloadURL  https://cw-mod.github.io/balconette-mode/catwar-balconette.user.js
// @match        *://catwar.su/*
// @match        *://catwar.net/*
// @exclude      *://catwar.su/ws/*
// @exclude      *://catwar.net/ws/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @noframes
// ==/UserScript==

/* eslint-disable */
/* Собрано автоматически из src/ скриптом build.js. Не редактировать руками. */

(function () {
  'use strict';

  var CWB_VERSION = "0.2.0";
  var CWB_VARIANT = "full";
  var CWB_MODULE_IDS = ["cell-coords","climbing-field","domain-redirect-reverse","domain-redirect","hide-weather","history-autoscroll","layout-swap","notifications","old-icons","pm-ids","static-background"];

  var __factories = Object.create(null);
  var __cache = Object.create(null);

  function __def(name, factory) { __factories[name] = factory; }

  function require(name) {
    if (name === "cwb:meta") return { version: CWB_VERSION, variant: CWB_VARIANT, moduleIds: CWB_MODULE_IDS.slice() };
    if (__cache[name]) return __cache[name].exports;
    var factory = __factories[name];
    if (!factory) throw new Error("[CWB] неизвестный модуль: " + name);
    var module = { exports: {} };
    __cache[name] = module;
    factory(require, module, module.exports);
    return module.exports;
  }

  /* ====================================================================== */
  /* src/core/audio.js */
  __def("core/audio", function (require, module, exports) {
    /**
     * Простой проигрыватель коротких звуков через Web Audio API.
     * Без внешних файлов — синтез или data-URI не нужны, всё генерируется on-the-fly.
     */

    var log = require('core/log').create('audio');

    var sharedCtx = null;

    function getCtx() {
      if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        sharedCtx = new Ctx();
        return sharedCtx;
      } catch (e) {
        log.warn('Web Audio недоступен', e);
        return null;
      }
    }

    /** Разблокировка автоплей-политики после первого жеста пользователя. */
    function unlock() {
      var ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(function () { /* noop */ });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', unlock, { once: true, capture: true });
    }

    /**
     * Короткий синтезированный сигнал.
     * @param {string} kind — тип события (pm, mention, action, alert, ping)
     * @param {number} volume — 0..1
     */
    function play(kind, volume) {
      var ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(function () { /* noop */ });

      var vol = Math.max(0, Math.min(1, Number(volume) || 0.3));
      if (vol <= 0) return;

      var presets = {
        pm: { freq: 880, dur: 0.12, type: 'sine', attack: 0.01 },
        mention: { freq: 660, dur: 0.15, type: 'triangle', attack: 0.01 },
        chat: { freq: 520, dur: 0.08, type: 'sine', attack: 0.005 },
        action: { freq: 440, dur: 0.18, type: 'sine', attack: 0.02 },
        alert: { freq: 220, dur: 0.25, type: 'square', attack: 0.01 },
        ping: { freq: 990, dur: 0.06, type: 'sine', attack: 0.005 },
        map: { freq: 330, dur: 0.14, type: 'triangle', attack: 0.01 },
      };
      var p = presets[kind] || presets.ping;

      try {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = p.type;
        osc.frequency.setValueAtTime(p.freq, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + (p.attack || 0.01));
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + p.dur + 0.02);
      } catch (e) {
        log.warn('не удалось проиграть', kind, e);
      }
    }

    module.exports = {
      play: play,
      unlock: unlock,
    };
  });

  /* ====================================================================== */
  /* src/core/bootstrap.js */
  __def("core/bootstrap", function (require, module, exports) {
    /**
     * Точка входа.
     *
     * Порядок:
     *   1. document-start: определяем страницу, ставим хук сокета на игровой странице;
     *   2. DOMContentLoaded: поднимаем логгер, регистрируем модули, монтируем панель;
     *   3. если страница игровая — ждём Vue (но не блокируем CSS-модули).
     */

    var log = require('core/log');
    var config = require('core/config');
    var registry = require('core/registry');
    var ui = require('core/ui');
    var vue = require('core/vue');
    var dom = require('core/dom');
    var meta = require('cwb:meta');

    /* --------------------------------- роутер ---------------------------------- */

    /**
     * Определение страницы по URL (по мотивам роутера CW Shed).
     * Модуль объявляет, на каких страницах он живёт, через поле `pages`.
     */
    function detectPage(href) {
      // Ручное переопределение для test/mock.html (в игре не используется).
      if (typeof window.CWB_FORCE_PAGE === 'string') return window.CWB_FORCE_PAGE;

      var url;
      try { url = new URL(href || window.location.href); } catch (e) { return 'other'; }
      var host = url.hostname;
      if (!/(^|\.)catwar\.(su|net)$/.test(host)) return 'other';

      var p = url.pathname.replace(/\/+$/, '') || '/';

      if (p === '/cw3') return 'game';
      if (p === '/cw3/jagd') return 'hunt';
      if (p === '/cw3/kns') return 'kns';
      if (p.indexOf('/cw3/') === 0) return 'cw3-other';
      if (p === '/ls' || p.indexOf('/ls/') === 0) return 'pm';
      if (p === '/chat' || p.indexOf('/chat/') === 0) return 'chat';
      if (p === '/settings') return 'settings';
      if (/^\/cat\d+$/.test(p)) return 'profile';
      if (p === '/my_cats' || p === '/mycat') return 'mycat';
      if (p === '/blogs' || p.indexOf('/blog') === 0) return 'blog';
      if (p === '/') return 'main';
      return 'site';
    }

    /** true, если на этой странице вообще имеет смысл показывать панель. */
    function isSupportedPage(page) {
      return page !== 'other';
    }

    /* ------------------------------ сборка модулей ----------------------------- */

    function registerModules() {
      meta.moduleIds.forEach(function (id) {
        try {
          var def = require('modules/' + id);
          registry.register(def && def.default ? def.default : def);
        } catch (e) {
          log.root.error('модуль ' + id + ' не зарегистрирован', e);
        }
      });
    }

    /* ---------------------------------- запуск --------------------------------- */

    var started = false;

    function start() {
      if (started) return;
      started = true;

      var page = detectPage();
      if (!isSupportedPage(page)) return;

      var cfg = config.all();
      log.setLevel(cfg.logLevel);
      try {
        console.info('[CWB] CatWar Balconette v' + meta.version + ' на странице «' + page + '». Кнопка «⚙ моды» справа, либо Ctrl+Alt+B.');
      } catch (e) { /* консоль недоступна */ }

      // Хук сокета ставим безусловно на игровой странице, до загрузки бандла игры.
      if (page === 'game') {
        try { require('core/socket').install(); } catch (e) { log.root.warn('хук сокета не встал', e); }
      }

      registerModules();
      registry.startEarly(page);

      function mountUi() {
        if (!document.body) {
          setTimeout(mountUi, 80);
          return;
        }
        try { ui.mount(); } catch (e) { log.root.error('панель настроек не поднялась', e); }
      }

      dom.ready().then(function () {
        // Панель монтируем в отдельный контейнер в конце body — не внутрь #app.
        mountUi();

        // CSS-модули не ждут Vue: они работают по стабильным id.
        registry.startAll(page);

        if (page === 'game' || page === 'hunt') {
          // Ждём Vue отдельно и молча: если игра не загрузилась, модули на стейте
          // просто не активируются, исключений в консоль не будет.
          vue.waitForVue({ timeout: 30000 }).then(function (vm) {
            log.root.info(vm ? 'Vue готов' : 'Vue не найден — работают только CSS-модули');
          });
        }

        window.addEventListener('pagehide', function () { registry.stopAll(); }, { once: true });
      });
    }

    module.exports = {
      start: start,
      detectPage: detectPage,
      isSupportedPage: isSupportedPage,
    };
  });

  /* ====================================================================== */
  /* src/core/config.js */
  __def("core/config", function (require, module, exports) {
    /**
     * Настройки самого ядра (не модулей). Сейчас только logLevel.
     * Лежат в одном ключе `cwb:core`.
     */

    var storage = require('core/storage');

    var KEY = 'core';

    var DEFAULTS = {
      logLevel: 'silent',       // silent | error | warn | info | debug
    };

    var SCHEMA = [
      {
        key: 'logLevel',
        type: 'select',
        label: 'Уровень логов в консоли',
        options: [
          { value: 'silent', label: 'Выключено' },
          { value: 'error', label: 'Только ошибки' },
          { value: 'warn', label: 'Предупреждения' },
          { value: 'info', label: 'Информация' },
          { value: 'debug', label: 'Отладка' },
        ],
      },
    ];

    function all() {
      var stored = storage.get(KEY, null);
      var out = Object.assign({}, DEFAULTS);
      if (stored && typeof stored === 'object') {
        for (var key in DEFAULTS) {
          if (Object.prototype.hasOwnProperty.call(DEFAULTS, key) && key in stored) {
            out[key] = stored[key];
          }
        }
      }
      return out;
    }

    function get(key) {
      return all()[key];
    }

    function set(key, value) {
      var next = all();
      next[key] = value;
      storage.set(KEY, next);
    }

    function onChange(cb) {
      return storage.watch(KEY, cb);
    }

    module.exports = {
      KEY: KEY,
      DEFAULTS: DEFAULTS,
      SCHEMA: SCHEMA,
      all: all,
      get: get,
      set: set,
      onChange: onChange,
    };
  });

  /* ====================================================================== */
  /* src/core/dom.js */
  __def("core/dom", function (require, module, exports) {
    /**
     * DOM-утилиты: безопасные селекторы, ожидание элементов через MutationObserver
     * (не DOMNodeInserted), управление инъекцией стилей.
     *
     * Правило проекта: мы НИКОГДА не переносим и не клонируем игровые узлы
     * (особенно #chat_form, #chat_msg, #text) — только добавляем свои узлы рядом
     * и свои стили.
     */

    var log = require('core/log').create('dom');

    var STYLE_PREFIX = 'cwb-style-';

    function qs(selector, root) {
      try {
        return (root || document).querySelector(selector);
      } catch (e) {
        log.warn('плохой селектор', selector, e);
        return null;
      }
    }

    function qsa(selector, root) {
      try {
        return Array.prototype.slice.call((root || document).querySelectorAll(selector));
      } catch (e) {
        log.warn('плохой селектор', selector, e);
        return [];
      }
    }

    /**
     * Ждёт появления элемента.
     * Возвращает промис, который резолвится элементом или null по таймауту —
     * никогда не реджектится, чтобы модуль просто «не завёлся» без шума в консоли.
     */
    function waitForElement(selector, opts) {
      opts = opts || {};
      var root = opts.root || document;
      var timeout = typeof opts.timeout === 'number' ? opts.timeout : 20000;

      return new Promise(function (resolve) {
        var existing = qs(selector, root);
        if (existing) { resolve(existing); return; }

        var done = false;
        var timer = null;
        var observer = null;

        function finish(el) {
          if (done) return;
          done = true;
          if (timer) clearTimeout(timer);
          if (observer) observer.disconnect();
          resolve(el);
        }

        try {
          observer = new MutationObserver(function () {
            var el = qs(selector, root);
            if (el) finish(el);
          });
          observer.observe(root === document ? document.documentElement || document : root, {
            childList: true,
            subtree: true,
          });
        } catch (e) {
          log.warn('MutationObserver недоступен', e);
          finish(null);
          return;
        }

        if (timeout > 0) timer = setTimeout(function () { finish(null); }, timeout);

        if (opts.signal) {
          opts.signal.addEventListener('abort', function () { finish(null); }, { once: true });
        }
      });
    }

    /** Обёртка над MutationObserver, возвращающая функцию отключения. */
    function observe(target, callback, options) {
      if (!target) return function () {};
      var obs;
      try {
        obs = new MutationObserver(callback);
        obs.observe(target, options || { childList: true, subtree: true });
      } catch (e) {
        log.warn('не удалось повесить observer', e);
        return function () {};
      }
      return function () {
        try { obs.disconnect(); } catch (e) { /* уже отключён */ }
      };
    }

    /** Вешает обработчик и возвращает функцию снятия. */
    function on(target, type, handler, options) {
      if (!target || typeof target.addEventListener !== 'function') return function () {};
      target.addEventListener(type, handler, options);
      return function () {
        try { target.removeEventListener(type, handler, options); } catch (e) { /* noop */ }
      };
    }

    function styleHost() {
      return document.head || document.documentElement || document.body;
    }

    /**
     * Вставляет (или обновляет) <style> с заданным id.
     * id автоматически получает префикс cwb-style-.
     */
    function injectStyle(id, css) {
      var elementId = String(id).indexOf(STYLE_PREFIX) === 0 ? String(id) : STYLE_PREFIX + id;
      var el = document.getElementById(elementId);
      if (!el) {
        el = document.createElement('style');
        el.id = elementId;
        el.type = 'text/css';
        var host = styleHost();
        if (!host) return null;
        host.appendChild(el);
      }
      if (el.textContent !== css) el.textContent = css;
      return el;
    }

    function removeStyle(id) {
      var elementId = String(id).indexOf(STYLE_PREFIX) === 0 ? String(id) : STYLE_PREFIX + id;
      var el = document.getElementById(elementId);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    /** Создание элемента: el('div', { class: 'x', text: 'y' }, [child]). */
    function el(tag, props, children) {
      var node = document.createElement(tag);
      if (props) {
        Object.keys(props).forEach(function (key) {
          var value = props[key];
          if (value === null || value === undefined || value === false) return;
          if (key === 'text') node.textContent = String(value);
          else if (key === 'html') node.innerHTML = String(value);
          else if (key === 'class' || key === 'className') node.className = String(value);
          else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
          else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
          else if (key === 'dataset' && typeof value === 'object') Object.assign(node.dataset, value);
          else node.setAttribute(key, value === true ? '' : String(value));
        });
      }
      (children || []).forEach(function (child) {
        if (child === null || child === undefined) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
      return node;
    }

    /** Готовность DOM. */
    function ready() {
      return new Promise(function (resolve) {
        if (document.readyState === 'interactive' || document.readyState === 'complete') { resolve(); return; }
        document.addEventListener('DOMContentLoaded', function () { resolve(); }, { once: true });
      });
    }

    /** Ближайший прокручиваемый предок (включая сам элемент). */
    function scrollParent(node) {
      var cur = node;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        var style = window.getComputedStyle(cur);
        var overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && cur.scrollHeight > cur.clientHeight + 1) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    }

    /** Экранирование значения для подстановки в CSS-строку url('...'). */
    function cssUrl(value) {
      return "url('" + String(value).replace(/[\\'"\n\r]/g, '\\$&') + "')";
    }

    /** #rrggbb + альфа 0..1 -> rgba(). Нужно потому, что <input type=color> без альфы. */
    function hexToRgba(hex, alpha) {
      var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
      if (!m) return String(hex);
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var r = parseInt(h.slice(0, 2), 16);
      var g = parseInt(h.slice(2, 4), 16);
      var b = parseInt(h.slice(4, 6), 16);
      var a = typeof alpha === 'number' ? Math.max(0, Math.min(1, alpha)) : 1;
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
    }

    module.exports = {
      STYLE_PREFIX: STYLE_PREFIX,
      qs: qs,
      qsa: qsa,
      waitForElement: waitForElement,
      observe: observe,
      on: on,
      injectStyle: injectStyle,
      removeStyle: removeStyle,
      el: el,
      ready: ready,
      scrollParent: scrollParent,
      escapeHtml: escapeHtml,
      cssUrl: cssUrl,
      hexToRgba: hexToRgba,
    };
  });

  /* ====================================================================== */
  /* src/core/log.js */
  __def("core/log", function (require, module, exports) {
    /**
     * Крошечный логгер с уровнями. По умолчанию молчит полностью,
     * чтобы скрипт не засорял консоль игры.
     */

    var LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
    var LEVEL_NAMES = ['silent', 'error', 'warn', 'info', 'debug'];

    var current = LEVELS.silent;

    function setLevel(name) {
      if (typeof name === 'number') {
        current = Math.max(0, Math.min(4, name));
        return;
      }
      if (Object.prototype.hasOwnProperty.call(LEVELS, name)) current = LEVELS[name];
    }

    function getLevel() {
      return LEVEL_NAMES[current];
    }

    function emit(level, method, prefix, args) {
      if (current < level) return;
      var out = Array.prototype.slice.call(args);
      out.unshift('[CWB' + (prefix ? ':' + prefix : '') + ']');
      try {
        console[method].apply(console, out);
      } catch (e) {
        /* консоль может быть недоступна — молча игнорируем */
      }
    }

    /** Создаёт именованный логгер (обычно на модуль). */
    function create(prefix) {
      return {
        error: function () { emit(LEVELS.error, 'error', prefix, arguments); },
        warn: function () { emit(LEVELS.warn, 'warn', prefix, arguments); },
        info: function () { emit(LEVELS.info, 'info', prefix, arguments); },
        debug: function () { emit(LEVELS.debug, 'log', prefix, arguments); },
        child: function (sub) { return create(prefix ? prefix + ':' + sub : sub); },
      };
    }

    module.exports = {
      LEVELS: LEVELS,
      LEVEL_NAMES: LEVEL_NAMES,
      setLevel: setLevel,
      getLevel: getLevel,
      create: create,
      root: create(''),
    };
  });

  /* ====================================================================== */
  /* src/core/registry.js */
  __def("core/registry", function (require, module, exports) {
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
     *     pages: ['game'],                   // на каких страницах поднимать; ['*'] — везде
     *     early: false,                      // true — старт на document-start, до DOM
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

    /** Модули с `early: true` — до DOMContentLoaded (редирект и т.п.). */
    function startEarly(page) {
      currentPage = page;
      list().forEach(function (mod) {
        if (mod.early && isEnabled(mod.id) && matchesPage(mod, page)) startModule(mod.id);
      });
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
      startEarly: startEarly,
      startAll: startAll,
      stopAll: stopAll,
      startModule: startModule,
      stopModule: stopModule,
      onChange: onChange,
      matchesPage: matchesPage,
      get page() { return currentPage; },
    };
  });

  /* ====================================================================== */
  /* src/core/socket.js */
  __def("core/socket", function (require, module, exports) {
    /**
     * Опциональный хук игрового сокета. ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН.
     *
     * Зачем он есть: `window.io` игра не выставляет, сокет живёт внутри webpack-модуля,
     * поэтому единственный способ увидеть трафик — подменить конструктор WebSocket
     * ДО загрузки бандла (@run-at document-start).
     *
     * Почему им не надо пользоваться без нужды: для 99% фич достаточно реактивных
     * $watch по Vue-стейту (core/vue.js). Хук — механизм «на будущее»; ни один модуль
     * первой партии на него не завязан.
     *
     * Хук ТОЛЬКО читает. Он никогда ничего не отправляет и не изменяет кадры.
     */

    var log = require('core/log').create('socket');

    var PATH_MARKER = '/ws/cw3/socket.io';

    var installed = false;
    var listeners = [];   // [{ event, cb }]
    var anyListeners = [];

    function emit(event, payload, raw) {
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i].event === event) {
          try { listeners[i].cb(payload, raw); } catch (e) { log.error('слушатель упал', event, e); }
        }
      }
      for (var j = 0; j < anyListeners.length; j++) {
        try { anyListeners[j](event, payload, raw); } catch (e) { log.error('слушатель упал', event, e); }
      }
    }

    /**
     * Разбор кадра Engine.IO 3 / Socket.IO 2.
     * Интересуют только пакеты `42[...]` (EVENT), в том числе внутри
     * framed-payload вида `<len>:42[...]` (polling).
     */
    function parseFrame(data) {
      if (typeof data !== 'string') return;
      var rest = data;

      // framed payload: "25:42[\"event\",{...}]31:42[...]"
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
          if (Array.isArray(parsed) && parsed.length) emit(String(parsed[0]), parsed[1], chunk);
        } catch (e) {
          /* не наш кадр — молча пропускаем */
        }
      }
    }

    /** Ставит хук. Вызывать как можно раньше (document-start), до загрузки cw3.js. */
    function install() {
      if (installed) return true;
      var Native = window.WebSocket;
      if (typeof Native !== 'function') return false;

      function Hooked(url, protocols) {
        var ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
        try {
          if (String(url).indexOf(PATH_MARKER) >= 0) {
            ws.addEventListener('message', function (e) { parseFrame(e.data); });
            log.info('сокет перехвачен:', url);
          }
        } catch (e) {
          log.warn('не удалось подписаться на сокет', e);
        }
        return ws;
      }

      Hooked.prototype = Native.prototype;
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { Hooked[k] = i; });

      try {
        window.WebSocket = Hooked;
        installed = true;
        return true;
      } catch (e) {
        log.warn('WebSocket недоступен для подмены', e);
        return false;
      }
    }

    /** Подписка на конкретное событие сервера ('field', 'msg', 'history', …). */
    function on(event, cb) {
      var entry = { event: event, cb: cb };
      listeners.push(entry);
      return function () {
        var i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    function onAny(cb) {
      anyListeners.push(cb);
      return function () {
        var i = anyListeners.indexOf(cb);
        if (i >= 0) anyListeners.splice(i, 1);
      };
    }

    module.exports = {
      PATH_MARKER: PATH_MARKER,
      install: install,
      on: on,
      onAny: onAny,
      isInstalled: function () { return installed; },
    };
  });

  /* ====================================================================== */
  /* src/core/storage.js */
  __def("core/storage", function (require, module, exports) {
    /**
     * Хранилище настроек.
     *
     * Бэкенд: GM_getValue/GM_setValue, если Tampermonkey их выдал, иначе localStorage.
     * Все ключи живут в неймспейсе `cwb:` и хранятся как JSON-строки — так экспорт
     * и импорт одинаковы для обоих бэкендов.
     *
     * Схема ключей (см. SPEC.md, раздел «Соглашения»):
     *   cwb:core          — настройки ядра  { logLevel }
     *   cwb:mod.<id>      — состояние модуля { enabled: bool, opt: { ... } }
     */

    var log = require('core/log').create('storage');

    var PREFIX = 'cwb:';

    // typeof по необъявленному идентификатору безопасен, прямой вызов — нет.
    var HAS_GM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
    var HAS_GM_LIST = typeof GM_listValues === 'function';
    var HAS_GM_DELETE = typeof GM_deleteValue === 'function';

    var listeners = Object.create(null); // key -> [cb]
    var anyListeners = [];

    function fullKey(key) {
      return PREFIX + key;
    }

    function readString(key) {
      try {
        if (HAS_GM) {
          var v = GM_getValue(fullKey(key), undefined);
          return typeof v === 'string' ? v : undefined;
        }
        var s = window.localStorage.getItem(fullKey(key));
        return s === null ? undefined : s;
      } catch (e) {
        log.warn('чтение не удалось', key, e);
        return undefined;
      }
    }

    function writeString(key, str) {
      try {
        if (HAS_GM) GM_setValue(fullKey(key), str);
        else window.localStorage.setItem(fullKey(key), str);
        return true;
      } catch (e) {
        log.warn('запись не удалась', key, e);
        return false;
      }
    }

    /** Читает значение. Битый JSON трактуется как отсутствие значения. */
    function get(key, fallback) {
      var raw = readString(key);
      if (raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch (e) {
        log.warn('битый JSON в ключе', key);
        return fallback;
      }
    }

    function set(key, value) {
      var str;
      try {
        str = JSON.stringify(value);
      } catch (e) {
        log.error('значение не сериализуется', key, e);
        return false;
      }
      if (readString(key) === str) return true; // без изменений — не будим слушателей
      if (!writeString(key, str)) return false;
      notify(key, value);
      return true;
    }

    function remove(key) {
      try {
        if (HAS_GM && HAS_GM_DELETE) GM_deleteValue(fullKey(key));
        else window.localStorage.removeItem(fullKey(key));
      } catch (e) {
        log.warn('удаление не удалось', key, e);
        return false;
      }
      notify(key, undefined);
      return true;
    }

    /** Все наши ключи без префикса. */
    function keys() {
      var out = [];
      try {
        if (HAS_GM && HAS_GM_LIST) {
          var all = GM_listValues() || [];
          for (var i = 0; i < all.length; i++) {
            if (all[i].indexOf(PREFIX) === 0) out.push(all[i].slice(PREFIX.length));
          }
        } else {
          var ls = window.localStorage;
          for (var j = 0; j < ls.length; j++) {
            var k = ls.key(j);
            if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
          }
        }
      } catch (e) {
        log.warn('перечисление ключей не удалось', e);
      }
      return out;
    }

    /* --------------------------------- события -------------------------------- */

    function notify(key, value) {
      var list = listeners[key];
      if (list) {
        for (var i = 0; i < list.length; i++) {
          try { list[i](value, key); } catch (e) { log.error('слушатель упал', key, e); }
        }
      }
      for (var j = 0; j < anyListeners.length; j++) {
        try { anyListeners[j](key, value); } catch (e) { log.error('слушатель упал', key, e); }
      }
    }

    /** Подписка на конкретный ключ. Возвращает функцию отписки. */
    function watch(key, cb) {
      if (typeof cb !== 'function') return function () {};
      (listeners[key] || (listeners[key] = [])).push(cb);
      return function () {
        var list = listeners[key];
        if (!list) return;
        var i = list.indexOf(cb);
        if (i >= 0) list.splice(i, 1);
      };
    }

    /** Подписка на любые изменения. */
    function watchAll(cb) {
      if (typeof cb !== 'function') return function () {};
      anyListeners.push(cb);
      return function () {
        var i = anyListeners.indexOf(cb);
        if (i >= 0) anyListeners.splice(i, 1);
      };
    }

    // В режиме localStorage подхватываем правки из других вкладок сайта
    // (например, вкладка форума — игровая вкладка у пользователя всегда одна).
    if (!HAS_GM && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', function (e) {
        if (!e || !e.key || e.key.indexOf(PREFIX) !== 0) return;
        var key = e.key.slice(PREFIX.length);
        var value;
        try { value = e.newValue === null ? undefined : JSON.parse(e.newValue); } catch (err) { return; }
        notify(key, value);
      });
    }

    /* ----------------------------- экспорт / импорт ---------------------------- */

    function exportAll() {
      var data = {};
      keys().forEach(function (k) {
        var v = get(k, undefined);
        if (v !== undefined) data[k] = v;
      });
      return {
        format: 'catwar-balconette-settings',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        data: data,
      };
    }

    /**
     * Импорт. По умолчанию — слияние (замена ключей из файла).
     * replace: true сначала стирает все наши ключи.
     */
    function importAll(payload, opts) {
      opts = opts || {};
      if (!payload || typeof payload !== 'object') throw new Error('Пустой файл настроек');
      var data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
      if (payload.format && payload.format !== 'catwar-balconette-settings') {
        throw new Error('Это не файл настроек CatWar Balconette');
      }
      if (opts.replace) keys().forEach(remove);
      var count = 0;
      Object.keys(data).forEach(function (k) {
        if (set(k, data[k])) count++;
      });
      return count;
    }

    function exportToFile(filename) {
      var json = JSON.stringify(exportAll(), null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || 'catwar-balconette-settings.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }

    /** Открывает системный диалог выбора файла и импортирует его содержимое. */
    function importFromFile(opts) {
      return new Promise(function (resolve, reject) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.style.display = 'none';
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          input.remove();
          if (!file) { resolve(0); return; }
          var reader = new FileReader();
          reader.onload = function () {
            try {
              resolve(importAll(JSON.parse(String(reader.result)), opts));
            } catch (e) {
              reject(e);
            }
          };
          reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
          reader.readAsText(file);
        });
        document.body.appendChild(input);
        input.click();
      });
    }

    module.exports = {
      PREFIX: PREFIX,
      backend: HAS_GM ? 'GM' : 'localStorage',
      get: get,
      set: set,
      remove: remove,
      keys: keys,
      watch: watch,
      watchAll: watchAll,
      exportAll: exportAll,
      importAll: importAll,
      exportToFile: exportToFile,
      importFromFile: importFromFile,
    };
  });

  /* ====================================================================== */
  /* src/core/ui.js */
  __def("core/ui", function (require, module, exports) {
    /**
     * Панель настроек.
     *
     * Жёсткие правила:
     *  - монтируемся ТОЛЬКО в отдельный контейнер #cwb-root в конце <body>,
     *    никогда внутрь #app / #main_table / игровых блоков;
     *  - все классы и id начинаются с `cwb-`;
     *  - панель гасит события клавиатуры внутри себя (capture + stopPropagation),
     *    чтобы игровые горячие клавиши (js/key.js слушает document) не срабатывали,
     *    пока пользователь печатает в наших полях.
     */

    var dom = require('core/dom');
    var log = require('core/log').create('ui');
    var registry = require('core/registry');
    var storage = require('core/storage');
    var config = require('core/config');
    var meta = require('cwb:meta');

    var ROOT_ID = 'cwb-root';
    var STYLE_ID = 'core-ui';

    var state = {
      root: null,
      gear: null,
      overlay: null,
      listEl: null,
      searchEl: null,
      query: '',
      open: false,
      offRegistry: null,
      offKeys: [],
      keeper: null,
      menuBound: false,
    };

    /* ---------------------------------- стили ---------------------------------- */

    function css() {
      return [
        '#cwb-root{position:static;pointer-events:none;',
        'font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1c1c1e;}',
        '#cwb-root *{box-sizing:border-box;}',

        '.cwb-gear{position:fixed;right:0;bottom:72px;z-index:2147483647;pointer-events:auto;',
        'min-width:44px;height:36px;padding:0 10px;border-radius:18px 0 0 18px;',
        'border:1px solid #3d3224;cursor:pointer;background:#e8c27a;color:#2a1f12;',
        'font:600 13px/34px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;',
        'box-shadow:0 2px 12px rgba(0,0,0,.45);opacity:1;transition:transform .15s,filter .15s;}',
        '.cwb-gear:hover{filter:brightness(1.08);}',

        '.cwb-overlay{position:fixed;inset:0;z-index:2147483646;pointer-events:auto;background:rgba(0,0,0,.45);',
        'display:flex;align-items:center;justify-content:center;padding:24px;}',
        '.cwb-overlay[hidden]{display:none;}',

        '.cwb-modal{width:min(720px,100%);max-height:min(85vh,900px);display:flex;flex-direction:column;',
        'background:#fdfbf7;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.4);overflow:hidden;}',

        '.cwb-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#2f2a24;color:#f3e7d3;flex:0 0 auto;}',
        '.cwb-title{font-weight:600;font-size:15px;white-space:nowrap;}',
        '.cwb-ver{opacity:.55;font-size:12px;}',
        '.cwb-search{flex:1 1 auto;min-width:80px;padding:6px 10px;border-radius:7px;border:1px solid #574f44;',
        'background:#3d372f;color:#f3e7d3;font:inherit;font-size:13px;}',
        '.cwb-search::placeholder{color:#a39684;}',
        '.cwb-x{background:none;border:none;color:#f3e7d3;font-size:22px;line-height:1;cursor:pointer;padding:0 4px;opacity:.7;}',
        '.cwb-x:hover{opacity:1;}',

        '.cwb-body{flex:1 1 auto;overflow-y:auto;padding:8px 14px 14px;}',

        '.cwb-cat{margin-top:14px;}',
        '.cwb-cat:first-child{margin-top:4px;}',
        '.cwb-cat-title{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#8a7f70;',
        'margin:0 0 6px;font-weight:700;}',

        '.cwb-mod{border:1px solid #e6ddcd;border-radius:9px;background:#fff;margin-bottom:7px;overflow:hidden;}',
        '.cwb-mod-head{display:flex;align-items:flex-start;gap:10px;padding:9px 11px;}',
        '.cwb-mod-main{flex:1 1 auto;min-width:0;}',
        '.cwb-mod-name{font-weight:600;font-size:13.5px;}',
        '.cwb-mod-desc{font-size:12px;color:#7d7367;margin-top:2px;}',
        '.cwb-mod-warn{font-size:12px;color:#9a5b00;margin-top:3px;}',

        '.cwb-sw{position:relative;flex:0 0 auto;width:38px;height:22px;cursor:pointer;margin-top:1px;}',
        '.cwb-sw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;}',
        '.cwb-sw span{position:absolute;inset:0;border-radius:11px;background:#cfc6b7;transition:background .15s;pointer-events:none;}',
        '.cwb-sw span::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;',
        'background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s;}',
        '.cwb-sw input:checked + span{background:#6f9a52;}',
        '.cwb-sw input:checked + span::after{transform:translateX(16px);}',

        '.cwb-opts{border-top:1px dashed #e6ddcd;padding:9px 11px;background:#fbf8f2;}',
        '.cwb-opt{display:flex;align-items:center;gap:10px;padding:4px 0;flex-wrap:wrap;}',
        '.cwb-opt-label{flex:1 1 200px;font-size:12.5px;min-width:0;}',
        '.cwb-opt-hint{display:block;font-size:11.5px;color:#8a7f70;margin-top:1px;}',
        '.cwb-opt input[type=text],.cwb-opt input[type=number],.cwb-opt select,.cwb-opt textarea{',
        'padding:4px 7px;border:1px solid #d6cbb8;border-radius:6px;font:inherit;font-size:12.5px;background:#fff;color:inherit;}',
        '.cwb-opt input[type=number]{width:84px;}',
        '.cwb-opt input[type=text]{width:220px;max-width:100%;}',
        '.cwb-opt textarea{width:100%;min-height:80px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;}',
        '.cwb-opt input[type=color]{width:42px;height:26px;padding:1px;border:1px solid #d6cbb8;border-radius:6px;background:#fff;cursor:pointer;}',
        '.cwb-opt input[type=range]{width:150px;}',
        '.cwb-opt-val{font-size:12px;color:#8a7f70;min-width:34px;}',
        '.cwb-opt-full{flex-direction:column;align-items:stretch;}',
        '.cwb-opt-full .cwb-opt-label{flex:0 0 auto;}',

        '.cwb-maps-editor{display:flex;flex-direction:column;gap:8px;width:100%;}',
        '.cwb-maps-editor h4{margin:4px 0 0;font-size:12px;}',
        '.cwb-maps-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
        '.cwb-maps-item{display:flex;align-items:center;gap:2px;}',
        '.cwb-maps-item button,.cwb-maps-row>.cwb-btn{min-height:24px;padding:2px 7px;border:1px solid #d6cbb8;',
        'border-radius:6px;background:#fff;cursor:pointer;font:inherit;font-size:12px;color:inherit;}',
        '.cwb-maps-item button.active{background:#e8c27a;border-color:#e8c27a;color:#2a1f12;}',
        '.cwb-maps-item .cwb-maps-ico{min-width:24px;padding:2px 5px;opacity:.8;}',

        '.cwb-foot{flex:0 0 auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;',
        'padding:10px 14px;border-top:1px solid #e6ddcd;background:#f5f0e6;}',
        '.cwb-btn{padding:6px 12px;border:1px solid #d6cbb8;border-radius:7px;background:#fff;cursor:pointer;',
        'font:inherit;font-size:12.5px;color:inherit;}',
        '.cwb-btn:hover{background:#f0e9db;}',
        '.cwb-foot-note{margin-left:auto;font-size:11.5px;color:#8a7f70;}',
        '.cwb-empty{padding:26px 0;text-align:center;color:#8a7f70;font-size:13px;}',

        '.cwb-toast{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);pointer-events:none;',
        'background:#2f2a24;color:#f3e7d3;padding:8px 16px;border-radius:8px;font-size:13px;',
        'box-shadow:0 6px 20px rgba(0,0,0,.35);opacity:0;transition:opacity .2s;}',
        '.cwb-toast.cwb-show{opacity:1;}',
      ].join('');
    }

    /* -------------------------------- рендеринг -------------------------------- */

    function control(schemaItem, current, apply) {
      var type = schemaItem.type || 'text';
      var node;

      if (type === 'boolean') {
        node = dom.el('label', { class: 'cwb-sw' }, [
          dom.el('input', { type: 'checkbox', checked: current ? true : null }),
          dom.el('span'),
        ]);
        node.firstChild.addEventListener('change', function (e) { apply(e.target.checked); });
        return node;
      }

      if (type === 'select') {
        node = dom.el('select');
        (schemaItem.options || []).forEach(function (o) {
          var opt = dom.el('option', { value: String(o.value), text: o.label });
          if (String(o.value) === String(current)) opt.selected = true;
          node.appendChild(opt);
        });
        node.addEventListener('change', function (e) {
          var raw = e.target.value;
          var match = (schemaItem.options || []).filter(function (o) { return String(o.value) === raw; })[0];
          apply(match ? match.value : raw);
        });
        return node;
      }

      if (type === 'number' || type === 'range') {
        node = dom.el('input', {
          type: type === 'range' ? 'range' : 'number',
          value: current === undefined || current === null ? '' : String(current),
          min: schemaItem.min,
          max: schemaItem.max,
          step: schemaItem.step,
        });
        var out = type === 'range' ? dom.el('span', { class: 'cwb-opt-val', text: String(current) }) : null;
        node.addEventListener('input', function (e) {
          var num = parseFloat(e.target.value);
          if (out) out.textContent = e.target.value;
          if (!isNaN(num)) apply(num);
        });
        if (out) {
          var wrap = dom.el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, [node, out]);
          return wrap;
        }
        return node;
      }

      if (type === 'color') {
        node = dom.el('input', { type: 'color', value: current || '#ffffff' });
        node.addEventListener('input', function (e) { apply(e.target.value); });
        return node;
      }

      if (type === 'textarea') {
        node = dom.el('textarea', { placeholder: schemaItem.placeholder || '' });
        node.value = current === undefined || current === null ? '' : String(current);
        node.addEventListener('change', function (e) { apply(e.target.value); });
        return node;
      }

      if (type === 'custom' && typeof schemaItem.render === 'function') {
        return schemaItem.render(current, apply, schemaItem) || document.createTextNode('');
      }

      node = dom.el('input', { type: 'text', value: current === undefined || current === null ? '' : String(current), placeholder: schemaItem.placeholder || '' });
      node.addEventListener('change', function (e) { apply(e.target.value); });
      return node;
    }

    function optionRow(schemaItem, current, apply) {
      var full = schemaItem.type === 'textarea' || schemaItem.type === 'custom';
      if (schemaItem.type === 'custom') {
        return dom.el('div', { class: 'cwb-opt cwb-opt-full' }, [
          schemaItem.label || schemaItem.hint
            ? dom.el('label', { class: 'cwb-opt-label' }, [
              schemaItem.label ? document.createTextNode(schemaItem.label) : null,
              schemaItem.hint ? dom.el('span', { class: 'cwb-opt-hint', text: schemaItem.hint }) : null,
            ])
            : null,
          control(schemaItem, current, apply),
        ]);
      }
      return dom.el('div', { class: 'cwb-opt' + (full ? ' cwb-opt-full' : '') }, [
        dom.el('label', { class: 'cwb-opt-label' }, [
          document.createTextNode(schemaItem.label || schemaItem.key),
          schemaItem.hint ? dom.el('span', { class: 'cwb-opt-hint', text: schemaItem.hint }) : null,
        ]),
        control(schemaItem, current, apply),
      ]);
    }

    function moduleCard(mod) {
      var settings = registry.settingsOf(mod.id);
      var enabled = registry.isEnabled(mod.id);
      var hasOpts = (mod.schema || []).length > 0;

      var opts = null;
      if (hasOpts) {
        opts = dom.el('div', { class: 'cwb-opts' });
        mod.schema.forEach(function (item) {
          opts.appendChild(optionRow(item, settings[item.key], function (value) {
            registry.setSetting(mod.id, item.key, value);
          }));
        });
        }

      var sw = dom.el('label', { class: 'cwb-sw' }, [
        dom.el('input', { type: 'checkbox', checked: enabled ? true : null }),
        dom.el('span'),
      ]);
      sw.firstChild.addEventListener('change', function (e) {
        registry.setEnabled(mod.id, e.target.checked);
      });

      return dom.el('div', { class: 'cwb-mod', 'data-cwb-mod': mod.id }, [
        dom.el('div', { class: 'cwb-mod-head' }, [
          dom.el('div', { class: 'cwb-mod-main' }, [
            dom.el('div', { class: 'cwb-mod-name', text: mod.title }),
            mod.description ? dom.el('div', { class: 'cwb-mod-desc', text: mod.description }) : null,
            mod.warning ? dom.el('div', { class: 'cwb-mod-warn', text: '⚠ ' + mod.warning }) : null,
          ]),
          sw,
        ]),
        opts,
      ]);
    }

    function coreCard() {
      var current = config.all();
      var opts = dom.el('div', { class: 'cwb-opts' });
      config.SCHEMA.forEach(function (item) {
        opts.appendChild(optionRow(item, current[item.key], function (value) {
          config.set(item.key, value);
          applyCoreSettings();
        }));
      });

      return dom.el('div', { class: 'cwb-mod', 'data-cwb-mod': '__core' }, [
        dom.el('div', { class: 'cwb-mod-head' }, [
          dom.el('div', { class: 'cwb-mod-main' }, [
            dom.el('div', { class: 'cwb-mod-name', text: 'Ядро' }),
            dom.el('div', { class: 'cwb-mod-desc', text: 'Логи скрипта в консоли.' }),
          ]),
        ]),
        opts,
      ]);
    }

    function matchesQuery(mod, query) {
      if (!query) return true;
      var hay = (mod.title + ' ' + mod.description + ' ' + mod.id).toLowerCase();
      return hay.indexOf(query) >= 0;
    }

    /** Чтобы input не терял фокус при registry.onChange → render(). */
    function captureFocusHint() {
      var el = document.activeElement;
      if (!el || !state.listEl || !state.listEl.contains(el)) return null;
      var modEl = el.closest ? el.closest('[data-cwb-mod]') : null;
      if (!modEl) return null;
      var opts = modEl.querySelector('.cwb-opts');
      if (!opts || !opts.contains(el)) return null;
      var rows = opts.querySelectorAll('.cwb-opt');
      var rowIndex = -1;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].contains(el)) { rowIndex = i; break; }
      }
      if (rowIndex < 0) return null;
      return {
        modId: modEl.getAttribute('data-cwb-mod'),
        rowIndex: rowIndex,
        selStart: typeof el.selectionStart === 'number' ? el.selectionStart : null,
        selEnd: typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
      };
    }

    function restoreFocusHint(hint) {
      if (!hint || !state.listEl) return;
      var modEl = state.listEl.querySelector('[data-cwb-mod="' + hint.modId + '"]');
      if (!modEl) return;
      var opts = modEl.querySelector('.cwb-opts');
      if (!opts) return;
      var row = opts.querySelectorAll('.cwb-opt')[hint.rowIndex];
      if (!row) return;
      var input = row.querySelector('input, select, textarea');
      if (!input) return;
      input.focus();
      if (hint.selStart != null && typeof input.setSelectionRange === 'function') {
        try { input.setSelectionRange(hint.selStart, hint.selEnd); } catch (e) { /* noop */ }
      }
    }

    function render() {
      if (!state.listEl) return;
      var focusHint = captureFocusHint();
      var query = state.query.trim().toLowerCase();
      state.listEl.textContent = '';

      if (!query) state.listEl.appendChild(coreCard());

      var shown = 0;
      registry.CATEGORIES.forEach(function (cat) {
        var mods = registry.list().filter(function (m) {
          if (m.category !== cat.id || !matchesQuery(m, query)) return false;
          return true;
        });
        if (!mods.length) return;
        shown += mods.length;
        var block = dom.el('section', { class: 'cwb-cat' }, [
          dom.el('h3', { class: 'cwb-cat-title', text: cat.title }),
        ]);
        mods.forEach(function (m) { block.appendChild(moduleCard(m)); });
        state.listEl.appendChild(block);
      });

      if (!shown && query) {
        state.listEl.appendChild(dom.el('div', { class: 'cwb-empty', text: 'Ничего не найдено' }));
      }

      restoreFocusHint(focusHint);
    }

    /* --------------------------------- поведение ------------------------------- */

    function toast(text) {
      if (!state.root) return;
      var node = dom.el('div', { class: 'cwb-toast', text: text });
      state.root.appendChild(node);
      requestAnimationFrame(function () { node.classList.add('cwb-show'); });
      setTimeout(function () {
        node.classList.remove('cwb-show');
        setTimeout(function () { if (node.parentNode) node.remove(); }, 250);
      }, 2200);
    }

    function open() {
      if (!state.overlay) return;
      render();
      state.overlay.hidden = false;
      state.open = true;
      if (state.searchEl) state.searchEl.focus();
    }

    function close() {
      if (!state.overlay) return;
      state.overlay.hidden = true;
      state.open = false;
    }

    function toggle() {
      if (state.open) close(); else open();
    }

    function applyCoreSettings() {
      require('core/log').setLevel(config.all().logLevel);
    }

    /** Гасим клавиатуру внутри панели, чтобы не срабатывали хоткеи игры. */
    function isolateKeyboard(node) {
      ['keydown', 'keyup', 'keypress'].forEach(function (type) {
        state.offKeys.push(dom.on(node, type, function (e) { e.stopPropagation(); }, true));
      });
    }

    function mount() {
      if (document.getElementById(ROOT_ID)) return;
      if (!document.body) return;

      dom.injectStyle(STYLE_ID, css());

      var root = dom.el('div', { id: ROOT_ID });

      var gear = dom.el('button', {
        class: 'cwb-gear cwb-bottom-right',
        type: 'button',
        title: 'CatWar Balconette — настройки',
        'aria-label': 'Настройки CatWar Balconette',
        text: '⚙ моды',
        onclick: toggle,
      });

      var search = dom.el('input', { class: 'cwb-search', type: 'search', placeholder: 'Поиск по модулям…' });
      search.addEventListener('input', function (e) { state.query = e.target.value; render(); });

      var list = dom.el('div', { class: 'cwb-body' });

      var modalChildren = [
        dom.el('div', { class: 'cwb-head' }, [
          dom.el('div', { class: 'cwb-title', text: 'CatWar Balconette' }),
          dom.el('div', { class: 'cwb-ver', text: 'v' + meta.version }),
          search,
          dom.el('button', { class: 'cwb-x', type: 'button', title: 'Закрыть', text: '×', onclick: close }),
        ]),
        list,
      ];
      modalChildren.push(dom.el('div', { class: 'cwb-foot' }, [
        dom.el('button', {
          class: 'cwb-btn', type: 'button', text: 'Экспорт настроек',
          onclick: function () {
            try { storage.exportToFile(); toast('Настройки сохранены'); }
            catch (e) { log.error(e); toast('Не получилось сохранить настройки'); }
          },
        }),
        dom.el('button', {
          class: 'cwb-btn', type: 'button', text: 'Импорт настроек',
          onclick: function () {
            storage.importFromFile().then(function (count) {
              if (!count) return;
              toast('Загружено: ' + count + '. Перезагрузи страницу.');
              render();
            }).catch(function (e) {
              log.error(e);
              toast('Файл не подошёл: ' + e.message);
            });
          },
        }),
        dom.el('div', { class: 'cwb-foot-note', text: 'Хранилище: ' + storage.backend }),
      ]));

      var modal = dom.el('div', { class: 'cwb-modal' }, modalChildren);

      var overlay = dom.el('div', { class: 'cwb-overlay', hidden: true }, [modal]);
      overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });

      root.appendChild(gear);
      root.appendChild(overlay);
      document.body.appendChild(root);

      state.root = root;
      state.gear = gear;
      state.overlay = overlay;
      state.listEl = list;
      state.searchEl = search;

      isolateKeyboard(root);

      // Esc закрывает панель; хоткей открытия — Ctrl+Alt+B.
      state.offKeys.push(dom.on(document, 'keydown', function (e) {
        if (state.open && e.key === 'Escape') { close(); e.stopPropagation(); return; }
        if (e.ctrlKey && e.altKey && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }
      }, true));

      // Панель живёт рядом с реестром: перерисовка только при вкл/выкл модуля.
      state.offRegistry = registry.onChange(function (id, kind) { if (state.open && kind === 'enabled') render(); });
      config.onChange(applyCoreSettings);

      applyCoreSettings();
      keepAlive();
      registerMenuCommand();
      log.info('панель настроек смонтирована');
    }

    /** Если игра выкинет наш узел из body — вернём его. */
    function keepAlive() {
      if (state.keeper) return;
      var target = document.documentElement || document.body;
      if (!target) return;
      state.keeper = new MutationObserver(function () {
        if (state.root && document.body && !document.body.contains(state.root)) {
          document.body.appendChild(state.root);
        }
      });
      try {
        state.keeper.observe(target, { childList: true, subtree: true });
      } catch (e) {
        state.keeper = null;
      }
    }

    function registerMenuCommand() {
      if (state.menuBound) return;
      if (typeof GM_registerMenuCommand !== 'function') return;
      try {
        GM_registerMenuCommand('CatWar Balconette: настройки', function () { open(); });
        state.menuBound = true;
      } catch (e) { /* меню TM недоступно */ }
    }

    function unmount() {
      state.offKeys.forEach(function (off) { off(); });
      state.offKeys = [];
      if (state.offRegistry) state.offRegistry();
      if (state.keeper) {
        try { state.keeper.disconnect(); } catch (e) { /* noop */ }
        state.keeper = null;
      }
      if (state.root && state.root.parentNode) state.root.remove();
      dom.removeStyle(STYLE_ID);
      state.root = state.gear = state.overlay = state.listEl = state.searchEl = null;
      state.open = false;
    }

    module.exports = {
      ROOT_ID: ROOT_ID,
      mount: mount,
      unmount: unmount,
      open: open,
      close: close,
      toggle: toggle,
      render: render,
      toast: toast,
    };
  });

  /* ====================================================================== */
  /* src/core/uwu.js */
  __def("core/uwu", function (require, module, exports) {
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
      'uwu_climbingPanelState',
      'uwu_climbingPanelStatus',
    ];

    var DOM_IDS = [
      'uwusettings',
      'uwu-climbingMainPanel',
      'uwu-climbingPanel',
      'uwu-fast-style-hideSky',
      'cellsBordersStyle',
    ];

    /**
     * Модули, у которых в UwU есть прямой аналог. Остальные — вкладка «Новые».
     * hint показывается в карточке надстройки.
     */
    var OVERLAY = {
      'static-background': {
        hint: 'В UwU — «Статичный фон локации». Если он включён, фон поля не трогаем, фон страницы остаётся нашим.',
      },
      'hide-weather': {
        hint: 'В UwU быстрый стиль «Скрыть небо». Если небо уже спрятано, наше не дублируем.',
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
      return !!fastStyles()[key];
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
  });

  /* ====================================================================== */
  /* src/core/vue.js */
  __def("core/vue", function (require, module, exports) {
    /**
     * Мост к Vue-приложению игры.
     *
     * Игра — Vue 2, весь стейт лежит в `document.querySelector('#app').__vue__`:
     *   game, chat, cat, family, weather, field, hunt, item, fight, buff,
     *   mobile, parameter, modal, siteClosure
     *
     * Предпочтительный способ получать данные — реактивные $watch отсюда,
     * а не хук сокета. Любая функция здесь безопасна при отсутствии Vue:
     * возвращает null / no-op, ничего не бросает.
     */

    var log = require('core/log').create('vue');

    var APP_SELECTOR = '#app';

    function getRoot() {
      try {
        var app = document.querySelector(APP_SELECTOR);
        return app && app.__vue__ ? app.__vue__ : null;
      } catch (e) {
        return null;
      }
    }

    function isReady() {
      return !!getRoot();
    }

    /** Корневой $data со всеми модулями игры (или null). */
    function getState() {
      var vm = getRoot();
      if (!vm) return null;
      return vm.$data || vm;
    }

    /** Безопасное чтение по пути: get('weather.hour'), get('field.map.3.5'). */
    function get(path, fallback) {
      var state = getState();
      if (!state) return fallback;
      var parts = String(path).split('.');
      var cur = state;
      for (var i = 0; i < parts.length; i++) {
        if (cur === null || cur === undefined) return fallback;
        cur = cur[parts[i]];
      }
      return cur === undefined ? fallback : cur;
    }

    /**
     * Ждёт монтирования Vue.
     * Резолвится корневым инстансом или null по таймауту — без исключений.
     */
    function waitForVue(opts) {
      opts = opts || {};
      var timeout = typeof opts.timeout === 'number' ? opts.timeout : 30000;
      var step = opts.interval || 120;

      return new Promise(function (resolve) {
        var immediate = getRoot();
        if (immediate) { resolve(immediate); return; }

        var elapsed = 0;
        var timer = setInterval(function () {
          var vm = getRoot();
          if (vm) {
            clearInterval(timer);
            resolve(vm);
            return;
          }
          elapsed += step;
          if (timeout > 0 && elapsed >= timeout) {
            clearInterval(timer);
            log.info('Vue не появился за', timeout, 'мс — модули, зависящие от стейта, не стартуют');
            resolve(null);
          }
        }, step);
      });
    }

    /**
     * $watch с безопасной отпиской.
     * Возвращает функцию отписки (no-op, если Vue нет).
     */
    function watch(path, cb, opts) {
      var vm = getRoot();
      if (!vm || typeof vm.$watch !== 'function' || typeof cb !== 'function') return function () {};
      var unwatch;
      try {
        unwatch = vm.$watch(path, function (value, old) {
          try { cb(value, old); } catch (e) { log.error('обработчик watch упал', path, e); }
        }, opts || {});
      } catch (e) {
        log.warn('не удалось подписаться на', path, e);
        return function () {};
      }
      return function () {
        try { if (typeof unwatch === 'function') unwatch(); } catch (e) { /* уже отписан */ }
      };
    }

    /**
     * То же, что watch(), но переживает ещё не смонтированный Vue.
     *
     * Модули поднимаются на DOMContentLoaded, а Vue монтируется позже — прямой
     * $watch в этот момент просто не на что вешать. Поэтому подписку откладываем
     * до появления корня. Возвращённая функция отписки работает в обоих состояниях:
     * до готовности она отменяет отложенную подписку, после — снимает настоящую.
     */
    function watchWhenReady(path, cb, opts) {
      if (typeof cb !== 'function') return function () {};

      if (getRoot()) return watch(path, cb, opts);

      var cancelled = false;
      var real = null;

      waitForVue({ timeout: (opts && opts.waitTimeout) || 60000 }).then(function (vm) {
        if (cancelled || !vm) return;
        real = watch(path, cb, opts);
      });

      return function () {
        cancelled = true;
        if (real) real();
      };
    }

    /** Собирает несколько отписок в одну. */
    function bag() {
      var offs = [];
      return {
        add: function (off) { if (typeof off === 'function') offs.push(off); return off; },
        watch: function (path, cb, opts) { var off = watch(path, cb, opts); offs.push(off); return off; },
        dispose: function () {
          while (offs.length) {
            var off = offs.pop();
            try { off(); } catch (e) { /* noop */ }
          }
        },
      };
    }

    /* ------------------------- удобные обёртки поверх watch ------------------- */

    /**
     * Изменение карты поля (переход, появление кота, предмета и т.д.).
     * deep по умолчанию: карта меняется точечно.
     */
    function onFieldChange(cb, opts) {
      return watchWhenReady('field.map', cb, Object.assign({ deep: true }, opts || {}));
    }

    /** Смена локации: {name, bg}. */
    function onLocationChange(cb) {
      return watchWhenReady('field.location', cb, { deep: true });
    }

    /**
     * Новые сообщения чата.
     * Колбэк получает массив ТОЛЬКО новых сообщений, а не весь список.
     * Мы не трогаем DOM чата: читаем chat.messages из стейта.
     */
    function onChatMessage(cb) {
      if (typeof cb !== 'function') return function () {};
      // seen считаем лениво: на момент подписки Vue может быть ещё не смонтирован,
      // и тогда вся уже загруженная лента ошибочно уехала бы в колбэк как «новая».
      var seen = null;
      return watchWhenReady('chat.messages', function (messages) {
        if (!Array.isArray(messages)) return;
        if (seen === null) { seen = messages.length; return; }
        if (messages.length < seen) { seen = messages.length; return; } // чат перезагрузили
        if (messages.length === seen) return;
        // chat.add делает unshift — новые сообщения в начале массива.
        var added = messages.length - seen;
        var fresh = messages.slice(0, added);
        seen = messages.length;
        cb(fresh, messages);
      });
    }

    /** Дописывание истории (#ist). В стейте это одна строка, которая растёт. */
    function onHistoryChange(cb) {
      return watchWhenReady('cat.history', cb);
    }

    /** Игровой час 0..23 (тикает раз в секунду внутри игры). */
    function onHourChange(cb) {
      return watchWhenReady('weather.hour', cb);
    }

    module.exports = {
      APP_SELECTOR: APP_SELECTOR,
      getRoot: getRoot,
      getState: getState,
      isReady: isReady,
      get: get,
      waitForVue: waitForVue,
      watch: watch,
      watchWhenReady: watchWhenReady,
      bag: bag,
      onFieldChange: onFieldChange,
      onLocationChange: onLocationChange,
      onChatMessage: onChatMessage,
      onHistoryChange: onHistoryChange,
      onHourChange: onHourChange,
    };
  });

  /* ====================================================================== */
  /* src/data/old-icons.js */
  __def("data/old-icons", function (require, module, exports) {
    /**
     * Словарь замен «старых иконок действий».
     *
     * ИСТОЧНИК: CW Shed 1.54, правило `on_css_oldicons`
     * (research/mods/CW_Shed.user.js, строки 2618–2641).
     *
     * ВАЖНО, ЧЕГО ЗДЕСЬ НЕ ХВАТАЕТ (подробности в SPEC.md, раздел «Открытые вопросы»):
     *  1. В Shed ссылки были на http://d.zaix.ru/… — это СТОРОННИЙ хостинг и HTTP.
     *     На https://catwar.su браузер заблокирует такие картинки как mixed content.
     *     Здесь они переписаны на https, но работоспособность домена не проверялась.
     *  2. Shed подменял всего 21 иконку из ~53 — это не полный «старый набор»,
     *     а те, что автору мода не понравились. Каталога «что реально изменилось
     *     на CDN игры» у нас нет: игровой HAR обрезан на 100 КБ.
     *  3. Нет соответствия id → название действия, поэтому в панели настроек
     *     нельзя показать человекочитаемый список.
     *
     * Пока пункты 1–3 не закрыты, модуль old-icons выключен по умолчанию и
     * рассчитан на свой набор картинок (опция «Свой словарь» или базовый URL).
     */

    var ZAIX = 'https://d.zaix.ru/';

    /** id действия (значение атрибута data-id у a.dey) -> URL картинки. */
    var ACTIONS = {
      '1': ZAIX + 'b6pm.png',
      '3': ZAIX + 'b6pp.png',
      '4': ZAIX + 'b6pC.png',
      '5': ZAIX + 'b6pD.png',
      '6': ZAIX + 'b6pK.png',
      '8': ZAIX + 'b6pE.png',
      '9': ZAIX + 'dIZZ.png',
      '11': ZAIX + 'c8wv.png',
      '12': ZAIX + 'b6po.png',
      '13': ZAIX + '3989.png',
      '14': ZAIX + 'b6pM.png',
      '17': ZAIX + '3aKJ.png',
      '18': ZAIX + 'dJ26.png',
      '19': ZAIX + 'dJ28.png',
      '24': ZAIX + 'criD.png',
      '27': ZAIX + 'aWBR.png',
      '28': ZAIX + 'buJT.png',
      '29': ZAIX + 'dcu3.png',
      '51': ZAIX + 'heaT.png',
      '52': ZAIX + 'heaU.png',
      '53': ZAIX + 'heaW.png',
      exchange: ZAIX + 'aRJm.png',
      flowers: ZAIX + 'aRIh.png',
    };

    /** Прочие точечные замены: CSS-селектор -> URL. */
    var EXTRA = {
      '#dialog > img': ZAIX + 'fpvK.png',
    };

    module.exports = {
      source: 'CW Shed 1.54 (on_css_oldicons)',
      ACTIONS: ACTIONS,
      EXTRA: EXTRA,
      /** Сколько иконок покрывает встроенный словарь. */
      count: Object.keys(ACTIONS).length + Object.keys(EXTRA).length,
    };
  });

  /* ====================================================================== */
  /* src/modules/cell-coords.js */
  __def("modules/cell-coords", function (require, module, exports) {
    /**
     * Координаты клетки при наведении на игровое поле.
     *
     * x/y — индексы td/tr в #cages (1-based), как в field.map[y][x].
     * При нюхе и перерисовке поля оверлей перевешивается по $watch field.map.
     * См. CORRECTIONS.md и RUNTIME.md §8.10.
     */

    var SEL_TABLE = '#cages';
    var SEL_CELL = SEL_TABLE + ' td.cage';

    function cellCoords(td) {
      var tr = td.parentElement;
      if (!tr || !tr.parentElement) return null;
      return {
        y: Array.prototype.indexOf.call(tr.parentElement.children, tr) + 1,
        x: Array.prototype.indexOf.call(tr.children, td) + 1,
      };
    }

    module.exports = {
      id: 'cell-coords',
      title: 'Координаты клетки',
      description: 'Подсказка x,y при наведении на клетку игрового поля.',
      category: 'field',
      pages: ['game', 'hunt'],
      enabledByDefault: false,
      order: 21,

      defaults: {
        showTree: true,
        hideInSmell: true,
      },

      schema: [],

      styles: function () {
        return [
          SEL_CELL + ' { position: relative; }',
          SEL_CELL + '[data-cwb-xy]:hover::before {',
          'content: attr(data-cwb-xy); position: absolute; top: 2px; left: 2px; z-index: 50;',
          'font: 11px/1 ui-monospace, Menlo, Consolas, monospace;',
          'background: rgba(0,0,0,.78); color: #fff; padding: 2px 4px; pointer-events: none;',
          'border-radius: 3px;',
          '}',
        ].join('\n');
      },

      init: function (ctx) {
        var boundTable = null;

        function labelFor(td) {
          var c = cellCoords(td);
          if (!c) return;
          var map = ctx.vue.get('field.map');
          var cage = map && map[c.y] && map[c.y][c.x];
          var text = c.x + ',' + c.y;
          if (ctx.settings.get('showTree') && cage && typeof cage.tree === 'number') {
            text += ' · ярус ' + cage.tree;
          }
          td.dataset.cwbXy = text;
        }

        function onOver(e) {
          var td = e.target.closest && e.target.closest(SEL_CELL);
          if (!td) return;
          if (ctx.settings.get('hideInSmell')) {
            var smell = ctx.vue.get('field.smellMap');
            if (smell && (typeof smell === 'object' || Array.isArray(smell))) return;
          }
          labelFor(td);
        }

        function bindTable(table) {
          if (!table || table === boundTable) return;
          boundTable = table;
          ctx.on(table, 'mouseover', onOver);
        }

        function syncTable() {
          if (ctx.isDisposed()) return;
          if (ctx.settings.get('hideInSmell')) {
            var smell = ctx.vue.get('field.smellMap');
            if (smell && (typeof smell === 'object' || Array.isArray(smell))) return;
          }
          var table = ctx.dom.qs(SEL_TABLE);
          if (table && table.tagName === 'TABLE') bindTable(table);
        }

        return ctx.dom.waitForElement(SEL_TABLE).then(function () {
          if (ctx.isDisposed()) return;
          syncTable();
          ctx.watch('field.map', syncTable, { deep: true });
          ctx.watch('field.smellMap', syncTable);
          ctx.watch('hunt.mode', syncTable);
        });
      },
    };
  });

  /* ====================================================================== */
  /* src/modules/climbing-field.js */
  __def("modules/climbing-field", function (require, module, exports) {
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
            var next = ask('Новое имя вкладки:', tab.name);
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
          var name = ask('Имя вкладки:');
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
              var next = ask('Новое имя поля:', table.name);
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
            var name = ask('Имя поля:');
            if (!name) return;
            tab.tables.push(emptyTable(name));
            tab.currentTable = tab.tables.length - 1;
            persist(maps);
          });
          fieldRow.appendChild(addField);
        }
        wrap.appendChild(fieldRow);

        var uwu = require('core/uwu');
        wrap.appendChild(dom.el('h4', { text: 'Импорт из UwU' }));
        var paste = dom.el('textarea', {
          class: 'cwb-maps-paste',
          placeholder: 'Вставь экспорт настроек UwU целиком — их поле «Экспорт»',
          style: {
            width: '100%',
            minHeight: '72px',
            boxSizing: 'border-box',
            padding: '6px 8px',
            border: '1px solid #d6cbb8',
            borderRadius: '6px',
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            fontSize: '12px',
            resize: 'vertical',
          },
        });
        wrap.appendChild(paste);
        var pasteRow = dom.el('div', { class: 'cwb-maps-row' });
        var pasteBtn = dom.el('button', {
          type: 'button',
          class: 'cwb-btn',
          text: 'Забрать карты из экспорта',
        });
        pasteBtn.addEventListener('click', function () {
          var imported = uwu.climbingMapsFromExport(paste.value);
          if (!imported) {
            window.alert('В вставке нет карт минника. Нужен экспорт настроек UwU целиком (в нём есть uwu_climbingPanelState) или сам объект с вкладками.');
            return;
          }
          if (!window.confirm('Заменить наши карты ЛУ картами из экспорта UwU? Их карты не трогаем, пишем только к себе.')) return;
          persist(normalizeMaps(imported));
          paste.value = '';
        });
        pasteRow.appendChild(pasteBtn);
        pasteRow.appendChild(dom.el('span', {
          class: 'cwb-opt-hint',
          text: 'Так забираются названия локаций и клетки. Единое хранилище UwU в localStorage их не кладёт.',
        }));
        wrap.appendChild(pasteRow);

        var importRow = dom.el('div', { class: 'cwb-maps-row' });
        var importBtn = dom.el('button', {
          type: 'button',
          class: 'cwb-btn',
          text: 'Импорт карт из UwU',
        });
        importBtn.addEventListener('click', function () {
          var imported = uwu.importClimbingMaps();
          if (!imported) {
            window.alert('Карт UwU в localStorage нет. Вставь экспорт из их настроек в поле выше.');
            return;
          }
          var empty = !uwu.climbingMapsHaveMarks(imported);
          var question = empty
            ? 'В localStorage UwU карты без клеток — часто это старая копия при едином хранилище. Названия локаций и клетки лежат в экспорте, вставь его в поле выше. Всё равно заменить наши карты этой копией?'
            : 'Заменить наши карты ЛУ картами из UwU? Их карты не трогаем, пишем только к себе.';
          if (!window.confirm(question)) return;
          persist(normalizeMaps(imported));
        });
        importRow.appendChild(importBtn);
        if (uwu.present()) {
          var stored = uwu.importClimbingMaps();
          importRow.appendChild(dom.el('span', {
            class: 'cwb-opt-hint',
            text: stored
              ? (uwu.climbingMapsHaveMarks(stored)
                ? 'Найдены карты UwU в localStorage.'
                : 'В localStorage UwU карты без клеток. Вставь их экспорт выше.')
              : 'UwU рядом, но карт минника в localStorage нет. Вставь их экспорт выше.',
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
      description: 'Минное поле 10×6: вкладки, локации, цифры треска, мины и переходы. Карты не слетают после обновления.',
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
        uwuSync: 'off',
        collapsed: false,
        x: null,
        y: null,
        clearOnLocation: false,
      },

      schema: [
        {
          key: 'blockDangerous',
          type: 'boolean',
          label: 'Кач ЛУ: не нажимать на опасные клетки',
          hint: 'Не даёт кликнуть и пойти с клавиатуры (WASD, QEZX) на мины, опаски и unsafe. Выключи, если хочешь ходить как обычно.',
        },
        {
          key: 'autoFromChat',
          type: 'boolean',
          label: 'Ставить цифру в клетку кота по треску в чате',
          hint: 'Берёт громкость из [треск] (0–7) и ставит в клетку, где стоит твой кот. Обычные системные реплики не считает.',
        },
        {
          key: 'mapsEditor',
          type: 'custom',
          label: 'Вкладки и поля',
          hint: 'Добавить, удалить или переименовать вкладки и таблицы внутри выбранной вкладки.',
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
          '#cwb-lu-train-uwu{margin-left:8px;height:22px;padding:0 8px;border:1px solid #6a5d4c;border-radius:4px;',
          'background:#3a332b;color:#f3e7d3;cursor:pointer;font:11px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
          '#cwb-lu-train-uwu.active{background:#e8c27a;color:#2a1f12;border-color:#e8c27a;}',
          '#cwb-lu-tools{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;}',
          '#cwb-lu-tools button{min-width:22px;height:20px;padding:0 5px;border:1px solid #6a5d4c;',
          'border-radius:4px;background:#3a332b;color:#f3e7d3;cursor:pointer;font:11px/18px inherit;}',
          '#cages td.cage{position:relative;width:100px;}',
          '#cages td.cage[data-cwb-lu-fill]::before{content:"";position:absolute;left:0;top:0;right:0;bottom:0;',
          'z-index:5;pointer-events:none;}',
          '#cages > tbody > tr > td.cage[data-cwb-lu-fill="safe"]::before{background:rgba(46,130,50,.28) !important;}',
          '#cages > tbody > tr > td.cage[data-cwb-lu-fill="mine"]::before{background:rgba(180,16,16,.32) !important;}',
          '#cages > tbody > tr > td.cage[data-cwb-lu-fill="transit"]::before{background:rgba(255,236,140,.3) !important;}',
          '#cages td.cage[data-cwb-lu-block]{cursor:not-allowed;}',
          '#cages td.cage[data-cwb-lu]::after{content:attr(data-cwb-lu);position:absolute;right:2px;bottom:2px;',
          'z-index:40;font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;padding:1px 3px;border-radius:3px;',
          'background:rgba(0,0,0,.78);color:#ffe9a8;pointer-events:none;}',
          '#cages td.cage[data-cwb-lu="X"]::after{background:rgba(160,0,0,.85);color:#fff;}',
          '#cwb-lu-overlay{display:flex;align-items:center;gap:5px;margin:0 0 6px;font-size:11px;cursor:pointer;opacity:.9;}',
          '#cwb-lu-overlay:hover{opacity:1;}',
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
        var overlayInput = dom.el('input', { type: 'checkbox', checked: !!ctx.settings.get('overlay') });
        var overlayLabel = dom.el('label', {
          id: 'cwb-lu-overlay',
          title: 'Дублировать пометки (безопасно/мина/переход) и цифры на клетках игрового поля',
        }, [overlayInput, document.createTextNode(' Переносить на игровую')]);
        overlayLabel.addEventListener('change', function (e) {
          if (e.target === overlayInput) ctx.settings.set('overlay', e.target.checked);
        });
        var navChildren = [overlayLabel, dom.el('h3', { text: 'Вкладка' }), tabsEl, dom.el('h3', { text: 'Локация' }), fieldsEl];
        var nav = dom.el('div', { id: 'cwb-lu-nav' }, navChildren);
        var emptyEl = dom.el('div', { id: 'cwb-lu-empty', text: 'Добавь поле или таблицу в настройках' });
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
          dom.el('div', { id: 'cwb-lu-help', text: 'Клавиши 0–7, «-» мина, «=» переход. Вкладки и поля — в панели модов. «Кач ЛУ» не даёт кликнуть и пойти WASD на опасные клетки.' }),
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

        var shadow = emptyGrid();
        var pulling = false;
        var pushedAt = [];
        var seenUwuTable = null;

        function syncMode() {
          var mode = ctx.settings.get('uwuSync');
          return mode === 'both' || mode === 'uwu' ? mode : 'off';
        }

        function uwuTable() {
          return document.getElementById('uwu-climbingPanel');
        }

        function uwuCellList() {
          var table = uwuTable();
          if (!table) return null;
          var list = table.querySelectorAll('td');
          return list.length >= ROWS * COLS ? list : null;
        }

        function markAt(i) {
          if (syncMode() === 'uwu') {
            var list = uwuCellList();
            if (list && list[i]) {
              var live = normalizeMark(list[i].dataset.value || '');
              if (live) return live;
            }
            return shadow[i] || '';
          }
          var grid = currentGrid();
          return grid[i] || '';
        }

        /**
         * UwU пишет клетку в своё хранилище (и в GM, если включено единое)
         * только из своего keydown по td. Чужой GM_setValue нам недоступен.
         */
        function pushCellToUwu(i, mark) {
          if (pulling || syncMode() === 'off') return;
          var list = uwuCellList();
          if (!list || !list[i]) return;
          var want = normalizeMark(mark);
          var td = list[i];
          if (normalizeMark(td.dataset.value || '') === want) return;
          pushedAt[i] = Date.now();
          var prev = document.activeElement;
          try {
            if (!want) {
              td.dataset.value = '';
              td.textContent = '';
              td.style.backgroundColor = '';
              pokeUwuSave(list, i);
            } else {
              var key = uwuKey(want);
              try { td.focus({ preventScroll: true }); } catch (e) { td.focus(); }
              td.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
            }
          } finally {
            if (prev && prev !== document.activeElement && prev.focus) {
              try { prev.focus({ preventScroll: true }); } catch (e2) { /* noop */ }
            }
          }
        }

        function pokeUwuSave(list, skip) {
          var j;
          for (j = 0; j < list.length; j++) {
            if (j === skip) continue;
            var key = uwuKey(normalizeMark(list[j].dataset.value || ''));
            if (!key) continue;
            try { list[j].focus({ preventScroll: true }); } catch (e) { list[j].focus(); }
            list[j].dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
            return;
          }
        }

        function uwuKey(mark) {
          if (mark === 'mine') return '-';
          if (mark === 'transit') return '=';
          if (/^[0-7]$/.test(mark)) return mark;
          return '';
        }

        function pullFromUwu() {
          if (pulling || syncMode() === 'off') return;
          var table = uwuTable();
          var list = uwuCellList();
          if (!table || !list) { seenUwuTable = null; return; }
          var rebuilt = table !== seenUwuTable;
          seenUwuTable = table;
          if (rebuilt && syncMode() === 'both') return;
          var changed = [];
          var now = Date.now();
          var i;
          for (i = 0; i < ROWS * COLS; i++) {
            if (pushedAt[i] && now - pushedAt[i] < 500) continue;
            var mark = normalizeMark(list[i].dataset.value || '');
            var cur = syncMode() === 'uwu' ? (shadow[i] || '') : (currentGrid()[i] || '');
            if (!mark || mark === cur) continue;
            changed.push({ i: i, mark: mark });
          }
          if (!changed.length) return;
          pulling = true;
          try {
            changed.forEach(function (item) {
              if (syncMode() === 'uwu') shadow[item.i] = item.mark;
              else currentGrid()[item.i] = item.mark;
            });
            if (syncMode() === 'both') { save(); paintAll(); }
            else paintField();
          } finally {
            pulling = false;
          }
        }

        function ensureUwuTrain() {
          var host = document.getElementById('uwu-functionButtonsContainer');
          var btn = document.getElementById('cwb-lu-train-uwu');
          if (syncMode() !== 'uwu' || !host) {
            if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
            return;
          }
          if (!btn) {
            btn = document.createElement('button');
            btn.id = 'cwb-lu-train-uwu';
            btn.type = 'button';
            btn.textContent = 'Кач ЛУ';
            btn.addEventListener('click', function () {
              ctx.settings.set('blockDangerous', !ctx.settings.get('blockDangerous'));
              paintTrain();
            });
            host.appendChild(btn);
          }
          paintUwuTrain(btn);
        }

        function paintUwuTrain(btn) {
          if (!btn) btn = document.getElementById('cwb-lu-train-uwu');
          if (!btn) return;
          var on = !!ctx.settings.get('blockDangerous');
          btn.classList.toggle('active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          btn.title = on
            ? 'Кач ЛУ включён: клик и клавиатура по опасным клеткам заблокированы'
            : 'Кач ЛУ выключен: обычное передвижение';
        }

        function applyUwuChrome() {
          panel.style.display = syncMode() === 'uwu' ? 'none' : '';
          ensureUwuTrain();
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
          if (markAt(idx(c.x, c.y)) === 'mine') return true;
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
          paintUwuTrain();
        }

        function paintField() {
          paintTrain();
          var tds = ctx.dom.qsa('#cages td.cage');
          var hidden = fieldHidden();
          // UwU при «Переносе» красит #cages из СВОЕЙ карты и только мины/переходы.
          // Нашу карту всё равно выводим — иначе поле остаётся пустым.
          var overlayOn = ctx.settings.get('overlay') && !hidden && syncMode() !== 'uwu';
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
          if (i < 0 || i >= ROWS * COLS) return;
          var next = normalizeMark(value);
          if (syncMode() === 'uwu') {
            if ((shadow[i] || '') === next && markAt(i) === next) return;
            shadow[i] = next;
            pushCellToUwu(i, next);
            paintField();
            return;
          }
          if (i >= currentGrid().length) return;
          currentGrid()[i] = next;
          save();
          paintAll();
          if (syncMode() === 'both') pushCellToUwu(i, next);
        }

        function applyToCell(x, y, value, overwrite) {
          if (x < 1 || x > COLS || y < 1 || y > ROWS) return;
          var i = idx(x, y);
          if (!overwrite && markAt(i)) return;
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
          for (var y = 1; y <= ROWS; y++) {
            for (var x = 1; x <= COLS; x++) {
              var cage = map[y] && map[y][x];
              var mark = cage ? markFromTree(cage.tree) : '';
              if (!mark) continue;
              var i = idx(x, y);
              var cur = markAt(i);
              if (mark === 'mine') {
                if (cur !== 'mine') setMark(i, 'mine');
              } else if (!cur) {
                setMark(i, mark);
              }
            }
          }
        }

        function scanUnsafeDom() {
          if (fieldHidden()) return;
          var map = ctx.vue.get('field.map');
          var tds = ctx.dom.qsa('#cages td.cage');
          tds.forEach(function (td) {
            var c = cellCoords(td);
            if (!c || c.x < 1 || c.x > COLS || c.y < 1 || c.y > ROWS) return;
            var cage = map && map[c.y] && map[c.y][c.x];
            if (!cellLooksUnsafe(td, cage)) return;
            var i = idx(c.x, c.y);
            if (markAt(i) === 'mine') return;
            setMark(i, 'mine');
          });
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
        applyUwuChrome();
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
            pullFromUwu();
            ensureUwuTrain();
          }, 50);

          ctx.addCleanup(function () {
            var btn = document.getElementById('cwb-lu-train-uwu');
            if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
          });

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
  });

  /* ====================================================================== */
  /* src/modules/domain-redirect-reverse.js */
  __def("modules/domain-redirect-reverse", function (require, module, exports) {
    /**
     * Редирект и подмена catwar.su → catwar.net.
     */

    var createRedirectModule;
    try {
      // В бандле имена модулей вида 'modules/<id>'.
      createRedirectModule = require('modules/domain-redirect').createRedirectModule;
    } catch (e) {
      // В чистом Node (юнит-тесты) работает только относительный путь.
      createRedirectModule = require('./domain-redirect').createRedirectModule;
    }

    var mod = createRedirectModule({
      id: 'domain-redirect-reverse',
      title: 'Редирект catwar.su → .net',
      description: 'Кидает с catwar.su на catwar.net и чинит ссылки, картинки и запросы.',
      category: 'misc',
      pages: ['*'],
      early: true,
      enabledByDefault: false,
      order: 6,
      compat: 'new',

      fromPrefixes: ['https://catwar.su', 'http://catwar.su', '//catwar.su'],
      toOrigin: 'https://catwar.net',
      hostRe: /(^|\.)catwar\.su$/i,

      defaults: {
        redirectPage: true,
        rewriteDom: true,
        interceptNetwork: true,
      },

      schema: [],
    });

    var origInit = mod.init;
    mod.init = function (ctx) {
      var registry;
      try { registry = require('core/registry'); } catch (e) {}
      if (registry && typeof registry.isEnabled === 'function' && registry.isEnabled('domain-redirect')) {
        ctx.log.warn('domain-redirect-reverse не применён: domain-redirect уже включён.');
        return;
      }
      origInit(ctx);
    };

    module.exports = mod;
  });

  /* ====================================================================== */
  /* src/modules/domain-redirect.js */
  __def("modules/domain-redirect", function (require, module, exports) {
    /**
     * Редирект и подмена домена.
     *
     * Поведение по мотивам userscript «Перенаправление ссылок CatWar»
     * https://github.com/cat-be/catwar-domain-redirect (автор 1080554, v1.1).
     * Отдельной лицензии в том репозитории нет; копируем идею, не хедер.
     *
     * Ничего не шлёт на сервер само: только подменяет адрес в уже идущих
     * переходах, ссылках и запросах. На живую игру вторую вкладку не открывает.
     */

    function createRedirectModule(opts) {
      var fromPrefixes = opts.fromPrefixes;
      var toOrigin = opts.toOrigin;
      var hostRe = opts.hostRe;

      function replaceDomain(url) {
        if (!url || typeof url !== 'string') return url;
        for (var i = 0; i < fromPrefixes.length; i++) {
          var p = fromPrefixes[i];
          if (url.indexOf(p) === 0) return toOrigin + url.slice(p.length);
        }
        return url;
      }

      function rewriteText(text) {
        if (!text || typeof text !== 'string') return text;
        var result = text;
        for (var i = 0; i < fromPrefixes.length; i++) {
          var p = fromPrefixes[i];
          var repl = (p.slice(0, 2) === '//' && p.indexOf('://') === -1)
            ? '//' + toOrigin.replace(/^https?:\/\//, '')
            : toOrigin;
          result = result.split(p).join(repl);
        }
        return result;
      }

      function rewriteSrcset(value) {
        if (!value || typeof value !== 'string') return value;
        return value.split(',').map(function (part) {
          var trimmed = part.trim();
          var i = trimmed.indexOf(' ');
          if (i === -1) return replaceDomain(trimmed);
          return replaceDomain(trimmed.slice(0, i)) + trimmed.slice(i);
        }).join(', ');
      }

      /** Куда увести открытую страницу. Иначе null. */
      function redirectTarget(href) {
        if (!href || typeof href !== 'string') return null;
        for (var i = 0; i < fromPrefixes.length; i++) {
          var p = fromPrefixes[i];
          if (href.indexOf(p) === 0) return toOrigin + href.slice(p.length);
        }
        try {
          var url = new URL(href);
          if (!hostRe.test(url.hostname)) return null;
          return toOrigin + url.pathname + url.search + url.hash;
        } catch (e) {
          return null;
        }
      }

      function rewriteResource(resource) {
        if (typeof resource === 'string') return replaceDomain(resource);
        if (resource && typeof Request === 'function' && resource instanceof Request) {
          var next = replaceDomain(resource.url);
          if (next === resource.url) return resource;
          try { return new Request(next, resource); } catch (e) { return resource; }
        }
        return resource;
      }

      function processElement(el) {
        if (!el || el.nodeType !== 1 || !el.hasAttribute) return;

        ['href', 'src', 'poster'].forEach(function (attr) {
          if (!el.hasAttribute(attr)) return;
          var oldVal = el.getAttribute(attr);
          var newVal = replaceDomain(oldVal);
          if (newVal !== oldVal) el.setAttribute(attr, newVal);
        });

        if (el.hasAttribute('srcset')) {
          var oldSrcset = el.getAttribute('srcset');
          var newSrcset = rewriteSrcset(oldSrcset);
          if (newSrcset !== oldSrcset) el.setAttribute('srcset', newSrcset);
        }

        if (el.hasAttribute('style')) {
          var oldStyle = el.getAttribute('style');
          var newStyle = rewriteText(oldStyle);
          if (newStyle !== oldStyle) el.setAttribute('style', newStyle);
        }
      }

      function processAll(root) {
        if (!root) root = document;
        if (!root.querySelectorAll) return;
        var nodes = root.querySelectorAll('[href], [src], [poster], [srcset], [style]');
        for (var i = 0; i < nodes.length; i++) processElement(nodes[i]);
      }

      function applySettings(ctx) {
        var target = redirectTarget(location.href);
        if (target && ctx.settings.get('redirectPage')) {
          try { location.replace(target); } catch (e) { ctx.log.warn('не удалось перенаправить', e); }
          return;
        }

        if (ctx.settings.get('rewriteDom')) {
          processAll(document);
          ctx.on(document, 'DOMContentLoaded', function () { processAll(document); });
          ctx.on(document, 'click', function (e) {
            var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!link) return;
            var oldHref = link.getAttribute('href');
            var newHref = replaceDomain(oldHref);
            if (newHref !== oldHref) link.setAttribute('href', newHref);
          }, true);

          var originalOpen = window.open;
          window.open = function (url) {
            var next = replaceDomain(url);
            var args = [next].concat([].slice.call(arguments, 1));
            if (typeof originalOpen === 'function') return originalOpen.apply(this, args);
            return null;
          };
          ctx.addCleanup(function () { window.open = originalOpen; });

          var root = document.documentElement || document;
          ctx.observe(root, function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
              var mutation = mutations[i];
              if (mutation.type === 'attributes') processElement(mutation.target);
              var nodes = mutation.addedNodes;
              for (var j = 0; j < nodes.length; j++) {
                var node = nodes[j];
                if (!node || node.nodeType !== 1) continue;
                processElement(node);
                processAll(node);
              }
            }
          }, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'src', 'poster', 'srcset', 'style'],
          });
        }

        if (ctx.settings.get('interceptNetwork')) {
          if (typeof window.fetch === 'function') {
            var originalFetch = window.fetch;
            window.fetch = function (resource, init) {
              return originalFetch.call(this, rewriteResource(resource), init);
            };
            ctx.addCleanup(function () { window.fetch = originalFetch; });
          }

          if (typeof XMLHttpRequest === 'function' && XMLHttpRequest.prototype) {
            var originalXhrOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
              var args = [method, replaceDomain(url)].concat([].slice.call(arguments, 2));
              return originalXhrOpen.apply(this, args);
            };
            ctx.addCleanup(function () { XMLHttpRequest.prototype.open = originalXhrOpen; });
          }
        }
      }

      var mod = {
        id: opts.id,
        title: opts.title,
        description: opts.description,
        category: opts.category,
        pages: opts.pages,
        early: opts.early,
        enabledByDefault: opts.enabledByDefault,
        order: opts.order,
        compat: opts.compat,

        defaults: opts.defaults,

        schema: opts.schema,

        init: function (ctx) {
          if (opts.init) {
            var result = opts.init(ctx);
            if (result === false) return;
          }
          applySettings(ctx);
        },
      };

      mod.replaceDomain = replaceDomain;
      mod.redirectTarget = redirectTarget;
      mod.rewriteSrcset = rewriteSrcset;
      mod.rewriteText = rewriteText;
      mod.rewriteResource = rewriteResource;
      mod.processElement = processElement;

      return mod;
    }

    var mod = createRedirectModule({
      id: 'domain-redirect',
      title: 'Редирект catwar.net → .su',
      description: 'Кидает с catwar.net на catwar.su и чинит ссылки, картинки и запросы. По умолчанию включён.',
      category: 'misc',
      pages: ['*'],
      early: true,
      enabledByDefault: true,
      order: 5,
      compat: 'new',

      fromPrefixes: ['https://catwar.net', 'http://catwar.net', '//catwar.net'],
      toOrigin: 'https://catwar.su',
      hostRe: /(^|\.)catwar\.net$/i,

      defaults: {
        redirectPage: true,
        rewriteDom: true,
        interceptNetwork: true,
      },

      schema: [],
    });

    /* Если работает обратный редирект (su → .net), а включили нас (net → .su) —
       останавливаем его: работают оба = бесконечный ping-pong редиректов.
       Обратный порядок (включили reverse при работающем нами) закрыт в его init. */
    var origInit = mod.init;
    mod.init = function (ctx) {
      try {
        var registry = require('core/registry');
        if (registry && typeof registry.isRunning === 'function' && registry.isRunning('domain-redirect-reverse')) {
          registry.setEnabled('domain-redirect-reverse', false);
          ctx.log.warn('обратный редирект (su → .net) выключен: работает net → .su');
        }
      } catch (e) { /* реестр недоступен (юнит-тесты в Node) — пропускаем */ }
      origInit(ctx);
    };

    module.exports = mod;
    module.exports.createRedirectModule = createRedirectModule;
  });

  /* ====================================================================== */
  /* src/modules/hide-weather.js */
  __def("modules/hide-weather", function (require, module, exports) {
    /**
     * Скрыть погоду.
     *
     * Разные узлы отвечают за разное, поэтому опции раздельные:
     *   #tr_sky  — строка таблицы с картинкой неба (внутри #sky, 150px высотой);
     *   #tos     — градиентная полоска температуры (инлайновый linear-gradient);
     *   #hour    — <a id="hour"> со ссылкой на /time и картинкой symbole/hours/N.png;
     *   сезон    — ещё одна <a href=".../time"> с картинкой symbole/seasonN.png,
     *              своего id у неё нет — цепляемся за путь к картинке;
     *   #tr_tos  — вся строка целиком. Внутри неё лежит .game-location
     *              («Моё местонахождение»), поэтому «скрыть всю строку» вынесено
     *              отдельно и с предупреждением.
     *
     * Разметка сверена с сохранённым HTML игровой страницы.
     */

    module.exports = {
      id: 'hide-weather',
      title: 'Убрать погоду',
      description: 'Прячет небо, температуру, час и сезон над полем.',
      category: 'field',
      pages: ['game'],
      enabledByDefault: false,
      order: 40,
      warning: null,

      defaults: {
        sky: true,
        tos: true,
        hour: false,
        season: false,
        wholeRow: false,
      },

      schema: [
        { key: 'tos', type: 'boolean', label: 'Полоска температуры' },
        { key: 'hour', type: 'boolean', label: 'Иконка игрового часа' },
        { key: 'season', type: 'boolean', label: 'Иконка сезона' },
      ],

      styles: function (s) {
        var css = [];
        if (s.wholeRow) {
          css.push('#tr_tos { display: none !important; }');
        } else {
          if (s.tos) css.push('#tos { display: none !important; }');
          if (s.hour) css.push('#hour { display: none !important; }');
          // У иконки сезона нет своего id — цепляемся за имя файла symbole/seasonN.png.
          if (s.season) css.push('#tr_tos img[src*="season"] { display: none !important; }');
        }
        if (s.sky && !require('core/uwu').hidingSky()) {
          css.push('#tr_sky { display: none !important; }');
          // На случай, если compact уже вынес #sky из таблицы.
          css.push('#sky { display: none !important; }');
        }
        return css.join('\n');
      },
    };
  });

  /* ====================================================================== */
  /* src/modules/history-autoscroll.js */
  __def("modules/history-autoscroll", function (require, module, exports) {
    /**
     * Автопрокрутка истории.
     *
     * История — #ist внутри #history_block. В обычном режиме прокручивается сама
     * страница, в compact — #history_block (у него overflow-y:auto). Поэтому цель
     * прокрутки ищем динамически: ближайший прокручиваемый предок #ist.
     *
     * Текст истории дописывается строкой в cat.history, Vue перерисовывает #ist —
     * ловим это MutationObserver-ом на контейнере (childList + characterData),
     * дублируя более надёжным $watch по стейту, если Vue доступен.
     */

    var dom = require('core/dom');

    module.exports = {
      id: 'history-autoscroll',
      title: 'Автопрокрутка истории',
      description: 'Держит историю прокрученной к последней записи.',
      category: 'info',
      pages: ['game'],
      enabledByDefault: false,
      order: 10,

      defaults: {
        respectUserScroll: true,
        threshold: 60,
        smooth: false,
      },

      schema: [],

      init: function (ctx) {
        var target = null;   // прокручиваемый контейнер
        var ist = null;
        var stick = true;    // пользователь «прилип» к низу
        var offScroll = null;
        var offObserve = null;

        function atBottom(el) {
          var gap = el.scrollHeight - el.scrollTop - el.clientHeight;
          return gap <= Math.max(0, Number(ctx.settings.get('threshold')) || 0);
        }

        function scrollToBottom() {
          if (!target) return;
          if (ctx.settings.get('respectUserScroll') && !stick) return;
          var top = target.scrollHeight;
          if (ctx.settings.get('smooth') && typeof target.scrollTo === 'function') {
            target.scrollTo({ top: top, behavior: 'smooth' });
          } else {
            target.scrollTop = top;
          }
        }

        function bindScrollTarget() {
          if (offScroll) { offScroll(); offScroll = null; }
          target = dom.scrollParent(ist);
          // scrollParent может вернуть documentElement — слушать надо тогда window.
          var listenOn = (target === document.documentElement || target === document.body ||
            target === document.scrollingElement) ? window : target;
          stick = true;
          offScroll = ctx.addCleanup(dom.on(listenOn, 'scroll', function () {
            if (!target) return;
            stick = atBottom(target === document.scrollingElement ? document.scrollingElement : target);
          }, { passive: true }));
        }

        function attach(node) {
          ist = node;
          bindScrollTarget();
          if (offObserve) offObserve();
          offObserve = ctx.observe(ist, function () {
            // Если Vue пересоздал #ist, перецепляемся.
            if (!document.contains(ist)) { rediscover(); return; }
            scrollToBottom();
          }, { childList: true, subtree: true, characterData: true });
          scrollToBottom();
          ctx.log.debug('история найдена, цель прокрутки:', target && target.id);
        }

        function rediscover() {
          if (ctx.isDisposed()) return;
          dom.waitForElement('#ist', { timeout: 20000 }).then(function (node) {
            if (!node || ctx.isDisposed()) return;
            attach(node);
          });
        }

        rediscover();

        // Дублирующий сигнал из стейта: история в игре — одна растущая строка.
        ctx.watch('cat.history', function () {
          // Ждём, пока Vue домалюет DOM.
          requestAnimationFrame(scrollToBottom);
        });
      },
    };
  });

  /* ====================================================================== */
  /* src/modules/layout-swap.js */
  __def("modules/layout-swap", function (require, module, exports) {
    /**
     * Поменять местами выбор кота (#mit) и иконки действий (#akten).
     *
     * Основной сценарий — компактный режим (3 колонки): #block_deys — flex-колонка
     * с #deys и #deys_mit. Перестановка через CSS order + data-атрибут, без
     * переноса узлов. Если структура иная — модуль молча не применяется.
     *
     * Эталоны разметки:
     *   компакт — «Игровая _ CatWar компактный режим 3 колонки.html»;
     *   обычный — «Игровая _ CatWar обычный режим не компактный.html».
     */

    var BLOCK = '#block_deys';
    var MARKER = 'cwb-layout-swap';

    module.exports = {
      id: 'layout-swap',
      title: 'Поменять кот ↔ действия',
      description: 'Сначала выбор соседнего кота, потом иконки действий.',
      category: 'interface',
      pages: ['game'],
      enabledByDefault: false,
      order: 15,

      styles: function () {
        var sel = BLOCK + '[data-' + MARKER + ']';
        return [
          /* Компакт: колонка, mit сверху */
          '#app.compact ' + sel + ' { display: flex; flex-direction: column; }',
          '#app.compact ' + sel + ' #deys_mit { order: 1; margin-top: 0; }',
          '#app.compact ' + sel + ' #deys { order: 2; margin-top: 8px; }',
          /* Обычный / широкий: строка, mit слева */
          '#app:not(.compact) ' + sel + ':not(.mobile) { display: flex; flex-direction: row; }',
          '#app:not(.compact) ' + sel + ':not(.mobile) #deys_mit { order: 1; margin-left: 0; margin-right: 5px; }',
          '#app:not(.compact) ' + sel + ':not(.mobile) #deys { order: 2; }',
          /* Мобильная колонка игры */
          sel + '.mobile #deys_mit { order: 1; }',
          sel + '.mobile #deys { order: 2; }',
        ].join('\n');
      },

      init: function (ctx) {
        return ctx.dom.waitForElement(BLOCK).then(function (block) {
          if (!block || ctx.isDisposed()) return;
          var deys = block.querySelector('#deys');
          var mitWrap = block.querySelector('#deys_mit');
          var mit = block.querySelector('#mit');
          var akten = block.querySelector('#akten');
          // Без обоих блоков или ключевых узлов — не ломаем вёрстку.
          if (!deys || !mitWrap || !mit || !akten) {
            ctx.log.debug('layout-swap: структура не узнана, пропуск');
            return;
          }
          block.setAttribute('data-' + MARKER, '1');
          ctx.addCleanup(function () { block.removeAttribute('data-' + MARKER); });
        });
      },
    };
  });

  /* ====================================================================== */
  /* src/modules/notifications.js */
  __def("modules/notifications", function (require, module, exports) {
    /**
     * Уведомления о новом ЛС и упоминании в чате.
     *
     * Browser Notification (разрешение — по кнопке в настройках), опционально звук
     * и мигание заголовка вкладки. Чат-DOM не трогаем — читаем Vue.
     * См. RUNTIME.md §8.12.
     */

    var audio = require('core/audio');
    var dom = require('core/dom');

    var PERM_BTN = 'cwb-notify-perm';

    module.exports = {
      id: 'notifications',
      title: 'Уведомления',
      description: 'Уведомления браузера про новое ЛС и упоминание в чате.',
      category: 'chat',
      pages: ['game', 'chat'],
      enabledByDefault: false,
      order: 10,

      defaults: {
        onPm: true,
        onMention: true,
        sound: true,
        blinkTitle: true,
        volume: 0.4,
      },

      schema: [
        { key: 'onPm', type: 'boolean', label: 'Новое личное сообщение' },
        { key: 'onMention', type: 'boolean', label: 'Упоминание в чате' },
        { key: 'volume', type: 'range', label: 'Громкость звука', min: 0, max: 1, step: 0.05 },
        {
          key: '_testSound',
          type: 'custom',
          label: 'Проверить звук',
          render: function () {
            return dom.el('button', {
              type: 'button',
              class: 'cwb-btn',
              text: 'Проверить звук',
              onclick: function () {
                var registry = require('core/registry');
                audio.play('pm', registry.settingsOf('notifications').volume);
              },
            });
          },
        },
        {
          key: '_perm',
          type: 'custom',
          label: 'Запросить разрешение',
          render: function () {
            return dom.el('button', {
              type: 'button',
              class: 'cwb-btn',
              text: 'Запросить разрешение',
              onclick: function () {
                if (typeof Notification !== 'undefined') {
                  Notification.requestPermission();
                }
              },
            });
          },
        },
      ],

      init: function (ctx) {
        function notify(title, body, kind) {
          audio.play(kind === 'pm' ? 'pm' : 'mention', ctx.settings.get('volume'));
          if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
          try {
            var n = new Notification(title, { body: body, tag: 'cwb-' + kind });
            n.onclick = function () { window.focus(); n.close(); };
          } catch (e) { ctx.log.warn('Notification API', e); }
        }

        return ctx.whenVueReady().then(function (vm) {
          if (!vm || ctx.isDisposed()) return;
          origTitle = document.title;

          if (ctx.settings.get('onPm')) {
            ctx.watch('game.notReadMess', function (now, was) {
              if (typeof now === 'number' && typeof was === 'number' && now > was) {
                notify('Новое личное сообщение', 'Непрочитанных: ' + now, 'pm');
              }
            });
          }

          if (ctx.settings.get('onMention')) {
            ctx.vue.onChatMessage(function (fresh) {
              var myId = ctx.vue.get('cat.id');
              fresh.forEach(function (msg) {
                if (!msg || msg.cat === myId) return;
                if (/class=["']myname["']/.test(String(msg.text || ''))) {
                  var plain = String(msg.text || '').replace(/<[^>]+>/g, '');
                  notify((msg.login || 'Чат') + ' упомянул(а) тебя', plain, 'mention');
                }
              });
            });
          }
        });
      },

      destroy: function () {
      },

      onSettings: function (ctx, key) {
        var registry = require('core/registry');
        registry.stopModule('notifications');
        registry.startModule('notifications');
      },
    };
  });

  /* ====================================================================== */
  /* src/modules/old-icons.js */
  __def("modules/old-icons", function (require, module, exports) {
    /**
     * Старые иконки действий.
     *
     * КАРКАС: логика подмены готова и работает, но встроенный словарь неполный и
     * ссылается на сторонний хостинг (см. комментарий в src/data/old-icons.js и
     * раздел «Открытые вопросы» в SPEC.md). Поэтому модуль выключен по умолчанию.
     *
     * Разметка действий: #deys > #akten > a.dey[data-id="{id}"] > img[src="actions/{id}.png"].
     * Подменяем через `content: url(...)` на <img> — так делал CW Shed; размер
     * иконки сохраняется, DOM не трогаем.
     *
     * Три режима источника картинок:
     *   builtin — словарь из src/data/old-icons.js;
     *   base    — свой базовый URL: {base}/{id}.png для всех известных id;
     *   custom  — свой JSON {"1": "https://…", "exchange": "https://…"}.
     */

    var data = require('data/old-icons');
    var dom = require('core/dom');

    function parseCustom(raw, log) {
      if (!String(raw || '').trim()) return {};
      try {
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (e) {
        if (log) log.warn('свой словарь иконок — не JSON', e);
        return {};
      }
    }

    function buildMap(s, log) {
      if (s.source === 'custom') return parseCustom(s.customMap, log);

      if (s.source === 'base') {
        var base = String(s.baseUrl || '').trim().replace(/\/+$/, '');
        if (!base) return {};
        var out = {};
        Object.keys(data.ACTIONS).forEach(function (id) { out[id] = base + '/' + id + '.png'; });
        return out;
      }

      return Object.assign({}, data.ACTIONS);
    }

    module.exports = {
      id: 'old-icons',
      title: 'Старые иконки действий',
      description: 'Ставит старые картинки на кнопки действий.',
      category: 'interface',
      pages: ['game'],
      enabledByDefault: false,
      order: 20,
      warning: 'Иконки грузятся со стороннего хоста d.zaix.ru.',

      defaults: {
        source: 'builtin',     // builtin | base | custom
        baseUrl: '',
        customMap: '',
        includeExtra: true,
      },

      schema: [],

      styles: function (s) {
        var map = buildMap(s);
        var css = [];

        Object.keys(map).forEach(function (id) {
          var url = map[id];
          if (!url) return;
          // Экранируем id: он идёт в строковый литерал атрибута.
          var safeId = String(id).replace(/['\\]/g, '\\$&');
          css.push("#deys [data-id='" + safeId + "'] > img { content: " + dom.cssUrl(url) + '; }');
        });

        if (s.includeExtra && s.source === 'builtin') {
          Object.keys(data.EXTRA).forEach(function (selector) {
            css.push(selector + ' { content: ' + dom.cssUrl(data.EXTRA[selector]) + '; }');
          });
        }

        return css.join('\n');
      },

      init: function (ctx) {
        var s = ctx.settings.all();
        var map = buildMap(s, ctx.log);
        if (!Object.keys(map).length) {
          ctx.log.warn('словарь иконок пуст — подменять нечего');
        }
      },

      onSettings: function (ctx) {
        // styles() уже пересобран реестром; своей логики на изменении нет.
      },
    };
  });

  /* ====================================================================== */
  /* src/modules/pm-ids.js */
  __def("modules/pm-ids", function (require, module, exports) {
    /**
     * ID собеседников на странице личных сообщений (/ls).
     *
     * ls.js рисует <a href="cat<ID>"> — ID уже в href, дописываем рядом.
     * Список перерисовывается AJAX'ом → MutationObserver на #main.
     * См. RUNTIME.md §8.6 и research/runtime/ls_page.html.
     */

    var SEL_MAIN = '#main';
    var SEL_PROFILE = '#main a[href^="cat"]:not([data-cwb-pm-id])';
    var SEL_MSG_LOGIN = '#msg_login';

    module.exports = {
      id: 'pm-ids',
      title: 'ID в личных сообщениях',
      description: 'Числовой ID рядом с ником в списке и в открытом письме.',
      category: 'info',
      pages: ['pm'],
      enabledByDefault: false,
      order: 42,

      init: function (ctx) {
        function stampLinks() {
          ctx.dom.qsa(SEL_PROFILE).forEach(function (a) {
            var href = a.getAttribute('href') || '';
            var id = href.replace(/^cat/, '');
            if (!/^\d+$/.test(id)) return;
            a.dataset.cwbPmId = id;
            var tag = ctx.dom.el('small', {
              class: 'cwb-pm-id',
              text: '[' + id + ']',
              style: { opacity: '0.65', marginLeft: '4px', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' },
            });
            a.insertAdjacentElement('afterend', tag);
            ctx.addCleanup(function () { if (tag.parentNode) tag.parentNode.removeChild(tag); });
          });

          var msgLogin = ctx.dom.qs(SEL_MSG_LOGIN);
          if (msgLogin && !msgLogin.dataset.cwbPmId) {
            var mid = (msgLogin.getAttribute('href') || '').replace(/^cat/, '');
            if (/^\d+$/.test(mid)) {
              msgLogin.dataset.cwbPmId = mid;
              var mtag = ctx.dom.el('small', {
                class: 'cwb-pm-id',
                text: ' [' + mid + ']',
                style: { opacity: '0.65', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' },
              });
              msgLogin.insertAdjacentElement('afterend', mtag);
              ctx.addCleanup(function () { if (mtag.parentNode) mtag.parentNode.removeChild(mtag); });
            }
          }
        }

        return ctx.dom.waitForElement(SEL_MAIN).then(function (main) {
          if (!main || ctx.isDisposed()) return;
          stampLinks();
          ctx.observe(main, stampLinks, { childList: true, subtree: true });
        });
      },
    };
  });

  /* ====================================================================== */
  /* src/modules/static-background.js */
  __def("modules/static-background", function (require, module, exports) {
    /**
     * Статичный фон.
     *
     * Два независимых слоя:
     *  - фон игрового поля: #cages_div, куда игра инлайном ставит spacoj/{bg}.jpg;
     *  - фон страницы: сезонный скин сайта /design/YYYY/season/…/style.css +
     *    background.png на body.
     *
     * CSS-ом сезонный <link> не выключить, поэтому для страницы есть отдельная
     * опция: помечаем такие stylesheet-ы disabled и возвращаем обратно в destroy.
     */

    var dom = require('core/dom');

    function backgroundValue(s) {
      if (s.mode === 'image' && String(s.imageUrl || '').trim()) {
        return dom.cssUrl(String(s.imageUrl).trim()) + ' center / cover no-repeat';
      }
      return s.color || '#000000';
    }

    module.exports = {
      id: 'static-background',
      title: 'Статичный фон',
      description: 'Один и тот же фон вместо сезонного оформления и картинки локации.',
      category: 'field',
      pages: ['game'],
      enabledByDefault: false,
      order: 30,

      defaults: {
        target: 'field',          // field | page | both
        mode: 'color',            // color | image
        color: '#1d2a1b',
        imageUrl: '',
        disableSeasonalCss: false,
      },

      schema: [
        {
          key: 'mode',
          type: 'select',
          label: 'Чем заменить',
          options: [
            { value: 'color', label: 'Сплошной цвет' },
            { value: 'image', label: 'Картинка по ссылке' },
          ],
        },
        { key: 'color', type: 'color', label: 'Цвет' },
        { key: 'imageUrl', type: 'text', label: 'Ссылка на картинку', placeholder: 'https://…/bg.png' },
      ],

      styles: function (s) {
        var bg = backgroundValue(s);
        var css = [];
        if (!require('core/uwu').hasFieldBackground()) {
          // background целиком, чтобы убить и инлайновый background-image локации.
          css.push('#cages_div { background: ' + bg + ' !important; }');
        }
        return css.join('\n');
      },

      init: function (ctx) {
        if (!ctx.settings.get('disableSeasonalCss')) return;

        var touched = [];
        dom.qsa('link[rel~="stylesheet"]').forEach(function (link) {
          var href = link.getAttribute('href') || '';
          if (href.indexOf('/design/') < 0) return;
          if (link.disabled) return;
          link.disabled = true;
          touched.push(link);
        });
        ctx.log.debug('отключено сезонных стилей:', touched.length);

        ctx.addCleanup(function () {
          touched.forEach(function (link) { link.disabled = false; });
        });
      },
    };
  });

  try {
    require("core/bootstrap").start();
  } catch (err) {
    console.error("[CWB] не удалось запустить скрипт:", err);
  }
})();
