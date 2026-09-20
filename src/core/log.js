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
