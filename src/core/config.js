/**
 * Настройки самого ядра (не модулей). Лежат в одном ключе `cwb:core`.
 */

var storage = require('core/storage');

var KEY = 'core';

var DEFAULTS = {
  logLevel: 'silent',       // silent | error | warn | info | debug
  gearCorner: 'bottom-right', // положение кнопки-шестерёнки
  gearHidden: false,        // спрятать шестерёнку (панель тогда только по хоткею)
  hotkey: true,             // Ctrl+Alt+B открывает панель
  socketHook: false,        // ранний хук WebSocket — опциональный механизм «на будущее»
};

var SCHEMA = [
  {
    key: 'gearCorner',
    type: 'select',
    label: 'Положение кнопки настроек',
    options: [
      { value: 'bottom-right', label: 'Внизу справа' },
      { value: 'bottom-left', label: 'Внизу слева' },
      { value: 'top-right', label: 'Вверху справа' },
      { value: 'top-left', label: 'Вверху слева' },
    ],
  },
  { key: 'gearHidden', type: 'boolean', label: 'Спрятать кнопку-шестерёнку', hint: 'Панель всё равно откроется по Ctrl+Alt+B' },
  { key: 'hotkey', type: 'boolean', label: 'Открывать панель по Ctrl+Alt+B' },
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
  {
    key: 'socketHook',
    type: 'boolean',
    label: 'Хук игрового сокета (экспериментально)',
    hint: 'Пока никому не нужен. После включения перезагрузи страницу. На сервер ничего не шлёт.',
  },
];

function all() {
  var stored = storage.get(KEY, null);
  return Object.assign({}, DEFAULTS, stored && typeof stored === 'object' ? stored : {});
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
