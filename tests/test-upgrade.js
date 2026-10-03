/* New dashboard math, catalog search and cross-page deployment contracts. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../js/upgrade.js');
const root = path.join(__dirname, '..');
assert.equal(ui.quickPayout('-110', 100).profit.toFixed(2), '90.91');
assert.equal(ui.quickPayout('+150', 40).total, 100);
assert.equal(ui.quickPayout('+100', 25).probability, 50);
for (const value of ['0', '99', '-99', '-100', '', 'Infinity', '110.5', '110x']) assert.throws(() => ui.quickPayout(value, 100));
for (const value of [0, -1, '', 'bad', Infinity, 1e12]) assert.throws(() => ui.quickPayout('-110', value));
assert.equal(ui.search('PaRLaY')[0][0], 'Parlay calculator');
assert(ui.search('bankroll kelly').some(x => x[1] === 'tools.html#kelly'));
assert.equal(ui.search('<img onerror=alert(1)>').length, 0);
assert.equal(ui.search('there-is-no-such-tool').length, 0);
assert.equal(ui.search('').length, ui.catalog.length);
for (const entry of ui.catalog) {
  const [file, hash] = entry[1].split('#');
  assert(fs.existsSync(path.join(root, file)), `Catalog page exists: ${file}`);
  if (hash) assert(fs.readFileSync(path.join(root, file), 'utf8').includes(`id="${hash}"`), `Anchor exists: ${entry[1]}`);
}
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(home.includes('failedFeeds === HS.LEAGUES.length'), 'Feed outages stay distinct from valid empty schedules');
assert(home.includes('if(document.hidden) return;'), 'Hidden homepage pauses refresh');
assert(home.includes('GIU.safeURL(a.links'), 'Home news URLs are validated');
console.log('Dashboard: math, invalid inputs, search, real catalog targets and feed-state checks passed.');
