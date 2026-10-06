/**
 * Статичный фон.
 *
 * Два независимых слоя:
 *  - фон игрового поля: #cages_div, куда игра инлайном ставит spacoj/{bg}.jpg;
 *  - фон страницы: сезонный скин сайта /design/YYYY/season/…/style.css +
 *    background.png на body.
 *
 * CSS-ом сезонный <link> не выключить, поэтому для страницы есть отдельная
 * опция: помечаем такие stylesheet-ы disabled и возвращаем обратно в destroy.
 */

var IS_LU = false;
try { IS_LU = require('cwb:meta').variant === 'lu'; } catch (e) {}

var dom = require('core/dom');

function backgroundValue(s) {
  if (s.mode === 'image' && String(s.imageUrl || '').trim()) {
    return dom.cssUrl(String(s.imageUrl).trim()) + ' center / cover no-repeat';
  }
  return s.color || '#000000';
}

module.exports = {
  id: 'static-background',
  title: 'Статичный фон',
  description: 'Один и тот же фон вместо сезонного оформления и картинки локации.',
  category: 'field',
  pages: ['game'],
  enabledByDefault: false,
  order: 30,

  defaults: {
    target: 'field',          // field | page | both
    mode: 'color',            // color | image
    color: '#1d2a1b',
    imageUrl: '',
    disableSeasonalCss: false,
  },

  schema: IS_LU ? [
    {
      key: 'mode',
      type: 'select',
      label: 'Чем заменить',
      options: [
        { value: 'color', label: 'Сплошной цвет' },
        { value: 'image', label: 'Картинка по ссылке' },
      ],
    },
    { key: 'color', type: 'color', label: 'Цвет' },
    { key: 'imageUrl', type: 'text', label: 'Ссылка на картинку', placeholder: 'https://…/bg.png' },
  ] : [
    {
      key: 'target',
      type: 'select',
      label: 'Что менять',
      options: [
        { value: 'field', label: 'Только фон локации' },
        { value: 'page', label: 'Только фон страницы' },
        { value: 'both', label: 'И то, и другое' },
      ],
    },
    {
      key: 'mode',
      type: 'select',
      label: 'Чем заменить',
      options: [
        { value: 'color', label: 'Сплошной цвет' },
        { value: 'image', label: 'Картинка по ссылке' },
      ],
    },
    { key: 'color', type: 'color', label: 'Цвет' },
    { key: 'imageUrl', type: 'text', label: 'Ссылка на картинку', placeholder: 'https://…/bg.png' },
    {
      key: 'disableSeasonalCss',
      type: 'boolean',
      label: 'Отключить сезонный скин сайта',
      hint: 'Убирает сезонные стили: шапку, боковины и фон оформления.',
    },
  ],

  styles: function (s) {
    var bg = backgroundValue(s);
    var css = [];
    if ((s.target === 'field' || s.target === 'both') && !require('core/uwu').hasFieldBackground()) {
      // background целиком, чтобы убить и инлайновый background-image локации.
      css.push('#cages_div { background: ' + bg + ' !important; }');
    }
    if (s.target === 'page' || s.target === 'both') {
      css.push('html, body { background: ' + bg + ' !important; }');
    }
    return css.join('\n');
  },

  init: function (ctx) {
    if (!ctx.settings.get('disableSeasonalCss')) return;

    var touched = [];
    dom.qsa('link[rel~="stylesheet"]').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (href.indexOf('/design/') < 0) return;
      if (link.disabled) return;
      link.disabled = true;
      touched.push(link);
    });
    ctx.log.debug('отключено сезонных стилей:', touched.length);

    ctx.addCleanup(function () {
      touched.forEach(function (link) { link.disabled = false; });
    });
  },
};
