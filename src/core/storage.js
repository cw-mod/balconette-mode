/**
 * Хранилище настроек.
 *
 * Бэкенд: GM_getValue/GM_setValue, если Tampermonkey их выдал, иначе localStorage.
 * Все ключи живут в неймспейсе `cwb:` и хранятся как JSON-строки — так экспорт
 * и импорт одинаковы для обоих бэкендов.
 *
 * Схема ключей (см. SPEC.md, раздел «Соглашения»):
 *   cwb:core          — настройки ядра  { logLevel, gearCorner, socketHook, ... }
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
