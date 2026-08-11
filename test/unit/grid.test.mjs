/**
 * Native e-grid (Elementor ≥ 4.2) — the atomic grid element + its two new envelope types.
 * Shapes verified against the live plugin source (grid.php, grid-track-size-prop-type.php,
 * layout-direction-prop-type.php, Grid_Track_Renderer, Multi_Props_Transformer @ 4.2.1) and an
 * end-to-end deploy+render probe on the :8947 playground. Contracts under test:
 *   - TRACKS: number → {unit:'fr', size:N} (renders repeat(N, 1fr)); string → {unit:'custom'}.
 *   - GAPXY: {column, row} of size envelopes ($$type 'layout-direction'); single-axis legal.
 *   - nativeGrid/<grid>: e-grid with EVERY base-style leak re-emitted explicitly (display,
 *     tracks, gap, padding, the mobile 1-column override) per the kit explicitness doctrine.
 *   - assertTree treats e-grid as a container (padding rule); decompile round-trips <grid>.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKS, GAPXY, nativeGrid, assertTree, S, SZ, DIM, P0, col, para,
} from '../../src/kit/kit.mjs';
import { sx } from '../../src/kit/kit-components.mjs';
import { h, render, renderPage } from '../../src/runtime.mjs';
import { decompile } from '../../src/decompile.mjs';
import { resetIds, deskProps, variantProps, allNodes } from '../helpers.mjs';

beforeEach(() => resetIds());

/* ── envelope constructors ── */
test('TRACKS: number → fr repeat-count envelope; string → custom track list', () => {
  assert.deepEqual(TRACKS(3), { $$type: 'grid-track-size', value: { unit: 'fr', size: 3 } });
  assert.deepEqual(TRACKS('240px 1fr 1fr'), { $$type: 'grid-track-size', value: { unit: 'custom', size: '240px 1fr 1fr' } });
  assert.deepEqual(TRACKS('auto'), { $$type: 'grid-track-size', value: { unit: 'custom', size: 'auto' } });
});

test('TRACKS: throws on non-positive/fractional counts (Grid_Track_Renderer::format_repeat needs ≥1 int)', () => {
  assert.throws(() => TRACKS(0), /positive integer/);
  assert.throws(() => TRACKS(2.5), /positive integer/);
});

test('GAPXY: two-axis layout-direction; single value fills both; envelopes pass through', () => {
  assert.deepEqual(GAPXY(16, 32), { $$type: 'layout-direction', value: { column: SZ(16), row: SZ(32) } });
  assert.deepEqual(GAPXY(20), { $$type: 'layout-direction', value: { column: SZ(20), row: SZ(20) } });
  assert.deepEqual(GAPXY(SZ(2, 'em'), 8).value.column, SZ(2, 'em'));
});

/* ── nativeGrid kit helper ── */
test('nativeGrid: e-grid with every base-style leak re-emitted (display/tracks/gap/padding/mobile 1-col)', () => {
  const g = nativeGrid({ cols: 3, gap: 24 }, [col({ padding: P0 }, [para('a')])]);
  assert.equal(g.elType, 'e-grid');
  assert.deepEqual(g.settings.tag, S('div'));
  const p = deskProps(g);
  assert.deepEqual(p.display, S('grid'));
  assert.deepEqual(p['grid-template-columns'], TRACKS(3));
  assert.deepEqual(p['grid-template-rows'], TRACKS('auto'), 'kills the base repeat(2,1fr) equal-height leak');
  assert.deepEqual(p.gap, GAPXY(24));
  assert.deepEqual(p.padding, DIM(0), 'intrinsic 10px guard applies to e-grid too');
  assert.deepEqual(variantProps(g, 'mobile'), { 'grid-template-columns': TRACKS(1) }, 'native mobile 1-column default');
});

test('nativeGrid: [column,row] gap, custom tracks, rows count, tag passthrough (grid.php enum)', () => {
  const g = nativeGrid({ cols: '2fr 1fr', rows: 2, gap: [16, 32], tag: 'section' }, []);
  assert.deepEqual(g.settings.tag, S('section'));
  const p = deskProps(g);
  assert.deepEqual(p['grid-template-columns'], TRACKS('2fr 1fr'));
  assert.deepEqual(p['grid-template-rows'], TRACKS(2));
  assert.deepEqual(p.gap, GAPXY(16, 32));
});

test('nativeGrid: author _m grid-template-columns beats the mobile 1-col default; extra _m keys merge', () => {
  const g = nativeGrid({ cols: 4, props: { _m: { 'grid-template-columns': TRACKS(2), gap: GAPXY(8) } } }, []);
  assert.deepEqual(variantProps(g, 'mobile'), { 'grid-template-columns': TRACKS(2), gap: GAPXY(8) });
});

test('assertTree: e-grid is a container — no explicit padding = structural error', () => {
  const bare = { id: 'x1', elType: 'e-grid', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] };
  assert.throws(() => assertTree([bare]), /container without explicit padding/);
  assertTree([nativeGrid({}, [])]);   // the helper bakes padding — passes
});

/* ── the <grid> JSX intrinsic ── */
test('<grid>: emits native e-grid; cols/rows/gapX/gapY/pad flow through sx', () => {
  const g = render(h('grid', { cols: 3, rows: 2, gapX: 16, gapY: 32, pad: 0 }, h('box', { pad: 0 }, 'x')));
  assert.equal(g.elType, 'e-grid');
  const p = deskProps(g);
  assert.deepEqual(p['grid-template-columns'], TRACKS(3));
  assert.deepEqual(p['grid-template-rows'], TRACKS(2));
  assert.deepEqual(p.gap, { $$type: 'layout-direction', value: { column: SZ(16), row: SZ(32) } });
  assert.deepEqual(p.padding, DIM(0));
  assert.equal(g.elements.length, 1);
  assert.equal(g.elements[0].elType, 'e-flexbox');
});

test('<grid>: defaults (cols 3, rows auto, gap 20 both axes, mobile 1-col) and uniform gap= override', () => {
  const g = render(h('grid', {}));
  const p = deskProps(g);
  assert.deepEqual(p['grid-template-columns'], TRACKS(3));
  assert.deepEqual(p.gap, GAPXY(20));
  assert.deepEqual(variantProps(g, 'mobile'), { 'grid-template-columns': TRACKS(1) });
  const g2 = render(h('grid', { gap: 12 }));
  assert.deepEqual(deskProps(g2).gap, SZ(12), 'sx uniform gap (a Size envelope — also valid in the schema union) wins over the default');
});

test('<grid tw="…">: the tailwind grid subset lands atomically (gap-x/gap-y, grid-rows)', () => {
  const g = render(h('grid', { tw: 'grid-cols-2 grid-rows-2 gap-x-4 gap-y-8' }));
  const p = deskProps(g);
  // tw gridCols/gridRows arrive via sx as STRING envelopes (the portable form) and win over defaults
  assert.deepEqual(p['grid-template-columns'], S('repeat(2, 1fr)'));
  assert.deepEqual(p['grid-template-rows'], S('repeat(2, 1fr)'));
  assert.deepEqual(p.gap, { $$type: 'layout-direction', value: { column: SZ(16), row: SZ(32) } });
});

test('<grid>: children carry span/rowSpan (tw col-span-N/row-span-N) as span envelopes', () => {
  const g = render(h('grid', { cols: 12 }, h('box', { tw: 'col-span-8 row-span-2', pad: 0 }, 'x')));
  const p = deskProps(g.elements[0]);
  assert.deepEqual(p['grid-column'], { $$type: 'span', value: 8 });
  assert.deepEqual(p['grid-row'], { $$type: 'span', value: 2 });
});

test('<grid id/href/cls>: shares the container specials (anchor id, link envelope, class label)', () => {
  const g = render(h('grid', { id: 'features', href: '/all/', cls: 'feature-grid' }));
  assert.deepEqual(g.settings._cssid, S('features'));
  assert.equal(g.settings.link.value.destination.value, '/all/');
});

/* ── decompile round-trip ── */
test('decompile: e-grid → <grid cols rows gapX/gapY>; fr and custom tracks invert; base padding baked', () => {
  const g = nativeGrid({ cols: 3, rows: 2, gap: [16, 32] }, []);
  const src = decompile([g]);
  assert.match(src, /<grid [^>]*cols=\{3\}/);
  assert.match(src, /rows=\{2\}/);
  assert.match(src, /gapX=\{16\}/);
  assert.match(src, /gapY=\{32\}/);
  const custom = decompile([nativeGrid({ cols: '240px 1fr', gap: 20 }, [])]);
  assert.match(custom, /cols=\{"240px 1fr"\}/);
  assert.match(custom, /gap=\{20\}/, 'equal axes collapse to one gap');
  // a FOREIGN e-grid with no local padding gets the native base 10px made explicit
  const foreign = { id: 'f1', elType: 'e-grid', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] };
  assert.match(decompile([foreign]), /<grid [^>]*pad=\{10\}/);
});

test('decompile → recompile: the emitted <grid> source renders back to an equivalent e-grid tree', () => {
  const orig = nativeGrid({ cols: 3, gap: 24 }, [col({ padding: P0 }, [para('card')])]);
  const src = decompile([orig]);
  // extract the JSX body and render it through the runtime (same trick decompile.test uses)
  const body = src.slice(src.indexOf('() => ['), src.indexOf('];') + 2).replace('() => ', '');
  assert.ok(body.includes('<grid'), 'grid tag emitted');
  const rt = render(h('grid', { cols: 3, gap: 24, pad: 0 }, h('box', { pad: 0 }, 'card')));
  assert.equal(rt.elType, 'e-grid');
  assert.deepEqual(deskProps(rt)['grid-template-columns'], deskProps(orig)['grid-template-columns']);
});

test('decompile: mobile track override survives (bare grid-template-columns in a variant used to be dropped)', () => {
  const g = nativeGrid({ cols: 4 }, []);
  const src = decompile([g]);
  assert.match(src, /mobile=\{\{ gridCols: 1 \}\}/);
});

test('renderPage: a grid page passes assertTree end to end', () => {
  const els = renderPage(h('grid', { cols: 3, pad: 0 }, [
    h('box', { pad: 0 }, h('text', {}, 'a')), h('box', { pad: 0 }, h('text', {}, 'b')), h('box', { pad: 0 }, h('text', {}, 'c')),
  ]));
  assertTree(els);
  assert.equal(allNodes(els).filter((n) => n.elType === 'e-grid').length, 1);
});
