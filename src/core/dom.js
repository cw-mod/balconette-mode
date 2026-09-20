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
