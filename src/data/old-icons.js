/**
 * Словарь замен «старых иконок действий».
 *
 * ИСТОЧНИК: CW Shed 1.54, правило `on_css_oldicons`
 * (research/mods/CW_Shed.user.js, строки 2618–2641).
 *
 * ВАЖНО, ЧЕГО ЗДЕСЬ НЕ ХВАТАЕТ (подробности в SPEC.md, раздел «Открытые вопросы»):
 *  1. В Shed ссылки были на http://d.zaix.ru/… — это СТОРОННИЙ хостинг и HTTP.
 *     На https://catwar.su браузер заблокирует такие картинки как mixed content.
 *     Здесь они переписаны на https, но работоспособность домена не проверялась.
 *  2. Shed подменял всего 21 иконку из ~53 — это не полный «старый набор»,
 *     а те, что автору мода не понравились. Каталога «что реально изменилось
 *     на CDN игры» у нас нет: игровой HAR обрезан на 100 КБ.
 *  3. Нет соответствия id → название действия, поэтому в панели настроек
 *     нельзя показать человекочитаемый список.
 *
 * Пока пункты 1–3 не закрыты, модуль old-icons выключен по умолчанию и
 * рассчитан на свой набор картинок (опция «Свой словарь» или базовый URL).
 */

var ZAIX = 'https://d.zaix.ru/';

/** id действия (значение атрибута data-id у a.dey) -> URL картинки. */
var ACTIONS = {
  '1': ZAIX + 'b6pm.png',
  '3': ZAIX + 'b6pp.png',
  '4': ZAIX + 'b6pC.png',
  '5': ZAIX + 'b6pD.png',
  '6': ZAIX + 'b6pK.png',
  '8': ZAIX + 'b6pE.png',
  '9': ZAIX + 'dIZZ.png',
  '11': ZAIX + 'c8wv.png',
  '12': ZAIX + 'b6po.png',
  '13': ZAIX + '3989.png',
  '14': ZAIX + 'b6pM.png',
  '17': ZAIX + '3aKJ.png',
  '18': ZAIX + 'dJ26.png',
  '19': ZAIX + 'dJ28.png',
  '24': ZAIX + 'criD.png',
  '27': ZAIX + 'aWBR.png',
  '28': ZAIX + 'buJT.png',
  '29': ZAIX + 'dcu3.png',
  '51': ZAIX + 'heaT.png',
  '52': ZAIX + 'heaU.png',
  '53': ZAIX + 'heaW.png',
  exchange: ZAIX + 'aRJm.png',
  flowers: ZAIX + 'aRIh.png',
};

/** Прочие точечные замены: CSS-селектор -> URL. */
var EXTRA = {
  '#dialog > img': ZAIX + 'fpvK.png',
};

module.exports = {
  source: 'CW Shed 1.54 (on_css_oldicons)',
  ACTIONS: ACTIONS,
  EXTRA: EXTRA,
  /** Сколько иконок покрывает встроенный словарь. */
  count: Object.keys(ACTIONS).length + Object.keys(EXTRA).length,
};
