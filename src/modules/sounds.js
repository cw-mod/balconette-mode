/**
 * Звуки на игровые события (по мотивам CW Shed / UwU, но через $watch).
 *
 * Без внешних URL — Web Audio синтез в core/audio.js.
 * Не эмитим сокет, только читаем Vue-стейт.
 */

var audio = require('core/audio');

module.exports = {
  id: 'sounds',
  title: 'Звуки событий',
  description: 'Короткие сигналы при ЛС, упоминании, конце действия и смене локации.',
  category: 'sound',
  pages: ['game'],
  enabledByDefault: false,
  order: 10,

  defaults: {
    volume: 0.35,
    onPm: true,
    onMention: true,
    onActionEnd: true,
    onMapChange: false,
    onChat: false,
    customUrl: '',
  },

  schema: [
    { key: 'volume', type: 'range', label: 'Громкость', min: 0.05, max: 1, step: 0.05 },
    { key: 'onPm', type: 'boolean', label: 'Новое личное сообщение (бейдж ЛС)' },
    { key: 'onMention', type: 'boolean', label: 'Упоминание твоего имени в чате' },
    { key: 'onActionEnd', type: 'boolean', label: 'Конец действия / перехода' },
    { key: 'onMapChange', type: 'boolean', label: 'Смена локации (карта)' },
    { key: 'onChat', type: 'boolean', label: 'Новое сообщение в общем чате (бейдж)' },
    {
      key: 'customUrl',
      type: 'text',
      label: 'Ссылка на свой звук (необязательно)',
      hint: 'Если есть — играет вместо встроенного звука на все события.',
    },
  ],

  init: function (ctx) {
    var prevAction = '';
    var prevLoc = '';
    var customAudio = null;

    function vol() {
      return ctx.settings.get('volume');
    }

    function playKind(kind) {
      var url = String(ctx.settings.get('customUrl') || '').trim();
      if (url) {
        try {
          if (!customAudio) customAudio = new Audio(url);
          customAudio.volume = vol();
          customAudio.currentTime = 0;
          customAudio.play().catch(function () { /* автоплей */ });
        } catch (e) {
          audio.play(kind, vol());
        }
        return;
      }
      audio.play(kind, vol());
    }

    return ctx.whenVueReady().then(function (vm) {
      if (!vm || ctx.isDisposed()) return;

      prevAction = ctx.vue.get('cat.actionMess') || '';
      prevLoc = (ctx.vue.get('field.location') || {}).name || '';

      if (ctx.settings.get('onPm')) {
        ctx.watch('game.notReadMess', function (now, was) {
          if (typeof now === 'number' && typeof was === 'number' && now > was) playKind('pm');
        });
      }

      if (ctx.settings.get('onChat')) {
        ctx.watch('game.notReadChat', function (now, was) {
          if (typeof now === 'number' && typeof was === 'number' && now > was) playKind('chat');
        });
      }

      if (ctx.settings.get('onActionEnd')) {
        ctx.watch('cat.actionMess', function (now) {
          var cur = now || '';
          if (prevAction && !cur) playKind('action');
          prevAction = cur;
        });
      }

      if (ctx.settings.get('onMapChange')) {
        ctx.watch('field.location', function (loc) {
          var name = (loc && loc.name) || '';
          if (prevLoc && name && name !== prevLoc) playKind('map');
          prevLoc = name;
        }, { deep: true });
      }

      if (ctx.settings.get('onMention')) {
        var myLogin = ctx.vue.get('cat.login') || '';
        ctx.vue.onChatMessage(function (fresh) {
          if (!myLogin) return;
          fresh.forEach(function (msg) {
            if (!msg || msg.cat === ctx.vue.get('cat.id')) return;
            var text = String(msg.text || '');
            if (/class=["']myname["']/.test(text) || text.indexOf('myname') >= 0) {
              playKind('mention');
            }
          });
        });
      }
    });
  },

  onSettings: function (ctx, key) {
    if (key === 'customUrl') return;
    var registry = require('core/registry');
    registry.stopModule('sounds');
    registry.startModule('sounds');
  },
};
