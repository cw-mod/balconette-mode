/**
 * ID и названия предметов во рту.
 *
 * Уникальный id и type — из item.list; название восстанавливаем из eatText
 * (единственный клиентский источник без модалки обмена). См. RUNTIME.md §8.8.
 */

var SEL_ITEM = '#itemList .itemInMouth';

/** Убирает глагол из eatText («Съесть голубой коралл» → «голубой коралл»). */
function itemNameFromEatText(eatText, type) {
  var name = String(eatText || '')
    .replace(/^(Съесть|Выпить|Обнять|Понюхать|Использовать|Развернуть)\s+/i, '')
    .trim();
  return name || ('тип ' + type);
}

module.exports = {
  id: 'mouth-item-ids',
  title: 'ID предметов во рту',
  description: 'Подписи с уникальным ID, типом и названием предмета во рту.',
  category: 'info',
  pages: ['game'],
  enabledByDefault: false,
  order: 41,

  defaults: {
    showName: true,
    fontSize: 9,
  },

  schema: [
    { key: 'showName', type: 'boolean', label: 'Показывать название' },
    { key: 'fontSize', type: 'number', label: 'Размер подписи, px', min: 7, max: 12, step: 1 },
  ],

  styles: function (s) {
    var fs = Math.max(7, Math.min(12, Number(s.fontSize) || 9));
    return [
      SEL_ITEM + ' { position: relative; }',
      SEL_ITEM + '[data-cwb-label]::after {',
      'content: attr(data-cwb-label); position: absolute; left: 0; bottom: 0; right: 0;',
      'font: ' + fs + 'px/1.15 ui-monospace, Menlo, Consolas, monospace;',
      'background: rgba(0,0,0,.72); color: #fff; padding: 1px 3px;',
      'pointer-events: none; z-index: 2; white-space: pre-wrap; word-break: break-all;',
      '}',
    ].join('\n');
  },

  init: function (ctx) {
    function mark() {
      var list = ctx.vue.get('item.list');
      if (!Array.isArray(list)) return;
      var showName = ctx.settings.get('showName');
      list.forEach(function (item) {
        if (!item || item.id == null) return;
        var el = document.getElementById(String(item.id));
        if (!el || !el.classList.contains('itemInMouth')) return;
        var name = itemNameFromEatText(item.eatText, item.type);
        var label = String(item.id) + '\\A#' + item.type;
        if (showName) label += '\\A' + name;
        el.dataset.cwbLabel = label;
      });
      ctx.dom.qsa(SEL_ITEM).forEach(function (el) {
        var id = el.id;
        var found = list && list.some(function (i) { return String(i.id) === id; });
        if (!found) delete el.dataset.cwbLabel;
      });
    }

    return ctx.whenVueReady().then(function (vm) {
      if (!vm || ctx.isDisposed()) return;
      mark();
      ctx.watch('item.list', function () {
        if (ctx.isDisposed()) return;
        requestAnimationFrame(mark);
      }, { deep: true });
    });
  },

  onSettings: function (ctx, key) {
    if (key === 'showName') {
      var registry = require('core/registry');
      registry.stopModule('mouth-item-ids');
      registry.startModule('mouth-item-ids');
    }
  },
};
