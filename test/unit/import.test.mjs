/**
 * import.mjs — the computed-style capture bridge, unit-tested on SYNTHETIC computed-style
 * fixtures (no browser here; the live capture path is exercised by the CLI against real pages).
 * Covers: delta-filtering vs control/parent, the sx mapping table, raw fallback routing,
 * mobile diffing, wrapper collapse, JSX emission — and proves an emitted page COMPILES through
 * the real pipeline (esbuild → render → compileSite → lint: 0 errors).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import {
  cssColor, compactBox, classify, textRun, mapStyles, diffMobile,
  buildTree, collapseTree, emitNode, emitPageJsx, pageFromCaptures,
  captureSource, importPage, collectFonts,
} from '../../src/import.mjs';
import { buildOptions } from '../../src/bundler.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h } from '../../src/runtime.mjs';
import { lintBundle } from '../../src/lint.mjs';
import { resetIds } from '../helpers.mjs';

beforeEach(() => resetIds());

/* ── synthetic computed-style fixtures ── */
const DEF = {
  display: 'block', position: 'static', 'z-index': 'auto', top: 'auto', right: 'auto', bottom: 'auto', left: 'auto',
  'flex-direction': 'row', 'flex-wrap': 'nowrap', 'justify-content': 'normal', 'align-items': 'normal', 'align-self': 'auto',
  'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'row-gap': 'normal', 'column-gap': 'normal',
  'grid-template-columns': 'none', 'grid-column': 'auto',
  width: 'auto', height: 'auto', 'max-width': 'none', 'min-width': '0px', 'min-height': '0px',
  'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px',
  'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px',
  'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', 'background-size': 'auto',
  'background-position': '0% 0%', 'background-repeat': 'repeat',
  color: 'rgb(17, 24, 39)', 'font-family': 'ui-sans-serif, system-ui', 'font-size': '16px', 'font-weight': '400',
  'font-style': 'normal', 'line-height': '24px', 'letter-spacing': 'normal',
  'text-align': 'start', 'text-transform': 'none', 'text-decoration-line': 'none', 'white-space': 'normal',
  'border-top-width': '0px', 'border-right-width': '0px', 'border-bottom-width': '0px', 'border-left-width': '0px',
  'border-top-style': 'none', 'border-right-style': 'none', 'border-bottom-style': 'none', 'border-left-style': 'none',
  'border-top-color': 'rgb(0, 0, 0)', 'border-right-color': 'rgb(0, 0, 0)', 'border-bottom-color': 'rgb(0, 0, 0)', 'border-left-color': 'rgb(0, 0, 0)',
  'border-top-left-radius': '0px', 'border-top-right-radius': '0px', 'border-bottom-right-radius': '0px', 'border-bottom-left-radius': '0px',
  'box-shadow': 'none', opacity: '1', 'overflow-x': 'visible', 'overflow-y': 'visible', 'object-fit': 'fill',
  'aspect-ratio': 'auto', transform: 'none', filter: 'none', 'backdrop-filter': 'none', 'list-style-type': 'none',
};
const st = (o = {}) => ({ ...DEF, ...o });
const CONTROL_DIV = st();
const CONTROL_P = st({ 'margin-top': '16px', 'margin-bottom': '16px', 'font-family': 'Times' });
const CONTROLS = { body: CONTROL_DIV, div: CONTROL_DIV, section: CONTROL_DIV, p: CONTROL_P, h2: st({ 'font-size': '24px', 'font-weight': '700', 'margin-top': '20px', 'margin-bottom': '20px', 'font-family': 'Times' }), img: st({ display: 'inline' }), span: st({ display: 'inline', 'font-family': 'Times' }), a: st({ display: 'inline', 'font-family': 'Times' }) };

const R = (x, y, w, hh) => ({ x, y, w, h: hh });
const parentOf = (styles, rect) => ({ styles, rect, path: 'p' });

test('cssColor: opaque rgb → hex, alpha and keywords pass through', () => {
  assert.equal(cssColor('rgb(255, 0, 0)'), '#ff0000');
  assert.equal(cssColor('rgba(17, 24, 39, 1)'), '#111827');
  assert.equal(cssColor('rgba(0, 0, 0, 0.5)'), 'rgba(0, 0, 0, 0.5)');
  assert.equal(cssColor('currentcolor'), 'currentcolor');
});

test('compactBox: n | [v,h] | [t,r,b,l] forms, auto survives', () => {
  assert.equal(compactBox([8, 8, 8, 8]), 8);
  assert.deepEqual(compactBox([96, 24, 96, 24]), [96, 24]);
  assert.deepEqual(compactBox([1, 2, 3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(compactBox([0, 'auto', 0, 'auto']), [0, 'auto']);
});

test('delta-filter: an unstyled full-width div emits only pad (container pad is always pinned)', () => {
  const parent = parentOf(st(), R(0, 0, 1440, 900));
  const { sx, raw } = mapStyles({ tag: 'div', kind: 'container', s: st(), c: CONTROLS.div, parent, rect: R(0, 0, 1440, 100) });
  assert.deepEqual(sx, { pad: 0 });
  assert.deepEqual(raw, []);
});

test('flex row maps dir/justify/align/gap/wrap; flex column stays the box default', () => {
  const parent = parentOf(st(), R(0, 0, 1440, 900));
  const s = st({ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'row-gap': '16px', 'column-gap': '16px', 'flex-wrap': 'wrap' });
  const { sx } = mapStyles({ tag: 'div', kind: 'container', s, c: CONTROLS.div, parent, rect: R(0, 0, 1440, 80) });
  assert.equal(sx.dir, 'row');
  assert.equal(sx.justify, 'space-between');
  assert.equal(sx.align, 'center');
  assert.equal(sx.gap, 16);
  assert.equal(sx.wrap, true);
  const col = mapStyles({ tag: 'div', kind: 'container', s: st({ display: 'flex', 'flex-direction': 'column' }), c: CONTROLS.div, parent, rect: R(0, 0, 1440, 80) }).sx;
  assert.equal(col.dir, undefined, 'column is the box default — no dir emitted');
});

test('grid: equal computed tracks normalize to a repeat count; unequal stay literal; span maps', () => {
  const parent = parentOf(st(), R(0, 0, 1200, 900));
  const eq = mapStyles({ tag: 'div', kind: 'container', s: st({ display: 'grid', 'grid-template-columns': '574.4px 574.4px' }), c: CONTROLS.div, parent, rect: R(0, 0, 1200, 400) }).sx;
  assert.equal(eq.gridCols, 2);
  const uneq = mapStyles({ tag: 'div', kind: 'container', s: st({ display: 'grid', 'grid-template-columns': '300px 600px' }), c: CONTROLS.div, parent, rect: R(0, 0, 1200, 400) }).sx;
  assert.equal(uneq.gridCols, '300px 600px');
  const gridParent = parentOf(st({ display: 'grid' }), R(0, 0, 1200, 400));
  const item = mapStyles({ tag: 'div', kind: 'container', s: st({ 'grid-column': 'span 2 / auto' }), c: CONTROLS.div, parent: gridParent, rect: R(0, 0, 600, 200) }).sx;
  assert.equal(item.span, 2);
  assert.equal(item.w, undefined, 'grid children never emit width (tracks size them)');
});

test('width heuristic: full-width skipped, maxw-constrained skipped, genuinely constrained kept, centering → auto margins', () => {
  const parent = parentOf(st(), R(0, 0, 1440, 2000));
  const full = mapStyles({ tag: 'div', kind: 'container', s: st(), c: CONTROLS.div, parent, rect: R(0, 0, 1440, 100) }).sx;
  assert.equal(full.w, undefined);
  const capped = mapStyles({ tag: 'div', kind: 'container', s: st({ 'max-width': '1280px' }), c: CONTROLS.div, parent, rect: R(80, 0, 1280, 100) }).sx;
  assert.equal(capped.maxw, 1280);
  assert.equal(capped.w, undefined, 'maxw is the constraint — no width');
  assert.deepEqual(capped.m, [0, 'auto'], 'equal side gaps → mx auto');
  const fixed = mapStyles({ tag: 'div', kind: 'container', s: st(), c: CONTROLS.div, parent, rect: R(0, 0, 640, 100) }).sx;
  assert.equal(fixed.w, 640);
});

test('flex-grow children skip width; flex:1 1 0 maps to the flex shorthand, exotic grows go raw', () => {
  const rowParent = parentOf(st({ display: 'flex', 'flex-direction': 'row' }), R(0, 0, 1200, 100));
  const grow = mapStyles({ tag: 'div', kind: 'container', s: st({ 'flex-grow': '1', 'flex-shrink': '1', 'flex-basis': '0%' }), c: CONTROLS.div, parent: rowParent, rect: R(0, 0, 400, 100) });
  assert.equal(grow.sx.flex, 1);
  assert.equal(grow.sx.w, undefined);
  const exotic = mapStyles({ tag: 'div', kind: 'container', s: st({ 'flex-grow': '2', 'flex-shrink': '0', 'flex-basis': '120px' }), c: CONTROLS.div, parent: rowParent, rect: R(0, 0, 700, 100) });
  assert.ok(exotic.raw.includes('flex:2 0 120px'));
});

test('visuals: bg color, single bg image → bgImage+bgOpts, gradient → raw, uniform border/radius/shadow map, multi-shadow → raw', () => {
  const parent = parentOf(st(), R(0, 0, 1440, 900));
  const base = { tag: 'div', kind: 'container', c: CONTROLS.div, parent, rect: R(0, 0, 1440, 100) };
  const bg = mapStyles({ ...base, s: st({ 'background-color': 'rgb(249, 250, 251)' }) }).sx;
  assert.equal(bg.bg, '#f9fafb');
  const img = mapStyles({ ...base, s: st({ 'background-image': 'url("https://x.test/a.jpg")', 'background-size': 'cover', 'background-position': '50% 50%', 'background-repeat': 'no-repeat' }) }).sx;
  assert.equal(img.bgImage, 'https://x.test/a.jpg');
  assert.equal(img.bgOpts.size, 'cover');
  const grad = mapStyles({ ...base, s: st({ 'background-image': 'linear-gradient(rgb(37, 99, 235), rgb(59, 130, 246))' }) });
  assert.ok(grad.raw.some((rr) => rr.startsWith('background-image:linear-gradient')));
  const bordered = mapStyles({ ...base, s: st({ 'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px', 'border-left-width': '1px', 'border-top-style': 'solid', 'border-right-style': 'solid', 'border-bottom-style': 'solid', 'border-left-style': 'solid', 'border-top-color': 'rgb(229, 231, 235)', 'border-right-color': 'rgb(229, 231, 235)', 'border-bottom-color': 'rgb(229, 231, 235)', 'border-left-color': 'rgb(229, 231, 235)', 'border-top-left-radius': '12px', 'border-top-right-radius': '12px', 'border-bottom-right-radius': '12px', 'border-bottom-left-radius': '12px' }) }).sx;
  assert.deepEqual(bordered.border, [1, '#e5e7eb']);
  assert.equal(bordered.radius, 12);
  const oneSide = mapStyles({ ...base, s: st({ 'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': 'rgb(0, 0, 0)' }) });
  assert.ok(oneSide.raw.some((rr) => rr.startsWith('border-top:1px solid')));
  const sh = mapStyles({ ...base, s: st({ 'box-shadow': 'rgba(0, 0, 0, 0.1) 0px 10px 15px -3px' }) }).sx;
  assert.deepEqual(sh.shadow, [10, 15, -3, 'rgba(0, 0, 0, 0.1)', 0]);
  const multi = mapStyles({ ...base, s: st({ 'box-shadow': 'rgba(0,0,0,0.1) 0px 10px 15px -3px, rgba(0,0,0,0.1) 0px 4px 6px -4px' }) });
  assert.ok(multi.raw.some((rr) => rr.startsWith('box-shadow:')));
});

test('typography: leaves PIN size/weight/lh/color; font stack goes raw only when it differs from the parent', () => {
  const parent = parentOf(st(), R(0, 0, 800, 600));
  const s = st({ 'font-size': '18px', 'font-weight': '600', 'line-height': '28px', color: 'rgb(55, 65, 81)', 'text-transform': 'uppercase', 'letter-spacing': '1.2px' });
  const { sx, raw } = mapStyles({ tag: 'p', kind: 'text', s, c: CONTROLS.p, parent, rect: R(0, 0, 800, 28) });
  assert.equal(sx.size, 18);
  assert.equal(sx.weight, 600);
  assert.equal(sx.lh, '28px');
  assert.equal(sx.color, '#374151');
  assert.equal(sx.ls, '1.2px');
  assert.equal(sx.font, undefined, 'font-family equal to parent — inherited, not emitted');
  assert.ok(raw.includes('text-transform:uppercase'));
  const mono = mapStyles({ tag: 'p', kind: 'text', s: st({ 'font-family': 'ui-monospace, monospace' }), c: CONTROLS.p, parent, rect: R(0, 0, 800, 28) });
  assert.ok(mono.raw.some((rr) => rr.startsWith('font-family:ui-monospace')));
  const single = mapStyles({ tag: 'p', kind: 'text', s: st({ 'font-family': 'Inter' }), c: CONTROLS.p, parent, rect: R(0, 0, 800, 28) }).sx;
  assert.equal(single.font, 'Inter');
});

test('long-tail → raw: overflow, opacity, transform, aspect-ratio, absolute insets; pos/z map to sx', () => {
  const parent = parentOf(st(), R(0, 0, 800, 600));
  const s = st({ position: 'absolute', top: '10px', left: '20px', right: '30px', bottom: '40px', 'z-index': '30', opacity: '0.5', 'overflow-x': 'hidden', 'overflow-y': 'hidden', transform: 'matrix(1, 0, 0, 1, 0, -8)', 'aspect-ratio': '16 / 9' });
  const { sx, raw } = mapStyles({ tag: 'div', kind: 'container', s, c: CONTROLS.div, parent, rect: R(20, 10, 200, 100) });
  assert.equal(sx.pos, 'absolute');
  assert.equal(sx.z, 30);
  assert.ok(raw.includes('top:10px') && raw.includes('left:20px'));
  assert.ok(!raw.some((rr) => rr.startsWith('right:')), 'right/bottom would overconstrain with width');
  assert.ok(raw.includes('overflow:hidden'));
  assert.ok(raw.includes('opacity:0.5'));
  assert.ok(raw.some((rr) => rr.startsWith('transform:matrix')));
  assert.ok(raw.includes('aspect-ratio:16 / 9'));
});

test('classify: headings, inline-only text runs, containers, html carriers', () => {
  const textKid = { tag: '#text', text: 'hi' };
  assert.equal(classify({ tag: 'h2', children: [textKid] }), 'heading');
  assert.equal(classify({ tag: 'p', children: [textKid, { tag: 'em', styles: st({ display: 'inline' }), children: [textKid] }] }), 'text');
  assert.equal(classify({ tag: 'a', children: [textKid] }), 'text');
  assert.equal(classify({ tag: 'div', children: [textKid] }), 'text', 'a div of pure text is a text block');
  assert.equal(classify({ tag: 'div', children: [textKid, { tag: 'a', styles: st({ display: 'inline-flex' }), children: [textKid] }] }), 'container', 'an inline-flex .btn anchor is a real box — parent stays a container');
  assert.equal(classify({ tag: 'a', children: [{ tag: 'div', styles: st(), children: [] }] }), 'container');
  assert.equal(classify({ tag: 'svg' }), 'svg');
  assert.equal(classify({ tag: 'img' }), 'img');
  assert.equal(classify({ tag: 'iframe' }), 'html');
});

test('textRun: em/strong/br survive, spans/links flatten with a note', () => {
  const notes = new Set();
  const out = textRun([
    { tag: '#text', text: 'Ship ' },
    { tag: 'em', children: [{ tag: '#text', text: 'insight' }] },
    { tag: '#text', text: ' & ' },
    { tag: 'span', styles: st({ display: 'inline' }), children: [{ tag: '#text', text: 'more' }] },
    { tag: 'br' },
    { tag: 'a', styles: st({ display: 'inline' }), children: [{ tag: '#text', text: 'now' }] },
  ], notes);
  assert.equal(out, 'Ship <em>insight</em> &amp; more<br>now');
  assert.ok([...notes].some((n) => n.includes('inline <a>')));
});

test('diffMobile: changed sx keys emit, desktop-only keys reset, unsupported keys note + keep desktop', () => {
  const notes = new Set();
  const m = diffMobile(
    { size: 48, w: 640, pad: [96, 24], gridCols: 2, bg: '#fff' },
    { size: 32, pad: [48, 16], gridCols: '358px', bg: '#eee' },
    notes,
  );
  assert.equal(m.size, 32);
  assert.equal(m.w, '100%', 'desktop width resets to full at mobile');
  assert.deepEqual(m.pad, [48, 16]);
  assert.equal(m.gridCols, '358px');
  assert.equal(m.bg, undefined, 'bg is on the mobile skip-list');
  assert.ok([...notes].some((n) => n.includes("'bg'")));
});

/* ── a small synthetic capture: body > wrapper(div, trivial) > section-ish div > h2 + p + hidden div ── */
const capFixture = () => {
  const body = {
    tag: 'body', path: '0', styles: st({ 'background-color': 'rgb(255, 255, 255)' }), rect: R(0, 0, 1440, 800),
    children: [{
      tag: 'div', path: '0/0', styles: st(), rect: R(0, 0, 1440, 800),           // trivial wrapper
      children: [{
        tag: 'div', path: '0/0/0', styles: st({ display: 'flex', 'flex-direction': 'column', 'row-gap': '24px', 'column-gap': '24px', 'padding-top': '96px', 'padding-right': '24px', 'padding-bottom': '96px', 'padding-left': '24px' }), rect: R(0, 0, 1440, 800),
        children: [
          { tag: 'h2', path: '0/0/0/0', styles: st({ 'font-size': '36px', 'font-weight': '700', 'line-height': '40px', color: 'rgb(17, 24, 39)' }), rect: R(24, 96, 1392, 40), children: [{ tag: '#text', text: 'Hello import' }] },
          { tag: 'p', path: '0/0/0/1', styles: st({ 'font-size': '16px', 'line-height': '26px', color: 'rgb(55, 65, 81)' }), rect: R(24, 160, 1392, 52), children: [{ tag: '#text', text: 'Computed styles in, JSX out.' }] },
          { tag: 'div', path: '0/0/0/2', styles: st({ 'background-color': 'rgb(37, 99, 235)' }), rect: R(24, 240, 640, 60), children: [] },
        ],
      }],
    }],
  };
  return { tree: body, controls: CONTROLS, title: 'Fixture', scrollHeight: 800 };
};
const capFixtureMobile = () => {
  const cap = capFixture();
  const sec = cap.tree.children[0].children[0];
  sec.rect = R(0, 0, 390, 900);
  sec.styles = st({ ...sec.styles, 'padding-top': '48px', 'padding-bottom': '48px', 'padding-left': '16px', 'padding-right': '16px' });
  cap.tree.rect = R(0, 0, 390, 900);
  cap.tree.children[0].rect = R(0, 0, 390, 900);
  sec.children[0].styles = st({ ...sec.children[0].styles, 'font-size': '28px', 'line-height': '32px' });
  sec.children[0].rect = R(16, 48, 358, 64);
  sec.children[1].rect = R(16, 128, 358, 78);
  sec.children[2] = { tag: 'div', path: '0/0/0/2', hidden: true };                // hidden at mobile
  return cap;
};

test('buildTree + collapseTree: trivial wrappers collapse, sections at top level, mobile diffs land', () => {
  const notes = new Set();
  const { root } = buildTree(capFixture(), capFixtureMobile(), { notes });
  const collapsed = collapseTree(root);
  collapsed.isRoot = true;
  assert.equal(collapsed.children.length, 1, 'trivial body wrapper chain collapsed');
  const sec = collapsed.children[0];
  assert.equal(sec.kind, 'section');
  assert.deepEqual(sec.sx.pad, [96, 24]);
  assert.equal(sec.sx.gap, 24);
  assert.deepEqual(sec.mobile, { pad: [48, 16] });
  const [h2n, pn, blue] = sec.children;
  assert.equal(h2n.kind, 'heading');
  assert.equal(h2n.tag, 'h2');
  assert.equal(h2n.sx.size, 36);
  assert.deepEqual(h2n.mobile, { size: 28, lh: '32px' });
  assert.equal(pn.kind, 'text');
  assert.equal(pn.text, 'Computed styles in, JSX out.');
  assert.deepEqual(blue.mobile, { display: 'none' }, 'hidden at mobile → display none override');
  assert.equal(blue.sx.bg, '#2563eb');
  assert.equal(blue.sx.w, 640);
});

test('emitNode/emitPageJsx: valid page source with header comment, canvas template, meta', () => {
  const { jsx, stats } = pageFromCaptures(capFixture(), capFixtureMobile(), { title: 'Fixture', source: 'test.html' });
  assert.ok(jsx.startsWith('// imported by exjsx import from test.html'));
  assert.ok(jsx.includes("template: 'elementor_canvas'"));
  assert.ok(jsx.includes('<section'));
  assert.ok(jsx.includes('<h2'));
  assert.ok(/mobile=\{\{/.test(jsx));
  assert.ok(stats.emitted >= 5);
  const one = emitNode({ kind: 'text', sx: { size: 14 }, raw: '', mobile: null, text: 'x', href: 'https://a.b/' });
  assert.ok(one.includes('href="https://a.b/"'));
  assert.ok(one.includes('& a{color:inherit'), 'linked text neutralizes the anchor color trap');
});

test('an emitted page COMPILES through the real pipeline (esbuild → render → compileSite → lint 0 errors)', async () => {
  const { jsx } = pageFromCaptures(capFixture(), capFixtureMobile(), { title: 'Fixture', source: 'test.html' });
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-imp-'));
  const pageFile = join(dir, 'fixture.page.jsx');
  writeFileSync(pageFile, jsx);
  const res = await esbuild.build(buildOptions(pageFile));
  const out = join(dir, 'built.mjs');
  writeFileSync(out, res.outputFiles[0].text);
  const mod = await import(pathToFileURL(out).href);
  assert.equal(typeof mod.default, 'function');
  const bundle = compileSite(defineSite({ name: 'imp-test', pages: [{ title: mod.meta.title, slug: 'fixture', template: mod.meta.template, node: h(mod.default, {}) }] }));
  assert.ok(bundle.pages[0].elements.length >= 1);
  const lint = lintBundle(bundle);
  assert.equal(lint.counts.error, 0, JSON.stringify(lint.findings ?? lint));
});

test('browser-side entry points exist (exercised live by the CLI, not in unit scope)', () => {
  assert.equal(typeof captureSource, 'function');
  assert.equal(typeof importPage, 'function');
  assert.equal(typeof mapStyles, 'function');
  assert.equal(typeof emitPageJsx, 'function');
  assert.equal(typeof diffMobile, 'function');
  assert.equal(typeof buildTree, 'function');
  assert.equal(typeof collapseTree, 'function');
});


/* ── collectFonts: the imported page must carry its own webfonts ──
 * The capture reads computed styles but never the document's <link> tags, so before this an
 * imported page silently fell back to a system stack inside WordPress and every metric shifted. */

test('collectFonts: returns each real family with the weights actually used, 400 always present', () => {
  const tree = {
    sx: { font: 'Playfair Display, serif', weight: 700 },
    children: [
      { sx: { weight: 600 }, children: [] },                                  // inherits Playfair
      { sx: { font: '"Plus Jakarta Sans", sans-serif', weight: 500 }, children: [] },
    ],
  };
  const got = collectFonts(tree);
  const byFam = Object.fromEntries(got.map((f) => [f.family, f.weights]));
  assert.deepEqual(Object.keys(byFam).sort(), ['Playfair Display', 'Plus Jakarta Sans']);
  // 700 declared on the node, 600 inherited from a descendant, 400 always
  assert.deepEqual(byFam['Playfair Display'], [400, 600, 700]);
  assert.deepEqual(byFam['Plus Jakarta Sans'], [400, 500]);
});

test('collectFonts: generic stacks are not webfonts and must not be requested', () => {
  for (const fam of ['sans-serif', 'ui-monospace', 'system-ui', 'inherit']) {
    assert.deepEqual(collectFonts({ sx: { font: fam }, children: [] }), [], fam);
  }
  assert.deepEqual(collectFonts({ sx: {}, children: [] }), []);
});

test('emitPageJsx: injects a fontLoader per family as the root\'s first children', () => {
  const root = { kind: 'container', tag: 'box', sx: { font: 'Playfair Display', weight: 700 }, raw: [], children: [] };
  const out = emitPageJsx(root, { title: 'T', source: 'x.html' });
  assert.match(out, /\{fontLoader\("Playfair Display", \[400, 700\]\)\}/);
  // must land INSIDE the root element, not before it
  assert.ok(out.indexOf('fontLoader') > out.indexOf('export default () => ('), 'loader is inside the tree');
});
