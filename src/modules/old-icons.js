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
  warning: 'Встроенный список неполный (' + data.count + ' иконок) и тянет картинки с d.zaix.ru. Лучше свой URL или свой словарь.',

  defaults: {
    source: 'builtin',     // builtin | base | custom
    baseUrl: '',
    customMap: '',
    includeExtra: true,
  },

  schema: [
    {
      key: 'source',
      type: 'select',
      label: 'Откуда брать картинки',
      options: [
        { value: 'builtin', label: 'Встроенный словарь (из CW Shed)' },
        { value: 'base', label: 'Свой базовый URL: {base}/{id}.png' },
        { value: 'custom', label: 'Свой словарь JSON' },
      ],
    },
    { key: 'baseUrl', type: 'text', label: 'Базовый URL', placeholder: 'https://example.com/cw-old-icons' },
    {
      key: 'customMap',
      type: 'textarea',
      label: 'Свой словарь',
      placeholder: '{\n  "1": "https://…/1.png",\n  "exchange": "https://…/exchange.png"\n}',
    },
    { key: 'includeExtra', type: 'boolean', label: 'Менять ещё и иконку диалога' },
  ],

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
