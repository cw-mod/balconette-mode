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
