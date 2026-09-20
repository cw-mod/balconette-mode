/**
 * Автопрокрутка истории.
 *
 * История — #ist внутри #history_block. В обычном режиме прокручивается сама
 * страница, в compact — #history_block (у него overflow-y:auto). Поэтому цель
 * прокрутки ищем динамически: ближайший прокручиваемый предок #ist.
 *
 * Текст истории дописывается строкой в cat.history, Vue перерисовывает #ist —
 * ловим это MutationObserver-ом на контейнере (childList + characterData),
 * дублируя более надёжным $watch по стейту, если Vue доступен.
 */

var dom = require('core/dom');

module.exports = {
  id: 'history-autoscroll',
  title: 'Автопрокрутка истории',
  description: 'Держит блок истории (#ist) прокрученным к последней записи.',
  category: 'info',
  pages: ['game'],
  enabledByDefault: false,
  order: 10,

  defaults: {
    respectUserScroll: true,
    threshold: 60,
    smooth: false,
  },

  schema: [
    {
      key: 'respectUserScroll',
      type: 'boolean',
      label: 'Не мешать, если прокрутил вверх',
      hint: 'Автопрокрутка возобновится, как только вернётесь к низу списка.',
    },
    { key: 'threshold', type: 'number', label: 'Зона «у низа», px', min: 0, max: 600, step: 10 },
    { key: 'smooth', type: 'boolean', label: 'Плавная прокрутка' },
  ],

  init: function (ctx) {
    var target = null;   // прокручиваемый контейнер
    var ist = null;
    var stick = true;    // пользователь «прилип» к низу
    var offScroll = null;
    var offObserve = null;

    function atBottom(el) {
      var gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      return gap <= Math.max(0, Number(ctx.settings.get('threshold')) || 0);
    }

    function scrollToBottom() {
      if (!target) return;
      if (ctx.settings.get('respectUserScroll') && !stick) return;
      var top = target.scrollHeight;
      if (ctx.settings.get('smooth') && typeof target.scrollTo === 'function') {
        target.scrollTo({ top: top, behavior: 'smooth' });
      } else {
        target.scrollTop = top;
      }
    }

    function bindScrollTarget() {
      if (offScroll) { offScroll(); offScroll = null; }
      target = dom.scrollParent(ist);
      // scrollParent может вернуть documentElement — слушать надо тогда window.
      var listenOn = (target === document.documentElement || target === document.body ||
        target === document.scrollingElement) ? window : target;
      stick = true;
      offScroll = ctx.addCleanup(dom.on(listenOn, 'scroll', function () {
        if (!target) return;
        stick = atBottom(target === document.scrollingElement ? document.scrollingElement : target);
      }, { passive: true }));
    }

    function attach(node) {
      ist = node;
      bindScrollTarget();
      if (offObserve) offObserve();
      offObserve = ctx.observe(ist, function () {
        // Если Vue пересоздал #ist, перецепляемся.
        if (!document.contains(ist)) { rediscover(); return; }
        scrollToBottom();
      }, { childList: true, subtree: true, characterData: true });
      scrollToBottom();
      ctx.log.debug('история найдена, цель прокрутки:', target && target.id);
    }

    function rediscover() {
      if (ctx.isDisposed()) return;
      dom.waitForElement('#ist', { timeout: 20000 }).then(function (node) {
        if (!node || ctx.isDisposed()) return;
        attach(node);
      });
    }

    rediscover();

    // Дублирующий сигнал из стейта: история в игре — одна растущая строка.
    ctx.watch('cat.history', function () {
      // Ждём, пока Vue домалюет DOM.
      requestAnimationFrame(scrollToBottom);
    });
  },
};
