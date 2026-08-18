/**
 * import.mjs — `exjsx import <url-or-html-file>`: the computed-style capture bridge.
 *
 * Renders the source in headless Chrome and reads COMPUTED styles per element — the browser
 * resolves the whole cascade (Tailwind, BEM, CSS-in-JS, whatever), so we never parse CSS text.
 * Output is an editable .page.jsx (intrinsics + sx props for what maps onto the atomic schema,
 * `raw=` for the remainder) that flows through the normal pipeline: lint/build/deploy/gates.
 * Import once, then iterate as code.
 *
 * The core trick is DELTA-FILTERING: a computed style has ~340 longhands per node; we only keep
 * declarations that DIFFER from (a) a per-tag control element rendered in a bare same-UA iframe
 * (UA-default delta) and (b) the parent's computed value for inherited typography (inheritance
 * delta). Text leaves additionally PIN size/weight/lh/color — the target renders inside a foreign
 * WordPress theme, so leaf typography is always made explicit for fidelity.
 *
 * Known limits (documented, by design):
 *   - pseudo-elements (::before/::after) are invisible to the DOM walk — decorative borders,
 *     underlays and animated sprites built on them are LOST (the emitted header comment says so).
 *   - inline links/spans inside a paragraph flatten to text (html-v3 whitelists em/strong/br only).
 *   - authored heights ARE now recovered: the capture probes height:auto and re-measures, so
 *     `absolute inset-0` overlays and `size-N` squares keep their size instead of collapsing.
 *     The probe is limited to absolute/empty/square/absolute-children boxes so a flex-stretched
 *     child never gets a hard height pinned onto it.
 *   - raw= CSS cannot vary per breakpoint (sx-mappable props diff into mobile={{…}}; raw deltas
 *     at 390 are dropped with a note).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/* ── the computed longhands we read per element (everything else can't map anyway) ── */
const PROPS = [
  'display', 'position', 'z-index', 'top', 'right', 'bottom', 'left',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-self',
  'flex-grow', 'flex-shrink', 'flex-basis', 'order', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-column',
  'width', 'height', 'max-width', 'min-width', 'min-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-align', 'text-transform', 'text-decoration-line', 'white-space',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'opacity', 'overflow-x', 'overflow-y', 'object-fit', 'aspect-ratio',
  'transform', 'filter', 'backdrop-filter', 'list-style-type',
];

/* ───────────────────────────── helpers (pure) ───────────────────────────── */
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r1 = (n) => Math.round(n * 10) / 10;
const isTransparent = (c) => !c || c === 'transparent' || /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/.test(c);
/** rgb()/rgba()/oklch() → #hex or rgba() — Tailwind v4 palettes are oklch, and Chrome's computed
 * values keep that serialization; Elementor's color prop wants classic notation. */
export function cssColor(c) {
  const ok = /^oklch\(([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\)$/.exec(c || '');
  if (ok) {
    let L = parseFloat(ok[1]); if (ok[1].endsWith('%')) L /= 100;
    const C = parseFloat(ok[2]); const H = (parseFloat(ok[3]) * Math.PI) / 180;
    let alpha = ok[4] === undefined ? 1 : parseFloat(ok[4]); if (ok[4]?.endsWith('%')) alpha /= 100;
    const a = C * Math.cos(H); const b = C * Math.sin(H);
    const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    const lin = [
      4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
      -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
      -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
    ].map((x) => {
      const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.abs(x) ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, v)) * 255);
    });
    if (alpha < 1) return `rgba(${lin[0]}, ${lin[1]}, ${lin[2]}, ${r1(alpha * 100) / 100})`;
    return `#${lin.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c || '');
  if (!m) return c;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (a < 1) return c;
  const h = (x) => Number(x).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}
const sides = (_s, fmt) => ['top', 'right', 'bottom', 'left'].map(fmt);
/** [t,r,b,l] → most compact pad/m literal: n | [v,h] | [t,r,b,l]. 'auto' tokens survive. */
export function compactBox(v4) {
  const [t, r, b, l] = v4;
  if (t === b && r === l) return t === r ? t : [t, r];
  return [t, r, b, l];
}
const INLINE_TAGS = new Set(['em', 'strong', 'b', 'i', 'br', 'span', 'a', 'small', 'code', 'sub', 'sup', 'time', 'abbr', 'u', 's', 'mark']);
const TEXTISH = new Set(['p', 'a', 'span', 'li', 'button', 'blockquote', 'figcaption', 'label', 'dt', 'dd', 'small', 'code', 'strong', 'em', 'th', 'td', 'summary']);
const HTML_CARRIER = new Set(['iframe', 'video', 'canvas', 'form', 'input', 'select', 'textarea', 'audio', 'table']);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isInlineChild = (ch) => ch.tag === '#text' || ch.tag === 'br' || ch.hidden
  || (INLINE_TAGS.has(ch.tag) && (ch.styles ? String(ch.styles.display).startsWith('inline') : true));
/* stricter: display exactly 'inline' — an inline-flex .btn anchor is a REAL box, not a text run */
const isPlainInlineChild = (ch) => ch.tag === '#text' || ch.tag === 'br' || ch.hidden
  || (INLINE_TAGS.has(ch.tag) && (ch.styles ? ch.styles.display === 'inline' : true));

/** element kind for the emit tree. */
export function classify(n) {
  if (n.tag === 'svg') return 'svg';
  if (n.tag === 'img') return 'img';
  if (HTML_CARRIER.has(n.tag)) return 'html';
  const kids = n.children || [];
  const inlineOnly = kids.length > 0 && kids.every(isInlineChild);
  const hasText = kids.some((c) => c.tag === '#text' || (c.children || []).length);
  if (/^h[1-6]$/.test(n.tag)) return inlineOnly || kids.length === 0 ? 'heading' : 'container';
  if (TEXTISH.has(n.tag) && inlineOnly && hasText) return 'text';
  // a DIV whose children are all plain-inline runs (spans/brs/text) is a text block, not a box
  if (kids.length > 0 && kids.every(isPlainInlineChild) && hasText) return 'text';
  return 'container';
}

/** serialize a text leaf's children to whitelisted html-v3 markup (em/strong/br); other inline
 * elements flatten to their text (notes collects what was lost). */
/** A run of inline children → html-v3 markup.
 *  `recolor` opts in to carrying a COLOURED <span> through as <strong>: html-v3 whitelists only
 *  em/strong/br, so `ENTER THE <span class="text-violet">VOID</span>` otherwise flattens and the
 *  highlighted word silently renders in the heading's own colour. The caller pairs this with an
 *  `& strong{color:…;font-weight:inherit}` rule so only the colour survives, not bolding. */
export function textRun(children, notes, recolor = null) {
  const ser = (kids) => kids.map((c) => {
    if (c.hidden) return '';
    if (c.tag === '#text') return esc(c.text);
    if (c.tag === 'br') return '<br>';
    if (c.tag === 'em' || c.tag === 'i') return `<em>${ser(c.children || [])}</em>`;
    if (c.tag === 'strong' || c.tag === 'b') return `<strong>${ser(c.children || [])}</strong>`;
    if (recolor && c.tag === 'span' && c.styles && c.styles.color === recolor) {
      return `<strong>${ser(c.children || [])}</strong>`;
    }
    if (c.tag === 'a' && notes) notes.add('inline <a> inside a text run flattened to plain text (html-v3 whitelists em/strong/br only)');
    else if (notes && c.tag !== 'span') notes.add(`inline <${c.tag}> flattened to plain text`);
    return ser(c.children || []);
  }).join('');
  return ser(children).replace(/[ \t]+/g, ' ').replace(/ ?<br> ?/g, '<br>').trim();
}

/* ───────────────────────────── the mapper ─────────────────────────────
 * One captured element (+ its parent + the per-tag control) → { sx, raw[] }.
 * sx keys are the exjsx shorthand vocabulary (kit-components sx()); raw is CSS the atomic
 * schema has no home for. */

/** A form control's computed styles → CSS. The atomic e-form widgets ship their own base skin, so
 * every visual property has to be restated or the control renders at Elementor's default size —
 * which is what made a natively-mapped form LOOK worse than the unstyled carrier it replaced. */
function fieldCss(st, { grow = false, width = null, fills = false } = {}) {
  const d = [];
  const px = (v) => `${r1(num(v))}px`;
  if (grow) d.push('flex:1 1 0%', 'min-width:0');
  d.push('box-sizing:border-box');
  // WIDTH. Without this every control hugs its content — the single most visible form defect.
  if (fills) d.push('width:100%');
  else if (width != null && width > 0) d.push(`width:${r1(width)}px`);
  if (num(st.height) > 0) d.push(`height:${px(st.height)}`);
  d.push(`padding:${px(st['padding-top'])} ${px(st['padding-right'])} ${px(st['padding-bottom'])} ${px(st['padding-left'])}`);
  if (!isTransparent(st['background-color'])) d.push(`background:${cssColor(st['background-color'])}`);
  const bw = num(st['border-top-width']);
  if (bw > 0) d.push(`border:${px(st['border-top-width'])} ${st['border-top-style']} ${cssColor(st['border-top-color'])}`);
  else d.push('border:0');
  const rad = num(st['border-top-left-radius']);
  if (rad > 0) d.push(`border-radius:${px(st['border-top-left-radius'])}`);
  if (st['font-family']) d.push(`font-family:${st['font-family']}`);
  if (num(st['font-size']) > 0) d.push(`font-size:${px(st['font-size'])}`);
  if (st['font-weight']) d.push(`font-weight:${st['font-weight']}`);
  if (st['line-height'] && st['line-height'] !== 'normal') d.push(`line-height:${px(st['line-height'])}`);
  d.push(`letter-spacing:${!st['letter-spacing'] || st['letter-spacing'] === 'normal' ? 'normal' : px(st['letter-spacing'])}`);
  if (st.color) d.push(`color:${cssColor(st.color)}`);
  if (st['box-shadow'] && st['box-shadow'] !== 'none') d.push(`box-shadow:${st['box-shadow']}`);
  if (st['text-align'] && st['text-align'] !== 'start') d.push(`text-align:${st['text-align']}`);
  return d.join(';');
}

/** A colour at the given alpha, for reproducing element opacity as a background layer. */
function veilOver(color, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(color).trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(alpha * 100) / 100})`;
  }
  const r = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(color).trim());
  return r ? `rgba(${r[1]}, ${r[2]}, ${r[3]}, ${Math.round(alpha * 100) / 100})` : null;
}

export function mapStyles(rec) {
  const { tag, kind, s, c = {}, parent, rect, notes = new Set(), isRoot = false,
          authoredH = null, authoredW = null, insetBoth = false, insetBothX = false } = rec;
  const sx = {};
  const raw = [];
  const p = parent?.styles || null;
  const d = s.display;
  const isFlex = d === 'flex' || d === 'inline-flex';
  const isGrid = d === 'grid' || d === 'inline-grid';
  const parentDisplay = p ? p.display : null;
  const parentFlexRow = parentDisplay && parentDisplay.includes('flex') && String(p['flex-direction']).startsWith('row');
  const parentFlexCol = parentDisplay && parentDisplay.includes('flex') && String(p['flex-direction']).startsWith('column');
  const parentGrid = parentDisplay && parentDisplay.includes('grid');

  /* ── container layout ── */
  if (kind === 'container' || kind === 'section') {
    if (isGrid) {
      const tracks = String(s['grid-template-columns']).trim().split(/\s+/).filter((t) => t !== 'none');
      const pxs = tracks.map((t) => parseFloat(t));
      if (tracks.length > 1 && pxs.every((x) => Number.isFinite(x)) && Math.max(...pxs) - Math.min(...pxs) <= 1.5) {
        sx.gridCols = tracks.length;               // equal tracks → repeat(n, 1fr): responsive-safe
      } else if (tracks.length && tracks[0] !== 'none') {
        sx.gridCols = tracks.map((t) => (Number.isFinite(parseFloat(t)) ? `${r1(parseFloat(t))}px` : t)).join(' ');
      }
    } else if (isFlex) {
      const fd = s['flex-direction'];
      if (fd !== 'column') sx.dir = fd;            // box defaults to a flex COLUMN
    } else if (d === 'inline-block' || d === 'inline-flex') {
      sx.display = d;
    }
    /* An inline-level box hugs its content. Elementor's flex parents stretch children, so a pill or
     * badge that was `inline-flex` in the source renders full-width unless it is told not to. */
    // An inline-level box hugs its content REGARDLESS of what its parent is — gating this on a flex
    // parent left pills and icon buttons stretching to the full row once their frozen width was
    // (correctly) removed. align-self only means anything inside a flex parent, so keep that gated.
    if (d === 'inline-block' || d === 'inline-flex') {
      raw.push('width:fit-content');
      if (parentDisplay && parentDisplay.includes('flex')) raw.push('align-self:flex-start');
    }
  }
  /* The same rule has to apply to TEXT leaves, and that is where it actually bites: a `<button>` or
   * `<a class="inline-block px-8 py-4">` carrying a label classifies as text, not a container, so the
   * container branch above never saw it. Emitted as a block-level paragraph it stretched to its
   * parent's full width — a 211px CTA rendered 500px wide. */
  if ((kind === 'text' || kind === 'heading')
      && (d === 'inline-block' || d === 'inline-flex' || d === 'inline')) {
    raw.push('width:fit-content');
    if (parentDisplay && parentDisplay.includes('flex')) raw.push('align-self:flex-start');
  }
  if (kind === 'container' || kind === 'section') {
    // block/flow-root map to the box default (flex column) — one-directional margin flows survive
    if (isFlex || isGrid) {
      const j = s['justify-content'];
      if (j && j !== 'normal' && j !== 'flex-start' && j !== 'start') sx.justify = j;
      const a = s['align-items'];
      if (a && a !== 'normal' && a !== 'stretch') sx.align = a === 'baseline' ? 'flex-end' : a;
      if (isFlex && s['flex-wrap'] === 'wrap') sx.wrap = true;
      const rg = s['row-gap'] === 'normal' ? 0 : num(s['row-gap']);
      const cg = s['column-gap'] === 'normal' ? 0 : num(s['column-gap']);
      if (rg || cg) {
        if (Math.abs(rg - cg) <= 0.5) sx.gap = r1(rg);
        else raw.push(`row-gap:${r1(rg)}px`, `column-gap:${r1(cg)}px`);
      }
    }
  }

  /* ── flex/grid item props (any kind) ── */
  if (parentDisplay && parentDisplay.includes('flex')) {
    const g = num(s['flex-grow']); const sh = num(s['flex-shrink']); const fb = s['flex-basis'];
    if (g > 0) {
      if (g === 1 && sh === 1 && (fb === '0%' || fb === '0px' || fb === 'auto')) sx.flex = 1;
      else raw.push(`flex:${g} ${sh} ${fb}`);
    }
    const as = s['align-self'];
    if (as && as !== 'auto' && as !== 'normal' && as !== 'stretch') raw.push(`align-self:${as}`);
  }
  if (s.order && num(s.order) !== 0) raw.push(`order:${s.order}`); // sm:order-last & friends
  if (parentGrid) {
    const gc = String(s['grid-column'] || '');
    const m = /^span (\d+)/.exec(gc);
    if (m) sx.span = Number(m[1]);
    else if (gc && !/^auto/.test(gc)) raw.push(`grid-column:${gc}`);
  }

  /* ── position ── */
  const pos = s.position;
  if (pos && pos !== 'static') {
    sx.pos = pos;
    // absolute/fixed: pin top+left only (all four + width would overconstrain); sticky: top
    if (pos === 'absolute' || pos === 'fixed') {
      // Pinning both edges of an axis is how `inset-0` full-bleeds; expressing it as inset keeps
      // the box responsive, where a frozen width/height from the 1440 capture would not be.
      if (insetBoth) raw.push(`top:${s.top}`, `bottom:${s.bottom}`);
      else if (s.top && s.top !== 'auto') raw.push(`top:${s.top}`);
      if (insetBothX) raw.push(`left:${s.left}`, `right:${s.right}`);
      else if (s.left && s.left !== 'auto') raw.push(`left:${s.left}`);
    } else if (pos === 'sticky' && s.top && s.top !== 'auto') raw.push(`top:${s.top}`);
  }
  if (s['z-index'] && s['z-index'] !== 'auto') sx.z = parseInt(s['z-index'], 10);

  /* ── size ── */
  const parentContentW = parent && parent.rect
    ? parent.rect.w - num(p['padding-left']) - num(p['padding-right']) - num(p['border-left-width']) - num(p['border-right-width'])
    : null;
  const mw = s['max-width'];
  if (mw && mw !== 'none') sx.maxw = mw.endsWith('%') ? mw : r1(num(mw)); // % stays % (len honors units)
  const fullW = parentContentW != null && Math.abs(rect.w - parentContentW) <= 1.5;
  const maxwIsTheConstraint = typeof sx.maxw === 'number' && Math.abs(rect.w - sx.maxw) <= 1.5;
  const growing = num(s['flex-grow']) > 0 && parentDisplay && parentDisplay.includes('flex');
  {
    // authoredW === null means the width came from content or from the parent — leave it fluid so the
    // box can hug or fill as the source did, instead of pinning it and forcing a text wrap.
    // TEXT leaves need this too: a `w-12 h-12 rounded-full` icon button carrying a glyph classifies
    // as text, and excluding it stretched a 48px round button across 284px of row.
    const widthIsAuthored = authoredW != null || insetBothX;
    const textLeaf = kind === 'text' || kind === 'heading';
    /* `parentGrid` skips width on the assumption a grid child fills its cell — but a 192px round
     * portrait centred in a wider cell does not, and dropping its width let it stretch into an
     * ellipse. authoredW is measured proof, so it outranks that heuristic. */
    if (!fullW && !maxwIsTheConstraint && !growing && widthIsAuthored && !isRoot
        && (!parentGrid || authoredW != null)
        && (!textLeaf || authoredW != null)) sx.w = r1(rect.w);
  }
  if (num(s['min-height']) > 0) sx.minh = r1(num(s['min-height']));
  if (num(s['min-width']) > 0) raw.push(`min-width:${s['min-width']}`);
  /* An authored height (proved by the capture's height:auto probe). Emitted only when the box is
   * NOT already sized by both inset edges, and only when it differs from any min-height we just
   * wrote — otherwise the same number lands twice. Without this the box renders at its content
   * height, which for `inset-0` overlays and `size-N` squares is 0 or half of what it should be. */
  if (authoredH != null && !insetBoth && !isRoot) {
    const h = r1(authoredH);
    if (!(typeof sx.minh === 'number' && Math.abs(sx.minh - h) <= 1)) sx.h = h;
    /* A TEXT leaf can carry an authored height too — `w-12 h-12 rounded-full flex items-center
     * justify-content` with a number inside is a circular badge, and classify() calls it text
     * because its only child is a text node. Excluding text leaves here left it at its content
     * height (18px instead of 48px), which shifted every following section up 30px. But pinning a
     * height on text without also carrying the source's flex centering drops the glyph to the top
     * of the box, so the two have to travel together. */
    if ((kind === 'text' || kind === 'heading') && (isFlex || isGrid)) {
      const al = s['align-items'];
      const ju = s['justify-content'];
      if ((al && al !== 'normal' && al !== 'stretch') || (ju && ju !== 'normal' && ju !== 'flex-start')) {
        raw.push(`display:${isGrid ? 'grid' : 'flex'}`);
        if (al && al !== 'normal' && al !== 'stretch') raw.push(`align-items:${al}`);
        if (ju && ju !== 'normal' && ju !== 'flex-start') raw.push(`justify-content:${ju}`);
      }
    }
  }

  /* ── margins (+ mx-auto centering via rect gaps — computed margins can't tell 'auto') ── */
  const mg = sides(s, (k) => r1(num(s[`margin-${k}`])));
  let centered = false;
  if (parentContentW != null && !fullW && (pos === 'static' || pos === 'relative')
      && !parentFlexRow && !parentGrid) {
    const parentContentX = parent.rect.x + num(p['padding-left']) + num(p['border-left-width']);
    const lg = rect.x - parentContentX;
    const rg2 = parentContentX + parentContentW - (rect.x + rect.w);
    centered = lg > 2 && rg2 > 2 && Math.abs(lg - rg2) <= 2;
  }
  const mv = [mg[0], centered ? 'auto' : mg[1], mg[2], centered ? 'auto' : mg[3]];
  const controlHasMargin = ['top', 'right', 'bottom', 'left'].some((k) => num((c || {})[`margin-${k}`]) > 0);
  if (mv.some((v) => v === 'auto' || v !== 0) || (controlHasMargin && kind !== 'container')) {
    sx.m = compactBox(mv);
  }

  /* ── padding — containers ALWAYS get pad (e-flexbox has a default 10px padding) ── */
  const pd = sides(s, (k) => r1(num(s[`padding-${k}`])));
  const controlHasPad = ['top', 'right', 'bottom', 'left'].some((k) => num((c || {})[`padding-${k}`]) > 0);
  if (kind === 'container' || kind === 'section' || isRoot) sx.pad = compactBox(pd);
  else if (pd.some((v) => v > 0) || controlHasPad) sx.pad = compactBox(pd);

  /* ── background ── */
  const bc = s['background-color'];
  const bgColor = !isTransparent(bc) ? cssColor(bc) : (isRoot ? '#ffffff' : null); // pin the page ground
  const bi = s['background-image'];
  if (bi && bi !== 'none') {
    const urls = [...String(bi).matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]);
    if (urls.length === 1 && !bi.includes('gradient(')) {
      sx.bgImage = urls[0];
      const opts = {};
      if (bgColor) opts.color = bgColor;
      opts.size = s['background-size'] === 'auto' ? 'auto' : s['background-size'];
      if (s['background-position'] && s['background-position'] !== '0% 0%') opts.position = s['background-position'];
      opts.repeat = s['background-repeat'] || 'repeat';
      sx.bgOpts = opts;
    } else {
      raw.push(`background-image:${bi}`);
      if (s['background-size'] !== 'auto') raw.push(`background-size:${s['background-size']}`);
      if (bgColor) sx.bg = bgColor;
    }
  } else if (bgColor) sx.bg = bgColor;

  /* ── border ── */
  const bw = sides(s, (k) => r1(num(s[`border-${k}-width`])));
  if (bw.some((v) => v > 0)) {
    const bs = sides(s, (k) => s[`border-${k}-style`]);
    const bcol = sides(s, (k) => cssColor(s[`border-${k}-color`]));
    const uniform = bw.every((v) => v === bw[0]) && bs.every((v) => v === bs[0]) && bcol.every((v) => v === bcol[0]);
    if (uniform && bs[0] === 'solid') sx.border = [bw[0], bcol[0]];
    else {
      ['top', 'right', 'bottom', 'left'].forEach((k, i) => {
        if (bw[i] > 0) raw.push(`border-${k}:${bw[i]}px ${bs[i]} ${bcol[i]}`);
      });
    }
  }

  /* ── radius ── */
  const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((k) => s[`border-${k}-radius`]);
  if (corners.some((v) => v && v !== '0px')) {
    const simple = corners.every((v) => /^[\d.e+]+px$/i.test(v)); // rounded-full computes to 3.35e7px
    if (simple && corners.every((v) => v === corners[0])) sx.radius = Math.min(9999, r1(num(corners[0])));
    else raw.push(`border-radius:${corners[0]} ${corners[1]} ${corners[2]} ${corners[3]}`);
  }

  /* ── shadow ── */
  const bsh = s['box-shadow'];
  if (bsh && bsh !== 'none') {
    const one = /^(rgba?\([^)]+\)|#\S+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px$/.exec(bsh.trim());
    if (one) sx.shadow = [r1(num(one[3])), r1(num(one[4])), r1(num(one[5])), cssColor(one[1]), r1(num(one[2]))];
    else raw.push(`box-shadow:${bsh}`);       // multi-layer / inset → raw
  }

  /* ── typography — leaves PIN size/weight/lh/color; containers emit inheritance deltas ── */
  const leaf = kind === 'text' || kind === 'heading';
  const inheritDiff = (prop) => !p || s[prop] !== p[prop];
  if (leaf) {
    sx.size = r1(num(s['font-size']));
    const fw = parseInt(s['font-weight'], 10);
    if (fw) sx.weight = fw;
    if (s['line-height'] && s['line-height'] !== 'normal') sx.lh = `${r1(num(s['line-height']))}px`;
    if (s.color) sx.color = cssColor(s.color);
    /* THEME-CASCADE DEFENCE. Pinning only non-default values leaves a hole: a WordPress theme that
     * sets `body{letter-spacing:-0.1px}` or `h1..h6{letter-spacing:…}` then leaks in, and because a
     * rule targeting the heading beats an inherited root value, every unpinned line renders ~1%
     * narrower and paragraphs re-wrap at different words. So pin letter-spacing ALWAYS — including
     * when the source says `normal`. Same for text-wrap: themes ship `text-wrap:pretty`, which
     * silently rebalances a paragraph that already fit. */
    // Only the `normal` case needs filling — a real value is emitted below as a px STRING, and a
    // bare `ls` number would be read as em (see the tracking-em-looks-like-px lint rule).
    const lsv = s['letter-spacing'];
    if (!lsv || lsv === 'normal') sx.ls = 0;
    raw.push('text-wrap:wrap');
  } else {
    if (s.color && inheritDiff('color') && !isRoot) sx.color = cssColor(s.color);
    if (isRoot && s.color) sx.color = cssColor(s.color);
    if (inheritDiff('font-size') && !leaf && (kind === 'container' || kind === 'section')) {
      // container-level font-size delta matters for inheriting descendants; leaves re-pin anyway
      if (!isRoot) sx.size = r1(num(s['font-size']));
    }
  }
  const fam = s['font-family'];
  if (fam && (isRoot || inheritDiff('font-family'))) {
    const families = fam.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));
    if (families.length === 1) sx.font = families[0];
    else raw.push(`font-family:${fam}`);       // stacks don't fit the single-family atomic prop
  }
  const ta = s['text-align'];
  if (ta === 'center' || ta === 'right' || ta === 'end') { if (inheritDiff('text-align') || leaf) sx.ta = ta === 'end' ? 'right' : ta; }
  else if (ta === 'justify' && (inheritDiff('text-align') || leaf)) raw.push('text-align:justify');
  if (s['letter-spacing'] && s['letter-spacing'] !== 'normal' && (leaf || inheritDiff('letter-spacing'))) {
    sx.ls = `${r1(num(s['letter-spacing']))}px`;
  }
  if (s['text-transform'] && s['text-transform'] !== 'none' && (leaf || inheritDiff('text-transform'))) raw.push(`text-transform:${s['text-transform']}`);
  if (s['text-decoration-line'] && s['text-decoration-line'] !== 'none' && leaf) raw.push(`text-decoration-line:${s['text-decoration-line']}`);
  if (s['font-style'] === 'italic' && (leaf || inheritDiff('font-style'))) raw.push('font-style:italic');
  if (s['white-space'] && !['normal', 'wrap'].includes(s['white-space']) && (leaf || inheritDiff('white-space'))) raw.push(`white-space:${s['white-space']}`);

  /* ── misc → raw ── */
  if (s.opacity && num(s.opacity) < 1) raw.push(`opacity:${s.opacity}`);
  const ox = s['overflow-x']; const oy = s['overflow-y'];
  const cOx = (c && c['overflow-x']) || 'visible'; const cOy = (c && c['overflow-y']) || 'visible';
  if ((ox !== cOx || oy !== cOy) && ((ox && ox !== 'visible') || (oy && oy !== 'visible'))) {
    if (ox === oy) raw.push(`overflow:${ox}`);
    else { if (ox !== 'visible') raw.push(`overflow-x:${ox}`); if (oy !== 'visible') raw.push(`overflow-y:${oy}`); }
  }
  if (kind === 'img' && s['object-fit'] && s['object-fit'] !== 'fill') {
    sx.fit = s['object-fit'];
    sx.h = r1(rect.h);                          // a cropped img needs its box pinned
  }
  if (s.transform && s.transform !== 'none') raw.push(`transform:${s.transform}`);
  if (s.filter && s.filter !== 'none') raw.push(`filter:${s.filter}`);
  if (s['backdrop-filter'] && s['backdrop-filter'] !== 'none') raw.push(`backdrop-filter:${s['backdrop-filter']}`);
  if (s['aspect-ratio'] && s['aspect-ratio'] !== 'auto' && !s['aspect-ratio'].startsWith('auto')) raw.push(`aspect-ratio:${s['aspect-ratio']}`);
  if ((tag === 'ul' || tag === 'ol') && s['list-style-type'] && s['list-style-type'] !== 'none') {
    notes.add(`<${tag}> list markers (${s['list-style-type']}) are lost — list items map to plain text`);
  }

  return { sx, raw };
}

/* ───────────────────────────── mobile diff ─────────────────────────────
 * Same element mapped at 390 vs 1440 → the differing sx keys become mobile={{…}}.
 * raw cannot vary per breakpoint (css() plumbing) — raw deltas are dropped with a note. */
const MOBILE_RESET = { w: '100%', maxw: '100%', m: 0, pad: 0, gap: 0, size: null, ta: 'start', ls: 0, minh: 0, radius: 0, align: 'normal', justify: 'normal', dir: 'column' };
const MOBILE_SKIP = new Set(['bgImage', 'bgOpts', 'border', 'shadow', 'bg', 'flex', 'span', 'pos', 'z', 'fit', 'font', 'display', 'wrap', 'color']);
export function diffMobile(desk, mob, notes = new Set()) {
  const out = {};
  for (const k of new Set([...Object.keys(desk), ...Object.keys(mob)])) {
    const dv = desk[k]; const mvv = mob[k];
    if (JSON.stringify(dv) === JSON.stringify(mvv)) continue;
    if (MOBILE_SKIP.has(k)) {
      if (k !== 'bgOpts') notes.add(`mobile delta on '${k}' not emitted (kept desktop value)`);
      continue;
    }
    if (mvv !== undefined) out[k] = mvv;
    else if (MOBILE_RESET[k] !== undefined && MOBILE_RESET[k] !== null) out[k] = MOBILE_RESET[k];
  }
  return out;
}

/* ───────────────────────────── tree building ───────────────────────────── */
const flatten = (n, map = new Map()) => {
  if (!n) return map;
  map.set(n.path, n);
  for (const c of n.children || []) if (c.tag !== '#text') flatten(c, map);
  return map;
};

export function buildTree(desktopCap, mobileCap, opts = {}) {
  const notes = opts.notes || new Set();
  const atomicForms = !!opts.atomicForms;
  const mobileMap = mobileCap ? flatten(mobileCap.tree) : new Map();
  const controls = desktopCap.controls || {};
  const mControls = mobileCap?.controls || controls;
  let dropped = 0; let emitted = 0;

  const mapAt = (capNode, parentCap, kind, ctrls, isRoot) => mapStyles({
    tag: capNode.tag, kind, s: capNode.styles, c: ctrls[capNode.tag], parent: parentCap,
    rect: capNode.rect, notes, isRoot,
    authoredH: capNode.authoredH, authoredW: capNode.authoredW,
    insetBoth: capNode.insetBoth, insetBothX: capNode.insetBothX,
  });

  const build = (capNode, parentCap, depth, ground = null) => {
    if (!capNode || capNode.hidden) { if (capNode) dropped++; return null; }
    if (capNode.tag === 'br') return null;       // a br between block children carries nothing
    const kind = classify(capNode);
    const isRoot = depth === 0;

    if (kind === 'svg') {
      let svg = capNode.svg || '';
      // NB: test the opening tag only, and don't let stroke-width= masquerade as width=
      const open = svg.slice(0, svg.indexOf('>') + 1).replace(/stroke-width=/g, '');
      if (!/[\s"']width=/.test(open) && capNode.rect) {
        svg = svg.replace(/<svg/, `<svg width="${Math.round(capNode.rect.w)}" height="${Math.round(capNode.rect.h)}"`);
      }
      // currentColor resolved the page cascade at capture — pin it (the carrier has no cascade)
      if (svg.includes('currentColor') && !/<svg[^>]*style=/.test(svg) && capNode.styles?.color) {
        svg = svg.replace(/<svg/, `<svg style="color:${cssColor(capNode.styles.color)}"`);
      }
      emitted++;
      return { kind: 'html', html: svg, path: capNode.path };
    }
    /* A REAL <form> maps onto the atomic e-form element. `form` is normally an HTML carrier, so the
     * walk never saw its fields and the whole form shipped as inert Tailwind markup — unstyled, and
     * the largest single fidelity loss on any page with a form. With --atomic-forms the capture
     * descends, and we collect the field descendants (flattening layout wrappers, whose only job was
     * flex sizing) into kit builders. e-form's own children must be kit nodes, so layout rides a
     * wrapper <box> with an `& form{…}` rule — the same technique that reached 99.2% by hand. */
    if (atomicForms && capNode.tag === 'form') {
      const fields = [];
      const collect = (n) => {
        for (const ch of n.children || []) {
          if (ch.hidden || ch.tag === '#text' || ch.tag === 'br') continue;
          const t = ch.tag;
          if (t === 'input' || t === 'textarea' || t === 'select' || t === 'label' || t === 'button') {
            fields.push(ch);
            if (t !== 'label') continue;
          }
          if (t === 'label') continue;
          collect(ch);                       // a wrapper div/span: hoist whatever is inside it
        }
      };
      collect(capNode);
      const built = [];
      for (const f of fields) {
        const attr = (nm) => { const m = new RegExp(`${nm}="([^"]*)"`).exec(f.html || ''); return m ? m[1] : ''; };
        const textOf = (n) => (n.children || []).map((c) => (c.tag === '#text' ? c.text : textOf(c))).join('').trim();
        // a field that sat inside a flex-grow wrapper must keep growing once the wrapper is gone
        const grow = num(f.styles['flex-grow']) > 0;
        const formW = capNode.rect.w
          - num(capNode.styles['padding-left']) - num(capNode.styles['padding-right']);
        const fills = Math.abs(f.rect.w - formW) <= 2;
        const css = fieldCss(f.styles, {
          grow: (f.tag === 'input' || f.tag === 'textarea' || f.tag === 'select') && grow,
          width: f.rect.w, fills,
        });
        if (f.tag === 'label') {
          built.push({ builder: 'formLabel', args: [attr('for') || 'field', textOf(f) || 'Label'], sel: '& label', css });
        } else if (f.tag === 'button') {
          built.push({ builder: 'formSubmit', args: [textOf(f) || 'Submit'], sel: '& button', css });
        } else if (f.tag === 'select') {
          /* formSelect's SECOND argument is the options array — `[value, label]` pairs, or a bare
           * string for both. Passing the opts object there made `options.map` throw and killed the
           * whole build, so parse the real <option> list out of the carrier markup. */
          const opts = [...(f.html || '').matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((m) => {
            const val = (/value="([^"]*)"/.exec(m[1]) || [])[1] ?? '';
            const label = m[2].replace(/<[^>]+>/g, '').trim();
            return val ? [val, label || val] : label;
          }).filter((o) => (Array.isArray(o) ? o[1] : o));
          built.push({ builder: 'formSelect',
            args: [attr('id') || attr('name') || 'field', opts,
              { required: /\brequired\b/.test(f.html || '') }],
            sel: '& select', css });
        } else {
          const b = f.tag === 'textarea' ? 'formTextarea' : 'formInput';
          built.push({ builder: b, args: [attr('id') || attr('name') || 'field',
            { placeholder: attr('placeholder'), type: attr('type') || 'text',
              required: /\brequired\b/.test(f.html || '') }],
            sel: `& ${f.tag}`, css });
        }
      }
      if (built.length) {
        const { sx: wsx, raw: wraw } = mapAt(capNode, parentCap, 'container', controls, false);
        // the <form> element's own layout, as CSS, since form() takes envelopes not sx
        const fs = capNode.styles;
        const decls = [`display:${fs.display}`];
        if (String(fs.display).includes('flex')) {
          decls.push(`flex-direction:${fs['flex-direction']}`);
          if (fs['align-items'] && fs['align-items'] !== 'normal') decls.push(`align-items:${fs['align-items']}`);
          if (fs['justify-content'] && fs['justify-content'] !== 'normal') decls.push(`justify-content:${fs['justify-content']}`);
        }
        const gap = num(fs['row-gap'] === 'normal' ? 0 : fs['row-gap']) || num(fs['column-gap'] === 'normal' ? 0 : fs['column-gap']);
        if (gap) decls.push(`gap:${r1(gap)}px`);
        emitted += built.length + 1;
        notes.add(`<form> mapped to a native e-form with ${built.length} field(s) (Pro required)`);
        return { kind: 'atomicForm', path: capNode.path, fields: built,
                 formCss: decls.join(';'), sx: wsx, raw: wraw };
      }
      // no recognisable fields — fall through to the carrier path below
    }
    if (kind === 'html') {
      /* A bare input/textarea/select HAS a native mapping — the atomic e-form-* widgets, which work
       * standalone without an enclosing e-form. Opt-in, because those widgets ride the Pro-only
       * e_pro_atomic_form experiment: emitting them by default would turn a working free-core import
       * into a deploy that aborts on unregistered types. `exjsx lint` warns via pro-only-element. */
      const FORMABLE = { input: 'formInput', textarea: 'formTextarea' };  // select needs an options array
      if (atomicForms && FORMABLE[capNode.tag]) {
        const attr = (name) => {
          const m = new RegExp(`${name}="([^"]*)"`).exec(capNode.html || '');
          return m ? m[1] : '';
        };
        const { sx: fsx, raw: fraw } = mapAt(capNode, parentCap, 'container', controls, false);
        emitted++;
        notes.add(`<${capNode.tag}> mapped to a native ${FORMABLE[capNode.tag]} (Pro required)`);
        return {
          kind: 'formField', builder: FORMABLE[capNode.tag], path: capNode.path,
          id: attr('id') || attr('name') || 'field',
          opts: { placeholder: attr('placeholder'), type: attr('type') || 'text',
                  required: /\brequired\b/.test(capNode.html || '') },
          sx: fsx, raw: fraw,
        };
      }
      notes.add(`<${capNode.tag}> kept as a raw html carrier (no atomic mapping)`);
      emitted++;
      return { kind: 'html', html: capNode.html || '', path: capNode.path };
    }

    const { sx, raw } = mapAt(capNode, parentCap, kind, controls, isRoot);
    const mCap = mobileMap.get(capNode.path);
    let mobile = null;
    if (mobileCap) {
      if (!mCap || mCap.hidden) mobile = { display: 'none' };
      else {
        const mParent = parentCap ? mobileMap.get(parentCap.path) : null;
        const { sx: msx, raw: mraw } = mapAt(mCap, mParent, kind, mControls, isRoot);
        const diff = diffMobile(sx, msx, notes);
        if (Object.keys(diff).length) mobile = diff;
        // raw cannot vary per breakpoint — surface the divergence instead of silently keeping desktop
        if (mraw.join(';') !== raw.join(';')) {
          const changed = [...new Set([...raw, ...mraw])].filter((rl) => raw.includes(rl) !== mraw.includes(rl)).map((rl) => rl.split(':')[0]);
          if (changed.length) notes.add(`raw CSS differs at 390 on <${capNode.tag}> (${[...new Set(changed)].join(', ')}) — raw can't vary per breakpoint, desktop value kept`);
        }
      }
    }

    const base = { kind, sx, raw: raw.join(';'), mobile, path: capNode.path };
    if (kind === 'text' || kind === 'heading') {
      /* A <span> whose colour differs from its heading is a highlighted word. Carry exactly one
       * such colour through as <strong> + a colour rule; more than one and we cannot tell them
       * apart inside a single whitelisted tag, so leave them flattened rather than mis-colour. */
      const tinted = [...new Set((capNode.children || [])
        .filter((ch) => ch.tag === 'span' && ch.styles && ch.styles.color
          && ch.styles.color !== capNode.styles.color)
        .map((ch) => ch.styles.color))];
      const hasRealBold = (capNode.children || []).some((ch) => ['strong', 'b', 'em', 'i'].includes(ch.tag));
      const recolor = tinted.length === 1 && !hasRealBold ? tinted[0] : null;
      const text = textRun(capNode.children || [], notes, recolor);
      if (recolor) {
        base.raw = `${base.raw ? `${base.raw};` : ''}& strong{color:${cssColor(recolor)};font-weight:inherit}`;
        notes.add('a coloured inline <span> was carried through as <strong> so its colour survives html-v3');
      }
      // inline em/strong runs with their own typography (the "$30 <span>/month</span>" pattern):
      // html-v3 keeps the tag; a nested & rule restores its computed size/weight/color.
      const inlineRules = [];
      const seenInline = new Set();
      for (const ch of capNode.children || []) {
        const t = ch.tag === 'b' ? 'strong' : ch.tag === 'i' ? 'em' : ch.tag;
        if ((t !== 'em' && t !== 'strong') || seenInline.has(t) || !ch.styles) continue;
        const ls = capNode.styles; const cs2 = ch.styles;
        const decls = [];
        if (Math.abs(num(cs2['font-size']) - num(ls['font-size'])) > 0.5) decls.push(`font-size:${r1(num(cs2['font-size']))}px`);
        if (cs2['font-weight'] !== ls['font-weight']) decls.push(`font-weight:${cs2['font-weight']}`);
        if (cs2.color !== ls.color) decls.push(`color:${cssColor(cs2.color)}`);
        if (cs2['line-height'] !== ls['line-height'] && cs2['line-height'] !== 'normal') decls.push(`line-height:${r1(num(cs2['line-height']))}px`);
        if (decls.length) { inlineRules.push(`& ${t}{${decls.join(';')}}`); seenInline.add(t); }
      }
      if (inlineRules.length) base.raw = `${base.raw ? `${base.raw};` : ''}${inlineRules.join('')}`;
      /* ICON FONT RESCUE. html-v3 whitelists em/strong/br, so any other inline child flattens to its
       * text. For an icon span (`<span class="material-symbols-outlined">arrow_forward</span>`) that
       * is catastrophic: the LIGATURE NAME renders as visible body copy. When every element child
       * shares one font-family that differs from the leaf's, adopt it onto the leaf so the glyph
       * still resolves. */
      const elKids = (capNode.children || []).filter((ch) => ch.tag !== '#text' && ch.tag !== 'br' && ch.styles);
      /* SOLE-CHILD PROMOTION. classify() calls a wrapper whose only child is an inline element a text
       * block, so the child flattens to text and the WRAPPER's styles win. When that child is the
       * thing carrying the visual identity — `<div class="absolute"><span class="bg-primary
       * text-on-primary px-3 uppercase">…</span></div>`, the chip/badge pattern — the result loses its
       * background, its inverted text colour, its padding and its tracking. Adopt the child's visual
       * props and keep only the wrapper's POSITION, which is the wrapper's actual job. */
      const bareText = (capNode.children || [])
        .filter((ch) => ch.tag === '#text' && ch.text && ch.text.trim()).length;
      if (elKids.length === 1 && !bareText) {
        const { sx: kidSx, raw: kidRaw } = mapAt(elKids[0], capNode, 'text', controls, false);
        const POSITIONAL = new Set(['pos', 'z', 'm', 'w', 'maxw', 'h', 'minh']);
        const merged = { ...base.sx };
        for (const [k, v] of Object.entries(kidSx)) if (!POSITIONAL.has(k)) merged[k] = v;
        base.sx = merged;
        // the wrapper's own raw is positioning (top/left/…); the child's is text-transform etc.
        const kidExtra = kidRaw.filter((d) => !/^(?:top|bottom|left|right|position)\s*:/.test(d));
        if (kidExtra.length) base.raw = `${base.raw ? `${base.raw};` : ''}${kidExtra.join(';')}`;
        notes.add(`sole inline <${elKids[0].tag}> child's styling promoted onto its <${capNode.tag}> `
          + '(the wrapper only positions it)');
      } else if (elKids.length) {
        const fams = new Set(elKids.map((ch) => ch.styles['font-family']));
        const own = capNode.styles['font-family'];
        if (fams.size === 1 && [...fams][0] && [...fams][0] !== own) {
          base.sx = { ...base.sx, font: String([...fams][0]).split(',')[0].trim().replace(/^["']|["']$/g, '') };
          const fs = elKids[0].styles['font-size'];
          if (fs) base.sx.size = r1(num(fs));
          notes.add(`inline <${elKids[0].tag}> icon font "${base.sx.font}" promoted onto its <${capNode.tag}>`);
        }
      }
      emitted++;
      const out = { ...base, text };
      if (kind === 'heading') out.tag = capNode.tag;
      if (capNode.href) out.href = capNode.href;
      return out;
    }
    if (kind === 'img') {
      emitted++;
      return { ...base, src: capNode.src || '', alt: capNode.alt || '' };
    }

    // container: element children in order; direct #text runs become synthetic text leaves
    const children = [];
    for (const ch of capNode.children || []) {
      if (ch.tag === '#text') {
        const t = esc(ch.text).trim();
        if (!t) continue;
        // typography pinned from the CONTAINER's computed style (that's what styles the run)
        const { sx: tsx } = mapStyles({ tag: 'p', kind: 'text', s: capNode.styles, c: controls.p, parent: parentCap, rect: capNode.rect, notes });
        const keep = {};
        for (const k of ['size', 'weight', 'lh', 'color', 'ta', 'ls', 'font']) if (tsx[k] !== undefined) keep[k] = tsx[k];
        children.push({ kind: 'text', sx: keep, raw: '', mobile: null, text: t, path: `${capNode.path}#t` });
        emitted++;
      } else {
        const ownBg = capNode.styles && !isTransparent(capNode.styles['background-color'])
          ? cssColor(capNode.styles['background-color']) : null;
        const built = build(ch, capNode, depth + 1, ownBg || ground);
        if (built) children.push(built);
      }
    }
    /* EMPTY ABSOLUTE OVERLAY → a background layer on this container.
     * Stitch (and Tailwind generally) draws tints, gradients and hairline rules as an empty
     * absolutely-positioned div stacked over the parent. assertTree rejects those outright — an
     * empty overlay swallows clicks in the Elementor editor — so the build used to fail and a human
     * had to collapse each one by hand. Fold the child's paint into this element's background
     * instead: same pixels, one fewer element, and nothing unclickable. */
    /* PAINT-ONLY CHILDREN → the parent's background layers.
     * Stitch draws tints, gradients, images and hairline rules as childless divs stacked inside a
     * relative box, and assertTree rejects an EMPTY ABSOLUTE one outright (it swallows editor
     * clicks). Folding just the absolute one into the parent is wrong: an absolute overlay paints
     * ABOVE its in-flow siblings, while a parent background paints BELOW them — that inverted the
     * hero (gradient ended up under the photo). So fold EVERY paint-only child together, in reverse
     * document order, because the first CSS layer is the topmost. That empties the container and
     * preserves the stacking. Bail entirely unless all children are paint-only — a partial fold is
     * how you get silently wrong pixels. */
    const paintOf = (ch) => {
      if (ch.kind !== 'container' || (ch.children || []).length) return null;
      const url = ch.sx?.bgImage;
      const fromRaw = (/background-image\s*:\s*([^;]+)/.exec(ch.raw || '') || [])[1];
      if (url) return `url('${url}')`;
      if (fromRaw) return fromRaw;
      if (ch.sx?.bg) return `linear-gradient(${ch.sx.bg}, ${ch.sx.bg})`;
      if (borderSidesOf(ch).length) return 'BORDERS';   // decorative rules/corner brackets
      return null;
    };
    /* Each drawn border side of an empty absolute box, as a line we can reproduce as a background
     * layer. `border-top:2px solid X` on a 48x48 box is a 48x2 line at the box's top edge. */
    const borderSidesOf = (ch) => {
      const out = [];
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const m = new RegExp(`border-${side}\\s*:\\s*([\\d.]+)px\\s+\\w+\\s+([^;]+)`).exec(ch.raw || '');
        if (m) out.push({ side, w: parseFloat(m[1]), color: m[2].trim() });
      }
      if (!out.length && Array.isArray(ch.sx?.border) && ch.sx.border.length === 2) {
        for (const side of ['top', 'right', 'bottom', 'left']) out.push({ side, w: ch.sx.border[0], color: ch.sx.border[1] });
      }
      return out;
    };
    /** child paint → background layers (an array: a border box needs one layer per drawn side). */
    const layersFor = (ch, cr) => {
      const paint = paintOf(ch);
      if (!paint) return null;
      if (paint !== 'BORDERS') {
        return [{ paint, size: `${r1(cr.w)}px ${r1(cr.h)}px`, pos: `${r1(cr.x)}px ${r1(cr.y)}px` }];
      }
      return borderSidesOf(ch).map(({ side, w, color }) => {
        const horiz = side === 'top' || side === 'bottom';
        const size = horiz ? `${r1(cr.w)}px ${r1(w)}px` : `${r1(w)}px ${r1(cr.h)}px`;
        const x = side === 'right' ? r1(cr.x + cr.w - w) : r1(cr.x);
        const y = side === 'bottom' ? r1(cr.y + cr.h - w) : r1(cr.y);
        return { paint: `linear-gradient(${color}, ${color})`, size, pos: `${x}px ${y}px` };
      });
    };
    const hasAbsOverlay = children.some((c) => c.kind === 'container' && !(c.children || []).length
      && c.sx?.pos === 'absolute' && paintOf(c));
    if (hasAbsOverlay && children.length && children.every((c) => paintOf(c))) {
      const layers = [];
      for (let i = children.length - 1; i >= 0; i--) {
        const ch = children[i];
        const cr = capChildRect(capNode, ch.path);
        if (!cr) { layers.length = 0; break; }
        const own = layersFor(ch, cr);
        if (!own) { layers.length = 0; break; }
        layers.push(...own);
        /* Element opacity cannot be expressed per background layer. When a faded image sits over a
         * known ground colour, an equivalent veil layer reproduces it exactly:
         * image at alpha A over ground == ground at (1-A) painted over the image. */
        const op = (/(?:^|;)\s*opacity\s*:\s*([\d.]+)/.exec(ch.raw || '') || [])[1];
        if (op && Number(op) < 1) {
          const g = ground || (capNode.styles && !isTransparent(capNode.styles['background-color'])
            ? cssColor(capNode.styles['background-color']) : null);
          if (!g) { layers.length = 0; break; }        // unknown ground → refuse to guess
          const veil = veilOver(g, 1 - Number(op));
          layers.splice(layers.length - own.length, 0, { paint: `linear-gradient(${veil}, ${veil})`,
            size: `${r1(cr.w)}px ${r1(cr.h)}px`, pos: `${r1(cr.x)}px ${r1(cr.y)}px` });
        }
      }
      if (layers.length) {
        const add = `background-image:${layers.map((l) => l.paint).join(', ')};`
          + `background-size:${layers.map((l) => l.size).join(', ')};`
          + `background-position:${layers.map((l) => l.pos).join(', ')};background-repeat:no-repeat`;
        base.raw = base.raw ? `${base.raw};${add}` : add;
        emitted -= children.length;
        notes.add(`${children.length} paint-only child(ren) folded into the parent background `
          + '(assertTree forbids unclickable empty absolute overlays)');
        children.length = 0;
      }
    } else if (hasAbsOverlay) {
      /* Mixed children. An absolute overlay still folds safely when its z-index puts it BEHIND every
       * non-paint sibling — then a parent background (which paints below all children) is exactly
       * where it already rendered. Strict `<` because at equal/auto z-index a positioned element
       * paints above a static one, so "equal" is not safe. This is the case the first pass created:
       * folding a wrapper's children empties the wrapper, and the wrapper then needs folding too. */
      const zOf = (c) => (typeof c.sx?.z === 'number' ? c.sx.z : 0);
      const others = children.filter((c) => !paintOf(c));
      const minOtherZ = others.length ? Math.min(...others.map(zOf)) : 0;
      for (let i = children.length - 1; i >= 0; i--) {
        const ch = children[i];
        if (!paintOf(ch) || ch.sx?.pos !== 'absolute') continue;
        const cr = capChildRect(capNode, ch.path);
        if (!cr) continue;
        // full-bleed == a background by intent, even with no z-index to prove it sits behind
        const coversParent = Math.abs(cr.x) <= 2 && Math.abs(cr.y) <= 2
          && Math.abs(cr.w - capNode.rect.w) <= 2 && Math.abs(cr.h - capNode.rect.h) <= 2;
        const escapesBox = cr.x < -1 || cr.y < -1
          || cr.x + cr.w > capNode.rect.w + 1 || cr.y + cr.h > capNode.rect.h + 1;
        if (escapesBox) continue;                       // background layers clip; folding would crop it
        // full-bleed, or lower z, or simply a paint-only box inside the parent → it is a background
        if (!coversParent && zOf(ch) > minOtherZ) continue;
        const own = layersFor(ch, cr);
        if (!own) continue;
        const extra = `background-image:${own.map((l) => l.paint).join(', ')};`
          + `background-size:${own.map((l) => l.size).join(', ')};`
          + `background-position:${own.map((l) => l.pos).join(', ')};background-repeat:no-repeat`;
        /* Only BACKGROUND-safe declarations may travel. filter/backdrop-filter/transform/opacity/
         * mix-blend-mode apply to the whole element — hoisting `filter:blur(64px)` off a decorative
         * glow blurred the entire section and erased the photograph sitting in it. Drop them and say
         * so, rather than silently wrecking the parent. */
        const dropped = [];
        // when the paint came FROM the borders they are now background layers; leaving the border
        // declarations in would draw them around the whole parent instead of at the overlay's box
        const borderBecameLayers = paintOf(ch) === 'BORDERS';
        const keptDecls = (ch.raw || '').split(';').map((x) => x.trim()).filter(Boolean)
          .filter((decl) => {
            if (borderBecameLayers && /^border(-top|-right|-bottom|-left)?\s*:/.test(decl)) return false;
            if (/^(?:top|bottom|left|right|background-image|background-size|background-position|background-repeat)\s*:/.test(decl)) return false;
            if (/^(?:filter|backdrop-filter|transform|opacity|mix-blend-mode)\s*:/.test(decl)) {
              dropped.push(decl.split(':')[0]); return false;
            }
            return true;
          }).join(';');
        base.raw = [base.raw, extra, keptDecls].filter(Boolean).join(';');
        children.splice(i, 1);
        emitted--;
        notes.add('absolute overlay folded into its parent background (it rendered behind its siblings)');
        if (dropped.length) notes.add(`overlay ${[...new Set(dropped)].join('/')} dropped — it would apply to the whole parent, not just the folded layer`);
      }
    }
    for (let i = children.length - 1; i >= 0; i--) {
      const ch = children[i];
      if (ch.kind !== 'container' || (ch.children || []).length) continue;
      if (ch.sx?.pos !== 'absolute') continue;
      const what = paintOf(ch) === 'BORDERS' ? 'border decoration'
        : paintOf(ch) ? 'background overlay' : 'empty positioned box';
      const cr = capChildRect(capNode, ch.path);
      const why = !paintOf(ch) ? 'it paints nothing'
        : !cr ? 'its geometry could not be resolved'
        : (cr.x < -1 || cr.y < -1 || cr.x + cr.w > capNode.rect.w + 1 || cr.y + cr.h > capNode.rect.h + 1)
          ? 'it extends outside its parent, so a background layer would clip it'
          : 'it paints above its siblings and folding would change the stacking';
      children.splice(i, 1);
      emitted--;
      notes.add(`dropped an un-foldable absolute ${what} — ${why} `
        + '(assertTree forbids empty absolute containers)');
    }
    emitted++;
    const out = { ...base, children };
    if (capNode.href) out.href = capNode.href;
    return out;
  };

  /** rect of a built child relative to its parent's padding box, found by capture path. */
  function capChildRect(parentCapNode, childPath) {
    const find = (n) => {
      if (!n || typeof n !== 'object') return null;
      if (n.path === childPath) return n;
      for (const k of n.children || []) { const r = find(k); if (r) return r; }
      return null;
    };
    const c = find(parentCapNode);
    if (!c || !c.rect || !parentCapNode.rect) return null;
    return { x: c.rect.x - parentCapNode.rect.x, y: c.rect.y - parentCapNode.rect.y, w: c.rect.w, h: c.rect.h };
  }

  const root = build(desktopCap.tree, null, 0);
  if (root) root.isRoot = true;
  return { root, stats: { emitted, dropped }, notes };
}

/* ── collapse pointless single-child wrapper chains (a div whose only role is another div) ── */
const TRIVIAL_KEYS = new Set(['pad', 'm', 'dir', 'gap', 'w']);
const isTrivialSx = (sx) => Object.entries(sx).every(([k, v]) => {
  if (!TRIVIAL_KEYS.has(k)) return false;
  if (k === 'pad' || k === 'm') return JSON.stringify(v) === '0' || v === 0;
  if (k === 'gap') return true;                 // single child: gap is inert
  if (k === 'dir') return true;                 // single child: row vs column is the same
  return false;                                 // w/anything else constrains — keep
});
export function collapseTree(node) {
  if (!node || !node.children) return node;
  node.children = node.children.map((c) => collapseTree(c)).filter(Boolean);
  if (
    (node.kind === 'container') && !node.isRoot
    && node.children.length === 1 && node.children[0].kind === 'container'
    && !node.raw && !node.href && !node.mobile && isTrivialSx(node.sx)
  ) return node.children[0];
  // top-level containers become <section> AFTER collapsing (so a trivial body wrapper never eats the slot)
  if (node.isRoot) for (const c of node.children) if (c.kind === 'container') c.kind = 'section';
  return node;
}

/* ───────────────────────────── JSX emitter ───────────────────────────── */
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const jsLit = (v) => {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(jsLit).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{ ${Object.entries(v).map(([k, x]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${jsLit(x)}`).join(', ')} }`;
  }
  return 'null';
};
const attr = (k, v) => {
  if (v === true) return k;
  if (typeof v === 'string' && !v.includes('"') && !v.includes('\n')) return `${k}="${v}"`;
  if (typeof v === 'number') return `${k}={${v}}`;
  return `${k}={${jsLit(v)}}`;
};
const PROP_ORDER = ['tag', 'href', 'src', 'alt', 'dir', 'gridCols', 'span', 'flex', 'gap', 'align', 'justify', 'wrap', 'display',
  'w', 'maxw', 'minh', 'h', 'pad', 'm', 'bg', 'bgImage', 'bgOpts', 'color', 'size', 'weight', 'font', 'lh', 'ls', 'ta',
  'radius', 'border', 'shadow', 'pos', 'z', 'fit', 'raw', 'mobile'];

function propsOf(n) {
  const o = {};
  if (n.kind === 'heading' && !['h1', 'h2', 'h3', 'h4'].includes(n.tag)) o.tag = n.tag;
  if (n.href) o.href = n.href;
  if (n.src !== undefined) { o.src = n.src; if (n.alt) o.alt = n.alt; }
  Object.assign(o, n.sx || {});
  let raw = n.raw || '';
  // linked text: the atomic paragraph anchor has its own base color — make it inherit the leaf's
  if (n.kind === 'text' && n.href) raw = `${raw ? `${raw};` : ''}& a{color:inherit;text-decoration:inherit}`;
  if (raw) o.raw = raw;
  if (n.mobile) o.mobile = n.mobile;
  return o;
}
const openTag = (name, o, selfClose) => {
  const parts = [name];
  for (const k of PROP_ORDER) if (o[k] !== undefined) parts.push(attr(k, o[k]));
  for (const k of Object.keys(o)) if (!PROP_ORDER.includes(k)) parts.push(attr(k, o[k]));
  return `<${parts.join(' ')}${selfClose ? ' />' : '>'}`;
};
const emitText = (t) => (/^[A-Za-z0-9 .,!?':;()%$&-]+$/.test(t) && !/^\s|\s$/.test(t)
  ? t : `{${JSON.stringify(t)}}`);

export function emitNode(n, indent = 1) {
  const pad = '  '.repeat(indent);
  const o = propsOf(n);
  if (n.kind === 'html') return `${pad}<html raw={${JSON.stringify(n.html)}} />`;
  if (n.kind === 'atomicForm') {
    const args = n.fields.map((f) => `      ${f.builder}(${f.args.map((a) => JSON.stringify(a)).join(', ')})`).join(',\n');
    const seen = new Set();
    const fieldRules = n.fields
      .filter((f) => f.sel && f.css && !seen.has(f.sel) && seen.add(f.sel))
      .map((f) => `${f.sel}{${f.css}}`);
    const rawAll = [...(n.raw || []), `& form{${n.formCss}}`, ...fieldRules].filter(Boolean).join(';');
    const attrs = Object.entries(n.sx || {}).map(([k, v]) => `${k}={${JSON.stringify(v)}}`).join(' ');
    return `${pad}<box ${attrs} raw={${JSON.stringify(rawAll)}}>\n`
      + `${pad}  {form({ name: "imported-form", actions: ["email"], messages: false }, [\n${args},\n${pad}  ])}\n`
      + `${pad}</box>`;
  }
  if (n.kind === 'formField') {
    /* The kit's form builders take PROP ENVELOPES (SZ()/P0) as their third argument, not sx
     * shorthand — passing sx there silently no-ops and the field renders at its default size.
     * So the geometry goes on a wrapper box, which the normal intrinsic path compiles properly,
     * and the control is told to fill it and inherit its typography. */
    const o = JSON.stringify(n.opts);
    const call = `{${n.builder}(${JSON.stringify(n.id)}, ${o})}`;
    const sx = { ...(n.sx || {}) };
    const fill = 'width:100%;height:100%;background:transparent;border:0;'
      + 'font-family:inherit;font-size:inherit;letter-spacing:inherit;color:inherit';
    const rawAll = [...(n.raw || []), `& input,& textarea,& select{${fill}}`].join(';');
    const attrs = Object.entries(sx).map(([k, v]) => `${k}={${JSON.stringify(v)}}`).join(' ');
    return `${pad}<box ${attrs} raw={${JSON.stringify(rawAll)}}>\n${pad}  ${call}\n${pad}</box>`;
  }
  if (n.kind === 'img') return `${pad}${openTag('img', o, true)}`;
  if (n.kind === 'text' || n.kind === 'heading') {
    const name = n.kind === 'text' ? 'text' : (o.tag ? 'heading' : n.tag);
    return `${pad}${openTag(name, o, false)}${emitText(n.text)}</${name}>`;
  }
  const name = n.isRoot ? 'box' : (n.kind === 'section' ? 'section' : 'box');
  if (!n.children || !n.children.length) return `${pad}${openTag(name, o, false)}</${name}>`;
  const kids = n.children.map((c) => emitNode(c, indent + 1)).join('\n');
  return `${pad}${openTag(name, o, false)}\n${kids}\n${pad}</${name}>`;
}

/* Google families actually used, with the weights actually used. The capture reads computed styles
 * but not the document's <link> tags, so an imported page previously fell back to a system stack in
 * WordPress and every glyph metric shifted. Collect from the emit tree and inject loaders. */
export function collectFonts(root) {
  const fonts = new Map();
  const first = (fam) => String(fam).split(',')[0].trim().replace(/^["']|["']$/g, '');
  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
    'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit', 'initial', '-apple-system']);
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const fam = n.sx?.font;
    if (fam) {
      const f = first(fam);
      if (f && !GENERIC.has(f.toLowerCase())) {
        if (!fonts.has(f)) fonts.set(f, new Set());
        // a weight seen anywhere under this family; 400 always, so body copy never faux-bolds
        fonts.get(f).add(400);
      }
    }
    if (n.sx?.weight && fam) fonts.get(first(fam))?.add(Number(n.sx.weight));
    for (const k of n.children || []) walk(k);
  };
  walk(root);
  // a weight used under a family declared on an ANCESTOR still needs loading — sweep again with
  // the nearest declared family in scope
  const sweep = (n, inherited) => {
    if (!n || typeof n !== 'object') return;
    const fam = n.sx?.font ? first(n.sx.font) : inherited;
    if (fam && fonts.has(fam) && n.sx?.weight) fonts.get(fam).add(Number(n.sx.weight));
    for (const k of n.children || []) sweep(k, fam);
  };
  sweep(root, null);
  return [...fonts.entries()].map(([family, w]) => ({ family, weights: [...w].sort((a, b) => a - b) }));
}

export function emitPageJsx(root, { title = 'Imported page', source = '?', notes = new Set() } = {}) {
  const lines = [
    `// imported by exjsx import from ${source} — review before shipping`,
    '// pseudo-elements (::before/::after) are NOT captured — decoration built on them is lost.',
  ];
  for (const nt of notes) lines.push(`// note: ${nt}`);
  lines.push('');
  lines.push(`export const meta = { title: ${JSON.stringify(title)}, template: 'elementor_canvas' };`);
  lines.push('');
  lines.push('export default () => (');
  const body = emitNode(root, 1);
  const fonts = collectFonts(root);
  if (fonts.length) {
    // Inject the loaders as the root's FIRST children (they render nothing). Two shapes to handle:
    // a root with children spans several lines, but a childless root emits as one `<box …></box>`
    // line — inserting after "the first newline" silently dropped the loaders in that case.
    const loaders = fonts.map((f) => (/^material symbols/i.test(f.family)
      // variable-axis family: fontLoader emits :wght@400;700, which returns no glyphs for it
      ? `    <html raw={${JSON.stringify(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${f.family.replace(/ /g, '+')}:wght,FILL@100..700,0..1&display=swap">`)}} />`
      : `    {fontLoader(${JSON.stringify(f.family)}, [${f.weights.join(', ')}])}`));
    const nl = body.indexOf('\n');
    if (nl !== -1) {
      lines.push(body.slice(0, nl + 1) + loaders.join('\n') + body.slice(nl));
    } else {
      const m = /^(\s*)(<[a-zA-Z][^>]*>)(.*)(<\/[a-zA-Z][^>]*>)\s*$/.exec(body);
      lines.push(m ? `${m[1]}${m[2]}\n${loaders.join('\n')}\n${m[1]}${m[3]}${m[4]}` : body);
    }
  } else lines.push(body);
  lines.push(');');
  lines.push('');
  return lines.join('\n');
}

/** captures → finished .page.jsx source (pure — unit-testable without a browser). */
export function pageFromCaptures(desktopCap, mobileCap, { title, source, atomicForms = false } = {}) {
  const notes = new Set();
  const { root, stats } = buildTree(desktopCap, mobileCap, { notes, atomicForms });
  if (!root) throw new Error('exjsx import: nothing visible captured from the source');
  const collapsed = collapseTree(root);
  collapsed.isRoot = true;
  const jsx = emitPageJsx(collapsed, { title: title || desktopCap.title || 'Imported page', source, notes });
  return { jsx, stats, notes };
}

/* ───────────────────────────── browser capture ───────────────────────────── */
async function resolvePlaywright() {
  const p = process.env.EXJSX_IT_PLAYWRIGHT;
  if (p) return import(pathToFileURL(p).href);
  try { return await import('playwright'); } catch {
    throw new Error('exjsx import: playwright not found — `npm i -D playwright` or set EXJSX_IT_PLAYWRIGHT to a playwright index.mjs');
  }
}

/* runs INSIDE the page — must be fully self-contained (playwright serializes it). */
function capturePage({ props, descendForms = false }) {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'SOURCE', 'TRACK']);
  const CARRIER = new Set(['IFRAME', 'VIDEO', 'CANVAS', 'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'AUDIO', 'TABLE']);
  // <form> is a carrier by default, which means the walk never reaches its fields. When we intend to
  // map those fields onto atomic e-form widgets we must descend instead.
  if (descendForms) CARRIER.delete('FORM');
  // per-tag control elements in a bare same-UA iframe → UA-default styles without page CSS
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:absolute;left:-99999px;top:0;width:500px;height:500px;visibility:hidden';
  document.documentElement.appendChild(ifr);
  const idoc = ifr.contentDocument;
  const controls = {};
  const controlFor = (tag) => {
    if (!controls[tag]) {
      let el; try { el = idoc.createElement(tag); } catch { el = idoc.createElement('div'); }
      idoc.body.appendChild(el);
      const cs = idoc.defaultView.getComputedStyle(el);
      const o = {}; for (const pr of props) o[pr] = cs.getPropertyValue(pr);
      controls[tag] = o;
    }
    return controls[tag];
  };
  const readStyles = (cs) => { const o = {}; for (const pr of props) o[pr] = cs.getPropertyValue(pr); return o; };
  const sizingRules = { width: [], height: [] };
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    const visit = (list) => {
      for (const rule of list) {
        if (rule.cssRules) { visit(rule.cssRules); continue; }   // @media/@supports
        if (!rule.selectorText || !rule.style) continue;
        for (const axis of ['width', 'height']) {
          const v = rule.style.getPropertyValue(axis);
          if (v && v !== 'auto') sizingRules[axis].push(rule.selectorText);
        }
      }
    };
    try { visit(rules); } catch { /* cross-origin */ }
  }
  const declaresSize = (el, axis) => {
    if (el.style && el.style.getPropertyValue(axis)) return true;
    for (const sel of sizingRules[axis]) {
      try { if (el.matches(sel)) return true; } catch { /* :hover etc */ }
    }
    return false;
  };
  const walk = (el, path) => {
    if (SKIP.has(el.tagName)) return null;
    const tag = el.tagName.toLowerCase();
    if (el.tagName === 'BR') return { tag: 'br', path };
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return { tag, path, hidden: true };
    const r = el.getBoundingClientRect();
    // sr-only/clip patterns and zero-size decorations: ≤1.5px in BOTH dimensions is invisible
    if (tag !== 'body' && r.width <= 1.5 && r.height <= 1.5) return null;
    const rect = { x: r.x, y: r.y, w: r.width, h: r.height };
    controlFor(tag);
    if (el.tagName === 'SVG' || el instanceof SVGSVGElement) {
      return { tag: 'svg', path, styles: readStyles(cs), rect, svg: el.outerHTML };
    }
    const n = { tag, path, styles: readStyles(cs), rect, children: [] };
    /* AUTHORED-HEIGHT PROBE. Computed styles cannot distinguish an authored height from a
     * content-driven one, so heights were previously never emitted — which silently destroyed
     * Tailwind's `absolute inset-0` (height 0, invisible) and `size-N` squares (collapsed to
     * their content). Setting height:auto and re-measuring answers the question definitively.
     * Restricted to the shapes that actually break, so a flex-stretched child (whose auto height
     * legitimately differs) never gets a hard height pinned onto it:
     *   a) absolutely/fixed positioned, b) no element children, c) square, d) only absolute kids. */
    /* IMG is probed too. An `h-[600px] w-full object-cover` photograph has an AUTHORED height and no
     * aspect-ratio to recover it from, so excluding images meant every full-bleed photo rendered at
     * whatever height its intrinsic ratio produced — the dominant error on image-led layouts. */
    if (!CARRIER.has(el.tagName) && r.height > 1.5) {
      /* Probe unless the height could LEGITIMATELY come from stretch, which is the only case where
       * pinning it would be wrong. Height-stretch requires a flex-ROW or grid parent (on a flex
       * COLUMN parent the cross axis is horizontal, so stretch sets width, not height). A narrower
       * allow-list missed the commonest real case: a flex row with an authored bar height (`h-20`
       * on a nav), which has children and is not square, so it rendered at 42px instead of 80px. */
      const pcs = el.parentElement ? getComputedStyle(el.parentElement) : null;
      const parentStretchesHeight = !!pcs
        && (pcs.display.includes('grid')
            || (pcs.display.includes('flex') && pcs.flexDirection.startsWith('row')));
      const selfAlign = cs.alignSelf === 'auto' || cs.alignSelf === 'normal'
        ? (pcs ? pcs.alignItems : 'normal') : cs.alignSelf;
      /* Stretch is per-AXIS. A flex-ROW parent stretches its children's HEIGHT; a flex-COLUMN parent
       * stretches their WIDTH. Gating the whole probe on the height case skipped the width probe too,
       * so a `w-12 h-12` icon button inside a flex row lost both its size and (because the block also
       * carried the inset probes) everything else — it rendered 284x26 instead of 48x48. */
      const parentStretchesWidth = !!pcs
        && (pcs.display.includes('grid')
            || (pcs.display.includes('flex') && pcs.flexDirection.startsWith('column')));
      const stretchy = selfAlign === 'stretch' || selfAlign === 'normal';
      const heightCouldStretch = parentStretchesHeight && stretchy;
      const widthCouldStretch = parentStretchesWidth && stretchy;
      {
        /* Neutralise stretch while measuring. With align-items:stretch a sibling of the same size
         * makes height:auto produce the SAME number, masking a genuinely authored height — two 48px
         * icon buttons in a row hid each other's `h-12` and rendered 26px tall. Pinning
         * align-self:flex-start for the probe removes that masking. */
        const prev = el.style.getPropertyValue('height');
        const prevPri = el.style.getPropertyPriority('height');
        const prevAS = el.style.getPropertyValue('align-self');
        const prevASp = el.style.getPropertyPriority('align-self');
        el.style.setProperty('align-self', 'flex-start', 'important');
        el.style.setProperty('height', 'auto', 'important');
        const replacedH = el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS';
        const pw0 = el.style.getPropertyValue('width'); const pw0p = el.style.getPropertyPriority('width');
        if (replacedH) el.style.setProperty('width', 'auto', 'important');
        const autoH = el.getBoundingClientRect().height;
        if (replacedH) { if (pw0) el.style.setProperty('width', pw0, pw0p); else el.style.removeProperty('width'); }
        if (prev) el.style.setProperty('height', prev, prevPri); else el.style.removeProperty('height');
        if (prevAS) el.style.setProperty('align-self', prevAS, prevASp); else el.style.removeProperty('align-self');
        if (declaresSize(el, 'height') || Math.abs(autoH - r.height) > 0.5) n.authoredH = r.height;
        {
          /* A REPLACED element (img) has an intrinsic aspect ratio, so constraining one axis fixes the
           * other: width:auto on a `w-48 h-48` square photo still measures 48 because the height holds
           * it there. The probe saw no change, dropped the width, and a round portrait rendered as a
           * wide ellipse. Neutralise BOTH axes for replaced elements so the intrinsic size shows. */
          const replaced = el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS';
          const pw = el.style.getPropertyValue('width'); const pwp = el.style.getPropertyPriority('width');
          const ph = el.style.getPropertyValue('height'); const php = el.style.getPropertyPriority('height');
          el.style.setProperty('width', 'auto', 'important');
          if (replaced) el.style.setProperty('height', 'auto', 'important');
          const autoW = el.getBoundingClientRect().width;
          if (pw) el.style.setProperty('width', pw, pwp); else el.style.removeProperty('width');
          if (replaced) { if (ph) el.style.setProperty('height', ph, php); else el.style.removeProperty('height'); }
          if (declaresSize(el, 'width') || Math.abs(autoW - r.width) > 0.5) n.authoredW = r.width;
          /* A SQUARE box with a proven authored height was authored on both axes — `w-48 h-48`,
           * `size-12`. The width probe alone misses these whenever the cascade already shrink-wraps
           * the box (a flex column with align-items:center), and the consequence is severe: a round
           * portrait keeps its radius, loses its width and renders as a wide ellipse. */
          if (n.authoredW == null && n.authoredH != null && Math.abs(r.width - r.height) <= 1) {
            n.authoredW = r.width;
          }
          /* A ROUND box that renders square is a circle — an avatar, an icon chip — and both axes are
           * authored by definition. Layout probing cannot prove it when the child is `w-full h-full`
           * (the parent's size depends on the child and vice versa), and Tailwind's CDN rules are not
           * reachable through CSSOM, so neither earlier signal fires. Losing the width here is very
           * visible: the radius survives and a round portrait renders as a wide ellipse. */
          const radius = parseFloat(cs.borderTopLeftRadius) || 0;
          const roundish = /%$/.test(cs.borderTopLeftRadius) || radius >= Math.min(r.width, r.height) / 2 - 1;
          if (Math.abs(r.width - r.height) <= 1 && roundish && r.width > 8) {
            n.authoredW = r.width; n.authoredH = r.height;
          }
        }
        /* inset-0 detection MUST be probed, not read. For a positioned element the browser RESOLVES
         * `bottom`/`right` to a used pixel value even when the author never set them — a `fixed top-0`
         * header reports bottom:819px. Trusting that pinned both edges and stretched the nav to
         * viewport-minus-819 = 181px instead of 81px. Force the edge to auto: only an AUTHORED edge
         * changes the box when removed. */
        if (cs.position === 'absolute' || cs.position === 'fixed') {
          const probeEdge = (prop) => {
            const pv = el.style.getPropertyValue(prop); const pp = el.style.getPropertyPriority(prop);
            el.style.setProperty(prop, 'auto', 'important');
            const rr = el.getBoundingClientRect();
            if (pv) el.style.setProperty(prop, pv, pp); else el.style.removeProperty(prop);
            return rr;
          };
          if (cs.top !== 'auto' && Math.abs(probeEdge('bottom').height - r.height) > 0.5) n.insetBoth = true;
          if (cs.left !== 'auto' && Math.abs(probeEdge('right').width - r.width) > 0.5) n.insetBothX = true;
        }
      }
    }
    if (CARRIER.has(el.tagName)) { n.html = el.outerHTML; return n; }
    if (el.tagName === 'A' && el.getAttribute('href')) n.href = el.getAttribute('href');
    if (el.tagName === 'IMG') { n.src = el.currentSrc || el.src; n.alt = el.getAttribute('alt') || ''; return n; }
    let ei = 0;
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) {
        const t = ch.textContent;
        if (t.trim()) n.children.push({ tag: '#text', text: t.replace(/\s+/g, ' ') });
        else if (/\s/.test(t)) n.children.push({ tag: '#text', text: ' ' }); // inter-span whitespace is a word break
      } else if (ch.nodeType === 1) {
        const k = walk(ch, `${path}/${ei}`); ei += 1;
        if (k) n.children.push(k);
      }
    }
    return n;
  };
  const tree = walk(document.body, '0');
  ifr.remove();
  return { tree, controls, title: document.title, scrollHeight: document.documentElement.scrollHeight };
}

/** Render the source at the given widths and capture computed-style trees. */
export async function captureSource(source, { widths = [1440, 390], atomicForms = false } = {}) {
  const url = /^https?:\/\//.test(source) ? source : pathToFileURL(resolve(source)).href;
  const pw = await resolvePlaywright();
  const browser = await pw.chromium.launch();
  try {
    const caps = {};
    for (const w of widths) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(url, { waitUntil: 'networkidle' });
      // deterministic capture: freeze animations/transitions (entrance keyframes, tickers)
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
      await page.waitForTimeout(300);
      caps[w] = await page.evaluate(capturePage, { props: PROPS, descendForms: atomicForms });
      await page.close();
    }
    return caps;
  } finally { await browser.close(); }
}

/** The CLI verb: capture at 1440+390, map, emit, write. */
export async function importPage(source, { out, name, atomicForms = false } = {}) {
  if (!out) throw new Error('exjsx import: --out <file>.page.jsx is required');
  const caps = await captureSource(source, { atomicForms });
  const base = (name || String(out).split('/').pop().replace(/\.page\.jsx$/, '').replace(/\.jsx$/, ''))
    .replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const title = caps[1440].title || base.replace(/-/g, ' ').replace(/(^|\s)\w/g, (m) => m.toUpperCase());
  const { jsx, stats, notes } = pageFromCaptures(caps[1440], caps[390], { title, source, atomicForms });
  writeFileSync(resolve(out), jsx);
  return { out: resolve(out), stats, notes: [...notes], title };
}
