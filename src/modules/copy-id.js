/**
 * Копирование ID кота или предмета.
 *
 * Важно: клик по иконке предмета/кота во рту открывает игровое меню (#thdey).
 * Перехватывать его нельзя — именно так ломалось меню. Копируем только
 * со строки «Уникальный ID» и с наших подписей, либо с ссылки /catN без
 * блокировки перехода.
 */

var dom = require('core/dom');

var TOAST_ID = 'cwb-copy-toast';

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(String(text));
  }
  return new Promise(function (resolve, reject) {
    try {
      var ta = document.createElement('textarea');
      ta.value = String(text);
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      resolve();
    } catch (e) { reject(e); }
  });
}

function parseId(text) {
  var m = /(\d{3,})/.exec(String(text || ''));
  return m ? m[1] : null;
}

module.exports = {
  id: 'copy-id',
  title: 'Копирование ID',
  description: 'Клик по строке «Уникальный ID» в меню предмета или по подписи ID копирует число. По иконке предмета меню не ломается.',
  category: 'info',
  pages: ['game', 'pm', 'profile'],
  enabledByDefault: false,
  order: 44,

  defaults: {
    requireAlt: false,
  },

  schema: [
    {
      key: 'requireAlt',
      type: 'boolean',
      label: 'Только с зажатым Alt',
      hint: 'Без галочки копируется обычным кликом по строке ID, не по иконке.',
    },
  ],

  styles: function () {
    return [
      '#' + TOAST_ID + '{position:fixed;z-index:2147483000;bottom:24px;left:50%;transform:translateX(-50%);',
      'padding:6px 14px;border-radius:8px;background:rgba(20,18,15,.9);color:#f3e7d3;',
      'font:13px/1.3 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;',
      'box-shadow:0 2px 10px rgba(0,0,0,.35);transition:opacity .2s;}',
    ].join('');
  },

  init: function (ctx) {
    var toastTimer = null;

    function flash(msg) {
      var node = document.getElementById(TOAST_ID);
      if (!node) {
        node = dom.el('div', { id: TOAST_ID });
        ctx.mount(node);
      }
      node.textContent = msg;
      node.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = ctx.timeout(function () { node.style.opacity = '0'; }, 1400);
    }

    function copyId(id) {
      if (!id || !/^\d+$/.test(String(id))) return false;
      copyText(id).then(function () {
        flash('Скопировано: ' + id);
      }).catch(function () {
        flash('Не удалось скопировать');
      });
      return true;
    }

    function onClick(e) {
      if (ctx.settings.get('requireAlt') && !e.altKey) return;

      // Иконка предмета/кота и чекбокс выбора — игровое меню. Не трогаем.
      if (e.target.closest && e.target.closest('#itemList .itemInMouth, #itemList .catrot, #itemList .item-select, #thdey a, #ctdey a')) {
        return;
      }

      // Строка «Уникальный ID: 72517354» в меню предмета
      var thLi = e.target.closest && e.target.closest('#thdey li');
      if (thLi && /Уникальный ID/i.test(thLi.textContent || '')) {
        var id = parseId(thLi.textContent);
        if (!id) {
          var list = ctx.vue.get('item.list');
          if (Array.isArray(list)) {
            list.forEach(function (it) { if (it && it.isActive) id = String(it.id); });
          }
        }
        if (copyId(id)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Ссылка на профиль: копируем, но переход не блокируем
      var a = e.target.closest && e.target.closest('a[href*="cat"]');
      if (a && !(a.closest && a.closest('#thdey, #ctdey, #itemList'))) {
        var href = a.getAttribute('href') || '';
        var match = /(?:^|\/)cat(\d+)/.exec(href);
        if (match) copyId(match[1]);
      }
    }

    ctx.on(document, 'click', onClick, true);
  },
};
