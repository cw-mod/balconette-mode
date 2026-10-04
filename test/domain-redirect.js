#!/usr/bin/env node
/**
 * Юнит-тесты подмены catwar.net → catwar.su без живой игры и без jsdom.
 */

'use strict';

const path = require('path');
const mod = require(path.join(__dirname, '..', 'src', 'modules', 'domain-redirect.js'));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? ' — ' + detail : ''));
}

console.log('\nРедирект catwar.net (юнит)');

check('https путь', mod.replaceDomain('https://catwar.net/cw3/foo') === 'https://catwar.su/cw3/foo');
check('http путь', mod.replaceDomain('http://catwar.net/cw3/') === 'https://catwar.su/cw3/');
check('protocol-relative', mod.replaceDomain('//catwar.net/pic.png') === 'https://catwar.su/pic.png');
check('уже .su не трогаем', mod.replaceDomain('https://catwar.su/cw3/') === 'https://catwar.su/cw3/');
check('чужой хост не трогаем', mod.replaceDomain('https://example.com/catwar.net') === 'https://example.com/catwar.net');
check('не строка', mod.replaceDomain(null) === null);
check('query и hash',
  mod.replaceDomain('https://catwar.net/cw3/?x=1#y') === 'https://catwar.su/cw3/?x=1#y');

check('redirect https', mod.redirectTarget('https://catwar.net/cw3/') === 'https://catwar.su/cw3/');
check('redirect http', mod.redirectTarget('http://catwar.net/ls') === 'https://catwar.su/ls');
check('redirect .su — null', mod.redirectTarget('https://catwar.su/cw3/') === null);
check('redirect чужой — null', mod.redirectTarget('https://example.com/') === null);
check('redirect www', mod.redirectTarget('https://www.catwar.net/cw3') === 'https://catwar.su/cw3');

check('srcset с дескриптором',
  mod.rewriteSrcset('https://catwar.net/a.png 1x, https://catwar.net/b.png 2x') ===
    'https://catwar.su/a.png 1x, https://catwar.su/b.png 2x');
check('style url',
  /catwar\.su/.test(mod.rewriteText('background:url(https://catwar.net/x.jpg)')) &&
  !/catwar\.net/.test(mod.rewriteText('background:url(https://catwar.net/x.jpg)')));
check('rewriteResource строка',
  mod.rewriteResource('https://catwar.net/api') === 'https://catwar.su/api');
check('rewriteResource чужое',
  mod.rewriteResource('https://catwar.su/api') === 'https://catwar.su/api');

const failed = results.filter((r) => !r.ok);
console.log('\n' + '-'.repeat(60));
console.log(`Итог: ${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) {
  failed.forEach((f) => console.log('  FAIL ' + f.name + (f.detail ? ' — ' + f.detail : '')));
}
console.log('-'.repeat(60));
process.exit(failed.length ? 1 : 0);
