/**
 * Interactions (motion) + popups — the last catalog column. Envelope shapes are LIVE-PROBED
 * facts (4.1.4): animation.$$type must be 'animation-preset-props' (NOT 'animation-preset' —
 * the wrong type gets interactions silently stripped to [] on save); items wrap in
 * {$$type:'interaction-item'}; timing values are ms size envelopes; max 5 per element.
 * Popup display meta: trigger groups decode to PHP ['yes','delay'=>n] → JSON {"0":"yes","delay":n}.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { interaction, interact, heading, col, P0 } from '../../src/kit/kit.mjs';
import { h, render } from '../../src/runtime.mjs';
import { compileSite, MOTION_GUARD_SNIPPET } from '../../src/compile.mjs';
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

test('interaction: enums guarded; easing/replay ride in config-v2 (Animation_Config_Prop_Type::get_key)', () => {
  assert.throws(() => interaction({ trigger: 'blur' }), /enum is load\|scrollIn/);
  assert.throws(() => interaction({ effect: 'bounce' }), /enum is fade\|slide\|scale/);
  assert.throws(() => interaction({ type: 'inout' }), /enum is in\|out/);
  assert.throws(() => interaction({ direction: 'up' }), /direction "up"/);
  assert.throws(() => interaction({ repeat: 'forever' }), /enum is loop\|times/);
  assert.throws(() => interaction({ duration: -1 }), /non-negative ms/);
  assert.throws(() => interaction({ delay: 'fast' }), /non-negative ms/);
  const ix = interaction({ trigger: 'scrollIn', effect: 'slide', direction: 'left', easing: 'easeOut', replay: true });
  const cfg = ix.value.animation.value.config;
  assert.equal(cfg.$$type, 'config-v2', "SPEC 1.8 fix: was 'animation-config' — canonical key is config-v2");
  assert.equal(cfg.value.easing.value, 'easeOut');
  assert.equal(cfg.value.replay.value, true);
});

test('interaction: default trigger is scrollIn (NEVER scrollOut — free 4.2.1 crash bug), no phantom config', () => {
  const ix = interaction();
  assert.equal(ix.value.trigger.value, 'scrollIn');
  assert.equal(ix.value.animation.value.config, undefined, 'no config envelope unless a config field is set');
  assert.equal(ix.value.breakpoints, undefined, 'no breakpoints envelope unless excludeOn is set');
});

test('interaction: pro config fields — relativeTo/repeat/times/start/end envelope-exact in config-v2', () => {
  const ix = interaction({ trigger: 'scrollOn', relativeTo: 'viewport', repeat: 'times', times: 3, start: 85, end: 15 });
  const cfg = ix.value.animation.value.config;
  assert.equal(cfg.$$type, 'config-v2');
  assert.equal(cfg.value.relativeTo.value, 'viewport');
  assert.equal(cfg.value.repeat.value, 'times');
  assert.deepEqual(cfg.value.times, { $$type: 'number', value: 3 });
  assert.deepEqual(cfg.value.start, { $$type: 'size', value: { unit: '%', size: 85 } });
  assert.deepEqual(cfg.value.end, { $$type: 'size', value: { unit: '%', size: 15 } });
});

test('interaction: excludeOn → the interaction-breakpoints envelope (validator-exact)', () => {
  const ix = interaction({ excludeOn: ['mobile', 'tablet'] });
  assert.deepEqual(ix.value.breakpoints, {
    $$type: 'interaction-breakpoints',
    value: { excluded: { $$type: 'excluded-breakpoints', value: [{ $$type: 'string', value: 'mobile' }, { $$type: 'string', value: 'tablet' }] } },
  });
  assert.throws(() => interaction({ excludeOn: [] }), /non-empty breakpoint array/);
  assert.throws(() => interaction({ excludeOn: ['phone'] }), /known breakpoints/);
});

test("interaction: effect 'custom' keyframes — editor-exact envelopes (opacity fraction ×100, axis defaults)", () => {
  const ix = interaction({ effect: 'custom', keyframes: [
    { stop: 0, opacity: 0, move: { y: 40 } },
    { stop: 100, opacity: 1, scale: { x: 1.1 }, rotate: { z: 90 }, skew: { x: 5 } },
  ] });
  const kfs = ix.value.animation.value.custom_effect;
  assert.equal(kfs.$$type, 'custom-effect');
  const [a, b] = kfs.value.keyframes.value;
  assert.equal(kfs.value.keyframes.$$type, 'keyframes');
  assert.equal(a.$$type, 'keyframe-stop');
  assert.deepEqual(a.value.stop, { $$type: 'size', value: { unit: '%', size: 0 } });
  assert.equal(a.value.settings.$$type, 'keyframe-stop-settings');
  assert.deepEqual(a.value.settings.value.opacity, { $$type: 'size', value: { unit: '%', size: 0 } });
  assert.deepEqual(a.value.settings.value.move, { $$type: 'transform-move', value: { x: { $$type: 'size', value: { unit: 'px', size: 0 } }, y: { $$type: 'size', value: { unit: 'px', size: 40 } }, z: { $$type: 'size', value: { unit: 'px', size: 0 } } } });
  assert.deepEqual(b.value.settings.value.opacity, { $$type: 'size', value: { unit: '%', size: 100 } }, 'fraction 1 → 100%');
  assert.deepEqual(b.value.settings.value.scale, { $$type: 'transform-scale', value: { x: { $$type: 'number', value: 1.1 }, y: { $$type: 'number', value: 1 }, z: { $$type: 'number', value: 1 } } }, 'scale axes default 1');
  assert.deepEqual(b.value.settings.value.rotate.value.z, { $$type: 'size', value: { unit: 'deg', size: 90 } });
  assert.deepEqual(b.value.settings.value.skew, { $$type: 'transform-skew', value: { x: { $$type: 'size', value: { unit: 'deg', size: 5 } }, y: { $$type: 'size', value: { unit: 'deg', size: 0 } } } }, 'skew is x/y only');
});

test('interaction: custom-effect misuse throws (the server would strip these SILENTLY)', () => {
  assert.throws(() => interaction({ effect: 'custom' }), /non-empty keyframes/);
  assert.throws(() => interaction({ effect: 'custom', keyframes: [] }), /non-empty keyframes/);
  assert.throws(() => interaction({ effect: 'fade', keyframes: [{ stop: 0, opacity: 0 }] }), /effect 'custom' only/);
  assert.throws(() => interaction({ effect: 'custom', keyframes: [{ opacity: 1 }] }), /stop "undefined"/);
  assert.throws(() => interaction({ effect: 'custom', keyframes: [{ stop: 50, blur: 4 }] }), /unknown setting\(s\) blur/);
  assert.throws(() => interaction({ effect: 'custom', keyframes: [{ stop: 50 }] }), /sets nothing/);
});

test('interact: attaches {version:1, items} to the node, accumulates, caps at 5 (sanitizer limit)', () => {
  const n = heading('h2', 'X');
  interact(n, { effect: 'fade' });
  interact(n, [{ effect: 'slide', trigger: 'scrollIn', direction: 'top' }]);
  assert.equal(n.interactions.version, 1);
  assert.equal(n.interactions.items.length, 2);
  assert.throws(() => interact(n, [{}, {}, {}, {}]), /caps at 5/);
});

test('runtime: motion prop on every intrinsic kind (box/grid/heading/text/img); animate stays as alias', () => {
  const b = render(h('box', { pad: 0, motion: { effect: 'fade' } }));
  const g = render(h('grid', { cols: 2, motion: { effect: 'fade' } }));
  const hd = render(h('h2', { motion: [{ effect: 'slide', trigger: 'scrollIn', direction: 'left' }, { effect: 'fade' }] }, 'T'));
  const tx = render(h('text', { motion: { effect: 'scale', type: 'in' } }, 'p'));
  const im = render(h('img', { src: 5, motion: { effect: 'fade' } }));
  const legacy = render(h('box', { pad: 0, animate: { effect: 'fade' } }));
  for (const [n, count] of [[b, 1], [g, 1], [hd, 2], [tx, 1], [im, 1], [legacy, 1]]) {
    assert.equal(n.interactions.items.length, count);
    assert.equal(n.interactions.items[0].$$type, 'interaction-item');
  }
  assert.equal(render(h('h2', {}, 'no-fx')).interactions, undefined, 'no phantom interactions');
});

test('runtime: motion misuse is loud — both spellings, <html>, and the 6-item cap', () => {
  assert.throws(() => render(h('box', { pad: 0, motion: { effect: 'fade' }, animate: { effect: 'fade' } })), /both motion and animate/);
  assert.throws(() => render(h('html', { raw: '<b>x</b>', motion: { effect: 'fade' } })), /motion on <html>/);
  assert.throws(() => render(h('box', { pad: 0, motion: [{}, {}, {}, {}, {}, {}] })), /caps at 5/);
});

test('compile: interactions SURVIVE normalizeIds + class extraction (top-level node key untouched)', () => {
  const site = defineSite({ name: 'mx', pages: [{ title: 'p', slug: 'p', node: h('box', { pad: 0 }, h('h2', { size: 30, animate: { effect: 'fade' } }, 'Animated')) }] });
  const b = compileSite(site);
  const withFx = allNodes(b.pages[0].elements).filter((n) => n.interactions?.items?.length);
  assert.equal(withFx.length, 1, 'interactions survived the pipeline');
  assert.equal(withFx[0].interactions.items[0].value.animation.$$type, 'animation-preset-props');
});

/* ── reduced-motion guard (a11y — native Elementor has ZERO prefers-reduced-motion handling) ── */
test('compile: reduced-motion guard carrier injected when a tree carries interactions (default ON)', () => {
  const site = defineSite({ name: 'rm', pages: [{ title: 'p', slug: 'p', node: h('box', { pad: 0, motion: { effect: 'fade' } }, h('h1', {}, 'X')) }] });
  const guards = allNodes(compileSite(site).pages[0].elements).filter((n) => n.widgetType === 'html' && n.settings.html === MOTION_GUARD_SNIPPET);
  assert.equal(guards.length, 1, 'exactly one guard widget');
  // the snippet's load-bearing pieces: reduced-motion query, the footer JSON id, neutralize-to-[]
  assert.match(MOTION_GUARD_SNIPPET, /prefers-reduced-motion: reduce/);
  assert.match(MOTION_GUARD_SNIPPET, /elementor-interactions-data/);
  assert.match(MOTION_GUARD_SNIPPET, /textContent="\[\]"/);
  assert.match(MOTION_GUARD_SNIPPET, /MutationObserver/, 'must neutralize on insertion — the JSON prints at wp_footer:10, consumers execute at :20');
});

test('compile: no guard without interactions; motion:{respectReducedMotion:false} opts out; parts get it too', () => {
  const plain = compileSite(defineSite({ name: 'rm2', pages: [{ title: 'p', slug: 'p', node: h('box', { pad: 0 }, h('h1', {}, 'X')) }] }));
  assert.ok(!allNodes(plain.pages[0].elements).some((n) => n.settings?.html === MOTION_GUARD_SNIPPET), 'no interactions → no guard');
  const optOut = compileSite(defineSite({ name: 'rm3', motion: { respectReducedMotion: false }, pages: [{ title: 'p', slug: 'p', node: h('box', { pad: 0, motion: { effect: 'fade' } }, h('h1', {}, 'X')) }] }));
  assert.ok(!allNodes(optOut.pages[0].elements).some((n) => n.settings?.html === MOTION_GUARD_SNIPPET), 'opt-out honored');
  const withPart = compileSite(defineSite({ name: 'rm4', pages: [{ title: 'p', slug: 'p', node: h('text', {}, 'x') }], parts: { header: { node: h('box', { pad: 0, motion: { effect: 'fade' } }, h('h2', {}, 'Nav')) } } }));
  assert.ok(allNodes(withPart.parts[0].elements).some((n) => n.settings?.html === MOTION_GUARD_SNIPPET), 'part trees carry their own guard');
  assert.ok(!allNodes(withPart.pages[0].elements).some((n) => n.settings?.html === MOTION_GUARD_SNIPPET), 'motionless page stays clean');
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
