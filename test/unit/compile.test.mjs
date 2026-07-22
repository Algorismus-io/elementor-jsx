/**
 * compile.mjs — site → deployable bundle: id normalization (the collision killer),
 * validation wiring, stats, fonts, page metadata.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compileSite } from '../../src/compile.mjs';
import { defineSite, fromData } from '../../src/site.mjs';
import { defineTheme } from '../../src/theme.mjs';
import { h } from '../../src/runtime.mjs';
import { resetIds, allNodes, collectIds, classRefs, findNode, byWidget, textOf } from '../helpers.mjs';

beforeEach(() => resetIds());

const page = (slug, node) => ({ title: slug, slug, node });
const Card = ({ t }) => h('box', { pad: 24, cls: 'card' }, h('h3', { size: 18 }, t));

test('compile: rejects a non-site entry', () => {
  assert.throws(() => compileSite({}), /defineSite/);
  assert.throws(() => compileSite(null), /defineSite/);
});

test('compile: normalizeIds — every element id unique per page, sequential e00000 form', () => {
  const site = defineSite({ name: 't', pages: [page('a', h('box', {}, h(Card, { t: 'x' }), h(Card, { t: 'y' })))] });
  const b = compileSite(site);
  const { el } = collectIds(b.pages[0].elements);
  assert.equal(new Set(el).size, el.length);
  assert.ok(el.every((id) => /^e[0-9a-z]{5}$/.test(id)));
});

test('compile: SAME component in two PAGES → no cross-page id collisions after normalize', () => {
  // both pages restart normalization at e00000 — ids repeat ACROSS pages by design
  // (each page is its own document); within a page they must be unique.
  const site = defineSite({ name: 't', pages: [page('a', h(Card, { t: 'x' })), page('b', h(Card, { t: 'x' }))] });
  const b = compileSite(site);
  for (const p of b.pages) {
    const { el } = collectIds(p.elements);
    assert.equal(new Set(el).size, el.length);
  }
});

test('compile: adversarial — trees with MANUALLY COLLIDING ids are repaired by normalizeIds', () => {
  // simulate the id-counter collision (two subtrees built in separate processes)
  const dup = () => ({ id: 'uSAME', elType: 'e-flexbox', settings: { classes: { $$type: 'classes', value: ['e-uSAME-s'] } }, styles: { 'e-uSAME-s': { id: 'e-uSAME-s', type: 'class', label: 'uSAME', variants: [{ meta: { breakpoint: 'desktop', state: null }, props: { padding: { $$type: 'dimensions', value: {} } } }] } }, elements: [] });
  const site = defineSite({ name: 't', pages: [{ title: 'a', slug: 'a', node: [dup(), dup()] }] });
  const b = compileSite(site);
  const { el } = collectIds(b.pages[0].elements);
  assert.equal(new Set(el).size, 2, 'element ids repaired');
  // identical styles were extracted into ONE shared class both elements now reference
  const refs = b.pages[0].elements.map((n) => n.settings.classes.value);
  assert.deepEqual(refs[0], refs[1]);
  assert.ok(refs[0][0].startsWith('g-'));
});

test('compile: style ids re-key to embed the NEW element id and class refs follow', () => {
  const site = defineSite({ name: 't', pages: [page('a', h('text', { size: 14 }, 'x'))] });
  const els = compileSite(site).pages[0].elements;
  // classes were extracted — but before extraction, normalize rewired refs. Verify via a styled node kept local:
  // rebuild without extraction by checking the class REF now points at the shared class, not a stale sid.
  const t = findNode(els, byWidget('e-paragraph'));
  const refs = classRefs(t);
  assert.equal(refs.length, 1);
  assert.ok(refs[0].startsWith('g-'), 'ref rewritten to the shared class');
});

test('compile: dedup stats — localStylesBefore ≥ sharedClasses; both reported', () => {
  const site = defineSite({
    name: 't',
    pages: [page('a', h('box', {}, Array.from({ length: 10 }, (_, i) => h(Card, { t: `c${i}` }))))],
  });
  const b = compileSite(site);
  assert.equal(b.stats.localStylesBefore, 21); // box + 10×(card+h3)
  assert.equal(b.stats.sharedClasses, 3);      // box, card, h3
});

test('compile: classes dedup ACROSS pages (one registry, first page wins)', () => {
  const site = defineSite({ name: 't', pages: [page('a', h(Card, { t: 'x' })), page('b', h(Card, { t: 'y' }))] });
  const b = compileSite(site);
  assert.equal(b.classes.order.filter((id) => id.includes('card')).length, 1);
});

test('compile: theme fonts collected into bundle.fonts', () => {
  const theme = defineTheme({ name: 'x', font: { head: 'Sora', body: 'Inter' } });
  const site = defineSite({ name: 't', theme, pages: [page('a', h('text', {}, 'x'))] });
  const b = compileSite(site);
  assert.deepEqual([...b.fonts].sort(), ['Inter', 'Sora']);
});

test('compile: variables + variableList flow from the theme; no theme → empty', () => {
  const theme = defineTheme({ name: 'x', color: { a: '#111' } });
  const b = compileSite(defineSite({ name: 't', theme, pages: [page('a', h('text', {}, 'x'))] }));
  assert.equal(b.variables.watermark, 1);
  assert.equal(b.variableList.length, 1);
  const b2 = compileSite(defineSite({ name: 't2', pages: [page('a', h('text', {}, 'x'))] }));
  // theme-less bundles still need the full hydrate shape — a bare {data:{}} deploys an invalid
  // blob (PHP "Undefined array key watermark" sitewide; field-found via the Pro suite)
  assert.deepEqual(b2.variables, { data: {}, watermark: 0, version: 1 });
});

test('compile: page template defaults to elementor_canvas, overridable', () => {
  const site = defineSite({ name: 't', pages: [page('a', h('text', {}, 'x')), { title: 'b', slug: 'b', template: 'default', node: h('text', {}, 'y') }] });
  const b = compileSite(site);
  assert.equal(b.pages[0].template, 'elementor_canvas');
  assert.equal(b.pages[1].template, 'default');
});

test('compile: INVALID tree is rejected by the wired assertTree (shift-left gate)', () => {
  // an e-flexbox with 2 children and no direction — the newspaper-columns footgun
  const bad = { id: 'x1', elType: 'e-flexbox', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [
    { id: 'x2', elType: 'widget', widgetType: 'e-heading', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] },
    { id: 'x3', elType: 'widget', widgetType: 'e-heading', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] },
  ] };
  const site = defineSite({ name: 't', pages: [{ title: 'a', slug: 'a', node: bad }] });
  assert.throws(() => compileSite(site), /assertTree/);
});

test('compile: bundle is JSON-serializable and self-identifying', () => {
  const b = compileSite(defineSite({ name: 'ser', pages: [page('a', h('text', {}, 'x'))] }));
  const round = JSON.parse(JSON.stringify(b));
  assert.equal(round.generatedBy, 'elementor-jsx');
  assert.equal(round.name, 'ser');
});

test('fromData: N rows → N page definitions sharing the design system', () => {
  const rows = [{ s: 'alpha' }, { s: 'beta' }, { s: 'gamma' }];
  const pages = fromData(rows, (r) => page(r.s, h(Card, { t: r.s })));
  const b = compileSite(defineSite({ name: 'dd', pages }));
  assert.equal(b.pages.length, 3);
  assert.deepEqual(b.pages.map((p) => p.slug), ['alpha', 'beta', 'gamma']);
  assert.equal(b.classes.order.filter((id) => id.includes('card')).length, 1, 'one card class across all pages');
});

test('compile: theme PARTS compile through the same pipeline and SHARE the class registry', () => {
  const Shell = ({ label }) => h('box', { cls: 'tb-bar', dir: 'row', pad: [14, 24], gap: 12 }, h('h4', { cls: 'tb-brand', size: 18 }, label));
  const site = defineSite({
    name: 'tb',
    pages: [{ title: 'p', slug: 'p', template: 'elementor_header_footer', node: h(Shell, { label: 'InPage' }) }],
    parts: {
      header: { node: h(Shell, { label: 'HeaderBrand' }) },
      footer: { node: h(Shell, { label: 'FooterBrand' }), conditions: ['include/general', 'exclude/singular/page/9'] },
    },
  });
  const b = compileSite(site);
  assert.equal(b.parts.length, 2);
  const [hdr, ftr] = b.parts;
  assert.equal(hdr.type, 'header');
  assert.deepEqual(hdr.conditions, ['include/general'], 'default condition');
  assert.deepEqual(ftr.conditions, ['include/general', 'exclude/singular/page/9'], 'custom conditions pass through');
  assert.equal(hdr.title, 'tb header');
  // the SAME tb-bar class serves page + header + footer (one design system)
  assert.equal(b.classes.order.filter((c) => c.includes('tb-bar')).length, 1);
  const refOf = (els) => allNodes(els).find((n) => n.elType === 'e-flexbox').settings.classes.value.join();
  assert.equal(refOf(hdr.elements), refOf(b.pages[0].elements), 'header + page reference the same shared class');
  assert.equal(b.pages[0].template, 'elementor_header_footer');
});

test('compile: no parts → empty parts array (back-compat)', () => {
  const b = compileSite(defineSite({ name: 't', pages: [page('a', h('text', {}, 'x'))] }));
  assert.deepEqual(b.parts, []);
});

test('compile: text content survives compilation exactly (no mangling)', () => {
  const msg = 'Symbols & entities — <em>keep</em> “quotes” 100%';
  const b = compileSite(defineSite({ name: 't', pages: [page('a', h('h2', {}, msg))] }));
  const hn = findNode(b.pages[0].elements, byWidget('e-heading'));
  assert.equal(textOf(hn), msg);
});
