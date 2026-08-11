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
import { PALETTE } from '../../src/tw-palette.mjs';
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
  ['gap-x → ATOMIC gapX (layout-direction gap, not raw)', 'gap-x-4', { gapX: 16 }],
  ['gap-y → ATOMIC gapY', 'gap-y-8', { gapY: 32 }],
  ['gap-x + gap-y together', 'gap-x-4 gap-y-8', { gapX: 16, gapY: 32 }],
  ['gap-x rem stays raw (size envelope cannot hold it)', 'gap-x-[2rem]', { raw: 'column-gap: 2rem;' }],
  ['grid-rows on scale', 'grid grid-rows-2', { display: 'grid', gridRows: 2 }],
  ['grid-rows arbitrary (underscores → spaces)', 'grid-rows-[auto_1fr]', { gridRows: 'auto 1fr' }],
  ['row-span → rowSpan', 'row-span-3', { rowSpan: 3 }],
  ['row-span-full → raw grid-row', 'row-span-full', { raw: 'grid-row: 1 / -1;' }],

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
  ['named text size', 'text-lg', { size: 18, lh: 28 }], // Tailwind pairs 18/28 — size alone drifted every corpus component
  ['text-5xl', 'text-5xl', { size: 48, lh: 1 }],
  ['leading wins over paired lh (either order)', 'leading-tight text-lg', { size: 18, lh: 1.25 }],
  ['bare flex is a ROW like Tailwind', 'flex gap-4', { display: 'flex', dir: 'row', gap: 16 }],
  ['flex-col still wins', 'flex flex-col', { display: 'flex', dir: 'column' }],
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

  // ── bundled palette (tw-palette.mjs) + /NN opacity modifier ──
  ['palette text color', 'text-slate-500', { color: '#64748b' }],
  ['palette bg color', 'bg-gray-900', { bg: '#111827' }],
  ['palette bg 50 shade', 'bg-gray-50', { bg: '#f9fafb' }],
  ['palette border joins width → sx border pair', 'border border-gray-200', { border: [1, '#e5e7eb'] }],
  ['palette border color alone → raw border-color', 'border-blue-500', { raw: 'border-color: #3b82f6;' }],
  ['opacity modifier on named color', 'bg-white/90', { bg: 'rgba(255, 255, 255, 0.9)' }],
  ['opacity modifier on palette color', 'text-slate-500/75', { color: 'rgba(100, 116, 139, 0.75)' }],
  ['fill palette → raw', 'fill-blue-500', { raw: 'fill: #3b82f6;' }],
  ['stroke palette → raw', 'stroke-red-600', { raw: 'stroke: #dc2626;' }],

  // ── size-* → w+h ──
  ['size on scale → w+h', 'size-5', { w: 20, h: 20 }],
  ['size-full', 'size-full', { w: '100%', h: '100%' }],
  ['size arbitrary', 'size-[18px]', { w: 18, h: 18 }],

  // ── arbitrary properties ──
  ['arbitrary property (underscores → spaces)', '[background-size:200%_100%]', { raw: 'background-size: 200% 100%;' }],
  ['arbitrary property mask-image', '[mask-image:linear-gradient(to_top,transparent_40%,#000_100%)]',
    { raw: 'mask-image: linear-gradient(to top,transparent 40%,#000 100%);' }],
  ['arbitrary property keeps underscores inside url()', '[mask-image:url(/img/my_mask.png)]',
    { raw: 'mask-image: url(/img/my_mask.png);' }],

  // ── transforms: composed into ONE transform: per bucket ──
  ['scale → transform', 'scale-105', { raw: 'transform: scale(1.05);' }],
  ['negative rotate', '-rotate-180', { raw: 'transform: rotate(-180deg);' }],
  ['negative translate fraction', '-translate-x-1/2', { raw: 'transform: translateX(-50%);' }],
  ['translate on the px scale', 'translate-x-0.5', { raw: 'transform: translateX(2px);' }],
  ['transform parts compose in token order', 'scale-90 -translate-y-1/2 rotate-45',
    { raw: 'transform: scale(0.9) translateY(-50%) rotate(45deg);' }],
  ['transform/transform-gpu are no-ops', 'transform transform-gpu', {}],

  // ── negative offsets / z / margins ──
  ['-top offset', '-top-20', { raw: 'top: -80px;' }],
  ['-inset', '-inset-5', { raw: 'inset: -20px;' }],
  ['positive inset on scale', 'inset-4', { raw: 'inset: 16px;' }],
  ['-z index', '-z-10', { raw: 'z-index: -10;' }],
  ['negative margin stays ATOMIC (envelope takes negative px)', '-mt-4', { m: { t: -16 } }],
  ['negative axis margin', '-mx-2', { m: { r: -8, l: -8 } }],

  // ── fixed raw combos ──
  ['sr-only → the standard 8-declaration block', 'sr-only',
    { raw: 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;' }],
  ['antialiased', 'antialiased', { raw: '-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;' }],
  ['box-content / box-border', 'box-content', { raw: 'box-sizing: content-box;' }],
  ['pointer-events-auto', 'pointer-events-auto', { raw: 'pointer-events: auto;' }],
  ['border-none → raw border-style', 'border-none', { raw: 'border-style: none;' }],
  ['border-y per-side raw', 'border-y',
    { raw: 'border-top-width: 1px; border-top-style: solid; border-bottom-width: 1px; border-bottom-style: solid;' }],
  ['border-b-2 per-side width', 'border-b-2', { raw: 'border-bottom-width: 2px; border-bottom-style: solid;' }],
  ['border-y + palette color → sides + border-color', 'border-y border-gray-100',
    { raw: 'border-top-width: 1px; border-top-style: solid; border-bottom-width: 1px; border-bottom-style: solid; border-color: #f3f4f6;' }],
  ['border arbitrary px width joins color', 'border-[20px] border-[#e2e8f0]', { border: [20, '#e2e8f0'] }],
  ['shadow-xs alias (v4 rename of old sm)', 'shadow-xs', { shadow: [1, 2, 0, 'rgba(0,0,0,0.05)'] }],
  ['text-balance → raw text-wrap', 'text-balance', { raw: 'text-wrap: balance;' }],
  ['text-pretty → raw text-wrap', 'text-pretty', { raw: 'text-wrap: pretty;' }],
  ['underline-offset is direct px', 'underline-offset-4', { raw: 'text-underline-offset: 4px;' }],
  ['max-w-prose = 65ch', 'max-w-prose', { raw: 'max-width: 65ch;' }],
  ['bg keywords → size/position/repeat (not the color path)', 'bg-cover bg-center bg-no-repeat',
    { raw: 'background-size: cover; background-position: center; background-repeat: no-repeat;' }],
  ['divide-y → owl child combinator', 'divide-y', { raw: '& > * + * { border-top-width: 1px; border-top-style: solid; }' }],
  ['space-y on the scale', 'space-y-4', { raw: '& > * + * { margin-top: 16px; }' }],
  ['space-x', 'space-x-2', { raw: '& > * + * { margin-left: 8px; }' }],
  ['blur → filter', 'blur-3xl', { raw: 'filter: blur(64px);' }],
  ['filter parts compose into ONE filter:', 'blur-sm brightness-110 grayscale',
    { raw: 'filter: blur(4px) brightness(1.1) grayscale(100%);' }],
  ['backdrop-blur → backdrop-filter', 'backdrop-blur-md', { raw: 'backdrop-filter: blur(12px);' }],
  ['ms-/me- logical margins', 'ms-2 me-4', { raw: 'margin-inline-start: 8px; margin-inline-end: 16px;' }],
  ['h-dvh', 'h-dvh', { raw: 'height: 100dvh;' }],
  ['min-h-svh', 'min-h-svh', { raw: 'min-height: 100svh;' }],

  // ── animate/group accepted no-ops (static render — keyframes/group state don't exist in atomic output) ──
  ['animate-* and group are no-ops', 'group animate-pulse animate-[float_4s_ease-in-out_infinite]', {}],

  // ── BUGFIX: bg-[length:…] is Tailwind's background-size disambiguator, not CSS ──
  ['bg-[length:…] → background-size (was invalid background:)', 'bg-[length:100%_100%]', { raw: 'background-size: 100% 100%;' }],
  ['bg-[bottom] stays background shorthand', 'bg-[bottom]', { raw: 'background: bottom;' }],

  // ── state prefixes: SPLIT BY EXPRESSIBILITY (1.7.x) ──
  // every utility in the bucket maps to a schema prop → NATIVE state variant (out.<state> = sx shorthand)
  ['hover schema-mappable → NATIVE state object (was raw pre-1.7.x)', 'hover:bg-slate-900', { hover: { bg: '#0f172a' } }],
  ['hover palette color with opacity modifier → native', 'hover:text-gray-500/75', { hover: { color: 'rgba(107, 114, 128, 0.75)' } }],
  ['focus schema-mappable → native', 'focus:bg-white', { focus: { bg: '#ffffff' } }],
  ['active: prefix (new) → native', 'active:bg-slate-800', { active: { bg: '#1e293b' } }],
  ['focus-visible: prefix (new) → native, its OWN state key', 'focus-visible:bg-blue-500', { 'focus-visible': { bg: '#3b82f6' } }],
  ['color-only border stays raw even in a state (finalizeBox contract)', 'focus-visible:border-blue-500',
    { raw: '&:focus-visible { border-color: #3b82f6; }' }],
  ['checked: prefix (new) → native', 'checked:bg-emerald-600', { checked: { bg: '#059669' } }],
  ['hover multi-utility all-mappable → one native object', 'hover:bg-slate-900 hover:text-white hover:shadow-lg',
    { hover: { bg: '#0f172a', color: '#ffffff', shadow: [10, 15, -3, 'rgba(0,0,0,0.1)'] } }],
  ['hover layout prop (display) is schema-mappable → native (was a throw pre-1.7.x)', 'hover:flex',
    { hover: { display: 'flex', dir: 'row' } }],
  // ≥1 raw-only utility → the WHOLE bucket falls back to one raw `&:state { … }` block
  ['hover on a raw-only utility', 'hover:opacity-75', { raw: '&:hover { opacity: 0.75; }' }],
  ['hover underline stays raw', 'hover:underline', { raw: '&:hover { text-decoration: underline; }' }],
  ['hover transform stays raw', 'hover:scale-105', { raw: '&:hover { transform: scale(1.05); }' }],
  ['hover bg-[length:…] bugfix applies inside states', 'hover:bg-[length:100%_150%]', { raw: '&:hover { background-size: 100% 150%; }' }],
  ['MIXED bucket: one raw-only utility drags the schema-mappable ones into the raw block',
    'hover:bg-slate-900 hover:underline', { raw: '&:hover { text-decoration: underline; background: #0f172a; }' }],
  ['mixed bucket renders layout keys as CSS too (full STATE_CSS coverage)',
    'active:flex active:underline', { raw: '&:active { text-decoration: underline; display: flex; flex-direction: row; }' }],
  ['split is PER STATE: native hover + raw focus coexist', 'hover:bg-slate-900 focus:opacity-75',
    { hover: { bg: '#0f172a' }, raw: '&:focus { opacity: 0.75; }' }],
  ['base raw + hover block concatenate (base first)', 'uppercase hover:opacity-75',
    { raw: 'text-transform: uppercase; &:hover { opacity: 0.75; }' }],
];

for (const [name, input, expected] of CASES) {
  test(`tw: ${name}`, () => {
    assert.deepEqual(twToSx(input), expected);
  });
}

/* ── palette table integrity: 22 families × 11 shades, all hex ── */
test('tw-palette: full default palette, every shade a 6-digit hex', () => {
  const families = Object.keys(PALETTE);
  assert.equal(families.length, 22);
  for (const fam of families) {
    const shades = Object.keys(PALETTE[fam]).map(Number).sort((a, b) => a - b);
    assert.deepEqual(shades, [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950], `${fam} shade set`);
    for (const [s, hex] of Object.entries(PALETTE[fam])) {
      assert.match(hex, /^#[0-9a-f]{6}$/, `${fam}-${s}`);
    }
  }
  // spot-check canonical anchors (the shades agents reach for most)
  assert.equal(PALETTE.slate[500], '#64748b');
  assert.equal(PALETTE.gray[700], '#374151');
  assert.equal(PALETTE.blue[500], '#3b82f6');
  assert.equal(PALETTE.emerald[600], '#059669');
  assert.equal(PALETTE.rose[950], '#4c0519');
});

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
  ['theme-var bg color (shadcn) names the utility, not the palette recipe', 'bg-primary', /unsupported bg-\* utility.*bg-\[#0ea5e9\]/],
  ['theme-var text color', 'text-primary', /unsupported text-\* utility.*text-\[#hex\]/],
  ['mobile-first prefix', 'md:flex', /mobile-first breakpoints are not supported/],
  ['group-hover state (no meta.state equivalent — parent recipe named)', 'group-hover:opacity-100', /needs the \.group parent machinery.*raw="&:hover \.child/],
  ['focus-within state (no meta.state equivalent)', 'focus-within:bg-white', /focus-within: has no meta\.state equivalent.*raw="&:focus-within/],
  ['visited state (no meta.state equivalent)', 'visited:text-white', /visited: has no meta\.state equivalent/],
  ['disabled state points at e--disabled being kit-only', 'disabled:opacity-50', /e--disabled is an editor-machinery class.*raw="&:disabled/],
  ['nested prefixes throw with the breakpoint-state recipe', 'max-md:hover:bg-white', /prefixes cannot nest.*hover=\{\{ tablet/],
  ['state-then-breakpoint nesting throws too', 'hover:max-lg:bg-white', /prefixes cannot nest/],
  ['unknown utility', 'foo-bar', /unknown utility.*"foo-bar"/],
  ['compound gradient', 'bg-gradient-to-r', /grad=\{\[angle/],
  ['v4 linear gradient', 'bg-linear-to-t', /grad=\{\[angle/],
  ['negative margin in non-px units', '-mt-[2rem]', /negative margins take the px scale/],
  ['ring utilities', 'ring-2', /unknown utility/],
  ['arbitrary property with build-time theme()',
    '[border-image:linear-gradient(to_right,transparent,--theme(--color-slate-300/.8),transparent)1]',
    /theme\(\) only exists at Tailwind build time/],
  ['arbitrary selector', '[&_summary::-webkit-details-marker]:hidden', /unknown utility/],
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

test('tw e2e: palette colors + size-* compile to verified envelopes', () => {
  const out = sx(mergeTw({ tw: 'bg-slate-900 size-10' }));
  assert.deepEqual(out.background, BG('#0f172a'));
  assert.deepEqual(out.width, SZ(40));
  assert.deepEqual(out.height, SZ(40));
});
test('tw e2e: negative margins survive the dimensions envelope atomically', () => {
  const out = sx(mergeTw({ tw: '-mt-4 -mx-2' }));
  assert.deepEqual(out.margin, PDIM({ t: -16, r: -8, l: -8 }));
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
test('sx aliases: grid/gap CSS names (columnGap/rowGap → layout-direction, gridTemplateRows)', () => {
  const out = sx({ columnGap: 16, 'row-gap': 32, gridTemplateRows: 2 });
  assert.deepEqual(out.gap, { $$type: 'layout-direction', value: { column: SZ(16), row: SZ(32) } });
  assert.deepEqual(out['grid-template-rows'], S('repeat(2, 1fr)'));
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
