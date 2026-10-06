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
  description: 'Уведомления браузера про новое ЛС и упоминание в чате.',
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
    { key: 'volume', type: 'range', label: 'Громкость звука', min: 0, max: 1, step: 0.05 },
    {
      key: '_testSound',
      type: 'custom',
      label: 'Проверить звук',
      render: function () {
        return dom.el('button', {
          type: 'button',
          class: 'cwb-btn',
          text: 'Проверить звук',
          onclick: function () {
            var registry = require('core/registry');
            audio.play('pm', registry.settingsOf('notifications').volume);
          },
        });
      },
    },
    {
      key: '_perm',
      type: 'custom',
      label: 'Запросить разрешение',
      render: function () {
        return dom.el('button', {
          type: 'button',
          class: 'cwb-btn',
          text: 'Запросить разрешение',
          onclick: function () {
            if (typeof Notification !== 'undefined') {
              Notification.requestPermission();
            }
          },
        });
      },
    },
  ],

  init: function (ctx) {
    function notify(title, body, kind) {
      audio.play(kind === 'pm' ? 'pm' : 'mention', ctx.settings.get('volume'));
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        var n = new Notification(title, { body: body, tag: 'cwb-' + kind });
        n.onclick = function () { window.focus(); n.close(); };
      } catch (e) { ctx.log.warn('Notification API', e); }
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
              notify((msg.login || 'Чат') + ' упомянул(а) тебя', plain, 'mention');
            }
          });
        });
      }
    });
  },

  destroy: function () {
  },

  onSettings: function (ctx, key) {
    var registry = require('core/registry');
    registry.stopModule('notifications');
    registry.startModule('notifications');
  },
};
