/**
 * sx() — the shorthand→atomic-envelope mapping. This is the core of the parity engine:
 * every key an author can write must compile to the EXACT verified Elementor envelope shape.
 * Table-driven: input → expected prop key + deep-equal envelope. Any drift here breaks parity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sx, FLEX } from '../../src/kit/kit-components.mjs';
import { S, C, N, SZ, DIM, M, RAD, BG, GRAD, SHADOW, SHADOWS, HUG, AUTO } from '../../src/kit/kit.mjs';

const VAR_REF = { $$type: 'global-color-variable', value: 'e-gv-abc1234', __lit: '#123456' };
const FONT_REF = { $$type: 'global-font-variable', value: 'e-gv-def5678' };

/** [name, input, expectations {propKey: envelope}] */
const CASES = [
  // ── background ──
  ['bg literal hex', { bg: '#0A2230' }, { background: BG('#0A2230') }],
  ['bg rgba literal', { bg: 'rgba(0,0,0,0.4)' }, { background: BG('rgba(0,0,0,0.4)') }],
  ['bg gradient array → GRAD', { bg: [130, '#093D57', '#06293C'] }, { background: GRAD(130, '#093D57', '#06293C') }],
  ['bg variable ref DEGRADES to __lit literal (Elementor 4.1.4 atomic bg)', { bg: VAR_REF },
    { background: { $$type: 'background', value: { color: C('#123456') } } }],
  ['bg pre-built background envelope passes through', { bg: BG('#fff') }, { background: BG('#fff') }],
  ['grad key', { grad: [90, '#000', '#fff'] }, { background: GRAD(90, '#000', '#fff') }],

  // ── spacing ──
  ['pad number → uniform DIM', { pad: 24 }, { padding: DIM(24) }],
  ['pad 0 (explicit — the intrinsic-10px guard)', { pad: 0 }, { padding: DIM(0) }],
  ['pad array [v,h]', { pad: [96, 24] }, { padding: DIM(96, 24) }],
  ['pad array [t,r,b,l]', { pad: [1, 2, 3, 4] }, { padding: DIM(1, 2, 3, 4) }],
  ['m number', { m: 12 }, { margin: M(12) }],
  ['m array with auto (centering)', { m: [0, 'auto'] }, { margin: M(0, 'auto') }],
  ['center → margin 0 auto', { center: true }, { margin: M(0, 'auto') }],
  ['gap', { gap: 18 }, { gap: SZ(18) }],

  // ── sizing ──
  ['w number → px', { w: 320 }, { width: SZ(320) }],
  ['w percent string', { w: '50%' }, { width: SZ(50, '%') }],
  ['w px string', { w: '75px' }, { width: SZ(75, 'px') }],
  ['w hug → fit-content envelope', { w: 'hug' }, { width: HUG }],
  ['w auto → AUTO envelope', { w: 'auto' }, { width: AUTO }],
  ['h number', { h: 44 }, { height: SZ(44) }],
  ['h percent', { h: '100%' }, { height: SZ(100, '%') }],
  ['maxw', { maxw: 1200 }, { 'max-width': SZ(1200) }],
  ['minh', { minh: 480 }, { 'min-height': SZ(480) }],

  // ── flex/grid layout ──
  ['align', { align: 'center' }, { 'align-items': S('center') }],
  ['justify', { justify: 'space-between' }, { 'justify-content': S('space-between') }],
  ['dir', { dir: 'row' }, { 'flex-direction': S('row') }],
  ['wrap true → wrap', { wrap: true }, { 'flex-wrap': S('wrap') }],
  ['wrap explicit value', { wrap: 'wrap-reverse' }, { 'flex-wrap': S('wrap-reverse') }],
  ['flex → FLEX composite (grow/shrink/basis)', { flex: 1 }, { flex: FLEX(1) }],
  ['span → grid-column span envelope', { span: 6 }, { 'grid-column': { $$type: 'span', value: 6 } }],
  ['rowSpan → grid-row span envelope (same authored NUMBER form as span)', { rowSpan: 2 },
    { 'grid-row': { $$type: 'span', value: 2 } }],
  ['display', { display: 'grid' }, { display: S('grid') }],
  ['gridCols number → display:grid + repeat()', { gridCols: 3 },
    { display: S('grid'), 'grid-template-columns': S('repeat(3, 1fr)') }],
  ['gridCols template string passthrough', { gridCols: '2fr 1fr' },
    { display: S('grid'), 'grid-template-columns': S('2fr 1fr') }],
  ['gridRows number → display:grid + repeat()', { gridRows: 2 },
    { display: S('grid'), 'grid-template-rows': S('repeat(2, 1fr)') }],
  ['gridRows template string passthrough', { gridRows: 'auto 1fr' },
    { display: S('grid'), 'grid-template-rows': S('auto 1fr') }],
  // two-axis gap: ONE layout-direction envelope, never row-gap/column-gap prop keys
  ['gapX + gapY → layout-direction gap', { gapX: 16, gapY: 32 },
    { gap: { $$type: 'layout-direction', value: { column: SZ(16), row: SZ(32) } } }],
  ['gapX alone → single-axis layout-direction (Multi_Props isset-filters)', { gapX: 16 },
    { gap: { $$type: 'layout-direction', value: { column: SZ(16) } } }],
  ['gap + gapY → gap fills the missing column axis', { gap: 20, gapY: 32 },
    { gap: { $$type: 'layout-direction', value: { column: SZ(20), row: SZ(32) } } }],
  ['pos', { pos: 'absolute' }, { position: S('absolute') }],

  // ── typography ──
  ['color literal → color envelope', { color: '#E01118' }, { color: C('#E01118') }],
  ['color variable ref stays LIVE and __lit is STRIPPED (validator rejects extras)', { color: VAR_REF },
    { color: { $$type: 'global-color-variable', value: 'e-gv-abc1234' } }],
  ['size → font-size px', { size: 40 }, { 'font-size': SZ(40) }],
  ['weight number → string envelope', { weight: 700 }, { 'font-weight': S('700') }],
  ['weight string', { weight: '600' }, { 'font-weight': S('600') }],
  ['font literal string', { font: 'Poppins' }, { 'font-family': S('Poppins') }],
  ['font variable ref passes through (live binding)', { font: FONT_REF }, { 'font-family': FONT_REF }],
  ['ta left → start (validator enum)', { ta: 'left' }, { 'text-align': S('start') }],
  ['ta right → end', { ta: 'right' }, { 'text-align': S('end') }],
  ['ta center passthrough', { ta: 'center' }, { 'text-align': S('center') }],
  ['ta justify passthrough', { ta: 'justify' }, { 'text-align': S('justify') }],
  ['lh unitless ≤4 → em', { lh: 1.6 }, { 'line-height': SZ(1.6, 'em') }],
  ['lh boundary 4 → em', { lh: 4 }, { 'line-height': SZ(4, 'em') }],
  ['lh >4 → px', { lh: 24 }, { 'line-height': SZ(24, 'px') }],
  ['ls → em', { ls: 0.12 }, { 'letter-spacing': SZ(0.12, 'em') }],

  // ── decoration ──
  ['radius', { radius: 24 }, { 'border-radius': RAD(24) }],
  ['shadow array → SHADOW', { shadow: [8, 24, -8, 'rgba(0,0,0,0.3)'] }, { 'box-shadow': SHADOW(8, 24, -8, 'rgba(0,0,0,0.3)') }],
  ['shadow envelope passthrough', { shadow: SHADOW(2, 4, 0, '#000') }, { 'box-shadow': SHADOW(2, 4, 0, '#000') }],
  ['fit → object-fit', { fit: 'cover' }, { 'object-fit': S('cover') }],
  ['border [w,color] → width+color+style solid', { border: [2, '#E4E9DC'] },
    { 'border-width': SZ(2), 'border-color': C('#E4E9DC'), 'border-style': S('solid') }],
  ['border color-only → 1px', { border: '#E4E9DC' },
    { 'border-width': SZ(1), 'border-color': C('#E4E9DC'), 'border-style': S('solid') }],
  // a bare NUMBER is a width like CSS `border:1px` — must NOT become border-color:{value:1}
  // (which 422s the deploy). Regression from a field run.
  ['border number → width only, no poisoned color', { border: 1 },
    { 'border-width': SZ(1), 'border-style': S('solid') }],
  ['border number + borderColor → both', { border: 2, borderColor: '#ccc' },
    { 'border-width': SZ(2), 'border-color': C('#ccc'), 'border-style': S('solid') }],
  ['borderColor alone → color + 1px solid', { borderColor: '#E4E9DC' },
    { 'border-color': C('#E4E9DC'), 'border-width': SZ(1), 'border-style': S('solid') }],
  // sx={{…}} as a prop merges as shorthand (React/MUI reflex) instead of silently dropping
  ['sx prop merges shorthand', { sx: { gap: 8 }, pad: 4 },
    { gap: SZ(8), padding: DIM(4) }],
  ['zIndex → z-index number', { zIndex: 5 }, { 'z-index': { $$type: 'number', value: 5 } }],
  ['z shorthand → z-index number', { z: 3 }, { 'z-index': { $$type: 'number', value: 3 } }],
];

for (const [name, input, expected] of CASES) {
  test(`sx: ${name}`, () => {
    const out = sx(input);
    for (const [key, env] of Object.entries(expected)) {
      assert.deepEqual(out[key], env, `prop "${key}"`);
    }
    // no unexpected keys beyond the expected set for a single-input case
    assert.deepEqual(Object.keys(out).sort(), Object.keys(expected).sort(), 'exact key set');
  });
}

test('sx: responsive recursion — tablet/mobile compile to _t/_m variant props', () => {
  const out = sx({ size: 40, mobile: { size: 24, ta: 'center' }, tablet: { size: 32 } });
  assert.deepEqual(out['font-size'], SZ(40));
  assert.deepEqual(out._t, { 'font-size': SZ(32) });
  assert.deepEqual(out._m, { 'font-size': SZ(24), 'text-align': S('center') });
});

test('sx: nested responsive inside responsive is NOT a thing (flat single level)', () => {
  const out = sx({ mobile: { size: 20 } });
  assert.equal(out._m._m, undefined);
});

test('sx: props escape hatch merges raw envelopes and WINS on conflict', () => {
  const out = sx({ w: 100, props: { width: SZ(50, '%'), 'z-index': N(5) } });
  assert.deepEqual(out.width, SZ(50, '%'), 'props overrides shorthand');
  assert.deepEqual(out['z-index'], N(5));
});

test('sx: empty input → empty props (no accidental defaults)', () => {
  assert.deepEqual(sx({}), {});
  assert.deepEqual(sx(), {});
});

test('sx: grad wins over bg when both given (grad applied last)', () => {
  const out = sx({ bg: '#fff', grad: [90, '#000', '#111'] });
  assert.deepEqual(out.background, GRAD(90, '#000', '#111'));
});

test('sx: zero values are not dropped (pad:0, gap:0, size:0, ls:0 must emit)', () => {
  const out = sx({ pad: 0, gap: 0, m: 0, radius: 0, ls: 0, lh: 0, minh: 0 });
  assert.ok(out.padding && out.gap && out.margin && out['border-radius'], 'zero spacing kept');
  assert.deepEqual(out['letter-spacing'], SZ(0, 'em'));
  assert.deepEqual(out['line-height'], SZ(0, 'em'));
  assert.deepEqual(out['min-height'], SZ(0));
});

test('FLEX: composite shape (flexGrow/flexShrink/flexBasis) with auto basis', () => {
  assert.deepEqual(FLEX(1), { $$type: 'flex', value: { flexGrow: N(1), flexShrink: N(1), flexBasis: SZ(0) } });
  assert.deepEqual(FLEX(2, 0, 'auto').value.flexBasis, AUTO);
});

test('sx: bgImage(url) → background-image-overlay envelope (validated live)', () => {
  const out = sx({ bgImage: 'https://x.test/hero.jpg' });
  assert.equal(out.background.$$type, 'background');
  const overlays = out.background.value['background-overlay'].value;
  assert.equal(overlays[0].$$type, 'background-image-overlay');
  assert.equal(overlays[0].value.image.value.src.value.url.value, 'https://x.test/hero.jpg');
  assert.equal(overlays[0].value.size.value, 'cover');
});

test('sx: bgImage(attachmentId) uses image-attachment-id src', () => {
  const out = sx({ bgImage: 42 });
  const src = out.background.value['background-overlay'].value[0].value.image.value.src.value;
  assert.equal(src.id.value, 42);
});

test('sx: bgImage with bgOpts overrides size/position/repeat', () => {
  const out = sx({ bgImage: 'https://x.test/h.jpg', bgOpts: { size: 'contain', position: 'top left', repeat: 'repeat' } });
  const ov = out.background.value['background-overlay'].value[0].value;
  assert.equal(ov.size.value, 'contain');
  assert.equal(ov.position.value, 'top left');
  assert.equal(ov.repeat.value, 'repeat');
});

/* 1.9.2 field report #6 — the AUTHORING half of multi-layer shadows: `shadow` takes one spec
 * tuple, an ARRAY of spec tuples, or a prebuilt envelope. Before this, layered elevation and
 * pixel-stepped borders had no atomic form at all. */
test('sx shadow: one spec tuple → SHADOW; an array of tuples → the multi-item SHADOWS envelope', () => {
  assert.deepEqual(sx({ shadow: [8, 30, -12, 'rgba(0,0,0,.25)', 2] })['box-shadow'], SHADOW(8, 30, -12, 'rgba(0,0,0,.25)', 2));
  const multi = sx({ shadow: [[0, 0, 0, '#111', 1], [0, 0, 0, '#111', 2]] })['box-shadow'];
  assert.deepEqual(multi, SHADOWS([0, 0, 0, '#111', 1], [0, 0, 0, '#111', 2]));
  assert.equal(multi.value.length, 2, 'ONE box-shadow envelope, two shadow items');
});

test('sx shadow: a prebuilt envelope passes through, and an empty array is a loud build error', () => {
  const env = SHADOWS([1, 2, 3, '#000']);
  assert.equal(sx({ shadow: env })['box-shadow'], env);
  assert.throws(() => sx({ shadow: [] }), /empty array/);
});

test('sx shadow: boxShadow/box-shadow aliases reach the same array handling', () => {
  assert.deepEqual(sx({ boxShadow: [[0, 0, 0, '#111', 1], [0, 0, 0, '#111', 2]] })['box-shadow'],
    sx({ 'box-shadow': [[0, 0, 0, '#111', 1], [0, 0, 0, '#111', 2]] })['box-shadow']);
});
