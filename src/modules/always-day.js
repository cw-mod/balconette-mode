/**
 * «Всегда день».
 *
 * Как игра рисует ночь (по разбору бандла, research/NEW_SITE.md §4):
 *  1. `weather.light` = 0.6…1 в зависимости от часа, и это значение уходит
 *     инлайновым стилем в `#cages_div { opacity: … }`. Никакого класса `night`
 *     и никакого filter нет. Значит перебиваем стилем с !important —
 *     инлайн-стиль проигрывает `!important` из таблицы стилей.
 *  2. `#sky` получает картинку /cw3/sky/N.png, где N зависит от связки
 *     зима/ночь/дождь. Ночные индексы 3,4,6,8 — дневные пары к ним 1,2,5,7.
 *
 * Пункт 1 — чистый CSS, включён всегда. Пункт 2 нельзя выразить CSS-ом,
 * не зная погоды, поэтому он опционален и делается точечной правкой
 * отображаемого поля `weather.sky` (это поле только про картинку, на игру
 * оно не влияет и на сервер ничего не уходит).
 */

// ночной индекс неба -> дневной аналог
var NIGHT_TO_DAY = { 3: 1, 4: 2, 6: 5, 8: 7, 18: 17 };

module.exports = {
  id: 'always-day',
  title: 'Всегда день',
  description: 'Убирает ночное затемнение игрового поля.',
  category: 'field',
  pages: ['game'],
  enabledByDefault: false,
  order: 10,

  defaults: {
    daySky: false,
  },

  schema: [
    {
      key: 'daySky',
      type: 'boolean',
      label: 'Дневное небо над полем',
      hint: 'Подменяет ночную картинку #sky на дневную того же сезона и погоды.',
    },
  ],

  styles: function () {
    var uwu = require('core/uwu');
    // Тот же CSS, что updateAlwaysDayStyle в UwU — не дублируем.
    if (uwu.hasAlwaysDay()) return '';
    return '#cages_div { opacity: 1 !important; }';
  },

  init: function (ctx) {
    if (!ctx.settings.get('daySky')) return;

    function fixSky() {
      var state = ctx.vue.getState();
      var weather = state && state.weather;
      if (!weather) return;
      var day = NIGHT_TO_DAY[weather.sky];
      // Присваиваем, только если индекс реально ночной — иначе зациклимся.
      if (day !== undefined && weather.sky !== day) weather.sky = day;
    }

    // Vue монтируется позже нас: ждём, но молча.
    return ctx.whenVueReady().then(function (vm) {
      if (!vm || ctx.isDisposed()) return;
      fixSky();
      ctx.watch('weather.sky', fixSky);
    });
  },
};
