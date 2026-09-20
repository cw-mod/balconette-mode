/**
 * Точка входа.
 *
 * Порядок:
 *   1. document-start: определяем страницу, при желании ставим хук сокета;
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

  // Хук сокета имеет смысл ставить только до загрузки бандла игры.
  if (cfg.socketHook && page === 'game') {
    try { require('core/socket').install(); } catch (e) { log.root.warn('хук сокета не встал', e); }
  }

  function mountUi() {
    if (!document.body) {
      setTimeout(mountUi, 80);
      return;
    }
    try { ui.mount(); } catch (e) { log.root.error('панель настроек не поднялась', e); }
  }

  dom.ready().then(function () {
    registerModules();

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
