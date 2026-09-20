/**
 * ID собеседников на странице личных сообщений (/ls).
 *
 * ls.js рисует <a href="cat<ID>"> — ID уже в href, дописываем рядом.
 * Список перерисовывается AJAX'ом → MutationObserver на #main.
 * См. RUNTIME.md §8.6 и research/runtime/ls_page.html.
 */

var SEL_MAIN = '#main';
var SEL_PROFILE = '#main a[href^="cat"]:not([data-cwb-pm-id])';
var SEL_MSG_LOGIN = '#msg_login';

module.exports = {
  id: 'pm-ids',
  title: 'ID в личных сообщениях',
  description: 'Показывает числовой ID рядом с ником в списке и в открытом письме.',
  category: 'info',
  pages: ['pm'],
  enabledByDefault: false,
  order: 42,

  init: function (ctx) {
    function stampLinks() {
      ctx.dom.qsa(SEL_PROFILE).forEach(function (a) {
        var href = a.getAttribute('href') || '';
        var id = href.replace(/^cat/, '');
        if (!/^\d+$/.test(id)) return;
        a.dataset.cwbPmId = id;
        var tag = ctx.dom.el('small', {
          class: 'cwb-pm-id',
          text: '[' + id + ']',
          style: { opacity: '0.65', marginLeft: '4px', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' },
        });
        a.insertAdjacentElement('afterend', tag);
        ctx.addCleanup(function () { if (tag.parentNode) tag.parentNode.removeChild(tag); });
      });

      var msgLogin = ctx.dom.qs(SEL_MSG_LOGIN);
      if (msgLogin && !msgLogin.dataset.cwbPmId) {
        var mid = (msgLogin.getAttribute('href') || '').replace(/^cat/, '');
        if (/^\d+$/.test(mid)) {
          msgLogin.dataset.cwbPmId = mid;
          var mtag = ctx.dom.el('small', {
            class: 'cwb-pm-id',
            text: ' [' + mid + ']',
            style: { opacity: '0.65', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' },
          });
          msgLogin.insertAdjacentElement('afterend', mtag);
          ctx.addCleanup(function () { if (mtag.parentNode) mtag.parentNode.removeChild(mtag); });
        }
      }
    }

    return ctx.dom.waitForElement(SEL_MAIN).then(function (main) {
      if (!main || ctx.isDisposed()) return;
      stampLinks();
      ctx.observe(main, stampLinks, { childList: true, subtree: true });
    });
  },
};
