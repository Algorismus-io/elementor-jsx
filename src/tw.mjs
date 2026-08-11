/**
 * tw.mjs — Tailwind-subset → sx shorthand. Zero runtime deps (only the bundled palette table);
 * kit-components consumes us.
 *
 * Why: models emit Tailwind natively with no docs in context; the bespoke sx vocabulary is
 * out-of-distribution and needs the skill loaded. `tw="px-6 py-24 flex flex-col gap-8"` lets an
 * agent author in its most-trained dialect while the compiler still owns the envelopes.
 *
 * Contract:
 *   - Utilities that map to atomic props BECOME sx shorthand (pad/gap/w/size/…) — first choice,
 *     because `raw` compiles to custom_css (Pro escape hatch), not atomic styles.
 *   - The default Tailwind palette IS bundled (tw-palette.mjs): text-gray-700 / bg-slate-900 /
 *     border-blue-500 / fill-* / stroke-* resolve to hex, with the /NN opacity modifier → rgba.
 *   - A known long tail (uppercase, truncate, z-index, transforms, filters, child-combinator
 *     utilities like space-y/divide-y…) falls back to `raw` CSS. scale/rotate/translate compose
 *     into ONE transform:; blur/brightness/grayscale into ONE filter:.
 *   - `hover:`/`focus:` variants compile to raw `&:hover { … }` blocks for declarations that
 *     have a CSS form (colors, background, border, shadow, opacity, transform…). Other state
 *     variants (group-hover:, active:…) still throw.
 *   - Everything else THROWS naming the token — a silently-dropped class is a visual bug only a
 *     screenshot catches. Mobile-first prefixes and gradient synthesis get targeted errors with
 *     the working recipe.
 *   - Breakpoints are DESKTOP-FIRST to match sx: base = desktop, `max-lg:` → tablet,
 *     `max-md:`/`max-sm:` → mobile (also literal `tablet:`/`mobile:` prefixes).
 *   - Spacing scale: n × 4px (p-6 = 24px). Arbitrary values: p-[96px], w-[50%], text-[#0A2230].
 */

import { PALETTE } from './tw-palette.mjs';

const SCALE = 4;

/* Tailwind pairs every named size with a line-height (text-3xl = 30/36) — emitting the size
 * alone drifted EVERY corpus component 2-6px vertically per text block (the harness's top
 * fidelity drain). [size, lineHeight]; ≥5xl Tailwind uses lh 1 (em). */
const TEXT_SIZES = { xs: [12, 16], sm: [14, 20], base: [16, 24], lg: [18, 28], xl: [20, 28], '2xl': [24, 32], '3xl': [30, 36], '4xl': [36, 40], '5xl': [48, 1], '6xl': [60, 1], '7xl': [72, 1], '8xl': [96, 1], '9xl': [128, 1] };
const WEIGHTS = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const LEADING = { none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625, loose: 2 };
const TRACKING = { tighter: -0.05, tight: -0.025, normal: 0, wide: 0.025, wider: 0.05, widest: 0.1 };
const MAX_W = { xs: 320, sm: 384, md: 448, lg: 512, xl: 576, '2xl': 672, '3xl': 768, '4xl': 896, '5xl': 1024, '6xl': 1152, '7xl': 1280 };
const ROUNDED = { none: 0, sm: 2, '': 4, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24, full: 9999 };
/* Tailwind shadows are multi-layer; single-layer approximations in SHADOW arg order [v, blur, spread, color].
 * xs is the v4 rename of the old sm tier. */
const SHADOWS = {
  xs: [1, 2, 0, 'rgba(0,0,0,0.05)'], sm: [1, 2, 0, 'rgba(0,0,0,0.05)'], '': [1, 3, 0, 'rgba(0,0,0,0.1)'], md: [4, 6, -1, 'rgba(0,0,0,0.1)'],
  lg: [10, 15, -3, 'rgba(0,0,0,0.1)'], xl: [20, 25, -5, 'rgba(0,0,0,0.1)'], '2xl': [25, 50, -12, 'rgba(0,0,0,0.25)'],
};
const BLUR = { none: 0, sm: 4, '': 8, md: 12, lg: 16, xl: 24, '2xl': 40, '3xl': 64 };
const ALIGN = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch', baseline: 'baseline' };
const JUSTIFY = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };
const NAMED_COLORS = { white: '#ffffff', black: '#000000', transparent: 'transparent' };
const FONT_STACKS = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
/* The standard Tailwind sr-only block (visually hidden, still read by screen readers). */
const SR_ONLY = 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;';

const fail = (tok, hint) => { throw new Error(`exjsx tw: ${hint} (token "${tok}")`); };
const unknown = (tok) => fail(tok, 'unknown utility — use an sx prop or raw="" for anything the subset does not cover');

/** looks like a color literal (arbitrary-value body or named)? */
const isColor = (v) => /^#|^rgba?\(|^hsla?\(/.test(v);
/** '#rrggbb' + fractional alpha → rgba() string (opacity-modifier support). */
function withAlpha(hex, a, tok) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return fail(tok, `opacity modifier needs a 6-digit hex base color (got "${hex}")`);
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/** color-name body → css color | null (null = not a bundled color, caller decides the error).
 * Handles named (white/black/transparent), the bundled palette (slate-500…), and the /NN
 * opacity modifier on either (bg-white/90 → rgba(255, 255, 255, 0.9)). */
function twColor(body, tok) {
  let alpha = null;
  const am = body.match(/^(.+)\/(\d{1,3})$/);
  if (am) { alpha = Math.min(100, Number(am[2])) / 100; body = am[1]; }
  let hex = NAMED_COLORS[body];
  if (hex == null) { const m = body.match(/^([a-z]+)-(\d{2,3})$/); hex = (m && PALETTE[m[1]]?.[m[2]]) || null; }
  if (hex == null) return null;
  if (alpha == null || hex === 'transparent') return hex;
  return withAlpha(hex, alpha, tok);
}
/** arbitrary length body → number (px) | string ('50%') | {css} for units sx can't envelope. */
function arbLen(v, tok) {
  if (/^-?\d*\.?\d+px$/.test(v)) return parseFloat(v);
  if (/^-?\d*\.?\d+%$/.test(v)) return v;
  if (/^-?\d*\.?\d+$/.test(v)) return parseFloat(v);
  if (/^-?\d*\.?\d+(rem|em|vw|vh|svh|dvh|ch)$/.test(v)) return { css: v };
  return fail(tok, `unsupported arbitrary length "${v}" — use px, %, or a plain number`);
}
/** scale token body → px number | string % | {css}. 'p-6' → 24, 'p-px' → 1, 'p-[96px]' → 96, 'w-1/2' → '50%'. */
function len(body, tok, { frac = false } = {}) {
  if (body === 'px') return 1;
  if (/^\d*\.?\d+$/.test(body)) return parseFloat(body) * SCALE;
  if (frac && /^\d+\/\d+$/.test(body)) { const [a, b] = body.split('/').map(Number); return `${+(100 * a / b).toFixed(4)}%`; }
  const m = body.match(/^\[(.+)\]$/);
  if (m) return arbLen(m[1], tok);
  return fail(tok, `unsupported length "${body}"`);
}
const arb = (body) => body.match(/^\[(.+)\]$/)?.[1];
/** len() result → css text. */
const cssLen = (v) => (typeof v === 'object' ? v.css : typeof v === 'number' ? v + 'px' : v);
/** negate a len() result (negative-utility support: -top-4, -mt-4, -translate-x-1/2). */
const negLen = (v) => (typeof v === 'number' ? -v : typeof v === 'object' ? { css: '-' + v.css } : '-' + v);
/** arbitrary-value '_' → space, but NEVER inside url(…) — underscores in URLs are literal. */
const unUnderscore = (v) => v.replace(/url\([^)]*\)|_/g, (s) => (s === '_' ? ' ' : s));
/** scale-N → CSS scale factor ('scale-105' → '1.05'; arb '[1.05]' passes through). */
function scaleVal(body, tok) {
  if (/^\d+$/.test(body)) return String(Number(body) / 100);
  const a = arb(body);
  if (a && /^-?\d*\.?\d+$/.test(a)) return a;
  return fail(tok, 'scale takes a percent number (scale-105) or [N]');
}
/** rotate-N → CSS angle ('rotate-45' → '45deg'; arb '[17deg]' passes through). */
function rotateVal(body, tok) {
  if (/^\d+$/.test(body)) return `${body}deg`;
  const a = arb(body);
  if (a && /^-?\d*\.?\d+(deg|turn|rad)$/.test(a)) return a;
  return fail(tok, 'rotate takes degrees (rotate-45) or [Ndeg]');
}

/** Parse ONE breakpoint bucket of tokens → { o: shorthand, raw: [decls] }. */
function parseBucket(tokens) {
  const o = {};
  const raw = [];
  const pad = {}; const mar = {}; const bord = {};
  const tf = []; const flt = []; const bflt = []; // composed transform / filter / backdrop-filter parts
  const R = (d) => raw.push(d);

  for (const tok of tokens) {
    let m;
    switch (true) {
      /* ── display / flex / grid ── */
      case tok === 'flex' || tok === 'grid' || tok === 'block' || tok === 'inline-block' || tok === 'inline-flex' || tok === 'inline':
        o.display = tok;
        // Tailwind's `flex` means flex-direction:row; box() defaults to column — without this,
        // bare `flex` silently stacked children (62 occurrences across the corpus rendered
        // vertical). flex-col/flex-row in either order still wins.
        if ((tok === 'flex' || tok === 'inline-flex') && o.dir === undefined) o.dir = 'row';
        break;
      case tok === 'hidden': o.display = 'none'; break;
      case tok === 'flex-row' || tok === 'flex-row-reverse': o.dir = tok.slice(5); break;
      case tok === 'flex-col': o.dir = 'column'; break;
      case tok === 'flex-col-reverse': o.dir = 'column-reverse'; break;
      case tok === 'flex-wrap' || tok === 'flex-nowrap' || tok === 'flex-wrap-reverse': o.wrap = tok.slice(5); break;
      case tok === 'flex-1': o.flex = 1; break;
      case tok === 'flex-auto': R('flex: 1 1 auto;'); break;
      case tok === 'flex-none': R('flex: none;'); break;
      case tok === 'grow': R('flex-grow: 1;'); break;
      case tok === 'grow-0': R('flex-grow: 0;'); break;
      case tok === 'shrink': R('flex-shrink: 1;'); break;
      case tok === 'shrink-0': R('flex-shrink: 0;'); break;
      case !!(m = tok.match(/^items-(start|end|center|stretch|baseline)$/)): o.align = ALIGN[m[1]]; break;
      case !!(m = tok.match(/^justify-(start|end|center|between|around|evenly)$/)): o.justify = JUSTIFY[m[1]]; break;
      case !!(m = tok.match(/^self-(start|end|center|stretch|baseline|auto)$/)):
        R(`align-self: ${ALIGN[m[1]] || m[1]};`); break;
      case !!(m = tok.match(/^gap-(x|y)-(.+)$/)): {
        // px values stay ATOMIC (sx gapX/gapY → one layout-direction gap envelope); only units
        // the size envelope can't hold fall back to raw column-gap/row-gap.
        const v = len(m[2], tok);
        if (typeof v === 'number') o[m[1] === 'x' ? 'gapX' : 'gapY'] = v;
        else R(`${m[1] === 'x' ? 'column' : 'row'}-gap: ${cssLen(v)};`);
        break;
      }
      case !!(m = tok.match(/^gap-(.+)$/)): {
        const v = len(m[1], tok);
        if (typeof v === 'number') o.gap = v; else R(`gap: ${cssLen(v)};`);
        break;
      }
      case !!(m = tok.match(/^grid-cols-(\d+)$/)): o.gridCols = Number(m[1]); break;
      case !!(m = tok.match(/^grid-cols-\[(.+)\]$/)): o.gridCols = m[1].replace(/_/g, ' '); break;
      case !!(m = tok.match(/^grid-rows-(\d+)$/)): o.gridRows = Number(m[1]); break;
      case !!(m = tok.match(/^grid-rows-\[(.+)\]$/)): o.gridRows = m[1].replace(/_/g, ' '); break;
      case tok === 'col-span-full': R('grid-column: 1 / -1;'); break;
      case !!(m = tok.match(/^col-span-(\d+)$/)): o.span = Number(m[1]); break;
      case tok === 'row-span-full': R('grid-row: 1 / -1;'); break;
      case !!(m = tok.match(/^row-span-(\d+)$/)): o.rowSpan = Number(m[1]); break;
      case !!(m = tok.match(/^order-(\d+|first|last)$/)):
        R(`order: ${m[1] === 'first' ? -9999 : m[1] === 'last' ? 9999 : m[1]};`); break;

      /* ── spacing (collected per side, finalized below) ── */
      case !!(m = tok.match(/^p(t|r|b|l|x|y)?-(.+)$/)): side(pad, m[1], len(m[2], tok), tok); break;
      case tok === 'mx-auto': mar.l = 'auto'; mar.r = 'auto'; break;
      case tok === 'my-auto': mar.t = 'auto'; mar.b = 'auto'; break;
      case !!(m = tok.match(/^m(t|r|b|l|x|y)?-(.+)$/)):
        side(mar, m[1], m[2] === 'auto' ? 'auto' : len(m[2], tok), tok); break;
      case !!(m = tok.match(/^-m(t|r|b|l|x|y)?-(.+)$/)): {
        // negative margins: the dimensions envelope takes negative px, so stay atomic
        const v = len(m[2], tok);
        if (typeof v !== 'number') fail(tok, 'negative margins take the px scale (-mt-4) or [Npx]');
        side(mar, m[1], -v, tok); break;
      }
      case !!(m = tok.match(/^m(s|e)-(.+)$/)): {
        const v = m[2] === 'auto' ? 'auto' : len(m[2], tok);
        R(`margin-inline-${m[1] === 's' ? 'start' : 'end'}: ${v === 'auto' ? 'auto' : cssLen(v)};`); break;
      }
      case !!(m = tok.match(/^space-(x|y)-(.+)$/)): {
        // Tailwind's owl selector — custom_css supports the & nesting form
        const v = len(m[2], tok);
        R(`& > * + * { margin-${m[1] === 'x' ? 'left' : 'top'}: ${cssLen(v)}; }`); break;
      }
      case !!(m = tok.match(/^divide-(x|y)(?:-(\d+))?$/)): {
        const s = m[1] === 'x' ? 'left' : 'top';
        R(`& > * + * { border-${s}-width: ${m[2] ?? 1}px; border-${s}-style: solid; }`); break;
      }

      /* ── sizing ── */
      case tok === 'w-full': o.w = '100%'; break;
      case tok === 'w-auto': o.w = 'auto'; break;
      case tok === 'w-fit': o.w = 'hug'; break;
      case tok === 'w-screen': R('width: 100vw;'); break;
      case tok === 'w-min' || tok === 'w-max': R(`width: ${tok.slice(2)}-content;`); break;
      case !!(m = tok.match(/^w-(.+)$/)): sizeProp(o, 'w', len(m[1], tok, { frac: true }), R, 'width'); break;
      case tok === 'h-full': o.h = '100%'; break;
      case tok === 'h-screen': R('height: 100vh;'); break;
      case tok === 'h-dvh' || tok === 'h-svh': R(`height: 100${tok.slice(2)};`); break;
      case tok === 'h-auto': R('height: auto;'); break;
      case tok === 'h-fit': R('height: fit-content;'); break;
      case !!(m = tok.match(/^h-(.+)$/)): sizeProp(o, 'h', len(m[1], tok, { frac: true }), R, 'height'); break;
      case tok === 'size-full': o.w = '100%'; o.h = '100%'; break;
      case !!(m = tok.match(/^size-(.+)$/)): {
        const v = len(m[1], tok, { frac: true });
        sizeProp(o, 'w', v, R, 'width'); sizeProp(o, 'h', v, R, 'height'); break;
      }
      case tok === 'min-h-screen': R('min-height: 100vh;'); break;
      case tok === 'min-h-svh' || tok === 'min-h-dvh': R(`min-height: 100${tok.slice(6)};`); break;
      case tok === 'min-h-full': R('min-height: 100%;'); break;
      case !!(m = tok.match(/^min-h-(.+)$/)): sizeProp(o, 'minh', len(m[1], tok), R, 'min-height'); break;
      case !!(m = tok.match(/^min-w-(.+)$/)): {
        const v = len(m[1], tok, { frac: true });
        R(`min-width: ${cssLen(v)};`); break;
      }
      case tok === 'max-w-full': R('max-width: 100%;'); break;
      case tok === 'max-w-none': R('max-width: none;'); break;
      case tok === 'max-w-prose': R('max-width: 65ch;'); break;
      case !!(m = tok.match(/^max-w-(.+)$/)):
        sizeProp(o, 'maxw', MAX_W[m[1]] ?? len(m[1], tok), R, 'max-width'); break;
      case !!(m = tok.match(/^max-h-(.+)$/)): {
        const v = len(m[1], tok);
        R(`max-height: ${cssLen(v)};`); break;
      }

      /* ── typography ── */
      case !!(m = tok.match(/^text-(left|center|right|justify|start|end)$/)): o.ta = m[1]; break;
      case TEXT_SIZES[tok.slice(5)] != null && tok.startsWith('text-'): {
        const [sz, lh] = TEXT_SIZES[tok.slice(5)];
        o.size = sz;
        if (o.lh === undefined) o.lh = lh; // an explicit leading-* (either order) wins
        break;
      }
      case !!(m = tok.match(/^text-\[(.+)\]$/)):
        if (isColor(m[1])) o.color = m[1];
        else { const v = arbLen(m[1], tok); if (typeof v === 'number') o.size = v; else R(`font-size: ${v.css ?? v};`); }
        break;
      case tok === 'text-balance' || tok === 'text-pretty': R(`text-wrap: ${tok.slice(5)};`); break;
      case tok.startsWith('text-') && !!(m = twColor(tok.slice(5), tok)): o.color = m; break;
      case /^text-/.test(tok): fail(tok, 'unsupported text-* utility — not a size, alignment, or bundled palette color; theme-var colors (text-primary…) need text-[#hex] or the color= prop'); break;
      case WEIGHTS[tok.slice(5)] != null && tok.startsWith('font-'): o.weight = WEIGHTS[tok.slice(5)]; break;
      case FONT_STACKS[tok.slice(5)] != null && tok.startsWith('font-'): R(`font-family: ${FONT_STACKS[tok.slice(5)]};`); break;
      case !!(m = tok.match(/^leading-(.+)$/)): {
        const nm = LEADING[m[1]];
        if (nm != null) o.lh = nm;
        else if (/^\d+$/.test(m[1])) o.lh = Number(m[1]) * SCALE;
        else { const v = arbLen(arb(m[1]) ?? m[1], tok); o.lh = typeof v === 'number' ? v : fail(tok, 'leading arbitrary value must be unitless or px'); }
        break;
      }
      case !!(m = tok.match(/^tracking-(.+)$/)): {
        const t = TRACKING[m[1]];
        if (t != null) o.ls = t;
        else { const a = arb(m[1]); if (a && /^-?\d*\.?\d+em$/.test(a)) o.ls = parseFloat(a); else fail(tok, 'tracking must be named or [Nem]'); }
        break;
      }
      case tok === 'uppercase' || tok === 'lowercase' || tok === 'capitalize': R(`text-transform: ${tok};`); break;
      case tok === 'normal-case': R('text-transform: none;'); break;
      case tok === 'italic': R('font-style: italic;'); break;
      case tok === 'not-italic': R('font-style: normal;'); break;
      case tok === 'underline' || tok === 'line-through': R(`text-decoration: ${tok};`); break;
      case tok === 'no-underline': R('text-decoration: none;'); break;
      case !!(m = tok.match(/^underline-offset-(\d+)$/)): R(`text-underline-offset: ${m[1]}px;`); break;
      case tok === 'truncate': R('overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'); break;
      case !!(m = tok.match(/^whitespace-(nowrap|normal|pre|pre-wrap|pre-line)$/)): R(`white-space: ${m[1]};`); break;
      case tok === 'break-words': R('overflow-wrap: break-word;'); break;
      case tok === 'antialiased': R('-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;'); break;

      /* ── color / background ── */
      case tok === 'bg-cover' || tok === 'bg-contain': R(`background-size: ${tok.slice(3)};`); break;
      case !!(m = tok.match(/^bg-(center|top|bottom|left|right)$/)): R(`background-position: ${m[1]};`); break;
      case !!(m = tok.match(/^bg-(no-repeat|repeat|repeat-x|repeat-y)$/)): R(`background-repeat: ${m[1]};`); break;
      case !!(m = tok.match(/^bg-\[(.+)\]$/)):
        if (isColor(m[1])) o.bg = m[1];
        else if (m[1].startsWith('length:')) R(`background-size: ${unUnderscore(m[1].slice(7))};`); // bg-[length:100%_100%] — 'length:' is Tailwind's disambiguator, NOT css
        else R(`background: ${unUnderscore(m[1])};`);
        break;
      case /^bg-gradient-|^bg-linear-|^from-|^via-|^to-/.test(tok): fail(tok, 'compound gradient utilities are not supported — use grad={[angle, from, to]}'); break;
      case tok.startsWith('bg-') && !!(m = twColor(tok.slice(3), tok)): o.bg = m; break;
      case /^bg-/.test(tok): fail(tok, 'unsupported bg-* utility — not a bundled palette color; theme-var colors (bg-primary…) need an arbitrary value like bg-[#0ea5e9], or the bg= prop'); break;
      case tok.startsWith('fill-') && !!(m = twColor(tok.slice(5), tok)): R(`fill: ${m};`); break;
      case tok.startsWith('stroke-') && !!(m = twColor(tok.slice(7), tok)): R(`stroke: ${m};`); break;

      /* ── border / radius (collected, finalized below) ── */
      case tok === 'border': bord.w = 1; break;
      case !!(m = tok.match(/^border-(\d+)$/)): bord.w = Number(m[1]); break;
      case tok === 'border-none': R('border-style: none;'); break;
      case !!(m = tok.match(/^border-(t|r|b|l|x|y)(?:-(\d+))?$/)): {
        const SIDES = { t: ['top'], r: ['right'], b: ['bottom'], l: ['left'], x: ['left', 'right'], y: ['top', 'bottom'] };
        for (const s of SIDES[m[1]]) R(`border-${s}-width: ${m[2] ?? 1}px; border-${s}-style: solid;`);
        break;
      }
      case !!(m = tok.match(/^border-\[(.+)\]$/)):
        if (isColor(m[1])) bord.c = m[1];
        else if (/^\d*\.?\d+px$/.test(m[1])) bord.w = parseFloat(m[1]); // border-[20px] — arb width
        else fail(tok, 'border arbitrary value must be a color or px width (border-[#e2e8f0], border-[20px])');
        break;
      case tok.startsWith('border-') && !!(m = twColor(tok.slice(7), tok)): bord.c = m; break;
      case /^border-/.test(tok): fail(tok, 'unsupported border-* utility — not a width, side, or bundled palette color; use border-[#e2e8f0]'); break;
      case tok === 'rounded': o.radius = ROUNDED['']; break;
      case ROUNDED[tok.slice(8)] != null && tok.startsWith('rounded-'): o.radius = ROUNDED[tok.slice(8)]; break;
      case !!(m = tok.match(/^rounded-\[(.+)\]$/)): {
        const v = arbLen(m[1], tok);
        if (typeof v === 'number') o.radius = v; else R(`border-radius: ${v.css ?? v};`);
        break;
      }
      case /^rounded-(t|r|b|l|tl|tr|br|bl)/.test(tok): fail(tok, 'per-corner radii go through raw="" (border-top-left-radius: …)'); break;

      /* ── transforms (composed into ONE transform: below) ── */
      case tok === 'transform' || tok === 'transform-gpu': break; // no-op: transform is synthesized from the scale/rotate/translate utilities
      case !!(m = tok.match(/^(-?)scale-(.+)$/)): tf.push(`scale(${m[1]}${scaleVal(m[2], tok)})`); break;
      case !!(m = tok.match(/^(-?)rotate-(.+)$/)): tf.push(`rotate(${m[1]}${rotateVal(m[2], tok)})`); break;
      case !!(m = tok.match(/^(-?)translate-(x|y)-(.+)$/)): {
        const v = len(m[3], tok, { frac: true });
        tf.push(`translate${m[2].toUpperCase()}(${cssLen(m[1] ? negLen(v) : v)})`); break;
      }

      /* ── filters (composed into ONE filter:/backdrop-filter: below) ── */
      case !!(m = tok.match(/^blur(?:-(none|sm|md|lg|xl|2xl|3xl))?$/)): flt.push(`blur(${BLUR[m[1] ?? '']}px)`); break;
      case !!(m = tok.match(/^blur-\[(.+)\]$/)): flt.push(`blur(${m[1]})`); break;
      case !!(m = tok.match(/^backdrop-blur(?:-(none|sm|md|lg|xl|2xl|3xl))?$/)): bflt.push(`blur(${BLUR[m[1] ?? '']}px)`); break;
      case !!(m = tok.match(/^brightness-(\d+)$/)): flt.push(`brightness(${Number(m[1]) / 100})`); break;
      case tok === 'grayscale': flt.push('grayscale(100%)'); break;
      case tok === 'grayscale-0': flt.push('grayscale(0)'); break;

      /* ── effects / misc ── */
      case tok === 'shadow': o.shadow = SHADOWS['']; break;
      case SHADOWS[tok.slice(7)] != null && tok.startsWith('shadow-'): o.shadow = SHADOWS[tok.slice(7)]; break;
      case tok === 'shadow-none': R('box-shadow: none;'); break;
      case !!(m = tok.match(/^opacity-(\d+)$/)): R(`opacity: ${Number(m[1]) / 100};`); break;
      case !!(m = tok.match(/^object-(cover|contain|fill|none)$/)): o.fit = m[1]; break;
      case !!(m = tok.match(/^overflow(-x|-y)?-(hidden|auto|scroll|visible)$/)):
        R(`overflow${m[1] || ''}: ${m[2]};`); break;
      case tok === 'aspect-square': R('aspect-ratio: 1 / 1;'); break;
      case tok === 'aspect-video': R('aspect-ratio: 16 / 9;'); break;
      case !!(m = tok.match(/^aspect-\[(.+)\]$/)): R(`aspect-ratio: ${m[1].replace(/_/g, ' ')};`); break;
      case tok === 'relative' || tok === 'absolute' || tok === 'fixed' || tok === 'sticky' || tok === 'static': o.pos = tok; break;
      case tok === 'inset-0': R('inset: 0;'); break;
      case !!(m = tok.match(/^inset-(.+)$/)): R(`inset: ${cssLen(len(m[1], tok, { frac: true }))};`); break;
      case !!(m = tok.match(/^-inset-(.+)$/)): R(`inset: ${cssLen(negLen(len(m[1], tok, { frac: true })))};`); break;
      case !!(m = tok.match(/^(top|right|bottom|left)-(.+)$/)): {
        const v = len(m[2], tok, { frac: true });
        R(`${m[1]}: ${cssLen(v)};`); break;
      }
      case !!(m = tok.match(/^-(top|right|bottom|left)-(.+)$/)): {
        const v = len(m[2], tok, { frac: true });
        R(`${m[1]}: ${cssLen(negLen(v))};`); break;
      }
      case !!(m = tok.match(/^z-(\d+)$/)): R(`z-index: ${m[1]};`); break;
      case !!(m = tok.match(/^-z-(\d+)$/)): R(`z-index: -${m[1]};`); break;
      case tok === 'sr-only': R(SR_ONLY); break;
      case tok === 'box-border' || tok === 'box-content': R(`box-sizing: ${tok.slice(4)}-box;`); break;
      case tok === 'cursor-pointer': R('cursor: pointer;'); break;
      case tok === 'select-none': R('user-select: none;'); break;
      case tok === 'pointer-events-none': R('pointer-events: none;'); break;
      case tok === 'pointer-events-auto': R('pointer-events: auto;'); break;
      case tok === 'list-none': R('list-style: none;'); break;
      /* arbitrary property: [mask-image:…] / [background-size:200%_100%] → raw prop: value */
      case !!(m = tok.match(/^\[([a-z-]+):(.+)\]$/)): {
        if (/(^|[^a-z-])(--)?theme\(/.test(m[2])) fail(tok, 'theme() only exists at Tailwind build time — inline the literal value');
        R(`${m[1]}: ${unUnderscore(m[2])};`); break;
      }
      case /^(transition|duration|ease|delay)(-|$)/.test(tok): break; // static render — accepted, no-op
      // static render: @keyframes can't be emitted from a class list and group-* state machinery
      // doesn't exist in atomic output — accepted no-ops so real-world blocks compile (motion
      // belongs to Elementor's own effects, not tw).
      case tok === 'group' || /^animate-/.test(tok): break;
      case tok === 'container': fail(tok, 'container is not supported — use maxw + center (or max-w-7xl mx-auto)'); break;

      default: unknown(tok);
    }
  }

  if (tf.length) raw.push(`transform: ${tf.join(' ')};`);
  if (flt.length) raw.push(`filter: ${flt.join(' ')};`);
  if (bflt.length) raw.push(`backdrop-filter: ${bflt.join(' ')};`);
  finalizeBox(o, 'pad', pad);
  finalizeBox(o, 'm', mar);
  if (bord.w != null && bord.c) o.border = [bord.w, bord.c];
  else if (bord.w != null) raw.push(`border-width: ${bord.w}px; border-style: solid;`);
  else if (bord.c) raw.push(`border-color: ${bord.c};`);
  return { o, raw };
}

/** apply a p/m token onto the side collector. axis: t|r|b|l|x|y|undefined(all). */
function side(box, axis, v, tok) {
  if (typeof v === 'object') fail(tok, 'rem/vw spacing goes through raw=""');
  if (typeof v === 'string' && v !== 'auto' && v.endsWith('%')) fail(tok, 'percent spacing goes through raw=""');
  const set = { undefined: ['t', 'r', 'b', 'l'], x: ['r', 'l'], y: ['t', 'b'], t: ['t'], r: ['r'], b: ['b'], l: ['l'] }[axis];
  for (const s of set) box[s] = v;
}
/** sides → sx pad/m: all four known → number/array shorthand; PARTIAL → {t,r,b,l} object
 * (sx → PDIM partial envelope — atomic, so axis spacing works inside responsive variants). */
function finalizeBox(o, key, box) {
  const ks = Object.keys(box);
  if (!ks.length) return;
  const { t, r, b, l } = box;
  if ([t, r, b, l].every((v) => v != null)) {
    o[key] = t === b && r === l ? (t === r ? t : [t, r]) : [t, r, b, l];
  } else {
    o[key] = { ...box };
  }
}
/** route a length onto an sx size key, or raw when the unit can't be enveloped. */
function sizeProp(o, key, v, R, cssName) {
  if (typeof v === 'object') R(`${cssName}: ${v.css};`);
  else if (key === 'maxw' || key === 'minh') { typeof v === 'number' ? (o[key] = v) : R(`${cssName}: ${v};`); }
  else o[key] = v;
}

/* sx shorthand key → css declaration, for hover:/focus: blocks (atomic props have no state
 * variants, so state styling ALWAYS goes through raw `&:hover { … }`). Only keys with an obvious
 * single-declaration CSS form are mapped; anything else throws with the raw="" recipe. */
const STATE_CSS = {
  color: (v) => `color: ${v};`,
  bg: (v) => `background: ${v};`,
  size: (v) => `font-size: ${typeof v === 'number' ? v + 'px' : v};`,
  weight: (v) => `font-weight: ${v};`,
  radius: (v) => `border-radius: ${typeof v === 'number' ? v + 'px' : v};`,
  border: (v) => `border: ${v[0]}px solid ${v[1]};`,
  shadow: (v) => `box-shadow: 0 ${v[0]}px ${v[1]}px ${v[2]}px ${v[3]};`,
};

/**
 * Parse a Tailwind utility string → sx-input shorthand (plus `raw`, `tablet`, `mobile`).
 * Desktop-first: base tokens are desktop; max-lg:→tablet, max-md:/max-sm:→mobile;
 * tablet:/mobile: literal prefixes also accepted. hover:/focus: compile to raw &:hover/&:focus
 * blocks. Mobile-first (md:, lg:) and other state prefixes throw — sx has no state variants and
 * silent reinterpretation of mobile-first semantics would misrender.
 */
export function twToSx(str) {
  const buckets = { desktop: [], tablet: [], mobile: [], hover: [], focus: [] };
  for (const tok of String(str).trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([a-z0-9-]+):(.+)$/);
    if (!m) { buckets.desktop.push(tok); continue; }
    const [, pre, rest] = m;
    if (pre === 'tablet' || pre === 'max-lg') buckets.tablet.push(rest);
    else if (pre === 'mobile' || pre === 'max-md' || pre === 'max-sm') buckets.mobile.push(rest);
    else if (pre === 'hover' || pre === 'focus') buckets[pre].push(rest);
    else if (/^(sm|md|lg|xl|2xl)$/.test(pre)) fail(tok, 'mobile-first breakpoints are not supported — author desktop-first: base = desktop, max-lg: = tablet, max-md: = mobile');
    else if (/^(active|group-hover|focus-within|focus-visible|visited|disabled)$/.test(pre)) fail(tok, 'state variants beyond hover:/focus: are not supported — use raw="&:active { … }"');
    else fail(tok, 'unknown variant prefix');
  }
  const d = parseBucket(buckets.desktop);
  const out = { ...d.o };
  const rawChunks = d.raw.slice();
  for (const st of ['hover', 'focus']) {
    if (!buckets[st].length) continue;
    const b = parseBucket(buckets[st]);
    const decls = b.raw.slice();
    for (const [k, v] of Object.entries(b.o)) {
      const fn = STATE_CSS[k];
      if (!fn) fail(`${st}:${buckets[st].join(` ${st}:`)}`, `${st}: supports color/background/border/radius/shadow/typography and raw-CSS utilities — layout changes on ${st} go through raw="&:${st} { … }"`);
      decls.push(fn(v));
    }
    rawChunks.push(`&:${st} { ${decls.join(' ')} }`);
  }
  if (rawChunks.length) out.raw = rawChunks.join(' ');
  for (const [bp, key] of [['tablet', 'tablet'], ['mobile', 'mobile']]) {
    if (!buckets[bp].length) continue;
    const b = parseBucket(buckets[bp]);
    if (b.raw.length) fail(buckets[bp].join(' '), `raw-fallback utilities are desktop-only for now — put ${bp} overrides that need custom CSS in raw="" via css() breakpoints`);
    out[key] = b.o;
  }
  return out;
}

/**
 * Expand a props object's `tw` into sx shorthand. EXPLICIT sx props win over tw on conflict;
 * `raw` strings concatenate (tw first); tablet/mobile shallow-merge per key.
 */
export function mergeTw(props = {}) {
  if (!props.tw) return props;
  const { tw, ...rest } = props;
  const t = twToSx(tw);
  const merged = { ...t, ...rest };
  if (t.raw && rest.raw) merged.raw = `${t.raw}\n${rest.raw}`;
  for (const bp of ['tablet', 'mobile']) {
    if (t[bp] && rest[bp]) merged[bp] = { ...t[bp], ...rest[bp] };
  }
  return merged;
}
