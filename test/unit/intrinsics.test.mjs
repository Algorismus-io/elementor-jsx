/**
 * Intrinsics beyond heading: text/p, box/col/row/section, img, html — plus the
 * runtime itself: fragments, components, theme context, kit-node passthrough.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { h, render, renderPage, Fragment, useTheme, useCtx } from '../../src/runtime.mjs';
import { defineTheme } from '../../src/theme.mjs';
import { resetIds, deskProps, styleOf, customCssOf, textOf, classRefs, findNode, byWidget } from '../helpers.mjs';
import { S, C, SZ, DIM, HUG } from '../../src/kit/kit.mjs';
import { txt as ktxt } from '../../src/kit/kit-components.mjs';

beforeEach(() => resetIds());

/* ── text / p ── */
test('text: renders e-paragraph with html-v3 content', () => {
  const n = render(h('text', {}, 'Body copy'));
  assert.equal(n.widgetType, 'e-paragraph');
  assert.equal(textOf(n), 'Body copy');
});

test('p: alias for text', () => {
  assert.equal(render(h('p', {}, 'P')).widgetType, 'e-paragraph');
});

test('text: href → real anchor link envelope (the atomic-paragraph nav recipe)', () => {
  const n = render(h('text', { href: '/about/' }, 'About'));
  assert.equal(n.settings.link.value.destination.value, '/about/');
});

test('text: style props + raw combine', () => {
  const n = render(h('text', { color: '#5B6B72', size: 14, lh: 1.55, raw: 'text-wrap:balance;' }, 'x'));
  const p = deskProps(n);
  assert.deepEqual(p.color, C('#5B6B72'));
  assert.deepEqual(p['line-height'], SZ(1.55, 'em'));
  assert.equal(customCssOf(n), 'text-wrap:balance;');
});

/* ── containers: box / col / row / section ── */
test('box: e-flexbox column with padding:0 baked (intrinsic-10px guard)', () => {
  const n = render(h('box', {}, h('text', {}, 'k')));
  assert.equal(n.elType, 'e-flexbox');
  const p = deskProps(n);
  assert.deepEqual(p['flex-direction'], S('column'));
  assert.deepEqual(p.padding, DIM(0));
  assert.equal(n.elements.length, 1);
});

test('box: explicit pad overrides the baked 0', () => {
  const p = deskProps(render(h('box', { pad: [96, 24] })));
  assert.deepEqual(p.padding, DIM(96, 24));
});

test('row: forces flex-direction row regardless of dir prop', () => {
  const p = deskProps(render(h('row', { dir: 'column' })));
  assert.deepEqual(p['flex-direction'], S('row'));
});

test('col: dir passthrough allows overriding to row', () => {
  const p = deskProps(render(h('col', { dir: 'row' })));
  assert.deepEqual(p['flex-direction'], S('row'));
});

test('section: renders tag=section semantic container', () => {
  const n = render(h('section', {}));
  assert.deepEqual(n.settings.tag, S('section'));
});

test('section: dir row survives the tag branch (sect bypasses row()/col())', () => {
  // regression: box() used to strip dir before sx, so <section dir="row"> (and tw="flex-row")
  // silently rendered as a column — Elementor's e-flexbox default.
  const p = deskProps(render(h('section', { dir: 'row' })));
  assert.deepEqual(p['flex-direction'], S('row'));
});

test('section: tw flex-row + max-md:flex-col compile to desktop row / mobile column', () => {
  const n = render(h('section', { tw: 'flex flex-row gap-16 max-md:flex-col' }));
  assert.deepEqual(deskProps(n)['flex-direction'], S('row'));
  const sid = Object.keys(n.styles)[0];
  const mob = n.styles[sid].variants.find((v) => v.meta.breakpoint === 'mobile');
  assert.deepEqual(mob.props['flex-direction'], S('column'));
});

test('box: tag=footer + dir row keeps both', () => {
  const n = render(h('box', { tag: 'footer', dir: 'row' }));
  assert.deepEqual(n.settings.tag, S('footer'));
  assert.deepEqual(deskProps(n)['flex-direction'], S('row'));
});

test('box: custom tag (header/footer/article)', () => {
  const n = render(h('box', { tag: 'footer' }));
  assert.deepEqual(n.settings.tag, S('footer'));
});

test('box: id prop → _cssid anchor setting', () => {
  const n = render(h('box', { id: 'pricing' }));
  assert.deepEqual(n.settings._cssid, S('pricing'));
});

test('box: href → container-level link (clickable card)', () => {
  const n = render(h('box', { href: '/go/' }));
  assert.equal(n.settings.link.value.destination.value, '/go/');
});

test('row: container children with no width get FLEX(1) auto-injected (ensureRowChild)', () => {
  const n = render(h('row', {}, h('col', {}, h('text', {}, 'a')), h('col', { w: 320 }, h('text', {}, 'b'))));
  const [a, b] = n.elements;
  assert.deepEqual(deskProps(a).flex?.$$type, 'flex', 'widthless col got flex');
  assert.equal(deskProps(b).flex, undefined, 'explicit-width col left alone');
  assert.deepEqual(deskProps(b).width, SZ(320));
});

test('row: hug width via w:"hug"', () => {
  const n = render(h('row', {}, h('col', { w: 'hug' }, h('text', {}, 'a'))));
  assert.deepEqual(deskProps(n.elements[0]).width, HUG);
});

test('box: full layout sweep (gap/align/justify/wrap/maxw/center/radius/shadow/border/grid)', () => {
  const p = deskProps(render(h('box', {
    gap: 20, align: 'center', justify: 'space-between', wrap: true, maxw: 1200, center: true,
    radius: 24, shadow: [8, 30, -12, 'rgba(0,0,0,.25)'], border: [1, '#E4E9DC'], gridCols: 12,
  })));
  assert.deepEqual(p.gap, SZ(20));
  assert.deepEqual(p['grid-template-columns'], S('repeat(12, 1fr)'));
  assert.deepEqual(p.display, S('grid'));
  assert.deepEqual(p['border-style'], S('solid'));
  assert.ok(p.margin && p['box-shadow'] && p['border-radius'] && p['max-width']);
});

test('box: deep nesting — 6 levels, ids all unique, structure preserved', () => {
  let v = h('text', {}, 'leaf');
  for (let i = 0; i < 6; i++) v = h('box', {}, v);
  const n = render(v);
  let depth = 0, cur = n;
  const seen = new Set();
  while (cur) { assert.ok(!seen.has(cur.id)); seen.add(cur.id); if (!cur.elements?.length) break; cur = cur.elements[0]; depth++; }
  assert.equal(depth, 6);
});

/* ── img ── */
test('img: attachment id → id-XOR-url image envelope', () => {
  const n = render(h('img', { src: 123 }));
  assert.equal(n.widgetType, 'e-image');
  assert.deepEqual(n.settings.image.value.src.value.id, { $$type: 'image-attachment-id', value: 123 });
  assert.equal(n.settings.image.value.src.value.url, null);
});

test('img: URL src → url-form envelope with INLINE alt (verified transformer path)', () => {
  const n = render(h('img', { src: 'http://x.test/a.png', alt: 'decorative probe', w: 200 }));
  const src = n.settings.image.value.src.value;
  assert.equal(src.id, null, 'id-XOR-url holds');
  assert.deepEqual(src.url, { $$type: 'url', value: 'http://x.test/a.png' });
  assert.deepEqual(src.alt, { $$type: 'string', value: 'decorative probe' });
});

test('img: RELATIVE url src throws at build (the PHP Url_Prop_Type rejects it live — probed)', () => {
  assert.throws(() => render(h('img', { src: '/wp-includes/x.png' })), /ABSOLUTE http\(s\) URL/);
});

test('img: attachment id + alt THROWS with the working recipe (was silently dropped)', () => {
  assert.throws(() => render(h('img', { src: 123, alt: 'nope' })), /alt_text.*media manifest|URL src/);
});

test('img: sizing + fit + radius + raw', () => {
  const n = render(h('img', { src: 5, w: '100%', h: 420, fit: 'cover', radius: 16, raw: 'filter:grayscale(1);' }));
  const p = deskProps(n);
  assert.deepEqual(p['object-fit'], S('cover'));
  assert.deepEqual(p.height, SZ(420));
  assert.equal(customCssOf(n), 'filter:grayscale(1);');
});

/* ── html ── */
test('html: raw prop becomes the widget html (children ignored when raw present)', () => {
  const n = render(h('html', { raw: '<b>raw</b>' }, 'fallback'));
  assert.equal(n.widgetType, 'html');
  assert.equal(n.settings.html, '<b>raw</b>');
});

test('html: children text used when no raw', () => {
  assert.equal(render(h('html', {}, '<i>k</i>')).settings.html, '<i>k</i>');
});

/* ── runtime semantics ── */
test('unknown intrinsic throws loudly', () => {
  assert.throws(() => render(h('marquee', {}, 'nope')), /unknown intrinsic <marquee>/);
});

test('Fragment: flattens to an array of siblings', () => {
  const out = render(h(Fragment, {}, h('text', {}, 'a'), h('text', {}, 'b')));
  assert.equal(out.length, 2);
});

test('component: function type is called with (props, ctx) and its output rendered', () => {
  const Card = ({ title }) => h('box', { cls: 'card' }, h('h3', {}, title));
  const n = render(h(Card, { title: 'T' }));
  assert.equal(n.elType, 'e-flexbox');
  assert.equal(textOf(n.elements[0]), 'T');
});

test('component: children prop flows through', () => {
  const Wrap = ({ children }) => h('box', {}, children);
  const n = render(h(Wrap, {}, h('text', {}, 'inner')));
  assert.equal(textOf(n.elements[0]), 'inner');
});

test('theme context: <Page theme> flows to useTheme() in descendants, restored after', () => {
  const t = defineTheme({ name: 'ctx', color: { ink: '#111111' } });
  let seen = null;
  const Deep = () => { seen = useTheme(); return h('text', {}, 'x'); };
  const Page = ({ children }) => h('box', {}, children);
  render(h(Page, { theme: t }, h(Deep, {})));
  assert.equal(seen, t);
  assert.equal(useTheme(), null, 'context restored after render');
});

test('theme context: nested themes shadow then restore', () => {
  const t1 = defineTheme({ name: 'a', color: {} });
  const t2 = defineTheme({ name: 'b', color: {} });
  const order = [];
  const Probe = ({ tag }) => { order.push([tag, useTheme()?.name]); return null; };
  const Shell = ({ theme, children }) => h('box', {}, children);
  render(h(Shell, { theme: t1 }, h(Probe, { tag: 'outer' }), h(Shell, { theme: t2 }, h(Probe, { tag: 'inner' })), h(Probe, { tag: 'after' })));
  assert.deepEqual(order, [['outer', 'a'], ['inner', 'b'], ['after', 'a']]);
});

test('kit-node passthrough: a raw kit node renders unchanged (escape hatch)', () => {
  const raw = ktxt('escape', { size: 13 });
  const n = render(h('box', {}, raw));
  assert.equal(n.elements[0], raw);
});

test('MIXING: JSX vnodes embedded in a kit component\'s children are RENDERED, at any depth', async () => {
  // the section({children:[<row/>]}) pattern — used to leak {$$v} vnodes that 422 at the
  // live PHP validator (R1). The runtime now renders embedded vnodes recursively.
  const { section } = await import('../../src/kit/kit-components.mjs');
  const kit = section({ header: { title: 'Mixed' }, children: [
    h('row', { gap: 12, pad: 0 }, h('text', {}, 'deep jsx')),
  ] });
  const out = render(h('box', { pad: 0 }, kit));
  const s = JSON.stringify(out);
  assert.ok(!s.includes('"$$v"'), 'no unrendered vnodes anywhere in the tree');
  assert.ok(s.includes('deep jsx'), 'embedded JSX rendered to a real widget');
});

test('MIXING: assertTree names a leaked vnode clearly (belt-and-suspenders)', async () => {
  const { assertTree } = await import('../../src/kit/kit.mjs');
  const leaked = { id: 'k1', elType: 'e-flexbox', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [h('row', {}, 'x')] };
  assert.throws(() => assertTree([leaked]), /unrendered JSX vnode <row>/);
});

test('renderPage: filters to kit nodes only, always returns an array', () => {
  const out = renderPage(h(Fragment, {}, h('section', {}), 'stray text', h('section', {})));
  assert.equal(out.length, 2);
  assert.ok(out.every((n) => n.elType));
});

test('render: null/false/empty inputs → null; arrays flatten and drop empties', () => {
  assert.equal(render(null), null);
  assert.equal(render(false), null);
  assert.equal(render(''), null);
  assert.deepEqual(render([null, h('text', {}, 'a'), false]).length, 1);
});

test('conditional rendering: {cond && <x/>} pattern drops cleanly', () => {
  const n = render(h('box', {}, false && h('text', {}, 'no'), h('text', {}, 'yes')));
  assert.equal(n.elements.length, 1);
});

test('list rendering: array.map children flatten into siblings', () => {
  const n = render(h('box', {}, ['a', 'b', 'c'].map((s) => h('text', {}, s))));
  assert.equal(n.elements.length, 3);
  assert.equal(textOf(n.elements[2]), 'c');
});
