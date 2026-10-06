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
