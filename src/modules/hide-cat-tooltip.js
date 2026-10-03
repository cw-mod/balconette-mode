/**
 * Скрыть всплывающее окно «О коте».
 *
 * Как в CatWar UwU (`hideCatTooltip` в быстрых стилях игровой):
 *   .cat_tooltip { display: none !important; }
 *
 * `.cat_tooltip` — <span> внутри `.cat` на клетке поля: имя, титул, запах,
 * онлайн. Тот же класс есть и в нюхе. DOM не трогаем — только CSS, клик
 * по коту и ссылка /catN остаются в разметке.
 */

module.exports = {
  id: 'hide-cat-tooltip',
  title: 'Скрыть окно «О коте»',
  description: 'Не показывает всплывашку с именем и запахом при наведении на кота.',
  category: 'interface',
  pages: ['game'],
  enabledByDefault: false,
  order: 45,

  styles: '.cat_tooltip { display: none !important; }',
};
