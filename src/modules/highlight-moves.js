/**
 * Подсветка переходов между локациями.
 *
 * Переход на поле — `.move_parent` (внутри img.move_img + .move_name,
 * классы .owned / .not_owned). Работаем только фильтром на ховере,
 * DOM не трогаем: клик по переходу должен остаться родным (игра шлёт
 * dynamicToken, подменять или эмулировать этот клик нельзя).
 */

var dom = require('core/dom');

module.exports = {
  id: 'highlight-moves',
  title: 'Подсветка переходов',
  description: 'Свечение вокруг перехода при наведении курсора.',
  category: 'field',
  pages: ['game'],
  enabledByDefault: false,
  order: 50,

  defaults: {
    color: '#ffffff',
    opacity: 0.8,
    blur: 6,
    always: false,
  },

  schema: [
    { key: 'color', type: 'color', label: 'Цвет свечения' },
    { key: 'opacity', type: 'range', label: 'Непрозрачность', min: 0.1, max: 1, step: 0.05 },
    { key: 'blur', type: 'number', label: 'Размытие, px', min: 1, max: 24, step: 1 },
    { key: 'always', type: 'boolean', label: 'Подсвечивать постоянно, а не по наведению' },
  ],

  styles: function (s) {
    var color = dom.hexToRgba(s.color, s.opacity);
    var blur = Math.max(1, Math.min(24, Number(s.blur) || 6));
    var glow = 'drop-shadow(0 0 ' + blur + 'px ' + color + ')';
    var css = ['.move_parent { transition: filter .25s ease; }'];
    css.push(s.always
      ? '.move_parent { filter: ' + glow + '; }'
      : '.move_parent:hover { filter: ' + glow + '; }');
    return css.join('\n');
  },
};
