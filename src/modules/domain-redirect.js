/**
 * Редирект и подмена catwar.net → catwar.su.
 *
 * Поведение по мотивам userscript «Перенаправление ссылок CatWar»
 * https://github.com/cat-be/catwar-domain-redirect (автор 1080554, v1.1).
 * Отдельной лицензии в том репозитории нет; копируем идею, не хедер.
 *
 * Ничего не шлёт на сервер само: только подменяет адрес в уже идущих
 * переходах, ссылках и запросах. На живую игру вторую вкладку не открывает.
 */

var FROM_HTTPS = 'https://catwar.net';
var FROM_HTTP = 'http://catwar.net';
var FROM_PROTOREL = '//catwar.net';
var TO = 'https://catwar.su';
var HOST_RE = /(^|\.)catwar\.net$/i;

function replaceDomain(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.indexOf(FROM_HTTPS) === 0) return TO + url.slice(FROM_HTTPS.length);
  if (url.indexOf(FROM_HTTP) === 0) return TO + url.slice(FROM_HTTP.length);
  if (url.indexOf(FROM_PROTOREL) === 0) return TO + url.slice(FROM_PROTOREL.length);
  return url;
}

function rewriteText(text) {
  if (!text || typeof text !== 'string') return text;
  return text.split(FROM_HTTPS).join(TO).split(FROM_HTTP).join(TO).split(FROM_PROTOREL).join('//catwar.su');
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

/** Куда увести открытую страницу catwar.net. Иначе null. */
function redirectTarget(href) {
  if (!href || typeof href !== 'string') return null;
  if (href.indexOf(FROM_HTTPS) === 0) return TO + href.slice(FROM_HTTPS.length);
  if (href.indexOf(FROM_HTTP) === 0) return TO + href.slice(FROM_HTTP.length);
  try {
    var url = new URL(href);
    if (!HOST_RE.test(url.hostname)) return null;
    return TO + url.pathname + url.search + url.hash;
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
  id: 'domain-redirect',
  title: 'Редирект catwar.net → .su',
  description: 'Кидает с catwar.net на catwar.su и чинит ссылки, картинки и запросы. По умолчанию включён.',
  category: 'misc',
  pages: ['*'],
  early: true,
  enabledByDefault: true,
  order: 5,
  compat: 'new',

  defaults: {
    redirectPage: true,
    rewriteDom: true,
    interceptNetwork: true,
  },

  schema: [
    {
      key: 'redirectPage',
      type: 'boolean',
      label: 'Перенаправлять открытие catwar.net',
      hint: 'Если вкладка открылась на catwar.net — кинет на тот же путь на .su.',
    },
    {
      key: 'rewriteDom',
      type: 'boolean',
      label: 'Подменять .net в ссылках и картинках',
      hint: 'Ссылки, картинки, клики и window.open.',
    },
    {
      key: 'interceptNetwork',
      type: 'boolean',
      label: 'Подменять .net в fetch и XHR',
      hint: 'Свои запросы не шлёт, только правит адрес у тех, что уже идут.',
    },
  ],

  init: function (ctx) {
    applySettings(ctx);
  },
};

mod.replaceDomain = replaceDomain;
mod.redirectTarget = redirectTarget;
mod.rewriteSrcset = rewriteSrcset;
mod.rewriteText = rewriteText;
mod.rewriteResource = rewriteResource;
mod.processElement = processElement;

module.exports = mod;
