/**
 * Подсказки по квадрату запаха на странице охоты (/cw3/jagd).
 *
 * Перенос фичи CW Shed / CatWar UwU: элемент #smell меняет красный канал
 * background-color — чем больше, тем ближе дичь. Показываем «Ближе» / «Дальше» /
 * «Потерян» (red=0) и таймер с начала отслеживания.
 *
 * Наблюдаем только style у #smell, DOM не перестраиваем.
 */

var SMELL = '#smell';
var HINT_ID = 'cwb-smell-hint';
var TIMER_ID = 'cwb-smell-timer';

function parseRed(color) {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
  var m = /rgba?\(\s*(\d+)/.exec(color);
  return m ? parseInt(m[1], 10) : null;
}

module.exports = {
  id: 'hunt-smell-square',
  title: 'Подсказка по запаху (охота)',
  description: 'На /cw3/jagd: «Ближе» / «Дальше» / «Потерян» по цвету квадрата запаха и таймер.',
  category: 'info',
  pages: ['hunt'],
  enabledByDefault: false,
  order: 50,

  defaults: {
    showTimer: true,
  },

  schema: [
    { key: 'showTimer', type: 'boolean', label: 'Показывать таймер' },
  ],

  styles: function () {
    return [
      '#' + HINT_ID + ', #' + TIMER_ID + '{',
      'font: 16px/1.2 ui-monospace, Menlo, Consolas, monospace;',
      'background: rgba(255,255,255,.92); color: #111; text-align: center;',
      'padding: 4px 6px; border-radius: 4px; pointer-events: none;',
      'box-shadow: 0 1px 4px rgba(0,0,0,.25);',
      '}',
      '#' + HINT_ID + '{ position: fixed; z-index: 2147481000; min-width: 100px; }',
      '#' + TIMER_ID + '{ position: fixed; z-index: 2147481000; min-width: 100px; font-size: 14px; }',
    ].join('\n');
  },

  init: function (ctx) {
    if (require('core/uwu').hasHuntSmell()) {
      ctx.log.info('UwU уже описывает запах на охоте — нашу подсказку не вешаем');
      return;
    }
    var hint = null;
    var timerEl = null;
    var prevRed = null;
    var seconds = 0;
    var tick = null;
    var smellEl = null;

    function positionNearSmell() {
      if (!smellEl || !hint) return;
      var r = smellEl.getBoundingClientRect();
      hint.style.left = Math.max(8, r.left) + 'px';
      hint.style.top = Math.max(8, r.top - 28) + 'px';
      if (timerEl) {
        timerEl.style.left = hint.style.left;
        timerEl.style.top = (parseInt(hint.style.top, 10) + 24) + 'px';
      }
    }

    function setHint(text) {
      if (!hint) {
        hint = ctx.dom.el('div', { id: HINT_ID });
        ctx.mount(hint);
      }
      hint.textContent = text;
      positionNearSmell();
    }

    function ensureTimer() {
      if (!ctx.settings.get('showTimer')) return;
      if (!timerEl) {
        timerEl = ctx.dom.el('div', { id: TIMER_ID, text: '00:00' });
        ctx.mount(timerEl);
        tick = ctx.interval(function () {
          seconds += 1;
          var m = Math.floor(seconds / 60);
          var s = seconds % 60;
          timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
          positionNearSmell();
        }, 1000);
      }
    }

    function onSmellStyle() {
      if (!smellEl || ctx.isDisposed()) return;
      var red = parseRed(window.getComputedStyle(smellEl).backgroundColor);
      if (red === null) return;

      ensureTimer();

      if (red === 0) {
        setHint('Потерян');
      } else if (prevRed !== null) {
        if (red > prevRed) setHint('Ближе');
        else if (red < prevRed) setHint('Дальше');
      } else {
        setHint(' ');
      }
      prevRed = red;
      positionNearSmell();
    }

    return ctx.dom.waitForElement(SMELL).then(function (el) {
      if (!el || ctx.isDisposed()) return;
      smellEl = el;
      ctx.observe(el, onSmellStyle, { attributes: true, attributeFilter: ['style'] });
      ctx.on(window, 'resize', positionNearSmell);
      ctx.on(window, 'scroll', positionNearSmell, true);
      onSmellStyle();
    });
  },
};
