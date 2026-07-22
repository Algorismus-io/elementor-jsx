/**
 * Interactions (motion) + popups — the last catalog column. Envelope shapes are LIVE-PROBED
 * facts (4.1.4): animation.$$type must be 'animation-preset-props' (NOT 'animation-preset' —
 * the wrong type gets interactions silently stripped to [] on save); items wrap in
 * {$$type:'interaction-item'}; timing values are ms size envelopes; max 5 per element.
 * Popup display meta: trigger groups decode to PHP ['yes','delay'=>n] → JSON {"0":"yes","delay":n}.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { interaction, interact, heading, col, P0 } from '../../../.claude/skills/elementor-ultra/lib/kit.mjs';
import { h, render } from '../../src/runtime.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { resetIds, allNodes } from '../helpers.mjs';

beforeEach(() => resetIds());

test('interaction: validator-exact envelope — interaction-item wrapper, animation-preset-props, ms timing', () => {
  const ix = interaction({ trigger: 'load', effect: 'fade', type: 'in', duration: 600, delay: 0 });
  assert.equal(ix.$$type, 'interaction-item');
  const v = ix.value;
  assert.equal(v.trigger.value, 'load');
  assert.equal(v.animation.$$type, 'animation-preset-props', 'THE fact: preset-props, not preset (wrong type = silent strip)');
  const a = v.animation.value;
  assert.equal(a.effect.value, 'fade');
  assert.equal(a.type.value, 'in');
  assert.equal(a.direction.value, '');
  assert.deepEqual(a.timing_config.value.duration, { $$type: 'size', value: { unit: 'ms', size: 600 } });
  assert.match(v.interaction_id.value, /^ix-/);
});

test('interaction: enums guarded; easing/replay ride in animation-config', () => {
  assert.throws(() => interaction({ trigger: 'blur' }), /enum is load\|scrollIn/);
  assert.throws(() => interaction({ effect: 'bounce' }), /enum is fade\|slide\|scale/);
  const ix = interaction({ trigger: 'scrollIn', effect: 'slide', direction: 'left', easing: 'easeOut', replay: true });
  const cfg = ix.value.animation.value.config;
  assert.equal(cfg.$$type, 'animation-config');
  assert.equal(cfg.value.easing.value, 'easeOut');
  assert.equal(cfg.value.replay.value, true);
});

test('interact: attaches {version:1, items} to the node, accumulates, caps at 5 (sanitizer limit)', () => {
  const n = heading('h2', 'X');
  interact(n, { effect: 'fade' });
  interact(n, [{ effect: 'slide', trigger: 'scrollIn', direction: 'top' }]);
  assert.equal(n.interactions.version, 1);
  assert.equal(n.interactions.items.length, 2);
  assert.throws(() => interact(n, [{}, {}, {}, {}]), /caps at 5/);
});

test('runtime: animate prop on every intrinsic kind (box/heading/text/img)', () => {
  const b = render(h('box', { pad: 0, animate: { effect: 'fade' } }));
  const hd = render(h('h2', { animate: [{ effect: 'slide', trigger: 'scrollIn', direction: 'left' }, { effect: 'fade' }] }, 'T'));
  const tx = render(h('text', { animate: { effect: 'scale', type: 'in' } }, 'p'));
  const im = render(h('img', { src: 5, animate: { effect: 'fade' } }));
  for (const [n, count] of [[b, 1], [hd, 2], [tx, 1], [im, 1]]) {
    assert.equal(n.interactions.items.length, count);
    assert.equal(n.interactions.items[0].$$type, 'interaction-item');
  }
  assert.equal(render(h('h2', {}, 'no-fx')).interactions, undefined, 'no phantom interactions');
});

test('compile: interactions SURVIVE normalizeIds + class extraction (top-level node key untouched)', () => {
  const site = defineSite({ name: 'mx', pages: [{ title: 'p', slug: 'p', node: h('box', { pad: 0 }, h('h2', { size: 30, animate: { effect: 'fade' } }, 'Animated')) }] });
  const b = compileSite(site);
  const withFx = allNodes(b.pages[0].elements).filter((n) => n.interactions?.items?.length);
  assert.equal(withFx.length, 1, 'interactions survived the pipeline');
  assert.equal(withFx[0].interactions.items[0].value.animation.$$type, 'animation-preset-props');
});

/* ── popup part ── */
test('popup part: compiles with display sugar → PHP-shape trigger groups ({"0":"yes",...})', () => {
  const site = defineSite({
    name: 'pp',
    pages: [{ title: 'p', slug: 'p', node: h('text', {}, 'x') }],
    parts: { popup: { node: h('box', { pad: 24 }, h('h3', {}, 'Offer!')), display: { pageLoad: 2 } } },
  });
  const b = compileSite(site);
  const popup = b.parts.find((p) => p.type === 'popup');
  assert.ok(popup, 'popup part compiled');
  assert.deepEqual(popup.conditions, ['include/general']);
  assert.deepEqual(popup.display.triggers.page_load, { 0: 'yes', delay: 2 }, 'mixed-key PHP shape');
  assert.deepEqual(popup.display.timing, []);
});

test('archive + error404 parts: types + default conditions', () => {
  const b = compileSite(defineSite({
    name: 'th',
    pages: [{ title: 'p', slug: 'p', node: h('text', {}, 'x') }],
    parts: {
      archive: { node: h('box', { pad: 0 }, h('h1', {}, 'Archive')) },
      error404: { node: h('box', { pad: 0 }, h('h1', {}, 'Lost')) },
    },
  }));
  const types = Object.fromEntries(b.parts.map((p) => [p.type, p.conditions]));
  assert.deepEqual(types['archive'], ['include/archive']);
  assert.deepEqual(types['error-404'], ['include/general']);
});

test('popup part: default display = page_load immediate; scroll + exit-intent sugar; canonical passthrough', () => {
  const mk = (display) => compileSite(defineSite({ name: 'pp', pages: [{ title: 'p', slug: 'p', node: h('text', {}, 'x') }], parts: { popup: { node: h('box', { pad: 0 }), display } } })).parts[0].display;
  assert.deepEqual(mk(undefined).triggers, { page_load: { 0: 'yes', delay: 0 } });
  assert.deepEqual(mk({ scrollPercent: 40 }).triggers.scrolling, { 0: 'yes', direction: 'down', offset: 40 });
  assert.deepEqual(mk({ exitIntent: true }).triggers.exit_intent, { 0: 'yes' });
  const canonical = { triggers: { page_load: { 0: 'yes', delay: 9 } }, timing: [] };
  assert.deepEqual(mk(canonical), canonical, 'canonical shape passes through untouched');
});
