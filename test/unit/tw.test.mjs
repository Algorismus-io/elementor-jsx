/**
 * tw() — the Tailwind-subset → sx-shorthand parser. Two contracts under test:
 *   1. twToSx: every supported utility maps to the EXACT sx shorthand key/value (table-driven),
 *      the raw-CSS fallback set emits the right declarations, and everything else throws loudly.
 *   2. mergeTw: precedence (explicit sx props beat tw), raw concatenation, breakpoint merging.
 * End-to-end cases push tw through sx() to pin the final atomic envelopes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twToSx, mergeTw } from '../../src/tw.mjs';
import { sx } from '../../src/kit/kit-components.mjs';
import { h, renderPage } from '../../src/runtime.mjs';
import { S, SZ, DIM, M, PDIM, RAD, BG, SHADOW } from '../../src/kit/kit.mjs';

/** [name, tw string, expected twToSx output (exact)] */
const CASES = [
  // ── display / flex / grid ──
  ['flex col centered', 'flex flex-col items-center justify-center',
    { display: 'flex', dir: 'column', align: 'center', justify: 'center' }],
  ['row + between + wrap', 'flex-row justify-between flex-wrap',
    { dir: 'row', justify: 'space-between', wrap: 'wrap' }],
  ['items/justify start map to flex-start', 'items-start justify-start',
    { align: 'flex-start', justify: 'flex-start' }],
  ['hidden → display none', 'hidden', { display: 'none' }],
  ['flex-1 → flex shorthand', 'flex-1', { flex: 1 }],
  ['grid with cols and span', 'grid grid-cols-3 col-span-2', { display: 'grid', gridCols: 3, span: 2 }],
  ['grid-cols arbitrary (underscores → spaces)', 'grid-cols-[2fr_1fr]', { gridCols: '2fr 1fr' }],

  // ── spacing: scale is n × 4px ──
  ['uniform padding', 'p-6', { pad: 24 }],
  ['axis padding [v,h]', 'py-24 px-6', { pad: [96, 24] }],
  ['four-side padding', 'pt-1 pr-2 pb-3 pl-4', { pad: [4, 8, 12, 16] }],
  ['p-px → 1px', 'p-px', { pad: 1 }],
  ['fractional scale', 'p-0.5', { pad: 2 }],
  ['arbitrary padding px', 'p-[96px]', { pad: 96 }],
  ['uniform margin', 'm-4', { m: 16 }],
  ['partial padding → partial-sides object (→ PDIM)', 'pt-4', { pad: { t: 16 } }],
  ['axis-only padding → partial-sides object', 'py-16', { pad: { t: 64, b: 64 } }],
  ['mx-auto → partial auto margins (atomic, not raw)', 'mx-auto', { m: { l: 'auto', r: 'auto' } }],
  ['gap on scale', 'gap-8', { gap: 32 }],
  ['gap arbitrary', 'gap-[18px]', { gap: 18 }],
  ['gap-x → raw column-gap', 'gap-x-4', { raw: 'column-gap: 16px;' }],

  // ── sizing ──
  ['w-full', 'w-full', { w: '100%' }],
  ['w-auto / w-fit(hug)', 'w-fit', { w: 'hug' }],
  ['w on scale', 'w-64', { w: 256 }],
  ['w fraction → percent', 'w-1/2', { w: '50%' }],
  ['w arbitrary percent', 'w-[50%]', { w: '50%' }],
  ['w arbitrary px', 'w-[560px]', { w: 560 }],
  ['h on scale', 'h-11', { h: 44 }],
  ['h-full', 'h-full', { h: '100%' }],
  ['min-h arbitrary', 'min-h-[480px]', { minh: 480 }],
  ['min-h-screen → raw vh', 'min-h-screen', { raw: 'min-height: 100vh;' }],
  ['max-w named (7xl=1280)', 'max-w-7xl', { maxw: 1280 }],
  ['max-w named (xl=576)', 'max-w-xl', { maxw: 576 }],
  ['max-w arbitrary', 'max-w-[560px]', { maxw: 560 }],
  ['w rem unit → raw', 'w-[20rem]', { raw: 'width: 20rem;' }],

  // ── typography ──
  ['named text size', 'text-lg', { size: 18 }],
  ['text-5xl', 'text-5xl', { size: 48 }],
  ['text alignment', 'text-center', { ta: 'center' }],
  ['text color named', 'text-white', { color: '#ffffff' }],
  ['text color arbitrary', 'text-[#0A2230]', { color: '#0A2230' }],
  ['text size arbitrary', 'text-[56px]', { size: 56 }],
  ['font weight named', 'font-bold', { weight: 700 }],
  ['font-extrabold', 'font-extrabold', { weight: 800 }],
  ['leading named → unitless (sx → em)', 'leading-tight', { lh: 1.25 }],
  ['leading scale → px (leading-6 = 24)', 'leading-6', { lh: 24 }],
  ['leading arbitrary unitless', 'leading-[1.05]', { lh: 1.05 }],
  ['tracking named', 'tracking-wide', { ls: 0.025 }],
  ['tracking arbitrary em', 'tracking-[0.12em]', { ls: 0.12 }],
  ['uppercase → raw', 'uppercase', { raw: 'text-transform: uppercase;' }],
  ['truncate → raw combo', 'truncate', { raw: 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' }],

  // ── color / border / effects ──
  ['bg named', 'bg-white', { bg: '#ffffff' }],
  ['bg arbitrary hex', 'bg-[#093D57]', { bg: '#093D57' }],
  ['bg arbitrary rgba', 'bg-[rgba(0,0,0,0.4)]', { bg: 'rgba(0,0,0,0.4)' }],
  ['rounded default = 4', 'rounded', { radius: 4 }],
  ['rounded-2xl = 16', 'rounded-2xl', { radius: 16 }],
  ['rounded-full = 9999', 'rounded-full', { radius: 9999 }],
  ['rounded arbitrary', 'rounded-[10px]', { radius: 10 }],
  ['border + color → sx border pair', 'border border-[#e2e8f0]', { border: [1, '#e2e8f0'] }],
  ['border-2 + named color', 'border-2 border-black', { border: [2, '#000000'] }],
  ['border width only → raw solid', 'border-2', { raw: 'border-width: 2px; border-style: solid;' }],
  ['shadow-lg → SHADOW args', 'shadow-lg', { shadow: [10, 15, -3, 'rgba(0,0,0,0.1)'] }],
  ['object-cover → fit', 'object-cover', { fit: 'cover' }],
  ['position', 'absolute', { pos: 'absolute' }],
  ['inset + z → raw', 'inset-0 z-10', { raw: 'inset: 0; z-index: 10;' }],
  ['opacity → raw fraction', 'opacity-60', { raw: 'opacity: 0.6;' }],
  ['overflow → raw', 'overflow-hidden', { raw: 'overflow: hidden;' }],
  ['aspect-video → raw', 'aspect-video', { raw: 'aspect-ratio: 16 / 9;' }],
  ['transition utilities are accepted no-ops', 'transition duration-300 ease-in-out', {}],
];

for (const [name, input, expected] of CASES) {
  test(`tw: ${name}`, () => {
    assert.deepEqual(twToSx(input), expected);
  });
}

/* ── breakpoints: desktop-first ── */
test('tw: base is desktop; max-lg → tablet; max-md → mobile', () => {
  assert.deepEqual(twToSx('text-[56px] max-lg:text-[40px] max-md:text-[32px] max-md:text-center'),
    { size: 56, tablet: { size: 40 }, mobile: { size: 32, ta: 'center' } });
});
test('tw: literal tablet:/mobile: prefixes also work', () => {
  assert.deepEqual(twToSx('gap-8 tablet:gap-6 mobile:gap-4'),
    { gap: 32, tablet: { gap: 24 }, mobile: { gap: 16 } });
});

/* ── loud failures ── */
const THROWS = [
  ['palette bg color', 'bg-blue-500', /palette colors are not bundled.*bg-\[#/],
  ['palette text color', 'text-slate-600', /palette colors are not bundled/],
  ['mobile-first prefix', 'md:flex', /mobile-first breakpoints are not supported/],
  ['hover state', 'hover:bg-black', /state variants are not supported/],
  ['unknown utility', 'foo-bar', /unknown utility.*"foo-bar"/],
  ['compound gradient', 'bg-gradient-to-r', /grad=\{\[angle/],
  ['negative margin', '-mt-4', /negative margins/],
  ['raw fallback inside a breakpoint bucket', 'max-md:uppercase', /desktop-only/],
];
for (const [name, input, re] of THROWS) {
  test(`tw throws: ${name}`, () => {
    assert.throws(() => twToSx(input), re);
  });
}

/* ── mergeTw: precedence + raw concat + breakpoint merge ── */
test('mergeTw: explicit sx props WIN over tw on conflict', () => {
  const out = mergeTw({ tw: 'p-6 gap-4', pad: 40 });
  assert.equal(out.pad, 40);
  assert.equal(out.gap, 16);
  assert.equal(out.tw, undefined, 'tw key is consumed');
});
test('mergeTw: raw strings concatenate, tw first', () => {
  const out = mergeTw({ tw: 'uppercase', raw: 'color: red;' });
  assert.equal(out.raw, 'text-transform: uppercase;\ncolor: red;');
});
test('mergeTw: tablet/mobile shallow-merge, explicit key wins', () => {
  const out = mergeTw({ tw: 'max-md:text-[32px] max-md:gap-4', mobile: { size: 28 } });
  assert.deepEqual(out.mobile, { size: 28, gap: 16 });
});
test('mergeTw: no tw → props returned untouched (same reference)', () => {
  const props = { pad: 24 };
  assert.equal(mergeTw(props), props);
});

/* ── end-to-end: tw → sx → exact atomic envelopes ── */
test('tw e2e: hero utilities compile to verified envelopes', () => {
  const out = sx(mergeTw({ tw: 'flex flex-col items-center py-24 px-6 gap-8 bg-[#0A2230] rounded-2xl max-w-[560px]' }));
  assert.deepEqual(out.display, S('flex'));
  assert.deepEqual(out['flex-direction'], S('column'));
  assert.deepEqual(out['align-items'], S('center'));
  assert.deepEqual(out.padding, DIM(96, 24));
  assert.deepEqual(out.gap, SZ(32));
  assert.deepEqual(out.background, BG('#0A2230'));
  assert.deepEqual(out['border-radius'], RAD(16));
  assert.deepEqual(out['max-width'], SZ(560));
});
test('tw e2e: axis spacing survives breakpoints as PARTIAL dimensions (fresh-agent gap #1)', () => {
  // live-verified 2026-07-23: partial envelopes validate AND render (:8915 probe page)
  const out = sx(mergeTw({ tw: 'py-24 mx-auto max-md:py-16' }));
  assert.deepEqual(out.padding, PDIM({ t: 96, b: 96 }));
  assert.deepEqual(out.margin, PDIM({ l: 'auto', r: 'auto' }));
  assert.deepEqual(out._m.padding, PDIM({ t: 64, b: 64 }));
});

test('runtime: <div> is a box alias; unknown intrinsic error teaches the vocabulary (fresh-agent gap #2)', () => {
  const els = renderPage(h('div', { tw: 'p-6' }));
  assert.equal(els[0].elType, 'e-flexbox');
  assert.throws(() => renderPage(h('button', {}, 'x')), /unknown intrinsic <button>[\s\S]*box\|div\|row\|col\|section[\s\S]*text href/);
});

test('runtime: inline <em>/<strong> in text intrinsics serialize; other vnodes THROW (nebula showcase bug)', () => {
  const els = renderPage(h('h1', {}, ['Ship ', h('em', {}, 'insight'), ', not dashboards.']));
  assert.equal(els[0].settings.title.value.content.value, 'Ship <em>insight</em>, not dashboards.');
  assert.throws(() => renderPage(h('text', {}, [h('box', {}, 'x')])), /<box> inside a text intrinsic.*em.*strong/);
});

test('tw e2e: typography + shadow + responsive variants', () => {
  const out = sx(mergeTw({ tw: 'text-5xl font-extrabold leading-tight tracking-[0.02em] shadow-lg max-md:text-[32px]' }));
  assert.deepEqual(out['font-size'], SZ(48));
  assert.deepEqual(out['font-weight'], S('800'));
  assert.deepEqual(out['line-height'], SZ(1.25, 'em'));
  assert.deepEqual(out['letter-spacing'], SZ(0.02, 'em'));
  assert.deepEqual(out['box-shadow'], SHADOW(10, 15, -3, 'rgba(0,0,0,0.1)'));
  assert.deepEqual(out._m, { 'font-size': SZ(32) });
});

/* ── sx aliases: standard CSS names (added alongside tw) ── */
test('sx aliases: CSS property names map to shorthand envelopes', () => {
  const out = sx({ padding: 24, maxWidth: 1200, textAlign: 'left', fontSize: 40, alignItems: 'center', 'font-weight': 700 });
  assert.deepEqual(out.padding, DIM(24));
  assert.deepEqual(out['max-width'], SZ(1200));
  assert.deepEqual(out['text-align'], S('start'), 'left → start via ta mapping');
  assert.deepEqual(out['font-size'], SZ(40));
  assert.deepEqual(out['align-items'], S('center'));
  assert.deepEqual(out['font-weight'], S('700'));
});
test('sx aliases: CSS string values parse (padding "96px 24px", fontSize "18px")', () => {
  const out = sx({ padding: '96px 24px', fontSize: '18px', margin: '0 auto' });
  assert.deepEqual(out.padding, DIM(96, 24));
  assert.deepEqual(out['font-size'], SZ(18));
  assert.deepEqual(out.margin, M(0, 'auto'));
});
test('sx aliases: explicit shorthand key WINS over its alias', () => {
  const out = sx({ pad: 40, padding: 8 });
  assert.deepEqual(out.padding, DIM(40));
});
