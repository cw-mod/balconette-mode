/**
 * Поменять местами выбор кота (#mit) и иконки действий (#akten).
 *
 * Основной сценарий — компактный режим (3 колонки): #block_deys — flex-колонка
 * с #deys и #deys_mit. Перестановка через CSS order + data-атрибут, без
 * переноса узлов. Если структура иная — модуль молча не применяется.
 *
 * Эталоны разметки:
 *   компакт — «Игровая _ CatWar компактный режим 3 колонки.html»;
 *   обычный — «Игровая _ CatWar обычный режим не компактный.html».
 */

var BLOCK = '#block_deys';
var MARKER = 'cwb-layout-swap';

module.exports = {
  id: 'layout-swap',
  title: 'Поменять кот ↔ действия',
  description: 'Сначала выбор соседнего кота (#mit), затем иконки действий (#akten).',
  category: 'interface',
  pages: ['game'],
  enabledByDefault: false,
  order: 15,

  styles: function () {
    var sel = BLOCK + '[data-' + MARKER + ']';
    return [
      /* Компакт: колонка, mit сверху */
      '#app.compact ' + sel + ' { display: flex; flex-direction: column; }',
      '#app.compact ' + sel + ' #deys_mit { order: 1; margin-top: 0; }',
      '#app.compact ' + sel + ' #deys { order: 2; margin-top: 8px; }',
      /* Обычный / широкий: строка, mit слева */
      '#app:not(.compact) ' + sel + ':not(.mobile) { display: flex; flex-direction: row; }',
      '#app:not(.compact) ' + sel + ':not(.mobile) #deys_mit { order: 1; margin-left: 0; margin-right: 5px; }',
      '#app:not(.compact) ' + sel + ':not(.mobile) #deys { order: 2; }',
      /* Мобильная колонка игры */
      sel + '.mobile #deys_mit { order: 1; }',
      sel + '.mobile #deys { order: 2; }',
    ].join('\n');
  },

  init: function (ctx) {
    return ctx.dom.waitForElement(BLOCK).then(function (block) {
      if (!block || ctx.isDisposed()) return;
      var deys = block.querySelector('#deys');
      var mitWrap = block.querySelector('#deys_mit');
      var mit = block.querySelector('#mit');
      var akten = block.querySelector('#akten');
      // Без обоих блоков или ключевых узлов — не ломаем вёрстку.
      if (!deys || !mitWrap || !mit || !akten) {
        ctx.log.debug('layout-swap: структура не узнана, пропуск');
        return;
      }
      block.setAttribute('data-' + MARKER, '1');
      ctx.addCleanup(function () { block.removeAttribute('data-' + MARKER); });
    });
  },
};
