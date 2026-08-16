/**
 * kit-components.mjs — higher-level authoring layer on top of kit.mjs.
 *
 * Why this exists: real page generators (kx-gen.mjs: 479 LOC) spend their lines on three things —
 *   1. raw `css()` strings (39×): atomic props don't cover everything, so authors drop to CSS.
 *   2. deep manual nesting: col()/row()/grid()/sect() (34×) with verbose prop envelopes.
 *   3. RE-INVENTING the same components inline every build (stat, section-header, card, band, nav…).
 * This module attacks all three: a declarative `sx` shorthand + a `box` primitive (col/row + css in
 * ONE call), and first-class COMPONENTS for the patterns every page repeats. Goal: same page, ~⅓ LOC.
 *
 * Everything still emits plain kit nodes (valid atomic trees) — compose freely with raw kit helpers.
 */
import {
  node, css, freshId, stateVariant,
  S, C, N, B, SZ, DIM, M, PDIM, P0, RAD, BG, GRAD, SHADOW, SHADOWS, HUG, AUTO, HTML, LINK, CLS, IMG_ID, IMG_URL,
  fx, col, row, grid, sect, heading, para, button, image, textLink, iconChip, faIcon,
} from './kit.mjs';

/** Atomic container background IMAGE. Accepts a URL (string), an attachment id (number), or a
 * prebuilt image envelope, plus optional {color, size, position, repeat, attachment}. Emits the
 * $$type:'background' envelope with a background-image-overlay (validated against the live plugin). */
export function bgImage(src, { color, size = 'cover', position = 'center center', repeat = 'no-repeat', attachment } = {}) {
  const img = typeof src === 'string' ? IMG_URL(src) : typeof src === 'number' ? IMG_ID(src) : src;
  const overlay = {
    $$type: 'background-image-overlay',
    value: {
      image: img,
      size: S(size),
      position: S(position),
      repeat: S(repeat),
      ...(attachment ? { attachment: S(attachment) } : {}),
    },
  };
  return {
    $$type: 'background',
    value: {
      ...(color ? { color: C(color) } : {}),
      'background-overlay': { $$type: 'background-overlay', value: [overlay] },
    },
  };
}
import { mergeTw } from '../tw.mjs';

/* ───────────────────────────── sx: shorthand → atomic props ─────────────────────────────
 * A compact style object maps to the verbose atomic prop envelopes. Numbers are px unless the
 * value says otherwise ('50%' → percent width). Recurses into `mobile`/`tablet`. Anything the
 * map doesn't cover goes through `raw` (a CSS string) via `box`/`styled`. */
/* Elementor's atomic size schema accepts all of these (Size_Constants::standard_units) — anything
 * else in a size string is either a typo or a CSS expression that belongs in `raw`. The old
 * parseFloat coercion silently turned '88vw' into 88px and shipped a site of 88px-wide cards;
 * unknown units must either be HONORED or THROW, never px-ified. */
const LEN_RE = /^\s*(-?(?:\d+\.?\d*|\.\d+))(px|%|em|rem|vw|vh|ch|vmin|vmax)?\s*$/;
/* Elementor's alignment enums, verbatim from style-schema.php — values outside these 400 at the
 * server after a clean lint. Note align-items has NO 'baseline'. */
const JUSTIFY_CONTENT = new Set(['center', 'start', 'end', 'flex-start', 'flex-end', 'left', 'right', 'normal', 'space-between', 'space-around', 'space-evenly', 'stretch']);
const ALIGN_ITEMS = new Set(['normal', 'stretch', 'center', 'start', 'end', 'flex-start', 'flex-end', 'self-start', 'self-end', 'anchor-center']);
const FLEX_SHORTHAND = { between: 'space-between', around: 'space-around', evenly: 'space-evenly' };
const len = (v, prop) => {
  if (typeof v !== 'string') return SZ(v);
  const m = LEN_RE.exec(v);
  if (!m) throw new Error(`sx ${prop}: unsupported value '${v}' — use a number (px) or 'N<unit>' with px/%/em/rem/vw/vh/ch/vmin/vmax; calc()/clamp()/keywords go through raw=`);
  return SZ(parseFloat(m[1]), m[2] || 'px');
};
const width = (v) => {
  if (v === 'hug') return HUG;
  if (v === 'auto') return AUTO;
  if (typeof v === 'string') {
    if (!LEN_RE.test(v)) {
      // 'fit-content'/'max-content'/etc. would silently compile to a NaN envelope (field report:
      // agents reach for CSS keywords here) — name the right token instead.
      throw new Error(`sx width/height: unknown value '${v}' — use 'hug' (= fit-content), 'auto', a number (px), or 'N<unit>' (%/vw/vh/em/rem/ch)`);
    }
    return len(v, 'width/height');
  }
  return SZ(v);
};
/** flex composite (Elementor Flex_Prop_Type: flexGrow/flexShrink/flexBasis). FLEX(1) → `flex:1 1 0`. */
export const FLEX = (grow = 1, shrink = 1, basis = 0) => ({
  $$type: 'flex',
  // string basis ('50%') used to land as SZ('50%') — a string where the schema wants a number.
  value: { flexGrow: N(grow), flexShrink: N(shrink), flexBasis: basis === 'auto' ? AUTO : len(basis, 'flex basis') },
});

/** true for an already-built typed envelope (e.g. a `global-color-variable` reference from a theme). */
const isEnv = (v) => v && typeof v === 'object' && typeof v.$$type === 'string';
const isVarRef = (v) => isEnv(v) && v.$$type === 'global-color-variable';
/** clean a variable ref for insertion into the tree (drop the __lit fallback the validator won't allow). */
const cleanRef = (v) => (isVarRef(v) ? { $$type: v.$$type, value: v.value } : v);
/** a color value → variable ref (live, for `color`/font) or a literal color. */
const colorVal = (v) => (isEnv(v) ? cleanRef(v) : C(v));
/** a background value. Elementor 4.1.4 atomic backgrounds don't resolve variable refs, so a var token
 * degrades to its literal fallback (__lit) here while `color`/font stay live. Literals → simple form. */
const bgValue = (v) => {
  if (isEnv(v) && v.$$type === 'background') return v;              // already a background
  if (isVarRef(v)) return { $$type: 'background', value: { color: C(v.__lit || '#000000') } };
  return { $$type: 'background', value: { color: colorVal(v) } };   // literal solid color
};

/* Standard CSS property names (kebab or camel) accepted as aliases for the shorthand keys —
 * models write `padding`/`maxWidth`/`textAlign` unprompted; don't make them learn `pad`/`maxw`/`ta`.
 * An explicit shorthand key wins over its alias when both appear. */
const SX_ALIAS = {
  padding: 'pad', margin: 'm', width: 'w', height: 'h',
  'max-width': 'maxw', maxWidth: 'maxw', 'min-height': 'minh', minHeight: 'minh',
  background: 'bg', 'background-color': 'bg', backgroundColor: 'bg',
  'align-items': 'align', alignItems: 'align', 'justify-content': 'justify', justifyContent: 'justify',
  'flex-direction': 'dir', flexDirection: 'dir', 'flex-wrap': 'wrap', flexWrap: 'wrap',
  'text-align': 'ta', textAlign: 'ta', 'font-size': 'size', fontSize: 'size',
  'font-weight': 'weight', fontWeight: 'weight', 'font-family': 'font', fontFamily: 'font',
  'line-height': 'lh', lineHeight: 'lh', 'letter-spacing': 'ls', letterSpacing: 'ls',
  'border-radius': 'radius', borderRadius: 'radius', 'box-shadow': 'shadow', boxShadow: 'shadow',
  'object-fit': 'fit', objectFit: 'fit', position: 'pos',
  'grid-template-columns': 'gridCols', gridTemplateColumns: 'gridCols',
  'grid-template-rows': 'gridRows', gridTemplateRows: 'gridRows',
  'column-gap': 'gapX', columnGap: 'gapX', 'row-gap': 'gapY', rowGap: 'gapY',
};
function unalias(o) {
  let out = null;
  for (const k of Object.keys(o)) {
    const a = SX_ALIAS[k];
    if (!a) continue;
    out ??= { ...o };
    if (out[a] === undefined) out[a] = out[k];
    delete out[k];
  }
  return out || o;
}
/* sx `shadow` — ONE layer as the arg tuple [v, blur, spread, color, h?, 'inset'?], an ARRAY OF
 * TUPLES for a MULTI-LAYER shadow ([[…],[…]] → Box_Shadow_Prop_Type's item array, rendered as a
 * comma list), or a prebuilt envelope. Multi-layer is what pixel-stepped "borders" and layered
 * elevation need; before 1.9.2 they could only be written as raw CSS, and raw-atomic-overlap then
 * warned on every such element (field report 1.9.1). */
const shadowVal = (v) => {
  if (!Array.isArray(v)) return v;                       // prebuilt {$$type:'box-shadow'} envelope
  if (!v.length) throw new Error('sx shadow: empty array — pass [v, blur, spread, color] or [[…],[…]] for multiple layers');
  return Array.isArray(v[0]) ? SHADOWS(...v) : SHADOW(...v);
};

/** '96px 24px' → [96, 24] for pad/m ('auto' preserved; unit tokens become size envelopes). */
const boxVal = (v, prop) => (typeof v === 'string'
  ? v.trim().split(/\s+/).map((s) => {
      if (s === 'auto') return 'auto';
      const m = LEN_RE.exec(s);
      if (!m) throw new Error(`sx ${prop}: unsupported token '${s}' in '${v}' — numbers (px), 'N<unit>' (px/%/em/rem/vw/vh/ch), or 'auto'; calc()/clamp() go through raw=`);
      return m[2] ? SZ(parseFloat(m[1]), m[2]) : parseFloat(m[1]);
    })
  : v);

/* ── state objects: hover={{…}}-style per-state styling wherever sx is (box/styled/JSX) ──
 * Values use the SAME sx vocabulary plus `raw` (state-scoped custom CSS) and nested tablet/mobile
 * (breakpoint-scoped states). e--selected/e--disabled stay kit-only (stateVariant) — they're
 * editor-machinery class states, not authoring vocabulary. */
const SX_STATES = { hover: 'hover', active: 'active', focus: 'focus', 'focus-visible': 'focus-visible', focusVisible: 'focus-visible', checked: 'checked' };
/** Pull state objects out of an sx-input object → { rest, states } (state names normalized). */
export function splitStates(o = {}) {
  let rest = o;
  const states = {};
  for (const [k, st] of Object.entries(SX_STATES)) {
    if (o[k] == null) continue;
    if (rest === o) rest = { ...o };
    states[st] = { ...(states[st] || {}), ...rest[k] };
    delete rest[k];
  }
  return { rest, states };
}
/** Apply state objects to a node: sx-mappable keys → NATIVE state variants (desktop, plus
 * tablet/mobile nests → breakpoint-scoped state variants); `raw` → per-state custom_css
 * (nested tablet/mobile raw → per-breakpoint per-state custom_css). */
export function applyStates(n, states) {
  for (const [state, obj] of Object.entries(states || {})) {
    const { raw, tablet, mobile, ...rest } = obj;
    const desk = sx(rest);
    if (Object.keys(desk).length) stateVariant(n, state, desk);
    for (const [bpKey, bpObj] of [['tablet', tablet], ['mobile', mobile]]) {
      if (!bpObj) continue;
      const { raw: bpRaw, ...bpRest } = bpObj;
      const p = sx(bpRest);
      if (Object.keys(p).length) stateVariant(n, state, p, { breakpoint: bpKey });
      if (bpRaw) css(n, bpRaw, { breakpoint: bpKey, state });
    }
    if (raw) css(n, raw, { state });
  }
  return n;
}

export function sx(o = {}) {
  // sx={{…}} as a prop: a nested shorthand object, merged in (React/MUI users reach for `sx` — it
  // used to be silently dropped). Its keys use the SAME shorthand vocabulary; outer keys win.
  if (o.sx && typeof o.sx === 'object') { const { sx: inner, ...rest } = o; o = { ...inner, ...rest }; }
  // A state object here has no node to land on — it would be silently dropped. box()/styled()/the
  // JSX runtime extract states (splitStates) BEFORE calling sx; anything else must too.
  for (const k of Object.keys(o)) {
    if (SX_STATES[k]) throw new Error(`sx: state object '${k}' has no target node here — state styling goes through box()/styled()/JSX props (${SX_STATES[k]}={{…}}), or kit stateVariant(node, '${SX_STATES[k]}', props). Note: states nest breakpoints (hover: { tablet: {…} }), not the other way around.`);
  }
  o = unalias(o);
  const p = {};
  // bgImage: URL string / attachment id / prebuilt envelope → container background image
  if (o.bgImage != null) p.background = bgImage(o.bgImage, o.bgOpts);
  else if (o.bg) {
    // a CSS gradient STRING is not a color — it used to ship inside a color envelope and render
    // nothing. Spreading it into GRAD is worse: strings spread char-by-char (angle:'l', color 'i').
    if (typeof o.bg === 'string' && o.bg.includes('gradient(')) {
      throw new Error(`sx bg: CSS gradient strings aren't colors — use grad: [angle, from, to] or raw="background-image:${o.bg};"`);
    }
    p.background = Array.isArray(o.bg) ? GRAD(...o.bg) : bgValue(o.bg);
  }
  if (o.grad) {
    if (!Array.isArray(o.grad)) throw new Error(`sx grad: expects [angle, from, to] — got ${typeof o.grad}; CSS gradient strings go through raw="background-image:…;"`);
    p.background = GRAD(...o.grad);
  }
  if (o.zIndex != null || o.z != null) {
    const zv = Number(o.zIndex ?? o.z);
    if (!Number.isFinite(zv)) throw new Error(`sx z: '${o.zIndex ?? o.z}' is not a number — z-index takes an integer`);
    p['z-index'] = N(zv);
  }
  // object form {t,r,b,l} = PARTIAL sides — unset sides inherit (axis spacing in responsive variants)
  if (o.pad != null) { const v = boxVal(o.pad, 'pad'); p.padding = Array.isArray(v) ? DIM(...v) : typeof v === 'object' ? PDIM(v) : DIM(v); }
  if (o.m != null) { const v = boxVal(o.m, 'm'); p.margin = Array.isArray(v) ? M(...v) : typeof v === 'object' ? PDIM(v) : M(v); }
  if (o.center) p.margin = M(0, 'auto');
  if (o.radius != null) p['border-radius'] = RAD(typeof o.radius === 'string' ? len(o.radius, 'radius') : o.radius);
  // gapX/gapY (column-gap/row-gap aliases) → ONE layout-direction gap envelope — NEVER the
  // row-gap/column-gap prop keys (not in the style schema; assertTree rejects them). A single
  // axis is legal (the PHP Multi_Props_Transformer isset-filters the {column,row} shape).
  if (o.gapX != null || o.gapY != null) {
    const gx = o.gapX ?? o.gap; const gy = o.gapY ?? o.gap;
    p.gap = { $$type: 'layout-direction', value: { ...(gx != null ? { column: len(gx, 'gapX') } : {}), ...(gy != null ? { row: len(gy, 'gapY') } : {}) } };
  } else if (o.gap != null) p.gap = len(o.gap, 'gap');
  if (o.w != null) p.width = width(o.w);
  if (o.maxw != null) p['max-width'] = len(o.maxw, 'maxw');
  if (o.minh != null) p['min-height'] = len(o.minh, 'minh');
  if (o.h != null) p.height = width(o.h);
  // Elementor's schema enums these server-side (style-schema.php) — an off-vocabulary value passes
  // lint and 400s the deploy (field hits: justify="between", align="baseline" ×5 across the batch).
  // Tailwind-style shorthands are normalized; everything else must be in the enum or we throw NOW.
  if (o.align) {
    const v = FLEX_SHORTHAND[o.align] || o.align;
    if (!ALIGN_ITEMS.has(v)) throw new Error(`sx align: '${o.align}' isn't in Elementor's align-items enum (${[...ALIGN_ITEMS].join(' | ')})${o.align === 'baseline' ? " — baseline isn't supported; use flex-end" : ''}`);
    p['align-items'] = S(v);
  }
  if (o.justify) {
    const v = FLEX_SHORTHAND[o.justify] || o.justify;
    if (!JUSTIFY_CONTENT.has(v)) throw new Error(`sx justify: '${o.justify}' isn't in Elementor's justify-content enum (${[...JUSTIFY_CONTENT].join(' | ')})`);
    p['justify-content'] = S(v);
  }
  if (o.dir) {
    const DIRS = { row: 'row', column: 'column', 'row-reverse': 'row-reverse', 'column-reverse': 'column-reverse', col: null, vertical: null, horizontal: null };
    if (!(o.dir in DIRS)) throw new Error(`sx dir: unknown value '${o.dir}' — use 'row' | 'column' | 'row-reverse' | 'column-reverse'`);
    if (DIRS[o.dir] === null) throw new Error(`sx dir: '${o.dir}' is not a flex-direction — use '${o.dir === 'col' || o.dir === 'vertical' ? 'column' : 'row'}'`);
    p['flex-direction'] = S(DIRS[o.dir]);
  }
  if (o.wrap) p['flex-wrap'] = S(o.wrap === true ? 'wrap' : o.wrap);
  if (o.color) p.color = colorVal(o.color);
  if (o.size != null) p['font-size'] = len(o.size, 'size');
  if (o.weight != null) p['font-weight'] = S(String(o.weight));
  if (o.font) p['font-family'] = isEnv(o.font) ? o.font : S(o.font);
  if (o.ta) p['text-align'] = S({ left: 'start', right: 'end' }[o.ta] || o.ta);
  // lh: bare numbers keep the CSS-like heuristic (≤4 reads as a multiplier → em, else px);
  // an explicit unit in a string is honored ('150%' used to become 150px — ×100 wrong).
  if (o.lh != null) {
    const explicit = typeof o.lh === 'string' && /[a-z%]/i.test(o.lh);
    if (explicit) p['line-height'] = len(o.lh, 'lh');
    else { const v = parseFloat(o.lh); p['line-height'] = SZ(v, v <= 4 ? 'em' : 'px'); }
  }
  // ls: bare numbers are em by convention; '2px' used to become 2em (~×32 wrong) — honor the unit.
  if (o.ls != null) {
    const explicit = typeof o.ls === 'string' && /[a-z%]/i.test(o.ls);
    p['letter-spacing'] = explicit ? len(o.ls, 'ls') : SZ(parseFloat(o.ls), 'em');
  }
  if (o.span != null) {
    const sp = Number(o.span);
    if (!Number.isFinite(sp)) throw new Error(`sx span: '${o.span}' is not a number — grid-column span takes an integer`);
    p['grid-column'] = { $$type: 'span', value: sp };
  }
  // grid-row span — same authored NUMBER form as span (deploy adapts to 'span N' on 4.2+ targets)
  if (o.rowSpan != null) {
    const sp = Number(o.rowSpan);
    if (!Number.isFinite(sp)) throw new Error(`sx rowSpan: '${o.rowSpan}' is not a number — grid-row span takes an integer`);
    p['grid-row'] = { $$type: 'span', value: sp };
  }
  if (o.flex != null) p.flex = FLEX(o.flex);
  if (o.display) p.display = S(o.display);
  if (o.gridCols != null) { p.display = S('grid'); p['grid-template-columns'] = S(typeof o.gridCols === 'number' ? `repeat(${o.gridCols}, 1fr)` : o.gridCols); }
  if (o.gridRows != null) { p.display = S('grid'); p['grid-template-rows'] = S(typeof o.gridRows === 'number' ? `repeat(${o.gridRows}, 1fr)` : o.gridRows); }
  if (o.pos) p.position = S(o.pos);
  if (o.shadow) p['box-shadow'] = shadowVal(o.shadow);
  if (o.fit) p['object-fit'] = S(o.fit);
  // border: [w, c] (both) · string (color, width 1) · number (width, color from borderColor or
  // currentColor). A bare number is a WIDTH like CSS `border:1px` — never a color; treating it as a
  // color used to emit border-color:{value:1}, which 422s the deploy with border-color: invalid_value.
  if (o.border != null) {
    let w, c;
    if (Array.isArray(o.border)) [w, c] = o.border;
    else if (typeof o.border === 'number') { w = o.border; c = o.borderColor; }
    else { w = 1; c = o.border; }
    p['border-width'] = SZ(w);
    if (c != null) p['border-color'] = C(c);
    p['border-style'] = S('solid');
  } else if (o.borderColor != null) {
    p['border-color'] = C(o.borderColor); p['border-width'] = SZ(1); p['border-style'] = S('solid');
  }
  if (o.tablet) p._t = sx(o.tablet);
  if (o.mobile) p._m = sx(o.mobile);
  return { ...p, ...(o.props || {}) };
}

/* Ensure a flex-ROW container child satisfies the kit contract (needs width OR flex, else it
 * defaults to 100% and wraps the row). Column children with no width get flex:1 (share the row);
 * children that already declare width/max-width+flex/flex are left alone. Absorbs a whole class of
 * assertTree footguns so row authoring is one line. */
function ensureRowChild(ch) {
  if (!ch || (ch.elType !== 'e-flexbox' && ch.elType !== 'e-div-block')) return;
  let sid = Object.keys(ch.styles || {})[0];
  if (!sid) { sid = `e-${ch.id}-s`; ch.styles = { [sid]: { id: sid, type: 'class', label: ch.id, variants: [{ meta: { breakpoint: 'desktop', state: null }, props: {} }] } }; ch.settings.classes = CLS([...(ch.settings.classes?.value ?? []), sid]); }
  const p = ch.styles[sid].variants.find((v) => v.meta.breakpoint === 'desktop' && !v.meta.state).props;
  if (!p.width && !p.flex) p.flex = FLEX(1);
}
/* box: the workhorse — one call replaces col({…verbose props}) + a trailing css(node,'…raw…').
 * `dir:'row'` for a row; `raw` for any CSS the sx map doesn't cover (gradients-on-text, grid spans…). */
export function box(o = {}, ch = []) {
  const { rest: o2, states } = splitStates(mergeTw(o));
  const { raw, dir, tag, ...rest } = o2;
  if (dir === 'row') ch.forEach(ensureRowChild);
  // dir stays in the sx input: the tag branch (sect) doesn't route through row()/col(),
  // so flex-direction must come from the props or <section dir="row"> silently renders as a column.
  const props = sx(dir ? { ...rest, dir } : rest);
  const n = tag ? sect(tag, props, ch) : (dir === 'row' ? row(props, ch) : col(props, ch));
  if (raw) css(n, raw);
  applyStates(n, states);
  return n;
}
/** Apply extra sx/raw to any existing node (post-hoc styling). Bootstraps a style holder on a
 * STYLELESS node (it used to silently DROP the sx — ctaBand's button styling never applied;
 * caught by the elementor-jsx test suite). Responsive keys (_t/_m from tablet/mobile) go to
 * their own variants, not into desktop props. */
export function styled(n, o = {}) {
  const { rest: o2, states } = splitStates(mergeTw(o));
  const { raw, ...rest } = o2;
  const { _t, _m, ...deskP } = sx(rest);
  let sid = Object.keys(n.styles || {})[0];
  if (!sid && (Object.keys(deskP).length || _t || _m)) {
    sid = `e-${n.id}-s`;
    n.styles = { [sid]: { id: sid, type: 'class', label: n.id, variants: [{ meta: { breakpoint: 'desktop', state: null }, props: {} }] } };
    const refs = n.settings.classes?.value ?? [];
    n.settings.classes = CLS(refs.includes(sid) ? refs : [...refs, sid]);
  }
  if (sid) {
    const st = n.styles[sid];
    if (Object.keys(deskP).length) Object.assign(st.variants.find((v) => v.meta.breakpoint === 'desktop' && !v.meta.state).props, deskP);
    for (const [bp, p] of [['tablet', _t], ['mobile', _m]]) {
      if (!p) continue;
      let v = st.variants.find((x) => x.meta.breakpoint === bp && !x.meta.state);
      if (!v) { v = { meta: { breakpoint: bp, state: null }, props: {} }; st.variants.push(v); }
      Object.assign(v.props, p);
    }
  }
  if (raw) css(n, raw);
  applyStates(n, states);
  return n;
}
/** Attach a registered global class (Class-Manager) by id, preserving locals. `bindClass(n,'fm-card')`. */
export function bindClass(n, ...classIds) {
  const refs = n.settings?.classes?.value ?? [];
  const add = classIds.map((c) => (c.startsWith('g-') || c.startsWith('e-') ? c : `g-${c}`));
  n.settings.classes = CLS([...new Set([...add, ...refs])]);
  return n;
}

/* ─────────────────────────────── text sugar ─────────────────────────────── */
export const h2 = (html, o = {}) => heading('h2', html, sx(o));
export const h3 = (html, o = {}) => heading('h3', html, sx(o));
export const txt = (html, o = {}) => para(html, sx(o));
export const eyebrow = (t, o = {}) =>
  para(t, sx({ weight: 700, size: 12.5, ls: 0.12, ...o }));
/** Headline with a colored accent word/phrase — free-Elementor safe (html-v3 <span> + nested css). */
export const accentHeading = (tag, html, accentColor, o = {}) => {
  const n = heading(tag, html, sx(o));
  css(n, `& span, & em { color:${accentColor}; font-style:normal; }`);
  return n;
};

/* ─────────────────────────────── sections ───────────────────────────────
 * section(): the standard shell — full-bleed <section> + centered maxw wrap + optional header. */
export function sectionHeader({ eyebrow: eb, title, body, align = 'flex-start', accent, gap = 14, maxw, sx: over } = {}) {
  const ta = align === 'center' ? 'center' : 'left';
  const kids = [];
  if (eb) kids.push(eyebrow(eb, { color: '#5B6B72', ta }));
  if (title) kids.push(accent ? accentHeading('h2', title, accent, { ta }) : h2(title, { ta }));
  if (body) kids.push(txt(body, { color: '#5B6B72', ta, maxw: maxw ?? 620, lh: 1.6 }));
  return box({ gap, align, w: '100%', ...(over || {}) }, kids);
}
export function section({ id, bg, pad = [96, 24], maxw = 1200, gap = 40, align = 'stretch', header, children = [], raw, sx: over } = {}) {
  const wrap = box({ w: '100%', maxw, center: true, gap, align, pad: 0 }, [
    ...(header ? [sectionHeader(header)] : []),
    ...children,
  ]);
  const s = box({ tag: 'section', w: '100%', bg, pad, align: 'center', raw, ...(over || {}) }, [wrap]);
  if (id) s.settings._cssid = S(id); // atomic HTML-id anchor (div-block/flexbox render _cssid → id attr)
  return s;
}

/* ─────────────────────────────── cards & grids ───────────────────────────────
 * card(): icon chip + title + desc, tintable. bento(): grid whose children carry `span`. */
export function card({ icon, iconLib = 'fa-solid', title, desc, tint = '#ffffff', ink = '#0A2230', sub = '#5B6B72', href, radius = 24, pad = 24, iconBg, gap = 10, span, children, sx: over } = {}) {
  const kids = [];
  if (icon) kids.push(iconChip(icon, { bg: iconBg ?? 'rgba(9,61,87,0.08)', color: ink, size: 20, library: iconLib }));
  if (title) kids.push(h3(title, { color: ink, size: 18, weight: 700 }));
  if (desc) kids.push(txt(desc, { color: sub, size: 14, lh: 1.55 }));
  if (children) kids.push(...children);
  const c = box({ bg: tint, radius, pad, gap, align: 'flex-start', h: '100%', ...(span ? { span } : {}), ...(over || {}) }, kids);
  if (href) c.settings.link = LINK(href);
  return c;
}
/** Bento grid: pass cards (or any nodes) with a `.span` — sets grid-column span per child. */
export function bento(items, { cols = 12, gap = 20, mobileCols = 1 } = {}) {
  const g = grid(`repeat(${cols}, 1fr)`, gap, {}, items);
  css(g, `@media(max-width:767px){& > *{grid-column:span ${cols}!important}}`);
  // also set the mobile variant so single-column stacking is explicit
  return g;
}
/** Even card grid (auto-fit): the common "N equal cards" case without span math. */
export const cardGrid = (items, { min = 240, gap = 20 } = {}) => grid(`repeat(auto-fit, minmax(${min}px, 1fr))`, gap, {}, items);

/* stat / step / chip / testimonial ─────────────────────────────────────── */
export const stat = ({ value, label, tint, ink = '#0A2230', sub = '#5B6B72', icon } = {}) =>
  box({ bg: tint, radius: 20, pad: 22, gap: 6, align: 'flex-start', h: '100%' }, [
    ...(icon ? [iconChip(icon, { bg: 'rgba(9,61,87,0.10)', color: ink, size: 18 })] : []),
    h3(value, { color: ink, size: 40, weight: 800, ls: -0.02 }),
    txt(label, { color: sub, size: 13.5 }),
  ]);
export const step = ({ n, title, desc, accent = '#5E9E2E', span } = {}) =>
  box({ bg: '#ffffff', radius: 24, pad: 24, gap: 10, align: 'flex-start', h: '100%', border: [1, '#E4E9DC'], ...(span ? { span } : {}) }, [
    box({ bg: accent, radius: 999, w: 36, h: 36, align: 'center', justify: 'center' }, [txt(String(n), { color: '#fff', weight: 700, size: 15 })]),
    h3(title, { color: '#0A2230', size: 18, weight: 700 }),
    txt(desc, { color: '#5B6B72', size: 14, lh: 1.55 }),
  ]);
export const chip = (t) => box({ dir: 'row', bg: '#ffffff', radius: 999, pad: [9, 16], gap: 8, align: 'center', border: [1, '#E4E9DC'], w: 'hug' }, [
  box({ bg: '#85C441', radius: 999, w: 7, h: 7 }, []),
  txt(t, { color: '#0A2230', size: 13.5, weight: 600 }),
]);
export const logoStrip = (labels, { caption } = {}) => box({ gap: 18, align: 'center', w: '100%' }, [
  ...(caption ? [eyebrow(caption, { color: '#5B6B72', ta: 'center' })] : []),
  box({ dir: 'row', gap: 12, wrap: true, justify: 'center', w: '100%' }, labels.map(chip)),
]);
export const testimonial = ({ quote, name, role, tint = '#ffffff' } = {}) =>
  box({ bg: tint, radius: 24, pad: 26, gap: 16, align: 'flex-start', h: '100%', border: [1, '#E4E9DC'] }, [
    txt(`&ldquo;${quote}&rdquo;`, { color: '#0A2230', size: 16, lh: 1.6 }),
    box({ gap: 2 }, [txt(name, { color: '#0A2230', weight: 700, size: 14.5 }), txt(role, { color: '#5B6B72', size: 13 })]),
  ]);

/* footer & CTA band ─────────────────────────────────────────────────────── */
export const footer = ({ brand, blurb, cols = [], bg = '#06293C', ink = '#ffffff', muted = 'rgba(255,255,255,0.6)' } = {}) =>
  box({ tag: 'section', w: '100%', bg, pad: [64, 24], align: 'center' }, [
    box({ dir: 'row', w: '100%', maxw: 1200, center: true, gap: 48, wrap: true, justify: 'space-between', align: 'flex-start' }, [
      box({ gap: 12, maxw: 320 }, [h3(brand, { color: ink, size: 22, weight: 800 }), txt(blurb, { color: muted, size: 14, lh: 1.6 })]),
      ...cols.map((cl) => box({ gap: 10 }, [
        eyebrow(cl.title, { color: muted }),
        ...cl.links.map((l) => { const t = l.text ?? l; return textLink(t, l.href || `/${String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, sx({ color: muted, size: 14 })); }),
      ])),
    ]),
  ]);
export const ctaBand = ({ eyebrow: eb, title, body, buttons = [], bg = '#093D57', accent = '#85C441' } = {}) =>
  box({ tag: 'section', w: '100%', pad: [96, 24], align: 'center', bg: [130, bg, '#06293C'] }, [
    box({ w: '100%', maxw: 820, center: true, gap: 18, align: 'center' }, [
      ...(eb ? [eyebrow(eb, { color: accent, ta: 'center' })] : []),
      h2(title, { color: '#fff', ta: 'center', size: 44, weight: 800 }),
      ...(body ? [txt(body, { color: 'rgba(255,255,255,0.75)', ta: 'center', size: 17, lh: 1.6, maxw: 620 })] : []),
      box({ dir: 'row', gap: 12, justify: 'center', wrap: true }, buttons.map((b, i) =>
        styled(button(b.text, b.href || '/contact'), i === 0 ? { bg: accent, color: '#06293C', radius: 999, pad: [14, 26], weight: 700 } : { bg: 'transparent', color: '#fff', radius: 999, pad: [14, 26], border: [1, 'rgba(255,255,255,0.4)'] }))),
    ]),
  ]);

/* nav: dropdown mega-menus + mobile hamburger, as ONE self-contained HTML widget (free-Elementor).
 * Replaces ~100 LOC of hand-authored inline HTML/CSS/JS per build. */
export function navBar({ logo = 'brand', links = [], ctas = [], accent = '#85C441', ink = '#093D57' } = {}) {
  const li = links.map((l) => {
    const items = l.menu ? `<div class="kn-mega">${l.menu.map((m) => `<a href="${m.href || '#'}"><b>${m.title}</b>${m.desc ? `<span>${m.desc}</span>` : ''}</a>`).join('')}</div>` : '';
    return `<div class="kn-item${l.menu ? ' has' : ''}"><a class="kn-top" href="${l.href || '#'}">${l.text}${l.menu ? '<i class="kn-caret"></i>' : ''}</a>${items}</div>`;
  }).join('');
  const cta = ctas.map((c, i) => `<a class="kn-cta${i === ctas.length - 1 ? ' solid' : ''}" href="${c.href || '#'}">${c.text}</a>`).join('');
  const chipsSvc = links.find((l) => l.menu)?.menu?.map((m) => `<a class="kn-chip" href="${m.href || '#'}">${m.title}</a>`).join('') || '';
  const html = `<nav class="kn"><div class="kn-in"><a class="kn-logo" href="/">${logo}</a>
<div class="kn-links">${li}</div><div class="kn-ctas">${cta}</div>
<button class="kn-burger" aria-label="Menu" onclick="this.closest('.kn').classList.toggle('open')"><span></span><span></span><span></span></button></div>
<div class="kn-mobile"><div class="kn-mtop"><span>${logo}</span><button onclick="this.closest('.kn').classList.remove('open')">&times;</button></div>
${links.map((l) => `<a class="kn-mlink" href="${l.href || '#'}">${l.text}</a>`).join('')}<div class="kn-mchips">${chipsSvc}</div>${cta}</div></nav>
<style>
.kn{position:sticky;top:0;z-index:50;background:rgba(245,249,230,.9);backdrop-filter:blur(8px);border-bottom:1px solid #E4E9DC;font-family:Poppins,system-ui,sans-serif}
.kn-in{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:24px;padding:14px 24px}
.kn-logo{font-weight:800;color:${ink};text-decoration:none;font-size:20px;margin-right:auto}
.kn-links{display:flex;gap:6px}.kn-item{position:relative}
.kn-top{display:flex;align-items:center;gap:5px;padding:8px 12px;color:${ink};text-decoration:none;font-weight:600;font-size:15px}
.kn-caret{width:7px;height:7px;border-right:2px solid ${ink};border-bottom:2px solid ${ink};transform:rotate(45deg);margin-top:-3px;transition:.2s}
.kn-item.has:hover .kn-caret,.kn-item.has:focus-within .kn-caret{transform:rotate(-135deg);margin-top:2px}
.kn-mega{position:absolute;top:calc(100% + 8px);left:0;min-width:520px;background:#fff;border-radius:20px;box-shadow:0 24px 50px -24px rgba(9,61,87,.3);padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:6px;opacity:0;visibility:hidden;transform:translateY(6px);transition:.18s}
.kn-item.has:hover .kn-mega,.kn-item.has:focus-within .kn-mega{opacity:1;visibility:visible;transform:none}
.kn-mega a{display:flex;flex-direction:column;padding:12px;border-radius:12px;text-decoration:none}
.kn-mega a:hover{background:#F5F9E6}.kn-mega b{color:${ink};font-size:15px}.kn-mega span{color:#5B6B72;font-size:13px}
.kn-ctas{display:flex;gap:10px}.kn-cta{padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;color:${ink};border:1px solid ${ink}}
.kn-cta.solid{background:${accent};border-color:${accent};color:#06293C}
.kn-burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer}.kn-burger span{width:24px;height:2px;background:${ink}}
.kn-mobile{display:none}
@media(max-width:900px){.kn-links,.kn-ctas{display:none}.kn-burger{display:flex}
.kn.open .kn-mobile{display:flex;flex-direction:column;gap:2px;position:fixed;inset:0;background:linear-gradient(160deg,#093D57,#06293C);padding:20px;z-index:99}
.kn-mtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.kn-mtop span{color:#fff;font-weight:800;font-size:20px}.kn-mtop button{background:rgba(255,255,255,.1);color:#fff;border:0;width:40px;height:40px;border-radius:999px;font-size:22px}
.kn-mlink{color:#fff;font-size:26px;font-weight:800;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.12);text-decoration:none}
.kn-mchips{display:flex;flex-wrap:wrap;gap:8px;padding:16px 0}.kn-mchips a{color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:8px 14px;font-size:14px;text-decoration:none}
.kn-mobile .kn-cta{margin-top:8px}}
</style>`;
  return { id: freshId(), elType: 'widget', widgetType: 'html', settings: { html }, styles: {}, elements: [] };
}

/* in-card mockups & charts (SVG/HTML widgets) — the decorative visuals we kept hand-authoring. */
const htmlW = (html) => ({ id: freshId(), elType: 'widget', widgetType: 'html', settings: { html }, styles: {}, elements: [] });
export const browserMock = (url = 'yoursite.com', { accent = '#85C441' } = {}) => htmlW(
  `<div style="background:#0C4D6E;border-radius:14px;padding:14px;font-family:Inter,sans-serif"><div style="display:flex;gap:6px;align-items:center;margin-bottom:12px"><i style="width:9px;height:9px;border-radius:9px;background:#ff5f57;display:inline-block"></i><i style="width:9px;height:9px;border-radius:9px;background:#febc2e;display:inline-block"></i><i style="width:9px;height:9px;border-radius:9px;background:#28c840;display:inline-block"></i><span style="background:rgba(255,255,255,.12);color:#cfe;font-size:11px;padding:3px 10px;border-radius:6px;margin-left:6px">${url}</span></div><div style="height:8px;width:70%;background:rgba(255,255,255,.25);border-radius:6px;margin:8px 0"></div><div style="height:8px;width:45%;background:rgba(255,255,255,.15);border-radius:6px;margin:8px 0"></div><span style="display:inline-block;background:${accent};color:#06293C;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;margin-top:8px">Get a quote</span></div>`);
export const barChart = (data = [30, 45, 40, 60, 70, 100], { accent = '#85C441', label } = {}) => htmlW(
  `<div style="font-family:Inter,sans-serif">${label ? `<div style="color:#85C441;font-weight:700;font-size:12px;margin-bottom:8px">${label}</div>` : ''}<div style="display:flex;align-items:flex-end;gap:8px;height:120px">${data.map((v, i) => `<div style="flex:1;height:${v}%;border-radius:6px;background:${i === data.length - 1 ? accent : 'rgba(255,255,255,.18)'}"></div>`).join('')}</div></div>`);
export const lineChart = (pts = [20, 35, 30, 50, 45, 70, 65, 85], { accent = '#6FAE32' } = {}) => {
  const w = 260, h = 90; const step = w / (pts.length - 1);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(0)},${(h - (p / 100) * h).toFixed(0)}`).join(' ');
  return htmlW(`<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block"><path d="${d}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><circle cx="${w}" cy="${(h - (pts[pts.length - 1] / 100) * h).toFixed(0)}" r="4" fill="${accent}"/></svg>`);
};
export const donut = (pct = 35, { accent = '#85C441', track = '#DCEAEF', label } = {}) => htmlW(
  `<div style="display:flex;align-items:center;gap:10px;font-family:Inter,sans-serif"><svg width="64" height="64" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="${track}" stroke-width="4"/><circle cx="18" cy="18" r="15.9" fill="none" stroke="${accent}" stroke-width="4" stroke-dasharray="${pct} 100" transform="rotate(-90 18 18)" stroke-linecap="round"/></svg>${label ? `<span style="color:#5B6B72;font-size:12px">${label}</span>` : ''}</div>`);
export const chatMock = (msgs = [['Any slots Friday?', 0], ['Yes, 2pm or 4:30pm are open. Shall I book one?', 1]]) => htmlW(
  `<div style="font-family:Inter,sans-serif;display:flex;flex-direction:column;gap:8px">${msgs.map(([t, me]) => `<div style="align-self:${me ? 'flex-start' : 'flex-end'};max-width:80%;background:${me ? '#fff' : 'rgba(255,255,255,.9)'};color:#0A2230;font-size:12px;padding:8px 11px;border-radius:12px">${t}</div>`).join('')}<div style="align-self:flex-start;color:#fff;font-size:16px;letter-spacing:2px">&bull;&bull;&bull;</div></div>`);

export const CInc = { S, C, N, B, SZ, DIM, M, RAD, BG, GRAD, SHADOW, HTML, LINK }; // re-export bag

/* ─────────────────────────────── accessibility primitives ───────────────────────────────
 * These exist because the two mechanisms Elementor gives us for accessibility metadata have very
 * different reach (live-verified on 4.2.1 free — see src/a11y.mjs LANDMARKS for the full note):
 *   settings.tag        renders everywhere, but its enum has no <main> and no <nav>;
 *   settings.attributes (role/aria-*) is DROPPED by free core's null transformer, Pro-only.
 * So anything that MUST work on a free install cannot go through role/aria at all — it has to be
 * real markup. The classic html widget emits its content verbatim on every tier, which makes it
 * the one reliable carrier for a skip link and for screen-reader-only text. */

/** Screen-reader-only text: visible to assistive tech, clipped to 1px for everyone else.
 * The declaration block is the long-standing "visually hidden" recipe (clip-path + 1px box);
 * `focusable` makes it reveal itself on focus, which is what a skip link needs. */
export const SR_ONLY_CSS = 'position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

/** Visually-hidden text as a standalone element (e.g. naming an icon-only control in real markup). */
export const srOnly = (text, { tag = 'span' } = {}) => ({
  id: freshId(), elType: 'widget', widgetType: 'html',
  settings: { html: `<${tag} style="${SR_ONLY_CSS}">${text}</${tag}>` },
  styles: {}, elements: [],
});

/**
 * Skip link (WCAG 2.2 SC 2.4.1 Bypass Blocks, Level A — a real success criterion, unlike the
 * landmark best-practices). Emitted as raw markup rather than an atomic button for two reasons:
 * an atomic e-button cannot carry the :focus reveal without Pro-only custom_css, and the link must
 * be the FIRST focusable thing in the document, which raw markup guarantees.
 *
 * `target` is the id of the element to jump to — give that element id="main-content" (the `id`
 * prop on any container sets Elementor's _cssid, which DOES render on free). tabindex="-1" on the
 * target is added by the emitted script so the jump actually moves focus in browsers that
 * otherwise only move the scroll position.
 */
export const skipLink = (target = 'main-content', text = 'Skip to content') => ({
  id: freshId(), elType: 'widget', widgetType: 'html',
  settings: {
    html:
      `<a class="exjsx-skip" href="#${target}">${text}</a>`
      + `<style>.exjsx-skip{${SR_ONLY_CSS}}`
      + `.exjsx-skip:focus,.exjsx-skip:focus-visible{position:fixed!important;top:8px;left:8px;width:auto;height:auto;margin:0;padding:12px 18px;clip:auto;clip-path:none;overflow:visible;white-space:normal;z-index:100000;background:#000;color:#fff;border-radius:8px;font:600 15px/1.2 system-ui,sans-serif;text-decoration:none;outline:3px solid #fff;outline-offset:2px}</style>`
      // The target is rendered AFTER this widget, so a bare inline script finds nothing — the
      // tabindex has to be set once the document is parsed (verified with a live DOM probe: the
      // immediate version left tabindex unset on every page).
      + `<script>(function(){var s=${JSON.stringify(target)},f=function(){var t=document.getElementById(s);if(t&&!t.hasAttribute("tabindex"))t.setAttribute("tabindex","-1")};"loading"===document.readyState?document.addEventListener("DOMContentLoaded",f):f()})()</script>`,
  },
  styles: {}, elements: [],
});

/**
 * A site-wide focus-visible indicator (WCAG 2.2 SC 2.4.7 Focus Visible, AA + 1.4.11 Non-text
 * Contrast, AA). Elementor's atomic base styles do not ship one, and the browser default outline
 * disappears against most brand backgrounds. Two-tone (dark ring + light halo) so it stays visible
 * on both light and dark surfaces without knowing the palette.
 */
export const focusRing = ({ color = '#1a1a1a', halo = '#ffffff', width = 3 } = {}) => ({
  id: freshId(), elType: 'widget', widgetType: 'html',
  settings: {
    html: `<style>:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:${width}px solid ${color}!important;outline-offset:2px!important;box-shadow:0 0 0 ${width + 2}px ${halo}!important;border-radius:3px}</style>`,
  },
  styles: {}, elements: [],
});

/**
 * Make an overflow-scrolling container reachable and operable from the keyboard
 * (WCAG 2.2 SC 2.1.1 Keyboard, Level A — axe reports this as `scrollable-region-focusable`).
 *
 * A horizontally-scrolling filmstrip whose cards are plain text has no focusable descendant, so a
 * keyboard-only reader can never scroll it and simply cannot reach the content past the fold. The
 * fix is one `tabindex="0"` on the scroller: once focused, the browser's own arrow-key scrolling
 * takes over — no scripted key handling, no focus trap.
 *
 * Why a script and not an attribute: `settings.attributes` is dropped wholesale by free Elementor's
 * null transformer (see the note at the top of this section), so `tabindex` cannot ride on the
 * element itself on a free install. The classic html widget's markup DOES render on every tier,
 * which is the same carrier `skipLink` uses.
 *
 * It applies axe's own criterion rather than trusting a hand-written selector: an element counts
 * only when it BOTH overflows AND has `overflow` auto/scroll on the overflowing axis. That
 * distinction is the whole correctness of the thing — `scrollWidth > clientWidth` is also true of
 * every `overflow:hidden` box on the page, and those cannot be scrolled by anyone, so a tab stop
 * there goes nowhere. It is re-evaluated on resize, because overflow is viewport-dependent.
 *
 * The default selector is `*` deliberately: the geometry test is the precise one, and the class
 * names a tw/raw rule compiles to are generated, so a hand-written selector is the fragile part.
 * Pass one only to narrow the search.
 *
 * `label` is optional; when given the scroller is also announced as a named region, which is what
 * lets a screen-reader user know what they have landed on. Without a label no role is set — an
 * unnamed region is not a landmark, and announcing an anonymous group is worse than silence.
 *
 * It never touches an element that is already focusable or already labelled, so authored markup
 * always wins.
 */
export const keyboardScrollable = (selector = '*', label = null) => ({
  id: freshId(), elType: 'widget', widgetType: 'html',
  settings: {
    html: `<script>(function(){var q=${JSON.stringify(String(selector))},L=${JSON.stringify(label)};`
      + `function scrollable(e){var c=getComputedStyle(e),o=/^(auto|scroll)$/;`
      + `return (e.scrollWidth>e.clientWidth+1&&o.test(c.overflowX))||(e.scrollHeight>e.clientHeight+1&&o.test(c.overflowY))}`
      + `function u(){document.querySelectorAll(q).forEach(function(e){`
      + `if(e.matches("a,button,input,select,textarea,summary,[contenteditable]"))return;`
      + `if(scrollable(e)){if(!e.hasAttribute("tabindex"))e.setAttribute("tabindex","0");`
      + `if(L&&!e.hasAttribute("aria-label")){e.setAttribute("role","region");e.setAttribute("aria-label",L)}}`
      + `else if(e.getAttribute("tabindex")==="0")e.removeAttribute("tabindex")})}`
      + `"loading"===document.readyState?document.addEventListener("DOMContentLoaded",u):u();`
      + `addEventListener("resize",u)})()</script>`,
  },
  styles: {}, elements: [],
});
