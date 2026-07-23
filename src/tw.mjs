/**
 * tw.mjs — Tailwind-subset → sx shorthand. Zero deps, no imports (kit-components consumes us).
 *
 * Why: models emit Tailwind natively with no docs in context; the bespoke sx vocabulary is
 * out-of-distribution and needs the skill loaded. `tw="px-6 py-24 flex flex-col gap-8"` lets an
 * agent author in its most-trained dialect while the compiler still owns the envelopes.
 *
 * Contract:
 *   - Utilities that map to atomic props BECOME sx shorthand (pad/gap/w/size/…) — first choice,
 *     because `raw` compiles to custom_css (Pro escape hatch), not atomic styles.
 *   - A known long tail (uppercase, truncate, z-index, inset offsets…) falls back to `raw` CSS.
 *   - Everything else THROWS naming the token — a silently-dropped class is a visual bug only a
 *     screenshot catches. Palette names (bg-blue-500), hover:, and mobile-first prefixes get
 *     targeted errors with the working recipe.
 *   - Breakpoints are DESKTOP-FIRST to match sx: base = desktop, `max-lg:` → tablet,
 *     `max-md:`/`max-sm:` → mobile (also literal `tablet:`/`mobile:` prefixes).
 *   - Spacing scale: n × 4px (p-6 = 24px). Arbitrary values: p-[96px], w-[50%], text-[#0A2230].
 */

const SCALE = 4;

const TEXT_SIZES = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48, '6xl': 60, '7xl': 72, '8xl': 96, '9xl': 128 };
const WEIGHTS = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const LEADING = { none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625, loose: 2 };
const TRACKING = { tighter: -0.05, tight: -0.025, normal: 0, wide: 0.025, wider: 0.05, widest: 0.1 };
const MAX_W = { xs: 320, sm: 384, md: 448, lg: 512, xl: 576, '2xl': 672, '3xl': 768, '4xl': 896, '5xl': 1024, '6xl': 1152, '7xl': 1280 };
const ROUNDED = { none: 0, sm: 2, '': 4, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24, full: 9999 };
/* Tailwind shadows are multi-layer; single-layer approximations in SHADOW arg order [v, blur, spread, color]. */
const SHADOWS = {
  sm: [1, 2, 0, 'rgba(0,0,0,0.05)'], '': [1, 3, 0, 'rgba(0,0,0,0.1)'], md: [4, 6, -1, 'rgba(0,0,0,0.1)'],
  lg: [10, 15, -3, 'rgba(0,0,0,0.1)'], xl: [20, 25, -5, 'rgba(0,0,0,0.1)'], '2xl': [25, 50, -12, 'rgba(0,0,0,0.25)'],
};
const ALIGN = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch', baseline: 'baseline' };
const JUSTIFY = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };
const NAMED_COLORS = { white: '#ffffff', black: '#000000', transparent: 'transparent' };
const FONT_STACKS = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const fail = (tok, hint) => { throw new Error(`exjsx tw: ${hint} (token "${tok}")`); };
const unknown = (tok) => fail(tok, 'unknown utility — use an sx prop or raw="" for anything the subset does not cover');

/** looks like a color literal (arbitrary-value body or named)? */
const isColor = (v) => /^#|^rgba?\(|^hsla?\(/.test(v);
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

/** Parse ONE breakpoint bucket of tokens → { o: shorthand, raw: [decls] }. */
function parseBucket(tokens) {
  const o = {};
  const raw = [];
  const pad = {}; const mar = {}; const bord = {};
  const R = (d) => raw.push(d);

  for (const tok of tokens) {
    let m;
    switch (true) {
      /* ── display / flex / grid ── */
      case tok === 'flex' || tok === 'grid' || tok === 'block' || tok === 'inline-block' || tok === 'inline-flex' || tok === 'inline':
        o.display = tok; break;
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
        const v = len(m[2], tok);
        R(`${m[1] === 'x' ? 'column' : 'row'}-gap: ${typeof v === 'object' ? v.css : typeof v === 'number' ? v + 'px' : v};`); break;
      }
      case !!(m = tok.match(/^gap-(.+)$/)): {
        const v = len(m[1], tok);
        if (typeof v === 'number') o.gap = v; else R(`gap: ${typeof v === 'object' ? v.css : v};`);
        break;
      }
      case !!(m = tok.match(/^grid-cols-(\d+)$/)): o.gridCols = Number(m[1]); break;
      case !!(m = tok.match(/^grid-cols-\[(.+)\]$/)): o.gridCols = m[1].replace(/_/g, ' '); break;
      case tok === 'col-span-full': R('grid-column: 1 / -1;'); break;
      case !!(m = tok.match(/^col-span-(\d+)$/)): o.span = Number(m[1]); break;
      case !!(m = tok.match(/^order-(\d+|first|last)$/)):
        R(`order: ${m[1] === 'first' ? -9999 : m[1] === 'last' ? 9999 : m[1]};`); break;

      /* ── spacing (collected per side, finalized below) ── */
      case !!(m = tok.match(/^p(t|r|b|l|x|y)?-(.+)$/)): side(pad, m[1], len(m[2], tok), tok); break;
      case tok === 'mx-auto': mar.l = 'auto'; mar.r = 'auto'; break;
      case tok === 'my-auto': mar.t = 'auto'; mar.b = 'auto'; break;
      case !!(m = tok.match(/^m(t|r|b|l|x|y)?-(.+)$/)):
        side(mar, m[1], m[2] === 'auto' ? 'auto' : len(m[2], tok), tok); break;
      case /^-m/.test(tok): fail(tok, 'negative margins go through raw="" (margin-…: -Npx)'); break;

      /* ── sizing ── */
      case tok === 'w-full': o.w = '100%'; break;
      case tok === 'w-auto': o.w = 'auto'; break;
      case tok === 'w-fit': o.w = 'hug'; break;
      case tok === 'w-screen': R('width: 100vw;'); break;
      case tok === 'w-min' || tok === 'w-max': R(`width: ${tok.slice(2)}-content;`); break;
      case !!(m = tok.match(/^w-(.+)$/)): sizeProp(o, 'w', len(m[1], tok, { frac: true }), R, 'width'); break;
      case tok === 'h-full': o.h = '100%'; break;
      case tok === 'h-screen': R('height: 100vh;'); break;
      case tok === 'h-auto': R('height: auto;'); break;
      case tok === 'h-fit': R('height: fit-content;'); break;
      case !!(m = tok.match(/^h-(.+)$/)): sizeProp(o, 'h', len(m[1], tok, { frac: true }), R, 'height'); break;
      case tok === 'min-h-screen': R('min-height: 100vh;'); break;
      case tok === 'min-h-full': R('min-height: 100%;'); break;
      case !!(m = tok.match(/^min-h-(.+)$/)): sizeProp(o, 'minh', len(m[1], tok), R, 'min-height'); break;
      case !!(m = tok.match(/^min-w-(.+)$/)): {
        const v = len(m[1], tok, { frac: true });
        R(`min-width: ${typeof v === 'object' ? v.css : typeof v === 'number' ? v + 'px' : v};`); break;
      }
      case tok === 'max-w-full': R('max-width: 100%;'); break;
      case tok === 'max-w-none': R('max-width: none;'); break;
      case !!(m = tok.match(/^max-w-(.+)$/)):
        sizeProp(o, 'maxw', MAX_W[m[1]] ?? len(m[1], tok), R, 'max-width'); break;
      case !!(m = tok.match(/^max-h-(.+)$/)): {
        const v = len(m[1], tok);
        R(`max-height: ${typeof v === 'object' ? v.css : typeof v === 'number' ? v + 'px' : v};`); break;
      }

      /* ── typography ── */
      case !!(m = tok.match(/^text-(left|center|right|justify|start|end)$/)): o.ta = m[1]; break;
      case tok in { 'text-white': 1, 'text-black': 1, 'text-transparent': 1 }: o.color = NAMED_COLORS[tok.slice(5)]; break;
      case TEXT_SIZES[tok.slice(5)] != null && tok.startsWith('text-'): o.size = TEXT_SIZES[tok.slice(5)]; break;
      case !!(m = tok.match(/^text-\[(.+)\]$/)):
        if (isColor(m[1])) o.color = m[1];
        else { const v = arbLen(m[1], tok); if (typeof v === 'number') o.size = v; else R(`font-size: ${v.css ?? v};`); }
        break;
      case /^text-/.test(tok): fail(tok, 'Tailwind palette colors are not bundled — use an arbitrary value like text-[#64748b], or the color= prop'); break;
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
      case tok === 'truncate': R('overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'); break;
      case !!(m = tok.match(/^whitespace-(nowrap|normal|pre|pre-wrap|pre-line)$/)): R(`white-space: ${m[1]};`); break;
      case tok === 'break-words': R('overflow-wrap: break-word;'); break;

      /* ── color / background ── */
      case NAMED_COLORS[tok.slice(3)] != null && tok.startsWith('bg-'): o.bg = NAMED_COLORS[tok.slice(3)]; break;
      case !!(m = tok.match(/^bg-\[(.+)\]$/)):
        if (isColor(m[1])) o.bg = m[1]; else R(`background: ${m[1].replace(/_/g, ' ')};`);
        break;
      case /^bg-gradient-|^from-|^via-|^to-/.test(tok): fail(tok, 'compound gradient utilities are not supported — use grad={[angle, from, to]}'); break;
      case /^bg-/.test(tok): fail(tok, 'Tailwind palette colors are not bundled — use an arbitrary value like bg-[#0ea5e9], or the bg= prop'); break;

      /* ── border / radius (collected, finalized below) ── */
      case tok === 'border': bord.w = 1; break;
      case !!(m = tok.match(/^border-(\d+)$/)): bord.w = Number(m[1]); break;
      case NAMED_COLORS[tok.slice(7)] != null && tok.startsWith('border-'): bord.c = NAMED_COLORS[tok.slice(7)]; break;
      case !!(m = tok.match(/^border-\[(.+)\]$/)):
        if (isColor(m[1])) bord.c = m[1]; else fail(tok, 'border arbitrary value must be a color — width via border-N');
        break;
      case /^border-(t|r|b|l)/.test(tok): fail(tok, 'per-side borders go through raw="" (border-top: 1px solid …)'); break;
      case /^border-/.test(tok): fail(tok, 'Tailwind palette colors are not bundled — use border-[#e2e8f0]'); break;
      case tok === 'rounded': o.radius = ROUNDED['']; break;
      case ROUNDED[tok.slice(8)] != null && tok.startsWith('rounded-'): o.radius = ROUNDED[tok.slice(8)]; break;
      case !!(m = tok.match(/^rounded-\[(.+)\]$/)): {
        const v = arbLen(m[1], tok);
        if (typeof v === 'number') o.radius = v; else R(`border-radius: ${v.css ?? v};`);
        break;
      }
      case /^rounded-(t|r|b|l|tl|tr|br|bl)/.test(tok): fail(tok, 'per-corner radii go through raw="" (border-top-left-radius: …)'); break;

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
      case !!(m = tok.match(/^(top|right|bottom|left)-(.+)$/)): {
        const v = len(m[2], tok, { frac: true });
        R(`${m[1]}: ${typeof v === 'object' ? v.css : typeof v === 'number' ? v + 'px' : v};`); break;
      }
      case !!(m = tok.match(/^z-(\d+)$/)): R(`z-index: ${m[1]};`); break;
      case tok === 'cursor-pointer': R('cursor: pointer;'); break;
      case tok === 'select-none': R('user-select: none;'); break;
      case tok === 'pointer-events-none': R('pointer-events: none;'); break;
      case tok === 'list-none': R('list-style: none;'); break;
      case /^(transition|duration|ease|delay)(-|$)/.test(tok): break; // static render — accepted, no-op
      case tok === 'container': fail(tok, 'container is not supported — use maxw + center (or max-w-7xl mx-auto)'); break;

      default: unknown(tok);
    }
  }

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

/**
 * Parse a Tailwind utility string → sx-input shorthand (plus `raw`, `tablet`, `mobile`).
 * Desktop-first: base tokens are desktop; max-lg:→tablet, max-md:/max-sm:→mobile;
 * tablet:/mobile: literal prefixes also accepted. Mobile-first (md:, lg:) and state
 * (hover:, focus:) prefixes throw — sx has no state variants and silent reinterpretation
 * of mobile-first semantics would misrender.
 */
export function twToSx(str) {
  const buckets = { desktop: [], tablet: [], mobile: [] };
  for (const tok of String(str).trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([a-z0-9-]+):(.+)$/);
    if (!m) { buckets.desktop.push(tok); continue; }
    const [, pre, rest] = m;
    if (pre === 'tablet' || pre === 'max-lg') buckets.tablet.push(rest);
    else if (pre === 'mobile' || pre === 'max-md' || pre === 'max-sm') buckets.mobile.push(rest);
    else if (/^(sm|md|lg|xl|2xl)$/.test(pre)) fail(tok, 'mobile-first breakpoints are not supported — author desktop-first: base = desktop, max-lg: = tablet, max-md: = mobile');
    else if (/^(hover|focus|active|group-hover|focus-within|disabled)$/.test(pre)) fail(tok, 'state variants are not supported — use raw="&:hover { … }"');
    else fail(tok, 'unknown variant prefix');
  }
  const d = parseBucket(buckets.desktop);
  const out = { ...d.o };
  if (d.raw.length) out.raw = d.raw.join(' ');
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
