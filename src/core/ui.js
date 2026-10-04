/**
 * Панель настроек.
 *
 * Жёсткие правила:
 *  - монтируемся ТОЛЬКО в отдельный контейнер #cwb-root в конце <body>,
 *    никогда внутрь #app / #main_table / игровых блоков;
 *  - все классы и id начинаются с `cwb-`;
 *  - панель гасит события клавиатуры внутри себя (capture + stopPropagation),
 *    чтобы игровые горячие клавиши (js/key.js слушает document) не срабатывали,
 *    пока пользователь печатает в наших полях.
 */

var dom = require('core/dom');
var log = require('core/log').create('ui');
var registry = require('core/registry');
var storage = require('core/storage');
var config = require('core/config');
var uwu = require('core/uwu');
var meta = require('cwb:meta');

var ROOT_ID = 'cwb-root';
var STYLE_ID = 'core-ui';

var TABS = [
  { id: 'new', title: 'Новые', hint: 'Модули, которых нет в CatWar UwU' },
  { id: 'overlay', title: 'Надстройки над UwU', hint: 'Наши штуки поверх / вместо аналогов UwU' },
];

var state = {
  root: null,
  gear: null,
  overlay: null,
  listEl: null,
  searchEl: null,
  tabsEl: null,
  noteEl: null,
  query: '',
  tab: 'new',
  open: false,
  offRegistry: null,
  offKeys: [],
  keeper: null,
  menuBound: false,
};

/* ---------------------------------- стили ---------------------------------- */

function css() {
  return [
    '#cwb-root{position:static;pointer-events:none;',
    'font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1c1c1e;}',
    '#cwb-root *{box-sizing:border-box;}',

    '.cwb-gear{position:fixed;z-index:2147483647;pointer-events:auto;',
    'min-width:44px;height:36px;padding:0 10px;border-radius:18px 0 0 18px;',
    'border:1px solid #3d3224;cursor:pointer;background:#e8c27a;color:#2a1f12;',
    'font:600 13px/34px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;',
    'box-shadow:0 2px 12px rgba(0,0,0,.45);opacity:1;transition:transform .15s,filter .15s;}',
    '.cwb-gear:hover{filter:brightness(1.08);}',
    '.cwb-gear[hidden]{display:none;}',
    '.cwb-gear.cwb-bottom-right,.cwb-gear.cwb-top-right{right:0;border-radius:18px 0 0 18px;}',
    '.cwb-gear.cwb-bottom-left,.cwb-gear.cwb-top-left{left:0;border-radius:0 18px 18px 0;}',
    '.cwb-gear.cwb-bottom-right,.cwb-gear.cwb-bottom-left{bottom:72px;}',
    '.cwb-gear.cwb-top-right,.cwb-gear.cwb-top-left{top:72px;}',

    '.cwb-overlay{position:fixed;inset:0;z-index:2147483646;pointer-events:auto;background:rgba(0,0,0,.45);',
    'display:flex;align-items:center;justify-content:center;padding:24px;}',
    '.cwb-overlay[hidden]{display:none;}',

    '.cwb-modal{width:min(720px,100%);max-height:min(85vh,900px);display:flex;flex-direction:column;',
    'background:#fdfbf7;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.4);overflow:hidden;}',

    '.cwb-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#2f2a24;color:#f3e7d3;flex:0 0 auto;}',
    '.cwb-title{font-weight:600;font-size:15px;white-space:nowrap;}',
    '.cwb-ver{opacity:.55;font-size:12px;}',
    '.cwb-search{flex:1 1 auto;min-width:80px;padding:6px 10px;border-radius:7px;border:1px solid #574f44;',
    'background:#3d372f;color:#f3e7d3;font:inherit;font-size:13px;}',
    '.cwb-search::placeholder{color:#a39684;}',
    '.cwb-x{background:none;border:none;color:#f3e7d3;font-size:22px;line-height:1;cursor:pointer;padding:0 4px;opacity:.7;}',
    '.cwb-x:hover{opacity:1;}',

    '.cwb-body{flex:1 1 auto;overflow-y:auto;padding:8px 14px 14px;}',

    '.cwb-tabs{display:flex;gap:6px;padding:8px 14px 0;background:#fdfbf7;flex:0 0 auto;}',
    '.cwb-tab{flex:1 1 0;min-width:0;padding:7px 10px;border:1px solid #d6cbb8;border-radius:8px;',
    'background:#fff;cursor:pointer;font:inherit;font-size:12.5px;font-weight:600;color:#3d3224;}',
    '.cwb-tab:hover{background:#f0e9db;}',
    '.cwb-tab[aria-selected="true"]{background:#e8c27a;border-color:#e8c27a;color:#2a1f12;}',
    '.cwb-tab-note{padding:6px 14px 0;font-size:11.5px;color:#8a7f70;flex:0 0 auto;}',
    '.cwb-uwu-banner{margin:6px 0 10px;padding:8px 10px;border-radius:8px;background:#f4efe4;',
    'border:1px solid #e6ddcd;font-size:12px;color:#5c5348;}',

    '.cwb-cat{margin-top:14px;}',
    '.cwb-cat:first-child{margin-top:4px;}',
    '.cwb-cat-title{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#8a7f70;',
    'margin:0 0 6px;font-weight:700;}',

    '.cwb-mod{border:1px solid #e6ddcd;border-radius:9px;background:#fff;margin-bottom:7px;overflow:hidden;}',
    '.cwb-mod-head{display:flex;align-items:flex-start;gap:10px;padding:9px 11px;}',
    '.cwb-mod-main{flex:1 1 auto;min-width:0;}',
    '.cwb-mod-name{font-weight:600;font-size:13.5px;}',
    '.cwb-mod-desc{font-size:12px;color:#7d7367;margin-top:2px;}',
    '.cwb-mod-warn{font-size:12px;color:#9a5b00;margin-top:3px;}',

    '.cwb-sw{position:relative;flex:0 0 auto;width:38px;height:22px;cursor:pointer;margin-top:1px;}',
    '.cwb-sw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;}',
    '.cwb-sw span{position:absolute;inset:0;border-radius:11px;background:#cfc6b7;transition:background .15s;pointer-events:none;}',
    '.cwb-sw span::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;',
    'background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s;}',
    '.cwb-sw input:checked + span{background:#6f9a52;}',
    '.cwb-sw input:checked + span::after{transform:translateX(16px);}',

    '.cwb-opts{border-top:1px dashed #e6ddcd;padding:9px 11px;background:#fbf8f2;}',
    '.cwb-opt{display:flex;align-items:center;gap:10px;padding:4px 0;flex-wrap:wrap;}',
    '.cwb-opt-label{flex:1 1 200px;font-size:12.5px;min-width:0;}',
    '.cwb-opt-hint{display:block;font-size:11.5px;color:#8a7f70;margin-top:1px;}',
    '.cwb-opt input[type=text],.cwb-opt input[type=number],.cwb-opt select,.cwb-opt textarea{',
    'padding:4px 7px;border:1px solid #d6cbb8;border-radius:6px;font:inherit;font-size:12.5px;background:#fff;color:inherit;}',
    '.cwb-opt input[type=number]{width:84px;}',
    '.cwb-opt input[type=text]{width:220px;max-width:100%;}',
    '.cwb-opt textarea{width:100%;min-height:80px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;}',
    '.cwb-opt input[type=color]{width:42px;height:26px;padding:1px;border:1px solid #d6cbb8;border-radius:6px;background:#fff;cursor:pointer;}',
    '.cwb-opt input[type=range]{width:150px;}',
    '.cwb-opt-val{font-size:12px;color:#8a7f70;min-width:34px;}',
    '.cwb-opt-full{flex-direction:column;align-items:stretch;}',

    '.cwb-maps-editor{display:flex;flex-direction:column;gap:8px;width:100%;}',
    '.cwb-maps-editor h4{margin:4px 0 0;font-size:12px;}',
    '.cwb-maps-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
    '.cwb-maps-item{display:flex;align-items:center;gap:2px;}',
    '.cwb-maps-item button,.cwb-maps-row>.cwb-btn{min-height:24px;padding:2px 7px;border:1px solid #d6cbb8;',
    'border-radius:6px;background:#fff;cursor:pointer;font:inherit;font-size:12px;color:inherit;}',
    '.cwb-maps-item button.active{background:#e8c27a;border-color:#e8c27a;color:#2a1f12;}',
    '.cwb-maps-item .cwb-maps-ico{min-width:24px;padding:2px 5px;opacity:.8;}',

    '.cwb-foot{flex:0 0 auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;',
    'padding:10px 14px;border-top:1px solid #e6ddcd;background:#f5f0e6;}',
    '.cwb-btn{padding:6px 12px;border:1px solid #d6cbb8;border-radius:7px;background:#fff;cursor:pointer;',
    'font:inherit;font-size:12.5px;color:inherit;}',
    '.cwb-btn:hover{background:#f0e9db;}',
    '.cwb-foot-note{margin-left:auto;font-size:11.5px;color:#8a7f70;}',
    '.cwb-empty{padding:26px 0;text-align:center;color:#8a7f70;font-size:13px;}',

    '.cwb-toast{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);pointer-events:none;',
    'background:#2f2a24;color:#f3e7d3;padding:8px 16px;border-radius:8px;font-size:13px;',
    'box-shadow:0 6px 20px rgba(0,0,0,.35);opacity:0;transition:opacity .2s;}',
    '.cwb-toast.cwb-show{opacity:1;}',
  ].join('');
}

/* -------------------------------- рендеринг -------------------------------- */

function control(schemaItem, current, apply) {
  var type = schemaItem.type || 'text';
  var node;

  if (type === 'boolean') {
    node = dom.el('label', { class: 'cwb-sw' }, [
      dom.el('input', { type: 'checkbox', checked: current ? true : null }),
      dom.el('span'),
    ]);
    node.firstChild.addEventListener('change', function (e) { apply(e.target.checked); });
    return node;
  }

  if (type === 'select') {
    node = dom.el('select');
    (schemaItem.options || []).forEach(function (o) {
      var opt = dom.el('option', { value: String(o.value), text: o.label });
      if (String(o.value) === String(current)) opt.selected = true;
      node.appendChild(opt);
    });
    node.addEventListener('change', function (e) {
      var raw = e.target.value;
      var match = (schemaItem.options || []).filter(function (o) { return String(o.value) === raw; })[0];
      apply(match ? match.value : raw);
    });
    return node;
  }

  if (type === 'number' || type === 'range') {
    node = dom.el('input', {
      type: type === 'range' ? 'range' : 'number',
      value: current === undefined || current === null ? '' : String(current),
      min: schemaItem.min,
      max: schemaItem.max,
      step: schemaItem.step,
    });
    var out = type === 'range' ? dom.el('span', { class: 'cwb-opt-val', text: String(current) }) : null;
    node.addEventListener('input', function (e) {
      var num = parseFloat(e.target.value);
      if (out) out.textContent = e.target.value;
      if (!isNaN(num)) apply(num);
    });
    if (out) {
      var wrap = dom.el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, [node, out]);
      return wrap;
    }
    return node;
  }

  if (type === 'color') {
    node = dom.el('input', { type: 'color', value: current || '#ffffff' });
    node.addEventListener('input', function (e) { apply(e.target.value); });
    return node;
  }

  if (type === 'textarea') {
    node = dom.el('textarea', { placeholder: schemaItem.placeholder || '' });
    node.value = current === undefined || current === null ? '' : String(current);
    node.addEventListener('change', function (e) { apply(e.target.value); });
    return node;
  }

  if (type === 'custom' && typeof schemaItem.render === 'function') {
    return schemaItem.render(current, apply, schemaItem) || document.createTextNode('');
  }

  node = dom.el('input', { type: 'text', value: current === undefined || current === null ? '' : String(current), placeholder: schemaItem.placeholder || '' });
  node.addEventListener('change', function (e) { apply(e.target.value); });
  return node;
}

function optionRow(schemaItem, current, apply) {
  var full = schemaItem.type === 'textarea' || schemaItem.type === 'custom';
  if (schemaItem.type === 'custom') {
    return dom.el('div', { class: 'cwb-opt cwb-opt-full' }, [
      schemaItem.label || schemaItem.hint
        ? dom.el('label', { class: 'cwb-opt-label' }, [
          schemaItem.label ? document.createTextNode(schemaItem.label) : null,
          schemaItem.hint ? dom.el('span', { class: 'cwb-opt-hint', text: schemaItem.hint }) : null,
        ])
        : null,
      control(schemaItem, current, apply),
    ]);
  }
  return dom.el('div', { class: 'cwb-opt' + (full ? ' cwb-opt-full' : '') }, [
    dom.el('label', { class: 'cwb-opt-label' }, [
      document.createTextNode(schemaItem.label || schemaItem.key),
      schemaItem.hint ? dom.el('span', { class: 'cwb-opt-hint', text: schemaItem.hint }) : null,
    ]),
    control(schemaItem, current, apply),
  ]);
}

function moduleCard(mod) {
  var settings = registry.settingsOf(mod.id);
  var enabled = registry.isEnabled(mod.id);
  var hasOpts = (mod.schema || []).length > 0;

  var opts = null;
  if (hasOpts) {
    opts = dom.el('div', { class: 'cwb-opts' });
    mod.schema.forEach(function (item) {
      opts.appendChild(optionRow(item, settings[item.key], function (value) {
        registry.setSetting(mod.id, item.key, value);
      }));
    });
    opts.appendChild(dom.el('div', { class: 'cwb-opt' }, [
      dom.el('button', {
        class: 'cwb-btn',
        type: 'button',
        text: 'Сбросить настройки модуля',
        onclick: function () { registry.resetSettings(mod.id); render(); },
      }),
    ]));
  }

  var sw = dom.el('label', { class: 'cwb-sw' }, [
    dom.el('input', { type: 'checkbox', checked: enabled ? true : null }),
    dom.el('span'),
  ]);
  sw.firstChild.addEventListener('change', function (e) {
    registry.setEnabled(mod.id, e.target.checked);
  });

  return dom.el('div', { class: 'cwb-mod', 'data-cwb-mod': mod.id }, [
    dom.el('div', { class: 'cwb-mod-head' }, [
      dom.el('div', { class: 'cwb-mod-main' }, [
        dom.el('div', { class: 'cwb-mod-name', text: mod.title }),
        mod.description ? dom.el('div', { class: 'cwb-mod-desc', text: mod.description }) : null,
        compatHint(mod),
        mod.warning ? dom.el('div', { class: 'cwb-mod-warn', text: '⚠ ' + mod.warning }) : null,
      ]),
      sw,
    ]),
    opts,
  ]);
}

function coreCard() {
  var current = config.all();
  var opts = dom.el('div', { class: 'cwb-opts' });
  config.SCHEMA.forEach(function (item) {
    opts.appendChild(optionRow(item, current[item.key], function (value) {
      config.set(item.key, value);
      applyCoreSettings();
    }));
  });

  return dom.el('div', { class: 'cwb-mod', 'data-cwb-mod': '__core' }, [
    dom.el('div', { class: 'cwb-mod-head' }, [
      dom.el('div', { class: 'cwb-mod-main' }, [
        dom.el('div', { class: 'cwb-mod-name', text: 'Ядро' }),
        dom.el('div', { class: 'cwb-mod-desc', text: 'Общие настройки скрипта: кнопка панели, логи, хук сокета.' }),
      ]),
    ]),
    opts,
  ]);
}

function compatHint(mod) {
  if (uwu.tabOf(mod) !== 'overlay') return null;
  var text = uwu.hintFor(mod.id);
  if (!text) return null;
  return dom.el('div', { class: 'cwb-mod-desc', text: text });
}

function matchesQuery(mod, query) {
  if (!query) return true;
  var hay = (mod.title + ' ' + mod.description + ' ' + mod.id).toLowerCase();
  return hay.indexOf(query) >= 0;
}

function matchesTab(mod, tab) {
  return uwu.tabOf(mod) === tab;
}

function currentTabMeta() {
  for (var i = 0; i < TABS.length; i++) {
    if (TABS[i].id === state.tab) return TABS[i];
  }
  return TABS[0];
}

function paintTabs() {
  if (!state.tabsEl) return;
  state.tabsEl.querySelectorAll('.cwb-tab').forEach(function (btn) {
    var on = btn.getAttribute('data-cwb-tab') === state.tab;
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (state.noteEl) {
    var metaTab = currentTabMeta();
    var note = metaTab.hint;
    if (state.tab === 'overlay') {
      if (uwu.present()) {
        note = 'UwU найден (' + uwu.sourceLabel() + '). Читаем их localStorage, ничего туда не пишем.';
      } else {
        note = metaTab.hint + '. UwU на странице не найден — модули работают сами.';
      }
    }
    state.noteEl.textContent = note;
  }
}

/** Чтобы input не терял фокус при registry.onChange → render(). */
function captureFocusHint() {
  var el = document.activeElement;
  if (!el || !state.listEl || !state.listEl.contains(el)) return null;
  var modEl = el.closest ? el.closest('[data-cwb-mod]') : null;
  if (!modEl) return null;
  var opts = modEl.querySelector('.cwb-opts');
  if (!opts || !opts.contains(el)) return null;
  var rows = opts.querySelectorAll('.cwb-opt');
  var rowIndex = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].contains(el)) { rowIndex = i; break; }
  }
  if (rowIndex < 0) return null;
  return {
    modId: modEl.getAttribute('data-cwb-mod'),
    rowIndex: rowIndex,
    selStart: typeof el.selectionStart === 'number' ? el.selectionStart : null,
    selEnd: typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
  };
}

function restoreFocusHint(hint) {
  if (!hint || !state.listEl) return;
  var modEl = state.listEl.querySelector('[data-cwb-mod="' + hint.modId + '"]');
  if (!modEl) return;
  var opts = modEl.querySelector('.cwb-opts');
  if (!opts) return;
  var row = opts.querySelectorAll('.cwb-opt')[hint.rowIndex];
  if (!row) return;
  var input = row.querySelector('input, select, textarea');
  if (!input) return;
  input.focus();
  if (hint.selStart != null && typeof input.setSelectionRange === 'function') {
    try { input.setSelectionRange(hint.selStart, hint.selEnd); } catch (e) { /* noop */ }
  }
}

function render() {
  if (!state.listEl) return;
  var focusHint = captureFocusHint();
  var query = state.query.trim().toLowerCase();
  state.listEl.textContent = '';
  paintTabs();

  if (!query && state.tab === 'new') state.listEl.appendChild(coreCard());
  if (!query && state.tab === 'overlay') {
    state.listEl.appendChild(dom.el('div', {
      class: 'cwb-uwu-banner',
      text: uwu.present()
        ? 'CatWar UwU рядом: дубли CSS/заголовка/дробей пропускаем, если они уже включены у них. Карты ЛУ можно импортировать в «Поле для ЛУ».'
        : 'CatWar UwU не найден. Надстройки работают сами; при совместном запуске часть правил не будет дублироваться.',
    }));
  }

  var shown = 0;
  registry.CATEGORIES.forEach(function (cat) {
    var mods = registry.list().filter(function (m) {
      if (m.category !== cat.id || !matchesQuery(m, query)) return false;
      return query ? true : matchesTab(m, state.tab);
    });
    if (!mods.length) return;
    shown += mods.length;
    var block = dom.el('section', { class: 'cwb-cat' }, [
      dom.el('h3', { class: 'cwb-cat-title', text: cat.title }),
    ]);
    mods.forEach(function (m) { block.appendChild(moduleCard(m)); });
    state.listEl.appendChild(block);
  });

  if (!shown && query) {
    state.listEl.appendChild(dom.el('div', { class: 'cwb-empty', text: 'Ничего не найдено' }));
  }

  restoreFocusHint(focusHint);
}

/* --------------------------------- поведение ------------------------------- */

function toast(text) {
  if (!state.root) return;
  var node = dom.el('div', { class: 'cwb-toast', text: text });
  state.root.appendChild(node);
  requestAnimationFrame(function () { node.classList.add('cwb-show'); });
  setTimeout(function () {
    node.classList.remove('cwb-show');
    setTimeout(function () { if (node.parentNode) node.remove(); }, 250);
  }, 2200);
}

function open() {
  if (!state.overlay) return;
  render();
  state.overlay.hidden = false;
  state.open = true;
  if (state.searchEl) state.searchEl.focus();
}

function close() {
  if (!state.overlay) return;
  state.overlay.hidden = true;
  state.open = false;
}

function toggle() {
  if (state.open) close(); else open();
}

function applyCoreSettings() {
  var cfg = config.all();
  if (state.gear) {
    state.gear.className = 'cwb-gear cwb-' + cfg.gearCorner;
    state.gear.hidden = !!cfg.gearHidden;
  }
  require('core/log').setLevel(cfg.logLevel);
}

/** Гасим клавиатуру внутри панели, чтобы не срабатывали хоткеи игры. */
function isolateKeyboard(node) {
  ['keydown', 'keyup', 'keypress'].forEach(function (type) {
    state.offKeys.push(dom.on(node, type, function (e) { e.stopPropagation(); }, true));
  });
}

function mount() {
  if (document.getElementById(ROOT_ID)) return;
  if (!document.body) return;

  dom.injectStyle(STYLE_ID, css());

  var root = dom.el('div', { id: ROOT_ID });

  var gear = dom.el('button', {
    class: 'cwb-gear cwb-bottom-right',
    type: 'button',
    title: 'CatWar Balconette — настройки',
    'aria-label': 'Настройки CatWar Balconette',
    text: '⚙ моды',
    onclick: toggle,
  });

  var search = dom.el('input', { class: 'cwb-search', type: 'search', placeholder: 'Поиск по модулям…' });
  search.addEventListener('input', function (e) { state.query = e.target.value; render(); });

  var tabs = dom.el('div', { class: 'cwb-tabs', role: 'tablist' });
  TABS.forEach(function (tab) {
    var btn = dom.el('button', {
      class: 'cwb-tab',
      type: 'button',
      role: 'tab',
      'data-cwb-tab': tab.id,
      'aria-selected': tab.id === state.tab ? 'true' : 'false',
      text: tab.title,
    });
    btn.addEventListener('click', function () {
      if (state.tab === tab.id) return;
      state.tab = tab.id;
      render();
    });
    tabs.appendChild(btn);
  });
  var tabNote = dom.el('div', { class: 'cwb-tab-note' });

  var list = dom.el('div', { class: 'cwb-body' });

  var modal = dom.el('div', { class: 'cwb-modal' }, [
    dom.el('div', { class: 'cwb-head' }, [
      dom.el('div', { class: 'cwb-title', text: 'CatWar Balconette' }),
      dom.el('div', { class: 'cwb-ver', text: 'v' + meta.version }),
      search,
      dom.el('button', { class: 'cwb-x', type: 'button', title: 'Закрыть', text: '×', onclick: close }),
    ]),
    tabs,
    tabNote,
    list,
    dom.el('div', { class: 'cwb-foot' }, [
      dom.el('button', {
        class: 'cwb-btn', type: 'button', text: 'Экспорт настроек',
        onclick: function () {
          try { storage.exportToFile(); toast('Файл настроек сохранён'); }
          catch (e) { log.error(e); toast('Не удалось выгрузить настройки'); }
        },
      }),
      dom.el('button', {
        class: 'cwb-btn', type: 'button', text: 'Импорт настроек',
        onclick: function () {
          storage.importFromFile().then(function (count) {
            if (!count) return;
            toast('Импортировано ключей: ' + count + '. Перезагрузите страницу.');
            render();
          }).catch(function (e) {
            log.error(e);
            toast('Файл не подошёл: ' + e.message);
          });
        },
      }),
      dom.el('div', { class: 'cwb-foot-note', text: 'Хранилище: ' + storage.backend }),
    ]),
  ]);

  var overlay = dom.el('div', { class: 'cwb-overlay', hidden: true }, [modal]);
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });

  root.appendChild(gear);
  root.appendChild(overlay);
  document.body.appendChild(root);

  state.root = root;
  state.gear = gear;
  state.overlay = overlay;
  state.listEl = list;
  state.searchEl = search;
  state.tabsEl = tabs;
  state.noteEl = tabNote;

  isolateKeyboard(root);

  // Esc закрывает панель; хоткей открытия — Ctrl+Alt+B.
  state.offKeys.push(dom.on(document, 'keydown', function (e) {
    if (state.open && e.key === 'Escape') { close(); e.stopPropagation(); return; }
    if (!config.get('hotkey')) return;
    if (e.ctrlKey && e.altKey && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  }, true));

  // Панель живёт рядом с реестром: любое изменение — перерисовка.
  state.offRegistry = registry.onChange(function () { if (state.open) render(); });
  config.onChange(applyCoreSettings);

  applyCoreSettings();
  keepAlive();
  registerMenuCommand();
  log.info('панель настроек смонтирована');
}

/** Если игра выкинет наш узел из body — вернём его. */
function keepAlive() {
  if (state.keeper) return;
  var target = document.documentElement || document.body;
  if (!target) return;
  state.keeper = new MutationObserver(function () {
    if (state.root && document.body && !document.body.contains(state.root)) {
      document.body.appendChild(state.root);
    }
  });
  try {
    state.keeper.observe(target, { childList: true, subtree: true });
  } catch (e) {
    state.keeper = null;
  }
}

function registerMenuCommand() {
  if (state.menuBound) return;
  if (typeof GM_registerMenuCommand !== 'function') return;
  try {
    GM_registerMenuCommand('CatWar Balconette: настройки', function () { open(); });
    state.menuBound = true;
  } catch (e) { /* меню TM недоступно */ }
}

function unmount() {
  state.offKeys.forEach(function (off) { off(); });
  state.offKeys = [];
  if (state.offRegistry) state.offRegistry();
  if (state.keeper) {
    try { state.keeper.disconnect(); } catch (e) { /* noop */ }
    state.keeper = null;
  }
  if (state.root && state.root.parentNode) state.root.remove();
  dom.removeStyle(STYLE_ID);
  state.root = state.gear = state.overlay = state.listEl = state.searchEl = null;
  state.tabsEl = state.noteEl = null;
  state.open = false;
}

module.exports = {
  ROOT_ID: ROOT_ID,
  mount: mount,
  unmount: unmount,
  open: open,
  close: close,
  toggle: toggle,
  render: render,
  toast: toast,
  TABS: TABS,
};
