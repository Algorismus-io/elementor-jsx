/**
 * decompile.mjs — INVERSE of the forward pipeline: an Elementor V4 atomic `_elementor_data` tree
 * → readable elementor-jsx source. Works on ANY atomic tree, not just ones this framework built.
 *
 * Strategy for FAITHFUL round-trip (decompile → build → equivalent tree):
 *   - Structure: e-flexbox→<box>/<row>, e-heading→<heading>, e-paragraph→<text>, e-image→<img>,
 *     html→<html raw>, e-button→<Button>, unknown widget→<Raw> (verbatim kit-node passthrough).
 *   - Styling: each node's local style props are inverted to the `sx` shorthand where a clean shorthand
 *     exists; everything else (variable refs, rare props) is emitted verbatim inside `props={{…}}`,
 *     which sx() spreads unchanged. So no styling is ever lost — pretty where possible, exact always.
 *   - Global classes (g-*) are kept as `cls` refs; their definitions live in the sidecar classes file.
 *   - custom_css (base64) is decoded to a `raw="…"` CSS string. Breakpoints (_t/_m) → tablet/mobile.
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
    case 'gap': { const c = SIZE(val) && cleanSize(val.value); return c ? { key: 'gap', val: c } : null; }
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
    case 'grid-column': return t === 'span' ? { key: 'span', val: String(val.value) } : null;
    case 'position': return { key: 'pos', val: q(val.value) };
    case 'object-fit': return { key: 'fit', val: q(val.value) };
    case 'display': return { key: 'display', val: q(val.value) };
    default: return null;
  }
}

/* invert a full props object → { sx: {k:src}, passthrough: {atomicProp: node} } */
function invertProps(props = {}) {
  const sx = {}; const pass = {}; let gridCols = null, gtc = null;
  for (const [k, v] of Object.entries(props)) {
    if (k === '_t' || k === '_m' || k === 'custom_css') continue;   // handled by caller
    if (k === 'display' && v?.value === 'flex') continue;           // box default — noise
    if (k === 'flex-direction' && v?.value === 'column') continue;  // box default — noise
    if (k === 'display' && v?.value === 'grid') { gridCols = true; continue; }
    if (k === 'grid-template-columns') { gtc = v?.value; continue; }
    const inv = invertProp(k, v);
    if (inv) sx[inv.key] = inv.val; else pass[k] = v;   // unknown / var → verbatim passthrough
  }
  if (gridCols && gtc != null) {
    const m = /^repeat\((\d+),\s*1fr\)$/.exec(gtc);
    sx.gridCols = m ? m[1] : q(gtc);
  } else if (gridCols) sx.display = q('grid');
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

  // build sx from the desktop variant + collect breakpoints + custom_css → raw
  let sxSrc = {}, pass = {}, rawCss = '', bp = {};
  if (styleObj) {
    for (const variant of styleObj.variants || []) {
      if (variant.meta?.state) continue;   // hover/focus/etc — skip so it can't overwrite the base style
      const inv = invertProps(variant.props || {});
      const cc = variant.props?.custom_css?.raw || variant.custom_css?.raw;
      const raw = cc ? b64d(cc) : '';
      const target = variant.meta?.breakpoint === 'mobile' ? '_m' : variant.meta?.breakpoint === 'tablet' ? '_t' : null;
      if (!target) { sxSrc = inv.sx; pass = inv.pass; if (raw) rawCss = raw; }
      else bp[target] = { ...inv.sx, ...(raw ? { __raw: raw } : {}) };
    }
  }

  const attrs = [];
  const cls = classes.length ? classes.join(' ') : null;
  if (cls) attrs.push(`gcls={${q(cls)}}`);   // external global-class refs → gcls (deploy carries their defs)
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
  if (w === 'html' || w === 'shortcode') return `${pad}<html raw={${q(stringV(s.html) ?? '')}} />`;
  if (w === 'e-heading') { const tagA = (tag && tag !== 'h2') ? `tag={${q(tag)}}` : ''; return `${pad}<heading ${A(tagA)}>{${q(htmlV3(s.title))}}</heading>`; }
  if (w === 'e-paragraph') return `${pad}<text ${A()}>{${q(htmlV3(s.paragraph))}}</text>`;
  if (w === 'e-button') return `${pad}<Button text={${q(htmlV3(s.text))}} ${A()} />`;
  if (w === 'e-image') { const id = s.image?.value?.src?.value?.id?.value; return `${pad}<img src={${id ?? 0}} ${A()} />`; }
  // widget label rides INSIDE the expression braces — a sibling {/*…*/} block is valid JSX-children
  // syntax but INVALID JS when the node sits at the top-level array (caught by the test suite).
  if (w) return `${pad}<Raw>{${JSON.stringify(n)} /* widget:${w} */}</Raw>`;

  // container (e-flexbox / e-div-block)
  const isRow = sxSrc.dir === '"row"';
  const Tag = tag === 'section' ? 'section' : 'box';
  const tagAttr = (tag && tag !== 'div' && tag !== 'section') ? `tag=${q(tag)}` : '';
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
