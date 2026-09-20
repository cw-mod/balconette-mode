/**
 * Уведомления о новом ЛС и упоминании в чате.
 *
 * Browser Notification (разрешение — по кнопке в настройках), опционально звук
 * и мигание заголовка вкладки. Чат-DOM не трогаем — читаем Vue.
 * См. RUNTIME.md §8.12.
 */

var audio = require('core/audio');
var dom = require('core/dom');

var PERM_BTN = 'cwb-notify-perm';

module.exports = {
  id: 'notifications',
  title: 'Уведомления',
  description: 'Браузерные уведомления о новом ЛС и упоминании вашего имени в чате.',
  category: 'chat',
  pages: ['game', 'chat'],
  enabledByDefault: false,
  order: 10,

  defaults: {
    onPm: true,
    onMention: true,
    sound: true,
    blinkTitle: true,
    volume: 0.4,
  },

  schema: [
    { key: 'onPm', type: 'boolean', label: 'Новое личное сообщение' },
    { key: 'onMention', type: 'boolean', label: 'Упоминание в чате' },
    { key: 'sound', type: 'boolean', label: 'Звук при уведомлении' },
    { key: 'blinkTitle', type: 'boolean', label: 'Мигать заголовком вкладки' },
    { key: 'volume', type: 'range', label: 'Громкость звука', min: 0.05, max: 1, step: 0.05 },
    {
      key: '_perm',
      type: 'boolean',
      label: 'Запросить разрешение браузера',
      hint: 'Включите, чтобы браузер спросил разрешение на уведомления. Не запрашивается автоматически.',
    },
  ],

  init: function (ctx) {
    var origTitle = document.title;
    var blinkTimer = null;
    var blinkOn = false;

    function stopBlink() {
      clearInterval(blinkTimer);
      blinkTimer = null;
      document.title = origTitle;
      blinkOn = false;
    }

    function blink(title) {
      if (!ctx.settings.get('blinkTitle')) return;
      stopBlink();
      var alt = '● ' + title;
      blinkTimer = ctx.interval(function () {
        document.title = blinkOn ? origTitle : alt;
        blinkOn = !blinkOn;
      }, 900);
      ctx.on(window, 'focus', stopBlink);
    }

    function notify(title, body, kind) {
      if (ctx.settings.get('sound')) audio.play(kind === 'pm' ? 'pm' : 'mention', ctx.settings.get('volume'));
      blink(title);
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        var n = new Notification(title, { body: body, tag: 'cwb-' + kind });
        n.onclick = function () { window.focus(); n.close(); };
      } catch (e) { ctx.log.warn('Notification API', e); }
    }

    // Кнопка разрешения — через одноразовый обработчик настройки _perm
    if (ctx.settings.get('_perm') && typeof Notification !== 'undefined' &&
        Notification.permission === 'default') {
      Notification.requestPermission().finally(function () {
        ctx.settings.set('_perm', false);
      });
    }

    return ctx.whenVueReady().then(function (vm) {
      if (!vm || ctx.isDisposed()) return;
      origTitle = document.title;

      if (ctx.settings.get('onPm')) {
        ctx.watch('game.notReadMess', function (now, was) {
          if (typeof now === 'number' && typeof was === 'number' && now > was) {
            notify('Новое личное сообщение', 'Непрочитанных: ' + now, 'pm');
          }
        });
      }

      if (ctx.settings.get('onMention')) {
        ctx.vue.onChatMessage(function (fresh) {
          var myId = ctx.vue.get('cat.id');
          fresh.forEach(function (msg) {
            if (!msg || msg.cat === myId) return;
            if (/class=["']myname["']/.test(String(msg.text || ''))) {
              var plain = String(msg.text || '').replace(/<[^>]+>/g, '');
              notify((msg.login || 'Чат') + ' упомянул(а) вас', plain, 'mention');
            }
          });
        });
      }
    });
  },

  destroy: function () {
    if (typeof document !== 'undefined') document.title = document.title.replace(/^●\s*/, '');
  },

  onSettings: function (ctx, key) {
    if (key === '_perm') {
      if (ctx.settings.get('_perm') && typeof Notification !== 'undefined') {
        Notification.requestPermission().finally(function () {
          ctx.settings.set('_perm', false);
        });
      }
      return;
    }
    var registry = require('core/registry');
    registry.stopModule('notifications');
    registry.startModule('notifications');
  },
};
