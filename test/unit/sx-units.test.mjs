/**
 * sx unit handling — the '88vw→88px' family. Every case here is a shipped field defect:
 * a unit-suffixed string silently parseFloat'd to px (maxw="88vw" rendered a site of 88px-wide
 * cards; minh="60vh"→60px; maxw="100%"→100px), or a string spread char-by-char (grad).
 * Contract: units Elementor's schema accepts are HONORED; everything else THROWS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sx, FLEX } from '../../src/kit/kit-components.mjs';
import { GRAD } from '../../src/kit/kit.mjs';

const size = (env) => env.value; // {unit, size}

test('maxw/minh honor %, vw, vh, rem (the silent-px bugs)', () => {
  assert.deepEqual(size(sx({ maxw: '100%' })['max-width']), { unit: '%', size: 100 });
  assert.deepEqual(size(sx({ maxw: '88vw' })['max-width']), { unit: 'vw', size: 88 });
  assert.deepEqual(size(sx({ minh: '60vh' })['min-height']), { unit: 'vh', size: 60 });
  assert.deepEqual(size(sx({ maxw: '40rem' })['max-width']), { unit: 'rem', size: 40 });
  assert.deepEqual(size(sx({ maxw: 480 })['max-width']), { unit: 'px', size: 480 });
  assert.deepEqual(size(sx({ maxw: '480px' })['max-width']), { unit: 'px', size: 480 });
});

test('w/h honor vw/vh/ch alongside % and keep hug/auto', () => {
  assert.deepEqual(size(sx({ w: '100vw' }).width), { unit: 'vw', size: 100 });
  assert.deepEqual(size(sx({ h: '100vh' }).height), { unit: 'vh', size: 100 });
  assert.deepEqual(size(sx({ w: '50%' }).width), { unit: '%', size: 50 });
  assert.deepEqual(size(sx({ w: '60ch' }).width), { unit: 'ch', size: 60 });
  assert.equal(sx({ w: 'hug' }).width.value.size, 'fit-content');
});

test('size/gap/radius honor units; lh/ls honor explicit units', () => {
  assert.deepEqual(size(sx({ size: '1.2rem' })['font-size']), { unit: 'rem', size: 1.2 });
  assert.deepEqual(size(sx({ gap: '2rem' }).gap), { unit: 'rem', size: 2 });
  assert.deepEqual(sx({ radius: '50%' })['border-radius'].value['start-start'].value, { unit: '%', size: 50 });
  assert.deepEqual(size(sx({ lh: '150%' })['line-height']), { unit: '%', size: 150 }); // was 150px (×100 wrong)
  assert.deepEqual(size(sx({ lh: 1.5 })['line-height']), { unit: 'em', size: 1.5 });   // bare-number heuristic kept
  assert.deepEqual(size(sx({ ls: '2px' })['letter-spacing']), { unit: 'px', size: 2 }); // was 2em (~×32 wrong)
  assert.deepEqual(size(sx({ ls: 0.08 })['letter-spacing']), { unit: 'em', size: 0.08 });
});

test('pad/m: unit tokens inside box strings are honored per side', () => {
  const pad = sx({ pad: '10vh 5vw' }).padding.value;
  assert.deepEqual(pad['block-start'].value, { unit: 'vh', size: 10 });
  assert.deepEqual(pad['inline-end'].value, { unit: 'vw', size: 5 });
  const m = sx({ m: '0 auto' }).margin.value;
  assert.equal(m['inline-end'].value.unit, 'auto');
});

test('unknown units and CSS expressions THROW instead of px-ifying', () => {
  assert.throws(() => sx({ maxw: 'fit-content' }), /maxw/);
  assert.throws(() => sx({ maxw: 'calc(100% - 40px)' }), /raw/);
  assert.throws(() => sx({ gap: '16px 32px' }), /gap/); // two-value gap: second value used to vanish
  assert.throws(() => sx({ w: 'max-content' }), /hug/);
  assert.throws(() => sx({ pad: 'clamp(1rem,2vw,2rem)' }), /pad/);
});

test('grad rejects strings (the char-spread trap) and GRAD self-defends', () => {
  assert.throws(() => sx({ grad: 'linear-gradient(135deg, #000, #fff)' }), /\[angle, from, to\]/);
  assert.throws(() => GRAD('l', 'i', 'n'), /angle/);
  assert.ok(GRAD(135, '#000', '#fff').$$type === 'background');
});

test('bg rejects gradient strings; z and span reject non-numbers', () => {
  assert.throws(() => sx({ bg: 'linear-gradient(90deg, #000, #fff)' }), /grad/);
  assert.throws(() => sx({ z: 'auto' }), /z-index/);
  assert.throws(() => sx({ span: 'two' }), /span/);
  assert.equal(sx({ z: '30' })['z-index'].value, 30);
});

test('FLEX string basis lands as a real size envelope', () => {
  assert.deepEqual(FLEX(1, 1, '50%').value.flexBasis.value, { unit: '%', size: 50 });
});

test('align/justify: shorthands normalize, off-enum values throw at build', () => {
  assert.equal(sx({ justify: 'between' })['justify-content'].value, 'space-between');
  assert.equal(sx({ justify: 'evenly' })['justify-content'].value, 'space-evenly');
  assert.equal(sx({ justify: 'space-between' })['justify-content'].value, 'space-between');
  assert.equal(sx({ align: 'start' })['align-items'].value, 'start');   // valid per schema
  assert.throws(() => sx({ align: 'baseline' }), /flex-end/);           // 5 field strikes
  assert.throws(() => sx({ justify: 'middle' }), /justify-content enum/);
});
