/**
 * Остаток времени до конца действия в заголовке вкладки.
 *
 * Как в CW Mod (`cw3_act_end_in_title`) и CW Shed (`$('title').text(time + " / " + action)`),
 * но без парсинга #block_mess: берём `cat.actionEnds` (unix) и `cat.actionMess` из Vue.
 */

var DEFAULT_TITLE = 'Игровая / CatWar';

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function formatLeft(sec) {
  if (sec < 0) sec = 0;
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = sec % 60;
  if (h > 0) return h + ' ч ' + m + ' мин ' + s + ' с';
  if (m > 0) return m + ' мин ' + s + ' с';
  return s + ' с';
}

function shortMess(text) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // Берём первую фразу без самого таймера, если он вдруг попал в mess.
  t = t.replace(/(?:\d+\s*ч\s*)?(?:\d+\s*мин\s*)?\d+\s*с\.?/gi, '').trim();
  if (t.length > 48) t = t.slice(0, 46) + '…';
  return t;
}

module.exports = {
  id: 'action-title',
  title: 'Таймер действия в заголовке',
  description: 'Пока идёт действие, во вкладке браузера пишется, сколько секунд осталось.',
  category: 'interface',
  pages: ['game', 'hunt'],
  enabledByDefault: false,
  order: 15,

  defaults: {
    showName: true,
  },

  schema: [
    {
      key: 'showName',
      type: 'boolean',
      label: 'Писать название действия рядом со временем',
      hint: 'Как в CW Shed: «1 мин 12 с / Вылизаться». Если выключено — только время, как в CW Mod.',
    },
  ],

  init: function (ctx) {
    var baseTitle = document.title || DEFAULT_TITLE;
    var weOwnTitle = false;

    function endsUnix() {
      var raw = ctx.vue.get('cat.actionEnds');
      var n = Number(raw);
      return n > 0 ? n : 0;
    }

    function leftSec() {
      var ends = endsUnix();
      if (!ends) return 0;
      // actionEnds — unix в секундах; если вдруг пришло в мс, нормализуем.
      if (ends > 1e12) ends = Math.floor(ends / 1000);
      return Math.max(0, ends - Math.floor(Date.now() / 1000));
    }

    function paint() {
      if (ctx.isDisposed()) return;
      var left = leftSec();
      var mess = ctx.vue.get('cat.actionMess') || '';
      var busy = left > 0 || !!String(mess).trim();

      if (!busy) {
        if (weOwnTitle) {
          document.title = baseTitle;
          weOwnTitle = false;
        }
        return;
      }

      if (!weOwnTitle) {
        baseTitle = document.title || DEFAULT_TITLE;
        weOwnTitle = true;
      }

      var time = formatLeft(left);
      var name = ctx.settings.get('showName') ? shortMess(mess) : '';
      document.title = name ? time + ' / ' + name : time;
    }

    ctx.addCleanup(function () {
      if (weOwnTitle) document.title = baseTitle;
    });

    return ctx.whenVueReady().then(function (vm) {
      if (!vm || ctx.isDisposed()) return;
      paint();
      ctx.interval(paint, 1000);
      ctx.watch('cat.actionEnds', paint);
      ctx.watch('cat.actionMess', paint);
    });
  },
};
