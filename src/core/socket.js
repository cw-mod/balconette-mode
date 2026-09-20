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
