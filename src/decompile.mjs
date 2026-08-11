/**
 * decompile.mjs — INVERSE of the forward pipeline: an Elementor V4 atomic `_elementor_data` tree
 * → readable elementor-jsx source. Works on ANY atomic tree, not just ones this framework built.
 *
 * Strategy for FAITHFUL round-trip (decompile → build → equivalent tree):
 *   - Structure: e-flexbox→<box>/<row>, e-grid→<grid cols rows>, e-heading→<heading>,
 *     e-paragraph→<text>, e-image→<img>, html→<html raw>, e-button→<Button>, unknown
 *     widget/element (e-form family incl. its success/error messages…)→<Raw> (verbatim passthrough).
 *   - Styling: each node's local style props are inverted to the `sx` shorthand where a clean shorthand
 *     exists; everything else (variable refs, rare props) is emitted verbatim inside `props={{…}}`,
 *     which sx() spreads unchanged. So no styling is ever lost — pretty where possible, exact always.
 *   - Global classes (g-*) are kept as `cls` refs; their definitions live in the sidecar classes file.
 *   - custom_css (base64) is decoded to a `raw="…"` CSS string. Breakpoints (_t/_m) → tablet/mobile.
 *   - STATE variants (hover/active/focus/focus-visible/checked) invert to state props:
 *     hover={{ …sx, tablet: {…}, raw: "…" }} — incl. per-state custom_css and non-desktop
 *     breakpoints. The two e-- class states (e--selected/e--disabled) have no JSX spelling, so a
 *     node carrying one round-trips verbatim as <Raw> (zero loss, kit-only territory).
 *   - settings.attributes (the key-value envelope) inverts to attrs={{…}}.
 */

const b64d = (s) => Buffer.from(s, 'base64').toString('utf8');
const q = (s) => JSON.stringify(String(s));   // robust JS-string literal (escapes quotes, newlines, unicode)
const isVar = (v) => v && v.$$type && /-variable$/.test(v.$$type);

/* ── typed atomic value → a JS literal, or null when it can't be represented EXACTLY as shorthand
 *    (keyword widths like fit-content, exotic units) → caller falls back to verbatim props passthrough. */
function cleanSize(v) {
  if (!v) return null;
  const { size, unit } = v;
  if (typeof size !== 'number' || !isFinite(size)) return null;      // keyword sizes → passthrough
  if (unit === 'px' || unit == null) return String(size);
  if (['%', 'em', 'rem', 'vw', 'vh'].includes(unit)) return q(`${size}${unit}`);
  return null;                                                        // exotic unit → passthrough
}
const sizeToVal = (v) => cleanSize(v) ?? '0';
// Elementor stores dimensions with LOGICAL keys; a size of unit 'auto' → 'auto', else the px number.
function dimSide(d) {
  const s = d?.value; if (!s) return '0';
  if (s.unit === 'auto') return "'auto'";
  return typeof s.size === 'number' && isFinite(s.size) ? String(s.size) : null;  // keyword → null (passthrough)
}
function dims(v) {
  const t = dimSide(v['block-start']), r = dimSide(v['inline-end']), b = dimSide(v['block-end']), l = dimSide(v['inline-start']);
  if ([t, r, b, l].some((x) => x == null)) return null;
  return { t, r, b, l };
}
function dimsToVal(v) {
  const d = dims(v); if (!d) return null;
  const { t, r, b, l } = d;
  if (t === r && r === b && b === l) return t;
  return `[${t}, ${r}, ${b}, ${l}]`;
}
// returns { key, val } for a known shorthand, or null to force props-passthrough
const SIZE = (p) => p && p.$$type === 'size';
function invertProp(prop, val) {
  const t = val && val.$$type;
  switch (prop) {
    case 'background': {
      const c = val?.value?.color;
      if (c && c.$$type === 'color') return { key: 'bg', val: q(c.value) };
      return null; // gradients / var-bg → passthrough
    }
    case 'padding': { const d = t === 'dimensions' && dimsToVal(val.value); return d ? { key: 'pad', val: d } : null; }
    case 'margin': {
      if (t !== 'dimensions') return null;
      const dd = dims(val.value); if (!dd) return null;
      if (dd.t === '0' && dd.b === '0' && dd.r === "'auto'" && dd.l === "'auto'") return { key: 'center', val: 'true' };
      return { key: 'm', val: dimsToVal(val.value) };
    }
    case 'border-radius': return (t === 'size' && val.value?.size != null) ? { key: 'radius', val: sizeToVal(val.value) } : null;
    case 'gap': { const c = SIZE(val) && cleanSize(val.value); return c ? { key: 'gap', val: c } : null; } // layout-direction handled in invertProps (two keys)
    case 'width': { const c = SIZE(val) && cleanSize(val.value); return c ? { key: 'w', val: c } : null; }   // hug/fit-content → passthrough
    case 'max-width': { const c = SIZE(val) && cleanSize(val.value); return c ? { key: 'maxw', val: c } : null; }
    case 'min-height': { const c = SIZE(val) && cleanSize(val.value); return c ? { key: 'minh', val: c } : null; }
    case 'height': { const c = SIZE(val) && cleanSize(val.value); return c ? { key: 'h', val: c } : null; }
    case 'align-items': return { key: 'align', val: q(val.value) };
    case 'justify-content': return { key: 'justify', val: q(val.value) };
    case 'flex-direction': return { key: 'dir', val: q(val.value) };
    case 'flex-wrap': return { key: 'wrap', val: q(val.value) };
    case 'color': return t === 'color' ? { key: 'color', val: q(val.value) } : null; // var color → passthrough
    case 'font-size': { const c = SIZE(val) && cleanSize(val.value); return c ? { key: 'size', val: c } : null; }
    case 'font-weight': return { key: 'weight', val: q(val.value) };
    case 'font-family': return t === 'string' ? { key: 'font', val: q(val.value) } : null;
    case 'text-align': return { key: 'ta', val: q({ start: 'left', end: 'right' }[val.value] || val.value) };
    case 'line-height': { if (!SIZE(val) || typeof val.value?.size !== 'number') return null; return { key: 'lh', val: val.value.unit === 'em' ? String(val.value.size) : (cleanSize(val.value) || null) }; }
    case 'letter-spacing': return (SIZE(val) && typeof val.value?.size === 'number') ? { key: 'ls', val: String(val.value.size) } : null;
    // span envelopes hold a NUMBER on 4.1.x-authored trees and 'span N' STRINGS on 4.2+ ones
    // (deploy adapts per target) — invert both; full-track strings ('1 / -1') → passthrough.
    case 'grid-column': case 'grid-row': {
      if (t !== 'span') return null;
      const key = prop === 'grid-column' ? 'span' : 'rowSpan';
      if (typeof val.value === 'number') return { key, val: String(val.value) };
      const m = /^span\s+(\d+)$/.exec(String(val.value));
      return m ? { key, val: m[1] } : null;
    }
    case 'position': return { key: 'pos', val: q(val.value) };
    case 'object-fit': return { key: 'fit', val: q(val.value) };
    case 'display': return { key: 'display', val: q(val.value) };
    default: return null;
  }
}

/* one grid-template value → source literal: string envelopes ('repeat(3, 1fr)' → 3, else quoted)
 * AND native grid-track-size envelopes (fr N → N, custom → quoted string); null = passthrough. */
function trackVal(v) {
  if (v?.$$type === 'grid-track-size') {
    const { unit, size } = v.value || {};
    if (unit === 'fr' && typeof size === 'number') return String(size);
    if (unit === 'custom') return q(String(size));
    return null;
  }
  if (typeof v?.value !== 'string') return null;
  const m = /^repeat\((\d+),\s*1fr\)$/.exec(v.value);
  return m ? m[1] : q(v.value);
}

/* invert a full props object → { sx: {k:src}, passthrough: {atomicProp: node} } */
function invertProps(props = {}) {
  const sx = {}; const pass = {}; let isGrid = false, gtc = null, gtr = null;
  for (const [k, v] of Object.entries(props)) {
    if (k === '_t' || k === '_m' || k === 'custom_css') continue;   // handled by caller
    if (k === 'display' && v?.value === 'flex') continue;           // box default — noise
    if (k === 'flex-direction' && v?.value === 'column') continue;  // box default — noise
    if (k === 'display' && v?.value === 'grid') { isGrid = true; continue; }
    if (k === 'grid-template-columns') { gtc = v; continue; }
    if (k === 'grid-template-rows') { gtr = v; continue; }
    // two-axis layout-direction gap → gap (equal axes) or gapX/gapY — two sx keys, so handled here
    if (k === 'gap' && v?.$$type === 'layout-direction') {
      const cs = v.value?.column ? cleanSize(v.value.column.value) : undefined;
      const rs = v.value?.row ? cleanSize(v.value.row.value) : undefined;
      if ((v.value?.column && cs == null) || (v.value?.row && rs == null)) { pass[k] = v; continue; }
      if (cs != null && rs != null && cs === rs) sx.gap = cs;
      else { if (cs != null) sx.gapX = cs; if (rs != null) sx.gapY = rs; }
      continue;
    }
    const inv = invertProp(k, v);
    if (inv) sx[inv.key] = inv.val; else pass[k] = v;   // unknown / var → verbatim passthrough
  }
  // tracks invert even WITHOUT display:grid in the same variant (mobile overrides carry only the
  // track list — they used to be silently dropped); gridCols/gridRows re-imply display:grid in sx.
  for (const [key, v, prop] of [['gridCols', gtc, 'grid-template-columns'], ['gridRows', gtr, 'grid-template-rows']]) {
    if (v == null) continue;
    const t = trackVal(v);
    if (t != null) sx[key] = t; else pass[prop] = v;
  }
  if (isGrid && gtc == null && gtr == null) sx.display = q('grid');
  return { sx, pass };
}

/* ── content extraction ── */
const htmlV3 = (v) => (v?.$$type === 'html-v3' ? (v.value?.content?.value ?? '') : (v?.value ?? ''));
const stringV = (v) => (v && typeof v === 'object' ? v.value : v);

/* ── one node → JSX source lines ── */
function emitNode(n, ind, ctx) {
  const pad = '  '.repeat(ind);
  const s = n.settings || {};
  const classes = (s.classes?.value || []).filter((c) => String(c).startsWith('g-')); // global refs → cls
  const styleId = (s.classes?.value || []).find((c) => /^e-.*-s\d*$/.test(c) || (n.styles && n.styles[c]));
  const styleObj = styleId && n.styles ? n.styles[styleId] : (n.styles ? Object.values(n.styles)[0] : null);

  // build sx from the desktop variant + collect breakpoints + custom_css → raw; STATE variants
  // (hover/…) collect into their own per-state buckets (desktop sx + tablet/mobile nests + raw).
  let sxSrc = {}, pass = {}, rawCss = '', bp = {};
  const stateSrc = {};   // state → { sx, pass, raw, tablet: {sx…}, mobile: {sx…} }
  if (styleObj) {
    for (const variant of styleObj.variants || []) {
      const state = variant.meta?.state;
      // e--selected/e--disabled: editor-machinery class states with no JSX spelling — verbatim node.
      if (state === 'e--selected' || state === 'e--disabled') {
        return `${pad}<Raw>{${JSON.stringify(n)} /* ${state} state variant — kit stateVariant() territory */}</Raw>`;
      }
      const inv = invertProps(variant.props || {});
      const cc = variant.props?.custom_css?.raw || variant.custom_css?.raw;
      const raw = cc ? b64d(cc) : '';
      const target = variant.meta?.breakpoint === 'mobile' ? '_m' : variant.meta?.breakpoint === 'tablet' ? '_t' : null;
      if (state) {
        const dst = (stateSrc[state] ??= { sx: {}, pass: {}, raw: '', tablet: null, mobile: null });
        if (!target) { dst.sx = inv.sx; dst.pass = inv.pass; if (raw) dst.raw = raw; }
        else dst[target === '_t' ? 'tablet' : 'mobile'] = { sx: inv.sx, pass: inv.pass, raw };
        continue;
      }
      if (!target) { sxSrc = inv.sx; pass = inv.pass; if (raw) rawCss = raw; }
      else bp[target] = { ...inv.sx, ...(raw ? { __raw: raw } : {}) };
    }
  }

  // native e-grid → <grid cols rows>: remap the inverted track keys to the intrinsic's props,
  // drop what the intrinsic re-emits (display:grid; rows 'auto' is its default), and bake the
  // base 10px padding explicitly when the source carried none (preserves the native render —
  // recompiled containers always set padding, per the kit's explicitness rule).
  if (n.elType === 'e-grid') {
    if (sxSrc.gridCols != null) { sxSrc.cols = sxSrc.gridCols; delete sxSrc.gridCols; }
    if (sxSrc.gridRows != null) { if (sxSrc.gridRows !== q('auto')) sxSrc.rows = sxSrc.gridRows; delete sxSrc.gridRows; }
    delete sxSrc.display;
    if (sxSrc.pad == null && !('padding' in pass)) sxSrc.pad = '10';
  }

  const attrs = [];
  const cls = classes.length ? classes.join(' ') : null;
  if (cls) attrs.push(`gcls={${q(cls)}}`);   // external global-class refs → gcls (deploy carries their defs)
  // settings.attributes (key-value envelope) → attrs={{…}} (ATTRS() re-emits it on rebuild)
  if (s.attributes?.$$type === 'attributes' && Array.isArray(s.attributes.value)) {
    const ao = {};
    for (const kv of s.attributes.value) {
      const k = kv?.value?.key?.value;
      if (k != null) ao[k] = kv?.value?.value?.value ?? '';
    }
    if (Object.keys(ao).length) attrs.push(`attrs={${JSON.stringify(ao)}}`);
  }
  // state variants → state props: hover={{ …sx, props: {…}, tablet: {…}, raw: "…" }}
  const stateObjSrc = (b) => {
    const parts = Object.entries(b.sx).map(([k, val]) => (k === 'center' ? 'center: true' : `${k}: ${val}`));
    if (Object.keys(b.pass || {}).length) parts.push(`props: ${JSON.stringify(b.pass)}`);
    for (const t of ['tablet', 'mobile']) {
      if (b[t] && (Object.keys(b[t].sx).length || Object.keys(b[t].pass || {}).length || b[t].raw)) parts.push(`${t}: ${stateObjSrc(b[t])}`);
    }
    if (b.raw) parts.push(`raw: ${q(b.raw)}`);
    return `{ ${parts.join(', ')} }`;
  };
  for (const [state, b] of Object.entries(stateSrc)) {
    const src = stateObjSrc(b);
    if (src !== '{  }') attrs.push(`${state}={${src}}`);
  }
  // interactions round-trip: emit animate={[…interaction-item envelopes…]} — interact() passes
  // pre-built envelopes through verbatim (they used to be silently DROPPED on decompile).
  const ixItems = n.interactions?.items || (typeof n.interactions === 'string' ? (JSON.parse(n.interactions || '{}').items || []) : []);
  if (ixItems.length) attrs.push(`animate={${JSON.stringify(ixItems)}}`);
  const link = s.link?.value?.href || s.link?.href || (s.link?.value?.destination);
  if (link) attrs.push(`href={${q(typeof link === 'object' ? (link.value || '') : link)}}`);
  for (const [k, val] of Object.entries(sxSrc)) attrs.push(k === 'center' ? 'center' : `${k}={${val}}`);
  if (Object.keys(bp).length) for (const [t, o] of Object.entries(bp)) {
    const parts = Object.entries(o).filter(([k]) => k !== '__raw').map(([k, val]) => `${k === 'center' ? 'center: true' : `${k.replace(/^_/, '')}: ${val}`}`);
    if (parts.length) attrs.push(`${t === '_m' ? 'mobile' : 'tablet'}={{ ${parts.join(', ')} }}`);  // skip empty breakpoints
  }
  if (Object.keys(pass).length) attrs.push(`props={${JSON.stringify(pass)}}`);
  if (rawCss) attrs.push(`raw={${q(rawCss)}}`);

  const w = n.widgetType, e = n.elType;
  const tag = stringV(s.tag);
  const A = (extra = '') => [extra, ...attrs].filter(Boolean).join(' ');

  // widgets (leaf)
  // content emitted as a single {"…"} STRING child so inline HTML (accent <span>s, <br>) survives recompile
  const isDynV = (v) => v && v.$$type === 'dynamic';
  if (w === 'html' || w === 'shortcode') return `${pad}<html raw={${q(stringV(s.html) ?? '')}} />`;
  if (w === 'e-heading') {
    const tagA = (tag && tag !== 'h2') ? `tag={${q(tag)}}` : '';
    // dynamic-bound content round-trips via dyn={…} (htmlV3() used to flatten it to '' — data loss)
    if (isDynV(s.title)) return `${pad}<heading ${A(tagA)} dyn={${JSON.stringify(s.title)}} />`;
    return `${pad}<heading ${A(tagA)}>{${q(htmlV3(s.title))}}</heading>`;
  }
  if (w === 'e-paragraph') {
    if (isDynV(s.paragraph)) return `${pad}<text ${A()} dyn={${JSON.stringify(s.paragraph)}} />`;
    return `${pad}<text ${A()}>{${q(htmlV3(s.paragraph))}}</text>`;
  }
  if (w === 'e-button') return `${pad}<Button text={${q(htmlV3(s.text))}} ${A()} />`;
  if (w === 'e-image') { const id = s.image?.value?.src?.value?.id?.value; return `${pad}<img src={${id ?? 0}} ${A()} />`; }
  // widget label rides INSIDE the expression braces — a sibling {/*…*/} block is valid JSX-children
  // syntax but INVALID JS when the node sits at the top-level array (caught by the test suite).
  if (w) return `${pad}<Raw>{${JSON.stringify(n)} /* widget:${w} */}</Raw>`;

  // container (e-flexbox / e-div-block / e-grid). OTHER container elTypes (e-form + its
  // e-form-success-message/e-form-error-message children, e-tabs family, e-collection-loop…)
  // round-trip as <Raw> — the old code emitted them as <box>, silently DROPPING the elType +
  // settings (a form decompiled into a plain div; data loss).
  if (e && e !== 'e-flexbox' && e !== 'e-div-block' && e !== 'e-grid') {
    return `${pad}<Raw>{${JSON.stringify(n)} /* element:${e} */}</Raw>`;
  }
  const isRow = sxSrc.dir === '"row"';
  const Tag = e === 'e-grid' ? 'grid' : tag === 'section' ? 'section' : 'box';
  // <grid> keeps ANY non-div tag as an attr (there's no <section>-style grid alias to absorb it)
  const tagAttr = (tag && tag !== 'div' && (Tag === 'grid' || tag !== 'section')) ? `tag=${q(tag)}` : '';
  const kids = (n.elements || []).map((c) => emitNode(c, ind + 1, ctx)).join('\n');
  if (!kids) return `${pad}<${Tag} ${A(tagAttr)} />`;
  return `${pad}<${Tag} ${A(tagAttr)}>\n${kids}\n${pad}</${Tag}>`;
}

/** Decompile a tree (array of top-level elements) → a full .jsx module source string. */
export function decompile(tree, { name = 'page', slug = 'page' } = {}) {
  // top-level siblings live in a JS ARRAY — they need commas (multi-root trees used to emit
  // invalid JS; single-root pages never hit it — caught by the test suite).
  const body = tree.map((n) => emitNode(n, 3, {})).join(',\n');
  return `import { defineSite } from '../../src/site.mjs';
import { Button, Raw } from '../../src/dcmp.mjs';
/* Decompiled from _elementor_data by exjsx decompile. Structure + local styles are inverted to
   sx/raw; global classes are kept as cls refs (defined in the sidecar classes file); anything the
   shorthand can't express is preserved verbatim in props={{…}}. Edit freely, then rebuild. */

export const ${name} = () => [
${body}
];

export default defineSite({
  name: '${name}',
  pages: [{ title: '${name}', slug: '${slug}', node: <${name} /> }],
});
`;
}
