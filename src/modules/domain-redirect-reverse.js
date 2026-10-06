/**
 * Редирект и подмена catwar.su → catwar.net.
 */

var createRedirectModule;
try {
  // В бандле имена модулей вида 'modules/<id>'.
  createRedirectModule = require('modules/domain-redirect').createRedirectModule;
} catch (e) {
  // В чистом Node (юнит-тесты) работает только относительный путь.
  createRedirectModule = require('./domain-redirect').createRedirectModule;
}

var mod = createRedirectModule({
  id: 'domain-redirect-reverse',
  title: 'Редирект catwar.su → .net',
  description: 'Кидает с catwar.su на catwar.net и чинит ссылки, картинки и запросы.',
  category: 'misc',
  pages: ['*'],
  early: true,
  enabledByDefault: false,
  order: 6,
  compat: 'new',

  fromPrefixes: ['https://catwar.su', 'http://catwar.su', '//catwar.su'],
  toOrigin: 'https://catwar.net',
  hostRe: /(^|\.)catwar\.su$/i,

  defaults: {
    redirectPage: true,
    rewriteDom: true,
    interceptNetwork: true,
  },

  schema: [],
});

var origInit = mod.init;
mod.init = function (ctx) {
  var registry;
  try { registry = require('core/registry'); } catch (e) {}
  if (registry && typeof registry.isEnabled === 'function' && registry.isEnabled('domain-redirect')) {
    ctx.log.warn('domain-redirect-reverse не применён: domain-redirect уже включён.');
    return;
  }
  origInit(ctx);
};

module.exports = mod;
