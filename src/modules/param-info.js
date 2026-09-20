/**
 * Подробная информация о параметре или навыке по клику.
 *
 * Значения берём из parameter.data.*, не из ширины .bar-fill (там scaleX).
 * Абсолютный опыт навыка — по шкале parameter.level и tooltip. См. CORRECTIONS.md.
 */

var dom = require('core/dom');

var BLOCK_SEL = '#parameters_skills_block';
var CARD_ID = 'cwb-param-info';

function skillAbs(parameter, key) {
  var d = parameter.data && parameter.data[key];
  if (!d || d.level === undefined) return null;
  var levels = parameter.level || [0, 1, 5, 20, 50, 200, 500, 1000, 3000, 10000];
  var m = /\((\d+(?:[.,]\d+)?)\/(\d+|∞)\)\s*$/.exec(d.tooltip || '');
  var inLvl = m ? parseFloat(String(m[1]).replace(',', '.')) : 0;
  var span = m ? m[2] : '∞';
  var abs = levels[d.level] + inLvl;
  var next = levels[d.level + 1];
  return {
    level: d.level,
    inLvl: inLvl,
    span: span,
    abs: abs,
    next: next,
    toNext: next != null ? next - abs : null,
    barWidth: d.barWidth,
    tooltip: d.tooltip,
  };
}

function needAbs(cat, parameter, key) {
  var map = { hunger: 'gol', thirst: 'zhazhda', dream: 'son', need: 'nuzh' };
  var raw = map[key];
  var max = parameter.maximums && parameter.maximums[key];
  if (raw && cat && typeof cat[raw] === 'number' && typeof max === 'number') {
    return { abs: cat[raw], max: max };
  }
  return null;
}

module.exports = {
  id: 'param-info',
  title: 'Информация о параметре',
  description: 'Карточка с текущим значением, максимумом, уровнем и абсолютным опытом навыка.',
  category: 'info',
  pages: ['game'],
  enabledByDefault: false,
  order: 43,

  styles: function () {
    return [
      '#' + CARD_ID + '{position:fixed;z-index:2147482500;max-width:320px;padding:10px 12px;',
      'border-radius:8px;background:rgba(20,18,15,.92);color:#f3e7d3;',
      'font:13px/1.45 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.45);cursor:default;}',
      '#' + CARD_ID + ' h4{margin:0 0 6px;font-size:14px;}',
      '#' + CARD_ID + ' .cwb-param-row{opacity:.85;margin:2px 0;}',
      '#' + CARD_ID + ' .cwb-param-close{float:right;cursor:pointer;opacity:.7;border:none;background:none;color:inherit;font-size:16px;}',
    ].join('');
  },

  init: function (ctx) {
    var card = null;

    function hideCard() {
      if (card && card.parentNode) card.parentNode.removeChild(card);
      card = null;
    }

    function showCard(html, x, y) {
      if (!card) {
        card = dom.el('div', { id: CARD_ID });
        ctx.mount(card);
      }
      card.innerHTML = html;
      var left = Math.min(window.innerWidth - card.offsetWidth - 8, Math.max(8, x));
      var top = Math.min(window.innerHeight - card.offsetHeight - 8, Math.max(8, y));
      card.style.left = left + 'px';
      card.style.top = top + 'px';
      var closeBtn = card.querySelector('.cwb-param-close');
      if (closeBtn) closeBtn.addEventListener('click', hideCard);
      ctx.addCleanup(hideCard);
    }

    function onClick(e) {
      var box = e.target.closest && e.target.closest('.parameter, .skill');
      if (!box || !box.id) return;
      // Не перехватываем клики по .symbole у health/smell — там игровые emit.
      if (e.target.closest && e.target.closest('.symbole') &&
          (box.id === 'health' || box.id === 'smell')) return;

      var state = ctx.vue.getState();
      if (!state || !state.parameter) return;

      var key = box.id;
      var parameter = state.parameter;
      var d = parameter.data && parameter.data[key];
      if (!d) return;

      var title = (parameter.titles && parameter.titles[key]) || key;
      var rows = [];

      if (box.classList.contains('skill')) {
        var s = skillAbs(parameter, key);
        if (!s) return;
        rows.push('<div class="cwb-param-row">Уровень: <b>' + s.level + '</b></div>');
        rows.push('<div class="cwb-param-row">Прогресс: <b>' + s.inLvl + ' / ' + s.span + '</b> (' + (s.barWidth != null ? s.barWidth : '?') + '%)</div>');
        rows.push('<div class="cwb-param-row">Абсолютный опыт: <b>' + s.abs + '</b></div>');
        if (s.toNext != null) rows.push('<div class="cwb-param-row">До след. уровня: <b>' + Math.max(0, Math.round(s.toNext * 100) / 100) + '</b></div>');
        if (d.tooltip) rows.push('<div class="cwb-param-row">Подсказка: ' + dom.escapeHtml(d.tooltip) + '</div>');
      } else {
        rows.push('<div class="cwb-param-row">Текущее: <b>' + dom.escapeHtml(String(d.data || '')) + '</b></div>');
        var na = needAbs(state.cat, parameter, key);
        if (na) rows.push('<div class="cwb-param-row">Очки: <b>' + na.abs + ' / ' + na.max + '</b></div>');
        var tipEl = box.querySelector('.symbole[data-original-title], .bar[data-original-title]');
        var tip = tipEl && tipEl.getAttribute('data-original-title');
        if (tip && tip !== 'null') rows.push('<div class="cwb-param-row">Подсказка: ' + dom.escapeHtml(tip) + '</div>');
      }

      e.preventDefault();
      e.stopPropagation();
      showCard(
        '<button type="button" class="cwb-param-close" aria-label="Закрыть">×</button>' +
        '<h4>' + dom.escapeHtml(title) + '</h4>' + rows.join(''),
        e.clientX + 8,
        e.clientY + 8
      );
    }

    return ctx.dom.waitForElement(BLOCK_SEL).then(function (block) {
      if (!block || ctx.isDisposed()) return;
      ctx.on(block, 'click', onClick);
      ctx.on(document, 'keydown', function (e) {
        if (e.key === 'Escape') hideCard();
      });
    });
  },
};
