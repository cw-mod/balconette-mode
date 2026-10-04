/**
 * Сетка на игровом поле.
 *
 * Поле — таблица #cages 10×6, клетка — td.cage (класс жив, в бандле есть
 * правило `.cage{padding-bottom:16px}`). Рисуем внутреннюю рамку через
 * box-shadow inset: он не меняет размеры клетки и не ломает раскладку,
 * в отличие от border.
 */

var dom = require('core/dom');

module.exports = {
  id: 'grid',
  title: 'Сетка на поле',
  description: 'Обозначает границы клеток игрового поля.',
  category: 'field',
  pages: ['game', 'hunt'],
  enabledByDefault: false,
  order: 20,

  defaults: {
    color: '#ffffff',
    opacity: 0.35,
    width: 1,
    skipSmell: true,
  },

  schema: [
    { key: 'color', type: 'color', label: 'Цвет линий' },
    { key: 'opacity', type: 'range', label: 'Непрозрачность', min: 0.05, max: 1, step: 0.05 },
    { key: 'width', type: 'number', label: 'Толщина, px', min: 1, max: 6, step: 1 },
    {
      key: 'skipSmell',
      type: 'boolean',
      label: 'Не рисовать в режиме нюха',
      hint: 'В режиме нюха у поля своя разметка, сетка поверх неё мешает.',
    },
  ],

  styles: function (s) {
    var uwu = require('core/uwu');
    if (uwu.hasCellBorders()) return '';
    var color = dom.hexToRgba(s.color, s.opacity);
    var w = Math.max(1, Math.min(6, Number(s.width) || 1));
    return '#cages td.cage { box-shadow: inset 0 0 0 ' + w + 'px ' + color + '; }';
  },

  init: function (ctx) {
    if (!ctx.settings.get('skipSmell')) return;

    // В режиме нюха таблица та же (#cages, td.cage), отличительного класса на
    // ней НЕТ — проверено по сохранённому HTML. Единственный надёжный признак —
    // field.smellMap в стейте, поэтому гасим сетку из JS, а не селектором.
    function sync() {
      var smell = ctx.vue.get('field.smellMap');
      var active = !!smell && (!Array.isArray(smell) || smell.length > 0);
      if (active) ctx.removeStyle();
      else ctx.refreshStyles();
    }

    return ctx.whenVueReady().then(function (vm) {
      if (!vm || ctx.isDisposed()) return;
      sync();
      ctx.watch('field.smellMap', sync);
    });
  },

  // Меняем настройки без перезапуска: styles() реестр уже пересобрал.
  onSettings: function (ctx, key) {
    if (key === 'skipSmell') {
      // Смена этой опции меняет набор подписок — нужен честный перезапуск.
      var registry = require('core/registry');
      registry.stopModule('grid');
      registry.startModule('grid');
    }
  },
};
