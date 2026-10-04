/**
 * Часы.
 *
 * Отдельный плавающий виджет в нашем контейнере, а не врезка в игровую вёрстку:
 * так он ни от чего в игре не зависит и снимается одним removeChild.
 * Игровой час берём из Vue (`weather.hour`), он тикает внутри игры раз в секунду.
 */

var dom = require('core/dom');

var SEASONS = ['Зима', 'Весна', 'Лето', 'Осень'];

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function realTime(s) {
  var now = new Date();
  var opts = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  if (s.showSeconds) opts.second = '2-digit';
  if (s.timezone === 'msk') opts.timeZone = 'Europe/Moscow';
  try {
    return new Intl.DateTimeFormat('ru-RU', opts).format(now);
  } catch (e) {
    return pad(now.getHours()) + ':' + pad(now.getMinutes()) + (s.showSeconds ? ':' + pad(now.getSeconds()) : '');
  }
}

module.exports = {
  id: 'clock',
  title: 'Часы',
  description: 'Плавающие часы. Реальное время, по желанию ещё игровой час и сезон.',
  category: 'interface',
  pages: ['game', 'hunt', 'chat', 'pm'],
  enabledByDefault: false,
  order: 10,

  defaults: {
    timezone: 'local',   // local | msk
    showSeconds: false,
    showGameHour: false,
    showSeason: false,
    fontSize: 15,
    x: null,             // положение после перетаскивания, px от левого/верхнего края
    y: null,
  },

  schema: [
    {
      key: 'timezone',
      type: 'select',
      label: 'Время',
      options: [
        { value: 'local', label: 'Местное' },
        { value: 'msk', label: 'Московское' },
      ],
    },
    { key: 'showSeconds', type: 'boolean', label: 'Показывать секунды' },
    { key: 'showGameHour', type: 'boolean', label: 'Игровой час', hint: 'Только на игровой странице.' },
    { key: 'showSeason', type: 'boolean', label: 'Игровой сезон' },
    { key: 'fontSize', type: 'number', label: 'Размер шрифта, px', min: 9, max: 40, step: 1 },
  ],

  styles: function (s) {
    return [
      '#cwb-clock{position:fixed;z-index:2147482000;padding:4px 10px;border-radius:8px;',
      'background:rgba(20,18,15,.72);color:#f3e7d3;font:', Math.max(9, Math.min(40, Number(s.fontSize) || 15)),
      'px/1.35 ui-monospace,Menlo,Consolas,monospace;',
      'white-space:nowrap;cursor:move;user-select:none;-webkit-user-select:none;box-shadow:0 2px 8px rgba(0,0,0,.35);}',
      '#cwb-clock .cwb-clock-sub{opacity:.75;font-size:.82em;}',
    ].join('');
  },

  init: function (ctx) {
    var s = ctx.settings.all();

    var main = dom.el('span', { class: 'cwb-clock-main' });
    var sub = dom.el('span', { class: 'cwb-clock-sub' });
    var node = dom.el('div', { id: 'cwb-clock', title: 'Можно перетащить' }, [main, sub]);

    // Положение: сохранённое или по умолчанию сверху слева.
    if (typeof s.x === 'number' && typeof s.y === 'number') {
      node.style.left = s.x + 'px';
      node.style.top = s.y + 'px';
    } else {
      node.style.left = '12px';
      node.style.top = '12px';
    }

    ctx.mount(node);

    function paint() {
      var cur = ctx.settings.all();
      main.textContent = realTime(cur);

      var extras = [];
      if (cur.showGameHour) {
        var hour = ctx.vue.get('weather.hour');
        if (typeof hour === 'number') extras.push('игр. ' + pad(hour) + ':00');
      }
      if (cur.showSeason) {
        var season = ctx.vue.get('weather.season');
        if (typeof season === 'number' && SEASONS[season]) extras.push(SEASONS[season]);
      }
      sub.textContent = extras.length ? ' · ' + extras.join(' · ') : '';
    }

    paint();
    ctx.interval(paint, s.showSeconds ? 1000 : 15000);
    // Отдельный «минутный» тик, чтобы без секунд часы не отставали больше 15 с.
    if (!s.showSeconds) ctx.interval(paint, 1000 * 30);

    if (s.showGameHour || s.showSeason) ctx.watch('weather.hour', paint);

    /* --------------------------- перетаскивание ---------------------------- */

    var drag = null;

    ctx.on(node, 'pointerdown', function (e) {
      if (e.button !== 0) return;
      var rect = node.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
      e.preventDefault();
    });

    ctx.on(node, 'pointermove', function (e) {
      if (!drag) return;
      var x = Math.max(0, Math.min(window.innerWidth - node.offsetWidth, e.clientX - drag.dx));
      var y = Math.max(0, Math.min(window.innerHeight - node.offsetHeight, e.clientY - drag.dy));
      node.style.left = x + 'px';
      node.style.top = y + 'px';
    });

    ctx.on(node, 'pointerup', function (e) {
      if (!drag) return;
      drag = null;
      try { node.releasePointerCapture(e.pointerId); } catch (err) { /* не критично */ }
      // Сохраняем через onSettings-безопасный путь: у модуля есть onSettings,
      // поэтому перезапуска не произойдёт и виджет не «мигнёт».
      ctx.settings.set('x', parseInt(node.style.left, 10) || 0);
      ctx.settings.set('y', parseInt(node.style.top, 10) || 0);
    });
  },

  /**
   * Настройки применяются без полного перезапуска, кроме тех, что меняют
   * частоту тика или набор подписок.
   */
  onSettings: function (ctx, key) {
    if (key === 'x' || key === 'y') return; // положение уже применено мышью
    ctx.log.debug('перезапуск часов из-за настройки', key);
    var registry = require('core/registry');
    registry.stopModule('clock');
    registry.startModule('clock');
  },
};
