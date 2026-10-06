var IS_LU = false;
try { IS_LU = require('cwb:meta').variant === 'lu'; } catch (e) {}

/**
 * Скрыть погоду.
 *
 * Разные узлы отвечают за разное, поэтому опции раздельные:
 *   #tr_sky  — строка таблицы с картинкой неба (внутри #sky, 150px высотой);
 *   #tos     — градиентная полоска температуры (инлайновый linear-gradient);
 *   #hour    — <a id="hour"> со ссылкой на /time и картинкой symbole/hours/N.png;
 *   сезон    — ещё одна <a href=".../time"> с картинкой symbole/seasonN.png,
 *              своего id у неё нет — цепляемся за путь к картинке;
 *   #tr_tos  — вся строка целиком. Внутри неё лежит .game-location
 *              («Моё местонахождение»), поэтому «скрыть всю строку» вынесено
 *              отдельно и с предупреждением.
 *
 * Разметка сверена с сохранённым HTML игровой страницы.
 */

module.exports = {
  id: 'hide-weather',
  title: 'Убрать погоду',
  description: 'Прячет небо, температуру, час и сезон над полем.',
  category: 'field',
  pages: ['game'],
  enabledByDefault: false,
  order: 40,
  warning: IS_LU ? null : '«Вся строка погоды» прячет ещё и «Моё местонахождение» — оно в той же строке.',

  defaults: {
    sky: true,
    tos: true,
    hour: false,
    season: false,
    wholeRow: false,
  },

  schema: IS_LU ? [
    { key: 'tos', type: 'boolean', label: 'Полоска температуры' },
    { key: 'hour', type: 'boolean', label: 'Иконка игрового часа' },
    { key: 'season', type: 'boolean', label: 'Иконка сезона' },
  ] : [
    { key: 'sky', type: 'boolean', label: 'Небо над полем' },
    { key: 'tos', type: 'boolean', label: 'Полоска температуры' },
    { key: 'hour', type: 'boolean', label: 'Иконка игрового часа' },
    { key: 'season', type: 'boolean', label: 'Иконка сезона' },
    {
      key: 'wholeRow',
      type: 'boolean',
      label: 'Вся строка погоды',
      hint: 'Перебивает галочки выше. В компакте ещё спрячет название локации.',
    },
  ],

  styles: function (s) {
    var css = [];
    if (s.wholeRow) {
      css.push('#tr_tos { display: none !important; }');
    } else {
      if (s.tos) css.push('#tos { display: none !important; }');
      if (s.hour) css.push('#hour { display: none !important; }');
      // У иконки сезона нет своего id — цепляемся за имя файла symbole/seasonN.png.
      if (s.season) css.push('#tr_tos img[src*="season"] { display: none !important; }');
    }
    if (s.sky && !require('core/uwu').hidingSky()) {
      css.push('#tr_sky { display: none !important; }');
      // На случай, если compact уже вынес #sky из таблицы.
      css.push('#sky { display: none !important; }');
    }
    return css.join('\n');
  },
};
