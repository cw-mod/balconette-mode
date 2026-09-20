/**
 * ID котов во рту.
 *
 * Данные — vm.cat.taken[].id; в DOM у div.catrot атрибут id совпадает с ID кота.
 * Подписи через data-cwb-id + CSS ::after, чтобы не трогать class/style Vue.
 * См. RUNTIME.md §8.7.
 */

var SEL_ITEM_LIST = '#itemList';
var SEL_CATROT = SEL_ITEM_LIST + ' .catrot';

module.exports = {
  id: 'mouth-cat-ids',
  title: 'ID котов во рту',
  description: 'Показывает числовой ID каждого кота, которого держите во рту.',
  category: 'info',
  pages: ['game'],
  enabledByDefault: false,
  order: 40,

  defaults: {
    fontSize: 10,
  },

  schema: [
    { key: 'fontSize', type: 'number', label: 'Размер подписи, px', min: 8, max: 14, step: 1 },
  ],

  styles: function (s) {
    var fs = Math.max(8, Math.min(14, Number(s.fontSize) || 10));
    return [
      SEL_CATROT + ' { position: relative; }',
      SEL_CATROT + '[data-cwb-id]::after {',
      'content: attr(data-cwb-id); position: absolute; left: 0; bottom: 0;',
      'font: ' + fs + 'px/1 ui-monospace, Menlo, Consolas, monospace;',
      'background: rgba(0,0,0,.72); color: #fff; padding: 1px 3px;',
      'pointer-events: none; z-index: 2; border-radius: 2px;',
      '}',
    ].join('\n');
  },

  init: function (ctx) {
    function mark() {
      var taken = ctx.vue.get('cat.taken');
      if (!Array.isArray(taken)) return;
      taken.forEach(function (cat) {
        if (!cat || cat.id == null) return;
        var el = document.getElementById(String(cat.id));
        if (el && el.classList.contains('catrot')) el.dataset.cwbId = String(cat.id);
      });
      ctx.dom.qsa(SEL_CATROT).forEach(function (el) {
        if (!el.dataset.cwbId) delete el.dataset.cwbId;
      });
    }

    return ctx.whenVueReady().then(function (vm) {
      if (!vm || ctx.isDisposed()) return;
      mark();
      ctx.watch('cat.taken', function () {
        if (ctx.isDisposed()) return;
        requestAnimationFrame(mark);
      }, { deep: true });
    });
  },
};
