/**
 * decompile — the inverse pipeline, tested two ways:
 *
 * 1. GOLDEN CORPUS: the 7 REAL production trees in examples/arrow-pp/trees/ (editor-authored
 *    Elementor V4 pages, ~190 nodes each, with editor artifacts like isInner/interactions).
 *    Each must decompile to source that REBUILDS through the real cli (esbuild) with widget
 *    counts and text content preserved.
 *
 * 2. STYLE ROUND-TRIP: a framework-authored page with local styles → decompile → rebuild →
 *    the style props survive (modulo documented normalizations: padding:0 baked on containers,
 *    flex:1 injected on widthless row children).
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decompile } from '../../src/decompile.mjs';
import { h, renderPage } from '../../src/runtime.mjs';
import { resetIds, allNodes, textOf, deskProps, variantProps, customCssOf } from '../helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const treesDir = join(root, 'examples', 'arrow-pp', 'trees');
const fixDir = join(root, 'test', 'fixtures');
const madeFiles = [];
after(() => { for (const f of madeFiles) { try { rmSync(f); } catch {} } });

beforeEach(() => resetIds());

const widgetCounts = (els) => {
  const c = {};
  for (const n of allNodes(els)) { const k = n.widgetType || n.elType; c[k] = (c[k] || 0) + 1; }
  return c;
};
const textsOf = (els) => allNodes(els).map((n) => textOf(n)).filter(Boolean).sort();

/** decompile a tree, write next to src-relative fixtures (so ../../src imports resolve), cli-build it. */
function rebuild(tree, name) {
  const src = decompile(tree, { name, slug: name.toLowerCase() });
  const file = join(fixDir, `.rt-${name}.jsx`);
  writeFileSync(file, src);
  madeFiles.push(file);
  const out = join(mkdtempSync(join(tmpdir(), 'exjsx-rt-')), 'b.json');
  execFileSync('node', [join(root, 'src', 'cli.mjs'), 'build', file, out], { encoding: 'utf8' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

/* ── 1. golden corpus: every real page round-trips ──
 * Two sources: examples/arrow-pp/trees (7 editor-era pages) + test/fixtures/corpus
 * (11 more REAL sites exported from the wpos stack — vineyards is an --inline deploy
 * with salted sids, the rest span landings, e-commerce, finance, figma conversions).
 * 18 real pages, ~2,900 nodes of production variety. */
const corpusDir = join(root, 'test', 'fixtures', 'corpus');
const CORPUS = [
  ...readdirSync(treesDir).filter((x) => x.endsWith('.json')).map((f) => [join(treesDir, f), `arrow-pp/${f}`]),
  ...readdirSync(corpusDir).filter((x) => x.endsWith('.json')).map((f) => [join(corpusDir, f), `corpus/${f}`]),
];
for (const [path, label] of CORPUS) {
  const name = 'G' + label.replace(/\.json$/, '').replace(/[^a-z0-9]+/gi, '');
  test(`golden corpus: ${label} decompiles and REBUILDS with structure + text preserved`, () => {
    const tree = JSON.parse(readFileSync(path, 'utf8'));
    const els = Array.isArray(tree) ? tree : (tree.content || tree.elements || []);
    const src = decompile(els, { name, slug: name.toLowerCase() });
    assert.ok(src.length > 200, 'non-trivial source');
    // structural leakage only — original page CONTENT may legitimately contain the word
    // "undefined" (figma-landing really does: "6386 Spring St undefined Anchorage…")
    assert.ok(!/\{undefined\}|=\s*undefined\b/.test(src), 'no undefined leaked into attrs/exprs');

    const bundle = rebuild(els, name);
    const rebuilt = bundle.pages[0].elements;

    // widget counts preserved. Documented lossy normalizations: e-div-block→e-flexbox and
    // shortcode→html (both render equivalently) — bucket those together.
    const a = widgetCounts(els), b = widgetCounts(rebuilt);
    for (const key of ['e-heading', 'e-paragraph', 'e-image', 'e-button']) {
      assert.equal(b[key] || 0, a[key] || 0, `${key} count`);
    }
    assert.equal((b.html || 0) + (b.shortcode || 0), (a.html || 0) + (a.shortcode || 0), 'html+shortcode count');
    assert.equal((b['e-flexbox'] || 0) + (b['e-div-block'] || 0), (a['e-flexbox'] || 0) + (a['e-div-block'] || 0), 'container count');

    // every heading/paragraph text survives byte-exact
    assert.deepEqual(textsOf(rebuilt), textsOf(els), 'all text content');
  });
}

/* ── 2. style-faithful round-trip on framework-authored trees ── */
test('style round-trip: sx props survive decompile→rebuild (color/size/pad/gap/radius/bg/responsive/raw)', () => {
  const page = renderPage(h('section', { pad: [80, 24], bg: '#F4F6F8' },
    h('box', { maxw: 1000, center: true, gap: 24, pad: 0 },
      h('h1', { color: '#B31E2C', size: 48, weight: 800, ta: 'center', lh: 1.1, ls: -0.02, raw: 'text-transform:uppercase;', mobile: { size: 28 } }, 'Round Trip'),
      h('text', { color: '#5B6B72', size: 15, lh: 1.6 }, 'Body <em>copy</em> &amp; more'),
      h('row', { gap: 16, pad: 0 },
        h('col', { pad: 20, radius: 14, bg: '#ffffff', w: 320 }, h('h3', { size: 18 }, 'Card')),
        h('col', { pad: 20, flex: 1 }, h('text', {}, 'Other'))),
      h('img', { src: 77, w: '100%', fit: 'cover' }))));
  const bundle = rebuild(page, 'RT');
  const rebuilt = bundle.pages[0].elements;
  const orig = allNodes(page), out = allNodes(rebuilt);

  const pick = (nodes, pred) => nodes.find(pred);
  // classes were extracted in the rebuilt BUNDLE — resolve each node's variants via its class ref
  const propsOf = (n) => {
    if (Object.keys(n.styles || {}).length) return Object.values(n.styles)[0].variants;
    const ref = (n.settings.classes?.value || []).find((c) => bundle.classes.items[c]);
    return ref ? bundle.classes.items[ref].variants : [];
  };
  const desk = (n) => propsOf(n).find((v) => v.meta.breakpoint === 'desktop')?.props || {};

  const hOut = pick(out, (n) => n.widgetType === 'e-heading' && textOf(n) === 'Round Trip');
  assert.ok(hOut, 'hero heading rebuilt');
  const hp = desk(hOut);
  assert.equal(hp.color.value, '#B31E2C');
  assert.equal(hp['font-size'].value.size, 48);
  assert.equal(hp['font-weight'].value, '800');
  assert.equal(hp['text-align'].value, 'center');
  assert.equal(hp['letter-spacing'].value.size, -0.02);
  const mob = propsOf(hOut).find((v) => v.meta.breakpoint === 'mobile');
  assert.equal(mob.props['font-size'].value.size, 28, 'mobile variant survived');
  const rawB64 = propsOf(hOut).find((v) => v.meta.breakpoint === 'desktop').custom_css?.raw;
  assert.equal(Buffer.from(rawB64, 'base64').toString(), 'text-transform:uppercase;', 'raw css survived');

  const cardOut = pick(out, (n) => n.elType === 'e-flexbox' && desk(n)['border-radius']);
  assert.ok(cardOut, 'card container rebuilt');
  const cp = desk(cardOut);
  assert.equal(cp['border-radius'].value['start-start'].value.size, 14);
  assert.equal(cp.background.value.color.value, '#ffffff');
  assert.equal(cp.width.value.size, 320);

  const pOut = pick(out, (n) => textOf(n) === 'Body <em>copy</em> &amp; more');
  assert.ok(pOut, 'inline markup text preserved');
  const iOut = pick(out, (n) => n.widgetType === 'e-image');
  assert.equal(iOut.settings.image.value.src.value.id.value, 77, 'attachment id preserved');
  assert.equal(desk(iOut)['object-fit'].value, 'cover');
});

test('style round-trip: variable refs pass through VERBATIM (props escape hatch)', () => {
  const varRef = { $$type: 'global-color-variable', value: 'e-gv-abc1234' };
  const page = renderPage(h('h2', { props: { color: varRef } }, 'VarBound'));
  const bundle = rebuild(page, 'RTVar');
  const out = allNodes(bundle.pages[0].elements).find((n) => textOf(n) === 'VarBound');
  const ref = (out.settings.classes?.value || []).find((c) => bundle.classes.items[c]);
  const props = bundle.classes.items[ref].variants[0].props;
  assert.deepEqual(props.color, varRef, 'var ref byte-identical after round-trip');
});

test('decompile: DYNAMIC content round-trips via dyn={…} (used to flatten to empty string)', () => {
  const DYN = { $$type: 'dynamic', value: { name: 'post-title', group: 'post', settings: {} } };
  const tree = [{ id: 'd1', elType: 'widget', widgetType: 'e-heading', settings: { tag: { $$type: 'string', value: 'h1' }, title: DYN, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] }];
  const src = decompile(tree, { name: 'Dyn', slug: 'dyn' });
  assert.match(src, /<heading[^>]*dyn=\{\{"\$\$type":"dynamic"/, 'dyn attr emitted');
  const bundle = rebuild(tree, 'DynRT');
  const out = allNodes(bundle.pages[0].elements).find((n) => n.widgetType === 'e-heading');
  assert.deepEqual(out.settings.title, DYN, 'dynamic envelope byte-identical after round-trip');
});

test('decompile: INTERACTIONS round-trip via animate={…} (used to be silently dropped)', () => {
  const item = { $$type: 'interaction-item', value: { interaction_id: { $$type: 'string', value: 'ix9' }, trigger: { $$type: 'string', value: 'load' }, animation: { $$type: 'animation-preset-props', value: { effect: { $$type: 'string', value: 'fade' }, type: { $$type: 'string', value: 'in' }, direction: { $$type: 'string', value: '' }, timing_config: { $$type: 'timing-config', value: { duration: { $$type: 'size', value: { unit: 'ms', size: 600 } }, delay: { $$type: 'size', value: { unit: 'ms', size: 0 } } } } } } } };
  const tree = [{ id: 'x1', elType: 'widget', widgetType: 'e-heading', settings: { tag: { $$type: 'string', value: 'h2' }, title: { $$type: 'html-v3', value: { content: { $$type: 'string', value: 'Animated' }, children: [] } }, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [], interactions: { version: 1, items: [item] } }];
  const src = decompile(tree, { name: 'Ix', slug: 'ix' });
  assert.match(src, /animate=\{\[\{"\$\$type":"interaction-item"/, 'animate attr emitted');
  const bundle = rebuild(tree, 'IxRT');
  const out = allNodes(bundle.pages[0].elements).find((n) => n.widgetType === 'e-heading');
  assert.equal(out.interactions.items.length, 1);
  assert.deepEqual(out.interactions.items[0], item, 'interaction envelope byte-identical');
});

test('decompile: NON-FLEXBOX container elTypes (e-form/e-tabs) → <Raw>, not a lossy <box>', () => {
  const tree = [{ id: 'f1', elType: 'e-form', settings: { 'form-name': { $$type: 'string', value: 'contact' }, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [
    { id: 'f2', elType: 'widget', widgetType: 'e-form-submit-button', settings: { text: { $$type: 'html-v3', value: { content: { $$type: 'string', value: 'Send' }, children: [] } }, tag: { $$type: 'string', value: 'button' }, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] },
  ] }];
  const src = decompile(tree, { name: 'FormRT', slug: 'formrt' });
  assert.match(src, /<Raw>\{.*\/\* element:e-form \*\/\}<\/Raw>/, 'form container preserved verbatim');
  assert.ok(!src.includes('<box'), 'NOT decompiled into a plain div');
  const bundle = rebuild(tree, 'FormRT2');
  const out = bundle.pages[0].elements[0];
  assert.equal(out.elType, 'e-form', 'elType survives');
  assert.equal(out.settings['form-name'].value, 'contact', 'settings survive');
  assert.equal(out.elements[0].widgetType, 'e-form-submit-button', 'children survive');
});

test('decompile: e-button → <Button>, unknown widget → <Raw> passthrough survives rebuild', () => {
  const tree = [
    { id: 'b1', elType: 'widget', widgetType: 'e-button', settings: { tag: { $$type: 'string', value: 'a' }, text: { $$type: 'html-v3', value: { content: { $$type: 'string', value: 'Click' }, children: [] } }, link: { $$type: 'link', value: { destination: { $$type: 'url', value: '/go/' }, isTargetBlank: { $$type: 'boolean', value: false } } }, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] },
    { id: 'w1', elType: 'widget', widgetType: 'nav-menu', settings: { menu: 'main', layout: 'dropdown' }, styles: {}, elements: [] },
  ];
  const src = decompile(tree, { name: 'BtnRaw', slug: 'btnraw' });
  assert.match(src, /<Button text=\{"Click"\}/);
  assert.match(src, /<Raw>\{.*\/\* widget:nav-menu \*\/\}<\/Raw>/);
  const bundle = rebuild(tree, 'BtnRaw');
  const out = allNodes(bundle.pages[0].elements);
  const btn = out.find((n) => n.widgetType === 'e-button');
  assert.equal(btn.settings.link.value.destination.value, '/go/');
  const nav = out.find((n) => n.widgetType === 'nav-menu');
  assert.deepEqual(nav.settings, { menu: 'main', layout: 'dropdown' }, 'Raw passthrough byte-faithful');
});

test('decompile: e-form status-message children (e-form-success/error-message) → <Raw>, byte-faithful rebuild', () => {
  const msg = (type, text) => ({ id: `m-${type}`, elType: `e-form-${type}-message`, settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [
    { id: `mp-${type}`, elType: 'widget', widgetType: 'e-paragraph', settings: { paragraph: { $$type: 'html-v3', value: { content: { $$type: 'string', value: text }, children: [] } }, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] },
  ] });
  const tree = [{ id: 'f1', elType: 'e-form', settings: { 'form-name': { $$type: 'string', value: 'c' }, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [
    msg('success', 'Sent!'), msg('error', 'Retry'),
  ] }];
  const src = decompile(tree, { name: 'FormMsgs', slug: 'formmsgs' });
  assert.match(src, /"elType":"e-form-success-message"/, 'success message preserved verbatim (inside the form Raw)');
  const bundle = rebuild(tree, 'FormMsgs');
  const out = allNodes(bundle.pages[0].elements);
  const s = out.find((n) => n.elType === 'e-form-success-message');
  const e = out.find((n) => n.elType === 'e-form-error-message');
  assert.ok(s && e, 'both message elements survive');
  assert.equal(textOf(s.elements[0]), 'Sent!');
  assert.equal(textOf(e.elements[0]), 'Retry');
});

test('decompile: native e-grid rebuilds through the real cli (grid → <grid> → e-grid)', async () => {
  const { nativeGrid, col, para, P0 } = await import('../../src/kit/kit.mjs');
  const tree = [nativeGrid({ cols: 3, rows: 2, gap: [16, 32] }, [col({ padding: P0 }, [para('cell')])])];
  const bundle = rebuild(JSON.parse(JSON.stringify(tree)), 'GridRT');
  const out = allNodes(bundle.pages[0].elements).find((n) => n.elType === 'e-grid');
  assert.ok(out, 'e-grid survives the round-trip');
  // post-dedup, local styles live in the shared class registry — resolve through the ref
  const ref = (out.settings.classes?.value || []).find((c) => bundle.classes.items[c]);
  const p = bundle.classes.items[ref].variants.find((v) => v.meta.breakpoint === 'desktop').props;
  assert.deepEqual(p['grid-template-columns'], { $$type: 'grid-track-size', value: { unit: 'fr', size: 3 } });
  assert.deepEqual(p['grid-template-rows'], { $$type: 'grid-track-size', value: { unit: 'fr', size: 2 } });
  assert.deepEqual(p.gap, { $$type: 'layout-direction', value: { column: { $$type: 'size', value: { unit: 'px', size: 16 } }, row: { $$type: 'size', value: { unit: 'px', size: 32 } } } });
});

test('decompile: STATE variants round-trip (native props + per-state raw + breakpoint nesting) — 1.7.x', async () => {
  const { box } = await import('../../src/kit/kit-components.mjs');
  const tree = [box({ pad: 0, hover: { bg: '#0f172a', raw: 'outline: none;', tablet: { color: '#5b6b72' } }, checked: { bg: '#059669' } }, [])];
  const src = decompile(JSON.parse(JSON.stringify(tree)), { name: 'St', slug: 'st' });
  assert.match(src, /hover=\{\{ bg: "#0f172a", tablet: \{ color: "#5b6b72" \}, raw: "outline: none;" \}\}/, 'hover state attr emitted');
  assert.match(src, /checked=\{\{ bg: "#059669" \}\}/, 'checked state attr emitted');
  const bundle = rebuild(tree, 'StRT');
  const out = allNodes(bundle.pages[0].elements)[0];
  const ref = (out.settings.classes?.value || []).find((c) => bundle.classes.items[c]);
  const variants = bundle.classes.items[ref].variants;
  const at = (bp, state) => variants.find((v) => v.meta.breakpoint === bp && (v.meta.state ?? null) === state);
  assert.equal(at('desktop', 'hover').props.background.value.color.value, '#0f172a');
  assert.equal(at('tablet', 'hover').props.color.value, '#5b6b72');
  assert.equal(at('desktop', 'checked').props.background.value.color.value, '#059669');
  assert.equal(Buffer.from(at('desktop', 'hover').custom_css.raw, 'base64').toString(), 'outline: none;', 'per-state custom_css survived');
});

test('decompile: ATTRIBUTES round-trip via attrs={…}; e-- class states fall back to <Raw> (kit-only) — 1.7.x', async () => {
  const { node, stateVariant, ATTRS, C } = await import('../../src/kit/kit.mjs');
  const tree = [node('e-div-block', { attrs: { 'data-track': 'cta', 'aria-label': 'Card' }, props: { padding: { $$type: 'dimensions', value: {} } } })];
  const src = decompile(JSON.parse(JSON.stringify(tree)), { name: 'At', slug: 'at' });
  assert.match(src, /attrs=\{\{"data-track":"cta","aria-label":"Card"\}\}/, 'attrs attr emitted');
  const bundle = rebuild(tree, 'AtRT');
  const out = allNodes(bundle.pages[0].elements)[0];
  assert.deepEqual(out.settings.attributes, ATTRS({ 'data-track': 'cta', 'aria-label': 'Card' }), 'attributes envelope byte-identical');

  const sel = stateVariant(node('e-div-block', { props: { padding: { $$type: 'dimensions', value: {} } } }), 'e--selected', { color: C('#f00') });
  const src2 = decompile([JSON.parse(JSON.stringify(sel))], { name: 'Sel', slug: 'sel' });
  assert.match(src2, /<Raw>\{.*e--selected state variant/, 'e-- state → verbatim Raw (no JSX spelling)');
});
