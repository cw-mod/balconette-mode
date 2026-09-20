/**
 * Простой проигрыватель коротких звуков через Web Audio API.
 * Без внешних файлов — синтез или data-URI не нужны, всё генерируется on-the-fly.
 */

var log = require('core/log').create('audio');

var sharedCtx = null;

function getCtx() {
  if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    sharedCtx = new Ctx();
    return sharedCtx;
  } catch (e) {
    log.warn('Web Audio недоступен', e);
    return null;
  }
}

/** Разблокировка автоплей-политики после первого жеста пользователя. */
function unlock() {
  var ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(function () { /* noop */ });
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });
}

/**
 * Короткий синтезированный сигнал.
 * @param {string} kind — тип события (pm, mention, action, alert, ping)
 * @param {number} volume — 0..1
 */
function play(kind, volume) {
  var ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(function () { /* noop */ });

  var vol = Math.max(0, Math.min(1, Number(volume) || 0.3));
  if (vol <= 0) return;

  var presets = {
    pm: { freq: 880, dur: 0.12, type: 'sine', attack: 0.01 },
    mention: { freq: 660, dur: 0.15, type: 'triangle', attack: 0.01 },
    chat: { freq: 520, dur: 0.08, type: 'sine', attack: 0.005 },
    action: { freq: 440, dur: 0.18, type: 'sine', attack: 0.02 },
    alert: { freq: 220, dur: 0.25, type: 'square', attack: 0.01 },
    ping: { freq: 990, dur: 0.06, type: 'sine', attack: 0.005 },
    map: { freq: 330, dur: 0.14, type: 'triangle', attack: 0.01 },
  };
  var p = presets[kind] || presets.ping;

  try {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.freq, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + (p.attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + p.dur + 0.02);
  } catch (e) {
    log.warn('не удалось проиграть', kind, e);
  }
}

module.exports = {
  play: play,
  unlock: unlock,
};
