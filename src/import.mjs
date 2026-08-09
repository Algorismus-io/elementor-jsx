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
 *   - authored heights are indistinguishable from content-driven heights in computed styles —
 *     heights are not emitted (aspect-ratio/object-fit cover the img cases).
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
export function textRun(children, notes) {
  const ser = (kids) => kids.map((c) => {
    if (c.hidden) return '';
    if (c.tag === '#text') return esc(c.text);
    if (c.tag === 'br') return '<br>';
    if (c.tag === 'em' || c.tag === 'i') return `<em>${ser(c.children || [])}</em>`;
    if (c.tag === 'strong' || c.tag === 'b') return `<strong>${ser(c.children || [])}</strong>`;
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
export function mapStyles(rec) {
  const { tag, kind, s, c = {}, parent, rect, notes = new Set(), isRoot = false } = rec;
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
      if (s.top && s.top !== 'auto') raw.push(`top:${s.top}`);
      if (s.left && s.left !== 'auto') raw.push(`left:${s.left}`);
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
  if (kind !== 'text' && kind !== 'heading' && !isRoot) {
    if (!fullW && !maxwIsTheConstraint && !parentGrid && !growing) sx.w = r1(rect.w);
  }
  if (num(s['min-height']) > 0) sx.minh = r1(num(s['min-height']));
  if (num(s['min-width']) > 0) raw.push(`min-width:${s['min-width']}`);

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
  const mobileMap = mobileCap ? flatten(mobileCap.tree) : new Map();
  const controls = desktopCap.controls || {};
  const mControls = mobileCap?.controls || controls;
  let dropped = 0; let emitted = 0;

  const mapAt = (capNode, parentCap, kind, ctrls, isRoot) => mapStyles({
    tag: capNode.tag, kind, s: capNode.styles, c: ctrls[capNode.tag], parent: parentCap,
    rect: capNode.rect, notes, isRoot,
  });

  const build = (capNode, parentCap, depth) => {
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
    if (kind === 'html') {
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
      const text = textRun(capNode.children || [], notes);
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
        const built = build(ch, capNode, depth + 1);
        if (built) children.push(built);
      }
    }
    emitted++;
    const out = { ...base, children };
    if (capNode.href) out.href = capNode.href;
    return out;
  };

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
  lines.push(emitNode(root, 1));
  lines.push(');');
  lines.push('');
  return lines.join('\n');
}

/** captures → finished .page.jsx source (pure — unit-testable without a browser). */
export function pageFromCaptures(desktopCap, mobileCap, { title, source } = {}) {
  const notes = new Set();
  const { root, stats } = buildTree(desktopCap, mobileCap, { notes });
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
function capturePage({ props }) {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'SOURCE', 'TRACK']);
  const CARRIER = new Set(['IFRAME', 'VIDEO', 'CANVAS', 'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'AUDIO', 'TABLE']);
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
export async function captureSource(source, { widths = [1440, 390] } = {}) {
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
      caps[w] = await page.evaluate(capturePage, { props: PROPS });
      await page.close();
    }
    return caps;
  } finally { await browser.close(); }
}

/** The CLI verb: capture at 1440+390, map, emit, write. */
export async function importPage(source, { out, name } = {}) {
  if (!out) throw new Error('exjsx import: --out <file>.page.jsx is required');
  const caps = await captureSource(source);
  const base = (name || String(out).split('/').pop().replace(/\.page\.jsx$/, '').replace(/\.jsx$/, ''))
    .replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const title = caps[1440].title || base.replace(/-/g, ' ').replace(/(^|\s)\w/g, (m) => m.toUpperCase());
  const { jsx, stats, notes } = pageFromCaptures(caps[1440], caps[390], { title, source });
  writeFileSync(resolve(out), jsx);
  return { out: resolve(out), stats, notes: [...notes], title };
}
