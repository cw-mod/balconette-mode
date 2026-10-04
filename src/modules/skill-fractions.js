/**
 * Дроби опыта на полосках навыков.
 *
 * Идея из CatWar UwU (`showExactSkillsValues`): вставить `.bar-data` в `.skill .bar`,
 * как у параметров в блоке «Состояние». Числа — из `parameter.data[key].tooltip`
 * или расчёт по `parameter.level` + `barWidth`. Не парсим `.bar-fill` (там scaleX).
 */

var BLOCK_SEL = '#parameters_skills_block';
var MARK = 'data-cwb-skill-fraction';
var DEFAULT_SKILLS = ['smell', 'dig', 'heal', 'swim', 'might', 'power', 'pet_faith', 'tree', 'observ'];

function parseFraction(tooltip) {
  var m = /\((\d+(?:[.,]\d+)?)\/(\d+|∞)\)\s*$/.exec(tooltip || '');
  if (!m) return null;
  return String(m[1]).replace(',', '.') + '/' + m[2];
}

function fractionFromScale(parameter, skillInfo) {
  var levels = parameter.level || [0, 1, 5, 20, 50, 200, 500, 1000, 3000, 10000];
  var level = skillInfo.level;
  if (level == null) return null;
  var next = levels[level + 1];
  if (next == null) return null;
  var span = next - levels[level];
  var inLvl = Math.floor((skillInfo.barWidth || 0) / 100 * span * 100) / 100;
  return inLvl + '/' + span;
}

function skillFraction(parameter, key) {
  var d = parameter.data && parameter.data[key];
  if (!d || d.isHidden || d.level === undefined) return null;
  return parseFraction(d.tooltip) || fractionFromScale(parameter, d);
}

module.exports = {
  id: 'skill-fractions',
  title: 'Дроби на навыках',
  description: 'Показывает опыт навыка на полоске (673/2000), как подписи в блоке «Состояние».',
  category: 'info',
  pages: ['game'],
  enabledByDefault: false,
  order: 44,

  defaults: {
    format: 'fraction',
  },

  schema: [
    {
      key: 'format',
      type: 'select',
      label: 'Формат',
      options: [
        { value: 'fraction', label: 'Только дробь (673/2000)' },
        { value: 'level+fraction', label: 'Уровень и дробь (7 · 673/2000)' },
      ],
    },
  ],

  styles: function () {
    return [
      BLOCK_SEL + ' .skill .bar { position: relative; }',
      BLOCK_SEL + ' .skill .bar-data[' + MARK + '] {',
      'position: absolute; left: 0; top: 0; width: 100%; height: 100%;',
      'text-align: center; font-size: 10px; line-height: 15px;',
      'color: var(--ui-on-accent, #fff); pointer-events: none; z-index: 2;',
      'text-shadow: 1px 1px 2px #000;',
      '}',
    ].join('\n');
  },

  init: function (ctx) {
    if (require('core/uwu').hasExactSkills()) {
      ctx.log.info('UwU уже рисует дроби на навыках — не дублируем .bar-data');
      return;
    }
    function clearMarks() {
      ctx.dom.qsa('[' + MARK + ']').forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    }

    function formatLabel(parameter, key, fraction) {
      if (!fraction) return '';
      var d = parameter.data && parameter.data[key];
      if (ctx.settings.get('format') === 'level+fraction' && d && d.level != null) {
        return d.level + ' · ' + fraction;
      }
      return fraction;
    }

    function paint() {
      if (ctx.isDisposed()) return;
      var state = ctx.vue.getState();
      if (!state || !state.parameter) return;

      var parameter = state.parameter;
      var keys = parameter.skills || DEFAULT_SKILLS;

      keys.forEach(function (key) {
        var skillEl = document.getElementById(key);
        if (!skillEl || !skillEl.classList.contains('skill')) return;

        var fraction = skillFraction(parameter, key);
        var bar = skillEl.querySelector('.bar');
        if (!bar) return;

        if (!fraction) {
          var stale = bar.querySelector('[' + MARK + ']');
          if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
          return;
        }

        var barData = bar.querySelector('[' + MARK + ']');
        if (!barData) {
          barData = document.createElement('div');
          barData.className = 'bar-data';
          barData.setAttribute(MARK, '1');
          bar.appendChild(barData);
        }

        var text = formatLabel(parameter, key, fraction);
        if (barData.textContent !== text) barData.textContent = text;
      });
    }

    function schedulePaint() {
      if (ctx.isDisposed()) return;
      requestAnimationFrame(paint);
    }

    ctx.addCleanup(clearMarks);

    return ctx.dom.waitForElement(BLOCK_SEL).then(function (block) {
      if (!block || ctx.isDisposed()) return;
      ctx.observe(block, schedulePaint, { childList: true, subtree: true });
      return ctx.whenVueReady().then(function (vm) {
        if (!vm || ctx.isDisposed()) return;
        schedulePaint();
        ctx.watch('parameter.data', schedulePaint, { deep: true });
        ctx.watch('parameter.skills', schedulePaint);
      });
    });
  },
};
