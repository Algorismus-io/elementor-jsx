/**
 * Media + structure atomic widgets — divider, youtube, self-hosted video, tabs.
 * Envelope shapes verified against atomic-widgets 4.1.4 source and live probes (2026-07-22):
 * tabs link POSITIONALLY (explicit tab-id breaks matching), chunk-based handlers
 * (e-tabs/e-youtube) need the webpack runtime → compile injects a classic carrier.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  divider, youtube, video, tabs, VIDEO_URL, VIDEO_ID,
  para, heading, assertTree, S, N, B, SZ, BG, P0, sect, IMG_ID,
} from '../../src/kit/kit.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h } from '../../src/runtime.mjs';
import { resetIds, allNodes, deskProps } from '../helpers.mjs';

beforeEach(() => resetIds());

/* ── divider ── */
test('divider: e-divider widget, styled via atomic props (renders a real <hr> — live-verified)', () => {
  const d = divider({ width: SZ(100, '%'), height: SZ(2), background: BG('#ccc') });
  assert.equal(d.widgetType, 'e-divider');
  assert.deepEqual(deskProps(d).height, SZ(2));
  assert.doesNotThrow(() => assertTree([d]));
});

/* ── youtube ── */
test('youtube: source + boolean matrix with verified defaults (controls on, rel on)', () => {
  const y = youtube('https://www.youtube.com/watch?v=abc123', { start: 10, end: 90, mute: true, privacyMode: true, rel: false });
  assert.equal(y.widgetType, 'e-youtube');
  assert.deepEqual(y.settings.source, S('https://www.youtube.com/watch?v=abc123'));
  assert.deepEqual(y.settings.start, S('10'), 'start/end are STRING props');
  assert.deepEqual(y.settings.player_controls, B(true));
  assert.deepEqual(y.settings.privacy_mode, B(true));
  assert.deepEqual(y.settings.rel, B(false));
  const min = youtube('https://youtu.be/x');
  assert.equal(min.settings.start, undefined, 'no phantom start/end');
});

/* ── self-hosted video ── */
test('VIDEO_URL / VIDEO_ID: video-src envelope, id-XOR-url, absolute-url guard', () => {
  assert.deepEqual(VIDEO_URL('https://x.test/a.mp4'), { $$type: 'video-src', value: { id: null, url: { $$type: 'url', value: 'https://x.test/a.mp4' } } });
  assert.deepEqual(VIDEO_ID(9), { $$type: 'video-src', value: { id: { $$type: 'video-attachment-id', value: 9 }, url: null } });
  assert.throws(() => VIDEO_URL('/rel.mp4'), /ABSOLUTE http\(s\) URL/);
});

test('video: string source sugar, playback booleans, timing, poster pairing', () => {
  const v = video('https://x.test/a.mp4', { mute: true, loop: true, preload: 'metadata', startTime: 5, endTime: 30, poster: IMG_ID(7) });
  assert.equal(v.widgetType, 'e-self-hosted-video');
  assert.equal(v.settings.source.$$type, 'video-src');
  assert.deepEqual(v.settings.controls, B(true));
  assert.deepEqual(v.settings.start_time, N(5));
  assert.deepEqual(v.settings.poster_enabled, B(true), 'poster implies poster_enabled');
  assert.equal(v.settings.poster.$$type, 'image');
  const bare = video(VIDEO_ID(3));
  assert.equal(bare.settings.poster_enabled, undefined, 'no phantom poster flags');
});

/* ── tabs ── */
test('tabs: canonical element family — e-tabs > menu(e-tab×N) + content-area(e-tab-content×N)', () => {
  const t = tabs([
    { label: 'One', content: [para('First')] },
    { label: 'Two', content: [para('Second')] },
  ], { active: 1 });
  assert.equal(t.elType, 'e-tabs');
  assert.deepEqual(t.settings['default-active-tab'], N(1));
  const [menu, area] = t.elements;
  assert.equal(menu.elType, 'e-tabs-menu');
  assert.equal(area.elType, 'e-tabs-content-area');
  assert.equal(menu.elements.length, 2);
  assert.equal(area.elements.length, 2);
  assert.ok(menu.elements.every((x) => x.elType === 'e-tab'));
  assert.ok(area.elements.every((x) => x.elType === 'e-tab-content'));
  // POSITIONAL linking — an explicit tab-id breaks the handler's id scheme (live-probed)
  for (const c of area.elements) assert.equal(c.settings['tab-id'], undefined);
  // labels ride as paragraph children inside the tab buttons
  assert.equal(menu.elements[0].elements[0].settings.paragraph.value.content.value, 'One');
  assert.doesNotThrow(() => assertTree([t]));
});

test('tabs: content defaults to empty, active defaults to 0', () => {
  const t = tabs([{ label: 'Only' }]);
  assert.deepEqual(t.settings['default-active-tab'], N(0));
  assert.deepEqual(t.elements[1].elements[0].elements, []);
});

/* ── webpack-runtime carrier (compile-level guarantee) ── */
const page = (node) => compileSite(defineSite({ name: 'w', pages: [{ title: 'w', slug: 'w', node }] })).pages[0].elements;
const hasCarrier = (els) => allNodes(els).some((n) => n.widgetType === 'html' && (n.settings.html || '').includes('exjsx-runtime-carrier'));

test('carrier: pure-atomic page WITH tabs/youtube gets the invisible classic carrier injected', () => {
  const els = page(h('box', { pad: 0 }, tabs([{ label: 'A', content: [para('x')] }])));
  assert.ok(hasCarrier(els), 'carrier injected (chunk handlers need webpack.runtime — live-probed gap)');
  resetIds();
  const els2 = page(h('box', { pad: 0 }, youtube('https://youtu.be/x')));
  assert.ok(hasCarrier(els2));
});

test('carrier: NOT injected when a classic widget already carries the runtime', () => {
  const els = page(h('box', { pad: 0 }, tabs([{ label: 'A' }]), h('html', { raw: '<b>classic</b>' })));
  assert.ok(!hasCarrier(els), 'existing classic widget suffices');
});

test('carrier: NOT injected on pages without chunk widgets (video/divider are runtime-free)', () => {
  const els = page(h('box', { pad: 0 }, divider(), video('https://x.test/a.mp4'), h('h2', {}, 'T')));
  assert.ok(!hasCarrier(els), 'no chunk widgets → no carrier');
});
