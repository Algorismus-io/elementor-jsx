/**
 * convert.mjs — DOM-JSON of a corpus component → exjsx JSX source (mechanical conversion).
 *
 * Mapping (fixed, no per-component tuning):
 *   div/section/article/ul/ol/li/header/footer/nav/main/form/figure/dl/details… → <box>
 *   h1..h6 → <heading tag>   ·   p/span/a/label/dt/dd/figcaption/blockquote/summary/button → <text>
 *   img → <img>   ·   svg → <html> carrier (classes compiled to an inline style attr)
 *   input/select/textarea → <html> carrier
 *
 * className → tw, with two deterministic pre-passes:
 *   1. BREAKPOINT RESOLUTION AT 1280px: the harness measures a single desktop viewport, so the
 *      mobile-first prefixes are statically resolved the way the CSS cascade would at 1280 —
 *      sm:/md:/lg:/xl: tokens hoist to base (in ascending breakpoint order, so later wins),
 *      2xl:/dark:/rtl: are inactive and drop (counted `inactive`, NOT skipped — the reference
 *      render doesn't apply them either). max-* / hover: / focus: pass through (tw supports them).
 *   2. tokens the tw compiler THROWS on (before:/after:, group-hover:, gradient synthesis,
 *      theme-var colors, unknown utilities…) → per-component `skipped` list; the harness measures
 *      what the supported subset achieves.
 *
 * ENVIRONMENT NEUTRALIZATION (documented, applies to every component equally):
 *   - WP themes style widgets directly (the bench injects Manrope 21.76px/300), while the
 *     reference page is Tailwind preflight (system-ui 16px/400). The converter therefore PINS the
 *     inheritance-resolved typography (font/size/weight/color/lh/ls) on every text leaf, computed
 *     ONLY from tw tokens + the preflight base — never from anything tw couldn't express.
 *   - `flex` with no direction token gets an explicit `flex-row` appended: Tailwind's default
 *     flex-direction is row, but tw→box defaults to column (documented in RESULTS.md as a real
 *     integration divergence — the compensation is counted per component as `flexRowFixups`).
 *   - box children of a row get w="hug" when unsized (box() otherwise forces flex:1 on them,
 *     which is not Tailwind's `width:auto` semantics).
 *   - boxes get pad={0} gap={0} unless a padding/gap token exists (plain divs have neither;
 *     Elementor defaults differ).
 */
import { twToSx } from '../../../src/tw.mjs';

/* font is tracked as a tw TOKEN and appended to each text leaf's tw string: the compiler's own
 * raw font-family path emits a valid unquoted stack, while a font= sx prop would quote the whole
 * stack as one family name (invalid CSS → browser serif fallback; found by the first run). */
const PREFLIGHT = { size: 16, weight: 400, color: '#000000', lh: 1.5, ls: 0, font: 'font-sans', ta: null };
const FONT_TOKENS = new Set(['font-sans', 'font-serif', 'font-mono']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const TEXTUAL = new Set(['p', 'a', 'span', 'label', 'figcaption', 'blockquote', 'summary', 'dt', 'dd', 'cite', 'button', 'li', 'em', 'strong', 'legend', 'time']);
const INLINE = new Set(['em', 'strong', 'br', 'span', 'a']);
const CARRIER_INPUT = new Set(['input', 'select', 'textarea']);

/* ── token machinery ── */

/** split a Tailwind token on ':' outside brackets ("lg:hover:bg-[url(a:b)]" → [lg,hover,bg-[…]]) */
function segments(tok) {
  const out = []; let cur = ''; let depth = 0;
  for (const ch of tok) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ':' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const RANK = { sm: 1, md: 2, lg: 3, xl: 4 };
// never active in this render on EITHER side: 1280px light-scheme document with no dir attribute
// (Tailwind v3 ltr:/rtl: require [dir=…] on an ancestor; dark: requires the dark class/scheme)
const INACTIVE = new Set(['2xl', 'dark', 'rtl', 'ltr']);

/**
 * className → { kept[], skipped[], inactive[], o } for ONE element.
 * kept = compilable tokens in cascade-correct order; o = twToSx() of the joined result.
 */
export function resolveClasses(classStr, ctx = {}) {
  const kept = []; const skipped = []; const inactive = [];
  for (const rawTok of String(classStr || '').trim().split(/\s+/).filter(Boolean)) {
    const segs = segments(rawTok);
    const util = segs.pop();
    let rank = 0; const keepPre = []; let drop = false;
    for (const pre of segs) {
      if (RANK[pre]) { rank = Math.max(rank, RANK[pre]); continue; } // active at 1280 → hoist
      if (INACTIVE.has(pre)) { drop = true; break; }
      keepPre.push(pre);                                             // hover/focus/max-*/before/… — tw decides
    }
    if (drop) { inactive.push(rawTok); continue; }
    const candidate = [...keepPre, util].join(':');
    try { twToSx(candidate); kept.push({ tok: candidate, rank }); }
    catch { skipped.push(rawTok); }
  }
  kept.sort((a, b) => a.rank - b.rank); // stable: base < sm < md < lg < xl (cascade winner last)
  let toks = kept.map((k) => k.tok);
  // flex with no direction → Tailwind means ROW; box() would default to column
  let flexRowFixup = false;
  if (toks.some((t) => t === 'flex' || t === 'inline-flex') && !toks.some((t) => /^flex-(row|col)/.test(t))) {
    toks = [...toks, 'flex-row'];
    flexRowFixup = true;
  }
  // combined-compile safety net: interactions between tokens can still throw (rare)
  let o = {};
  for (let i = 0; i < 10; i++) {
    try { o = twToSx(toks.join(' ')); break; }
    catch (e) {
      const m = /token "([^"]+)"/.exec(e.message);
      const bad = m && toks.find((t) => t.includes(m[1]));
      if (!bad) { skipped.push(`(combine) ${e.message.slice(0, 80)}`); toks = []; o = {}; break; }
      toks = toks.filter((t) => t !== bad);
      skipped.push(bad);
    }
  }
  return { kept: toks, skipped, inactive, o, flexRowFixup };
}

/* ── sx-shorthand → plain CSS text (for <html> carriers: svg, input) ── */
const px = (v) => (typeof v === 'number' ? `${v}px` : typeof v === 'object' ? v.css : v);
export function sxToCss(o) {
  const d = [];
  const boxSides = (v) => Array.isArray(v)
    ? v.map(px).join(' ')
    : typeof v === 'object'
      ? null // partial — emitted per side below
      : px(v);
  if (o.display) d.push(`display: ${o.display}`);
  if (o.dir) d.push(`flex-direction: ${o.dir}`);
  if (o.align) d.push(`align-items: ${o.align}`);
  if (o.justify) d.push(`justify-content: ${o.justify}`);
  if (o.wrap) d.push(`flex-wrap: ${o.wrap}`);
  if (o.gap != null) d.push(`gap: ${px(o.gap)}`);
  if (o.flex != null) d.push(`flex: ${o.flex}`);
  for (const [k, name] of [['pad', 'padding'], ['m', 'margin']]) {
    if (o[k] == null) continue;
    const v = boxSides(o[k]);
    if (v != null) d.push(`${name}: ${v}`);
    else for (const [s, side] of [['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left']]) if (o[k][s] != null) d.push(`${name}-${side}: ${px(o[k][s])}`);
  }
  if (o.w != null) d.push(`width: ${o.w === 'hug' ? 'fit-content' : px(o.w)}`);
  if (o.h != null) d.push(`height: ${px(o.h)}`);
  if (o.maxw != null) d.push(`max-width: ${px(o.maxw)}`);
  if (o.minh != null) d.push(`min-height: ${px(o.minh)}`);
  if (o.bg) d.push(`background: ${o.bg}`);
  if (o.color) d.push(`color: ${o.color}`);
  if (o.size != null) d.push(`font-size: ${px(o.size)}`);
  if (o.weight != null) d.push(`font-weight: ${o.weight}`);
  if (o.font) d.push(`font-family: ${o.font}`);
  if (o.lh != null) d.push(`line-height: ${typeof o.lh === 'number' && o.lh <= 4 ? o.lh : px(o.lh)}`);
  if (o.ls != null) d.push(`letter-spacing: ${o.ls}em`);
  if (o.ta) d.push(`text-align: ${o.ta}`);
  if (o.radius != null) d.push(`border-radius: ${px(o.radius)}`);
  if (o.border) d.push(`border: ${px(o.border[0])} solid ${o.border[1]}`);
  if (o.shadow) d.push(`box-shadow: 0 ${o.shadow[0]}px ${o.shadow[1]}px ${o.shadow[2]}px ${o.shadow[3]}`);
  if (o.pos) d.push(`position: ${o.pos}`);
  if (o.fit) d.push(`object-fit: ${o.fit}`);
  if (o.span != null) d.push(`grid-column: span ${o.span}`);
  if (o.gridCols != null) d.push(`display: grid; grid-template-columns: ${typeof o.gridCols === 'number' ? `repeat(${o.gridCols}, 1fr)` : o.gridCols}`);
  let css = d.join('; ');
  if (o.raw) css += (css ? '; ' : '') + o.raw.replace(/&[^{]*\{[^}]*\}/g, ''); // state blocks can't inline
  return css.trim();
}

/* ── conversion ── */

const isText = (n) => n.text != null;
const collapse = (s) => s.replace(/\s+/g, ' ');
const escHtml = (s) => s; // DOM-JSON text is already decoded; para content is html-v3 — re-escape angle brackets
const escT = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function isInlineEl(n) {
  if (isText(n)) return true;
  if (!INLINE.has(n.tag)) return false;
  return (n.children || []).every(isInlineEl);
}
const textLike = (n) => (n.children || []).every(isInlineEl) && (n.children || []).some((c) => isText(c) || INLINE.has(c.tag));

/** flatten inline content to an html-v3 string (em/strong/br survive; span/a classes are dropped → skipped) */
function inlineText(n, sink) {
  let out = '';
  for (const c of n.children || []) {
    if (isText(c)) { out += escT(collapse(c.text)); continue; }
    if (c.tag === 'br') { out += '<br>'; continue; }
    if (c.tag === 'em' || c.tag === 'strong') {
      if (c.attrs?.class) for (const t of c.attrs.class.split(/\s+/).filter(Boolean)) sink(`inline <${c.tag}>: ${t}`);
      out += `<${c.tag}>${inlineText(c, sink)}</${c.tag}>`;
      continue;
    }
    // span/a inline runs: exjsx text intrinsics have no styled inline spans — content survives, styling doesn't
    if (c.attrs?.class) for (const t of c.attrs.class.split(/\s+/).filter(Boolean)) sink(`inline <${c.tag}>: ${t}`);
    out += inlineText(c, sink);
  }
  return out;
}

const jstr = (s) => JSON.stringify(String(s));
const IND = (n) => '  '.repeat(n);

export function convertComponent(domRoot, { placeholderNote } = {}) {
  const skipped = []; const inactive = []; const notes = [];
  let flexRowFixups = 0;
  const sink = (t) => skipped.push(t);

  const resolve = (el) => {
    const r = resolveClasses(el.attrs?.class);
    skipped.push(...r.skipped);
    inactive.push(...r.inactive);
    if (r.flexRowFixup) flexRowFixups++;
    return r;
  };

  /** typography pins for a text leaf: own tw values win, else inherited, else preflight */
  const pins = (o, ctx) => {
    const eff = {
      size: typeof o.size === 'number' ? o.size : ctx.size,
      weight: o.weight ?? ctx.weight,
      color: typeof o.color === 'string' ? o.color : ctx.color,
      ls: o.ls ?? ctx.ls,
      ta: o.ta ?? ctx.ta,
    };
    let s = ` size={${JSON.stringify(eff.size)}} weight={${JSON.stringify(eff.weight)}} color={${jstr(eff.color)}} ls={${JSON.stringify(eff.ls)}}`;
    // line-height: own leading-* wins; an own text-SIZE token gets `normal` (what tw's output does
    // on a neutral page — Tailwind pairs sizes with line-heights, tw.mjs doesn't: measured, not
    // masked); otherwise the inherited/preflight value.
    if (o.lh != null) s += ` lh={${JSON.stringify(o.lh)}}`;
    else if (typeof o.size === 'number') s += ' raw={"line-height: normal;"}';
    else s += ` lh={${JSON.stringify(ctx.lh)}}`;
    if (eff.ta) s += ` ta={${jstr(eff.ta)}}`;
    return s;
  };

  const childCtx = (o, kept, ctx) => {
    const next = { ...ctx };
    if (typeof o.size === 'number') next.size = o.size;
    if (o.weight != null) next.weight = o.weight;
    if (typeof o.color === 'string') next.color = o.color;
    if (o.lh != null) next.lh = o.lh;
    if (o.ls != null) next.ls = o.ls;
    if (o.ta) next.ta = o.ta;
    for (const t of kept) if (FONT_TOKENS.has(t)) next.font = t;
    return next;
  };

  const twAttr = (kept) => (kept.length ? ` tw=${JSON.stringify(kept.join(' '))}` : '');
  /** leaf tw = own tokens + the inherited font token (per-leaf: WP themes style widgets directly,
   * so CSS inheritance from the root can't deliver the font) */
  const leafTw = (kept, ctx) => twAttr(kept.some((t) => FONT_TOKENS.has(t)) ? kept : [...kept, ctx.font]);

  /** hoist single inline span/a wrapper: <li><a class=…>text</a></li> keeps the a's styling */
  const hoist = (el) => {
    let cur = el; let href = cur.attrs?.href;
    while (true) {
      const kids = (cur.children || []).filter((c) => !isText(c) || c.text.trim());
      if (kids.length === 1 && !isText(kids[0]) && (kids[0].tag === 'a' || kids[0].tag === 'span') && textLike(kids[0])
          && (cur.children || []).filter(isText).every((t) => !t.text.trim())) {
        const inner = kids[0];
        cur = { ...inner, attrs: { ...inner.attrs, class: [cur.attrs?.class, inner.attrs?.class].filter(Boolean).join(' ') } };
        href = href ?? inner.attrs?.href;
      } else break;
    }
    return { el: cur, href };
  };

  const conv = (el, ctx, depth, { inRow = false, inFlexCol = false, isRoot = false } = {}) => {
    const pad = IND(depth);
    if (isText(el)) {
      const t = collapse(el.text);
      if (!t.trim()) return null;
      return `${pad}<text${leafTw([], ctx)}${pins({}, ctx)}>{${jstr(t.trim())}}</text>`;
    }
    const tag = el.tag;

    if (tag === 'svg') {
      const { o } = resolve(el);
      let svg = el.outer || '';
      const css = sxToCss(o);
      if (css) svg = svg.replace(/^<svg/, `<svg style=${JSON.stringify(css.replace(/"/g, "'"))}`);
      return `${pad}<html raw={${jstr(svg)}} />`;
    }

    if (tag === 'img') {
      const { kept, o } = resolve(el);
      let attrs = twAttr(kept) + ` src={${jstr(el.attrs?.src || '')}}`;
      const hasW = kept.some((t) => /^(w-|size-)/.test(t)); const hasH = kept.some((t) => /^(h-|size-)/.test(t));
      if (!hasW && el.attrs?.width) attrs += ` w={${Number(el.attrs.width)}}`;
      if (!hasH && el.attrs?.height) attrs += ` h={${Number(el.attrs.height)}}`;
      if (el.attrs?.alt) attrs += ` alt={${jstr(el.attrs.alt)}}`;
      return `${pad}<img${attrs} />`;
    }

    if (CARRIER_INPUT.has(tag)) {
      const { o } = resolve(el);
      const FONT_CSS = { 'font-sans': 'ui-sans-serif, system-ui, sans-serif', 'font-serif': 'ui-serif, Georgia, serif', 'font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace' };
      const eff = { size: typeof o.size === 'number' ? o.size : 14, font: FONT_CSS[ctx.font] || FONT_CSS['font-sans'], color: typeof o.color === 'string' ? o.color : ctx.color };
      const css = `${sxToCss(o)}; font-size: ${eff.size}px; font-family: ${eff.font}; color: ${eff.color}; box-sizing: border-box`.replace(/^; /, '');
      const a = el.attrs || {};
      const html = `<${tag}${a.type ? ` type="${a.type}"` : ''}${a.placeholder ? ` placeholder="${a.placeholder}"` : ''} style="${css.replace(/"/g, "'")}" />`;
      return `${pad}<html raw={${jstr(html)}} />`;
    }

    // details: static render of a CLOSED disclosure shows only the summary
    let children = el.children || [];
    if (tag === 'details' && el.attrs?.open == null) children = children.filter((c) => c.tag === 'summary');

    // single inline wrapper hoist (li>a, div>span…)
    const hoisted = hoist({ ...el, children });
    const H = hoisted.el; const href = hoisted.href;
    const { kept, o } = resolve(H);

    // the textual/box decision follows the HOISTED element (a div wrapping a single styled <a>
    // becomes one text leaf carrying both class lists)
    const effTag = H !== el && TEXTUAL.has(H.tag) && !TEXTUAL.has(tag) && !HEADINGS.has(tag) ? H.tag : tag;
    const isHeading = HEADINGS.has(effTag);
    // ANY textLike element flattens to one text leaf — a div holding only inline runs
    // ("Mary Sullivan <span>/</span> <a>CTO</a>") is one line in CSS flow; separate widgets
    // would stack vertically. EXCEPT when an inline child is styled like a box (a button-row div
    // of bg-/padding-carrying <a>s must stay a container or the buttons lose their chrome).
    const boxyInline = (n) => !isText(n) && (
      (n.attrs?.class || '').split(/\s+/).some((t) => /^(bg-|p[trblxy]?-\d|px-|py-|border|rounded|shadow|inline-block|inline-flex)/.test(t.replace(/^[a-z-]+:/, '')))
      || (n.children || []).some(boxyInline));
    const textual = isHeading || TEXTUAL.has(effTag)
      || (textLike(H) && (H.children || []).some((c) => INLINE.has(c.tag) || (isText(c) && c.text.trim())) && !(H.children || []).some(boxyInline));
    if (textual && textLike(H)) {
      const content = inlineText(H, sink).trim();
      let extra = href ? ` href={${jstr(href)}}` : '';
      // inline-block/inline-flex leaves shrink to content in the reference's BLOCK flow; inside an
      // explicit flex column/grid the reference blockifies+stretches them too, so no hug there.
      if ((o.display || '').startsWith('inline') && !o.w && !inFlexCol) {
        extra += ' w={"hug"}';
        if ((o.ta ?? ctx.ta) === 'center') {
          const tb = (v, side) => (typeof v === 'number' ? v : Array.isArray(v) ? (side === 't' ? v[0] : v[2] ?? v[0]) : v?.[side] ?? 0);
          extra += ` m={${JSON.stringify([tb(o.m, 't') || 0, 'auto', tb(o.m, 'b') || 0, 'auto'])}}`;
        }
      }
      if (isHeading) return `${pad}<heading tag={${jstr(effTag)}}${leafTw(kept, ctx)}${pins(o, ctx)}${extra}>{${jstr(content)}}</heading>`;
      return `${pad}<text${leafTw(kept, ctx)}${pins(o, ctx)}${extra}>{${jstr(content)}}</text>`;
    }

    // container → box
    const toks = [...kept];
    const hasPad = toks.some((t) => /^-?p([trblxyse])?-/.test(t));
    const hasGap = toks.some((t) => /^gap-/.test(t) || /^space-[xy]-/.test(t));
    let attrs = twAttr(toks);
    if (isRoot) attrs += ' id={"corpus-root"} w={"100%"}';
    if (!hasPad) attrs += ' pad={0}';
    if (!hasGap && !toks.some((t) => t.startsWith('grid-cols'))) attrs += ' gap={0}';
    // Tailwind row children default to width:auto; box() forces flex:1 on unsized children
    const sized = toks.some((t) => /^(w-|size-|flex-1$|grow$|basis-|max-w-|flex-auto$|flex-none$)/.test(t));
    // CSS absolute elements AND inline-level boxes shrink-wrap; an unsized e-con stretches instead
    const absHug = o.pos === 'absolute' && o.w == null && !toks.some((t) => /^(w-|size-|inset)/.test(t));
    const inlineHug = (o.display || '').startsWith('inline') && o.w == null && !inFlexCol && !toks.some((t) => /^(w-|size-)/.test(t));
    if (((inRow && !sized) || absHug || inlineHug) && !isRoot) attrs += ' w={"hug"}';
    if (inlineHug && (o.ta ?? ctx.ta) === 'center' && o.m == null && !toks.includes('mx-auto')) attrs += ' center={true}';
    if (href) attrs += ` href={${jstr(href)}}`;
    const isGrid = o.display === 'grid' || o.gridCols != null || toks.some((t) => t.startsWith('grid-cols'));
    const dirRow = !isGrid && ((o.dir || '').startsWith('row') || (!o.dir && (o.display === 'flex' || o.display === 'inline-flex')));
    const explicitFlex = isGrid || o.display === 'flex' || o.display === 'inline-flex';
    const nextCtx = childCtx(o, kept, ctx);
    const inner = (H.children || []).map((c) => conv(c, nextCtx, depth + 1, { inRow: dirRow, inFlexCol: explicitFlex && !dirRow })).filter(Boolean);
    // assertTree rejects EMPTY absolute containers (editor-click blockers) — emit the equivalent
    // decoration as an html carrier with the compiled CSS inlined instead
    if (!inner.length && o.pos === 'absolute') {
      const css = sxToCss(o);
      return `${pad}<html raw={${jstr(`<div style="${css.replace(/"/g, "'")}"></div>`)}} />`;
    }
    if (!inner.length) return `${pad}<box${attrs} />`;
    return `${pad}<box${attrs}>\n${inner.join('\n')}\n${pad}</box>`;
  };

  const jsx = conv(domRoot, { ...PREFLIGHT }, 1, { isRoot: true });
  return { jsx, skipped, inactive, notes, flexRowFixups };
}
