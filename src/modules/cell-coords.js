/**
 * Координаты клетки при наведении на игровое поле.
 *
 * x/y — индексы td/tr в #cages (1-based), как в field.map[y][x].
 * При нюхе и перерисовке поля оверлей перевешивается по $watch field.map.
 * См. CORRECTIONS.md и RUNTIME.md §8.10.
 */

var SEL_TABLE = '#cages';
var SEL_CELL = SEL_TABLE + ' td.cage';

function cellCoords(td) {
  var tr = td.parentElement;
  if (!tr || !tr.parentElement) return null;
  return {
    y: Array.prototype.indexOf.call(tr.parentElement.children, tr) + 1,
    x: Array.prototype.indexOf.call(tr.children, td) + 1,
  };
}

module.exports = {
  id: 'cell-coords',
  title: 'Координаты клетки',
  description: 'Подсказка x,y при наведении на клетку игрового поля.',
  category: 'field',
  pages: ['game', 'hunt'],
  enabledByDefault: false,
  order: 21,

  defaults: {
    showTree: true,
    hideInSmell: true,
  },

  schema: [
    { key: 'showTree', type: 'boolean', label: 'Показывать ярус дерева' },
    { key: 'hideInSmell', type: 'boolean', label: 'Скрывать в режиме нюха' },
  ],

  styles: function () {
    return [
      SEL_CELL + ' { position: relative; }',
      SEL_CELL + '[data-cwb-xy]:hover::before {',
      'content: attr(data-cwb-xy); position: absolute; top: 2px; left: 2px; z-index: 50;',
      'font: 11px/1 ui-monospace, Menlo, Consolas, monospace;',
      'background: rgba(0,0,0,.78); color: #fff; padding: 2px 4px; pointer-events: none;',
      'border-radius: 3px;',
      '}',
    ].join('\n');
  },

  init: function (ctx) {
    var boundTable = null;

    function labelFor(td) {
      var c = cellCoords(td);
      if (!c) return;
      var map = ctx.vue.get('field.map');
      var cage = map && map[c.y] && map[c.y][c.x];
      var text = c.x + ',' + c.y;
      if (ctx.settings.get('showTree') && cage && typeof cage.tree === 'number') {
        text += ' · ярус ' + cage.tree;
      }
      td.dataset.cwbXy = text;
    }

    function onOver(e) {
      var td = e.target.closest && e.target.closest(SEL_CELL);
      if (!td) return;
      if (ctx.settings.get('hideInSmell')) {
        var smell = ctx.vue.get('field.smellMap');
        if (smell && (typeof smell === 'object' || Array.isArray(smell))) return;
      }
      labelFor(td);
    }

    function bindTable(table) {
      if (!table || table === boundTable) return;
      boundTable = table;
      ctx.on(table, 'mouseover', onOver);
    }

    function syncTable() {
      if (ctx.isDisposed()) return;
      if (ctx.settings.get('hideInSmell')) {
        var smell = ctx.vue.get('field.smellMap');
        if (smell && (typeof smell === 'object' || Array.isArray(smell))) return;
      }
      var table = ctx.dom.qs(SEL_TABLE);
      if (table && table.tagName === 'TABLE') bindTable(table);
    }

    return ctx.dom.waitForElement(SEL_TABLE).then(function () {
      if (ctx.isDisposed()) return;
      syncTable();
      ctx.watch('field.map', syncTable, { deep: true });
      ctx.watch('field.smellMap', syncTable);
      ctx.watch('hunt.mode', syncTable);
    });
  },
};
