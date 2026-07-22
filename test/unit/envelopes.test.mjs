/**
 * Typed-envelope constructors (kit.mjs) — the verified Elementor prop shapes. These are the
 * atoms of parity: if one drifts, the PHP validator rejects entire trees. Every constructor
 * is pinned to its exact serialized form.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  S, C, N, B, SZ, DIM, M, P0, RAD, RADT, RADB, BG, GRAD, SHADOW,
  HUG, AUTO, HTML, LINK, CLS, IMG_ID, SVG_ID, CUSTOM_CSS,
} from '../../src/kit/kit.mjs';

test('scalars: S/C/N/B', () => {
  assert.deepEqual(S('x'), { $$type: 'string', value: 'x' });
  assert.deepEqual(C('#fff'), { $$type: 'color', value: '#fff' });
  assert.deepEqual(N(5), { $$type: 'number', value: 5 });
  assert.deepEqual(B(true), { $$type: 'boolean', value: true });
});

test('SZ: px default, explicit unit, zero, negative, fractional', () => {
  assert.deepEqual(SZ(16), { $$type: 'size', value: { unit: 'px', size: 16 } });
  assert.deepEqual(SZ(50, '%').value, { unit: '%', size: 50 });
  assert.deepEqual(SZ(0).value.size, 0);
  assert.deepEqual(SZ(-0.02, 'em').value, { unit: 'em', size: -0.02 });
});

test('DIM: CSS shorthand order maps to LOGICAL sides', () => {
  const d = DIM(1, 2, 3, 4).value;
  assert.deepEqual(d['block-start'], SZ(1));
  assert.deepEqual(d['inline-end'], SZ(2));
  assert.deepEqual(d['block-end'], SZ(3));
  assert.deepEqual(d['inline-start'], SZ(4));
});

test('DIM: 1-arg and 2-arg shorthand expansion', () => {
  assert.deepEqual(DIM(8), DIM(8, 8, 8, 8));
  assert.deepEqual(DIM(96, 24), DIM(96, 24, 96, 24));
});

test('P0: the padding-zero constant equals DIM(0)', () => {
  assert.deepEqual(P0, DIM(0));
});

test('M: auto sides for centering, envelope passthrough', () => {
  const m = M(0, 'auto').value;
  assert.deepEqual(m['block-start'], SZ(0));
  assert.deepEqual(m['inline-end'], AUTO);
  assert.deepEqual(m['inline-start'], AUTO);
  const custom = M(SZ(2, 'em'), 0).value;
  assert.deepEqual(custom['block-start'], SZ(2, 'em'), 'pre-built envelope passes through');
});

test('RAD family: all corners / top-only / bottom-only', () => {
  const r = RAD(24).value;
  for (const k of ['start-start', 'start-end', 'end-end', 'end-start']) assert.deepEqual(r[k], SZ(24));
  const t = RADT(16).value;
  assert.deepEqual([t['start-start'], t['start-end'], t['end-end'], t['end-start']], [SZ(16), SZ(16), SZ(0), SZ(0)]);
  const b = RADB(16).value;
  assert.deepEqual([b['start-start'], b['end-end']], [SZ(0), SZ(16)]);
});

test('BG: solid color background envelope', () => {
  assert.deepEqual(BG('#0A2230'), { $$type: 'background', value: { color: C('#0A2230') } });
});

test('GRAD: full gradient-overlay envelope (type/angle/stops at 0 and 100)', () => {
  const g = GRAD(130, '#093D57', '#06293C');
  assert.equal(g.$$type, 'background');
  const overlay = g.value['background-overlay'];
  assert.equal(overlay.$$type, 'background-overlay');
  const grad = overlay.value[0];
  assert.equal(grad.$$type, 'background-gradient-overlay');
  assert.deepEqual(grad.value.type, S('linear'));
  assert.deepEqual(grad.value.angle, N(130));
  const stops = grad.value.stops;
  assert.equal(stops.$$type, 'gradient-color-stop');
  assert.deepEqual(stops.value[0].value, { color: C('#093D57'), offset: N(0) });
  assert.deepEqual(stops.value[1].value, { color: C('#06293C'), offset: N(100) });
});

test('SHADOW: single-shadow array with h/v/blur/spread/color', () => {
  const sh = SHADOW(8, 30, -12, 'rgba(0,0,0,.25)', 2);
  assert.equal(sh.$$type, 'box-shadow');
  assert.deepEqual(sh.value[0].value, {
    hOffset: SZ(2), vOffset: SZ(8), blur: SZ(30), spread: SZ(-12), color: C('rgba(0,0,0,.25)'),
  });
});

test('HUG / AUTO: keyword size envelopes', () => {
  assert.deepEqual(HUG, { $$type: 'size', value: { unit: 'custom', size: 'fit-content' } });
  assert.deepEqual(AUTO, { $$type: 'size', value: { unit: 'auto', size: null } });
});

test('HTML: html-v3 with EMPTY children array (required by validator)', () => {
  assert.deepEqual(HTML('Hi <em>x</em>'), { $$type: 'html-v3', value: { content: S('Hi <em>x</em>'), children: [] } });
});

test('LINK: url destination + target-blank flag', () => {
  assert.deepEqual(LINK('/x/'), { $$type: 'link', value: { destination: { $$type: 'url', value: '/x/' }, isTargetBlank: B(false) } });
  assert.equal(LINK('https://e.co', true).value.isTargetBlank.value, true);
});

test('CLS: classes envelope', () => {
  assert.deepEqual(CLS(['a', 'b']), { $$type: 'classes', value: ['a', 'b'] });
});

test('IMG_ID: id-XOR-url enforced (url null), size variant', () => {
  const i = IMG_ID(42);
  assert.deepEqual(i.value.src.value, { id: { $$type: 'image-attachment-id', value: 42 }, url: null });
  assert.deepEqual(i.value.size, S('full'));
  assert.deepEqual(IMG_ID(42, 'large').value.size, S('large'));
});

test('SVG_ID: svg-src with id-XOR-url', () => {
  assert.deepEqual(SVG_ID(7), { $$type: 'svg-src', value: { id: { $$type: 'image-attachment-id', value: 7 }, url: null } });
});

test('CUSTOM_CSS: base64-wrapped raw (plain CSS silently no-ops — the encoding IS the contract)', () => {
  const c = CUSTOM_CSS('color:red;');
  assert.deepEqual(Object.keys(c), ['raw']);
  assert.equal(Buffer.from(c.raw, 'base64').toString('utf8'), 'color:red;');
});

test('envelopes are JSON-stable (serialize → parse → deep-equal, no functions/symbols)', () => {
  for (const env of [S('x'), C('#fff'), SZ(5), DIM(1, 2), M(0, 'auto'), RAD(9), BG('#000'), GRAD(90, '#000', '#fff'), SHADOW(1, 2, 0, '#000'), HUG, AUTO, HTML('t'), LINK('/'), IMG_ID(1), SVG_ID(1)]) {
    assert.deepEqual(JSON.parse(JSON.stringify(env)), env);
  }
});
