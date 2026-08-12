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
 *   - NATIVE COMPONENTS (SPEC 2.0 phase 3): an `e-component` instance inverts to
 *     `<PriceCard plan="Pro"/>` and the referenced component document is emitted ONCE as an
 *     exported `defineComponent(…)` above the page — see the components block below.
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

/* ── interactions inversion (SPEC 1.8) ── */
/* decode a node's `interactions` key → items array. Saved trees carry it as a JSON STRING
 * (validation.php re-encodes on save); authored trees as {version, items}. */
function interactionItemsOf(interactions) {
  let v = interactions;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
  if (!v || typeof v !== 'object') return [];
  const items = v.items?.$$type === 'array' ? v.items.value : v.items;
  return Array.isArray(items) ? items : [];
}
/* invert ONE interaction-item envelope → friendly motion-opts source (`{ trigger: 'load', … }`,
 * defaults omitted), or null when any field has no opts spelling (custom keyframes, alien keys)
 * → caller falls back to the verbatim envelope. */
function invertMotionItem(item) {
  if (item?.$$type !== 'interaction-item' || !item.value) return null;
  const v = item.value;
  if (Object.keys(v).some((k) => !['interaction_id', 'trigger', 'animation', 'breakpoints'].includes(k))) return null;
  const a = v.animation;
  if (a?.$$type !== 'animation-preset-props' || !a.value) return null;
  const av = a.value;
  if (Object.keys(av).some((k) => !['effect', 'type', 'direction', 'timing_config', 'config'].includes(k))) return null;   // custom_effect et al → verbatim
  const sv = (e) => (e?.$$type === 'string' && typeof e.value === 'string' ? e.value : null);
  const ms = (e) => (e?.$$type === 'size' && typeof e.value?.size === 'number' ? e.value.size
    : e?.$$type === 'number' && typeof e.value === 'number' ? e.value : null);
  const trigger = sv(v.trigger), effect = sv(av.effect), type = sv(av.type), direction = sv(av.direction);
  const tc = av.timing_config?.$$type === 'timing-config' ? av.timing_config.value : null;
  const duration = tc ? ms(tc.duration) : null, delay = tc ? ms(tc.delay) : null;
  if (trigger == null || effect == null || type == null || direction == null || duration == null || delay == null) return null;
  const o = [];
  if (trigger !== 'scrollIn') o.push(`trigger: ${q(trigger)}`);
  if (effect !== 'fade') o.push(`effect: ${q(effect)}`);
  if (type !== 'in') o.push(`type: ${q(type)}`);
  if (direction !== '') o.push(`direction: ${q(direction)}`);
  if (duration !== 600) o.push(`duration: ${duration}`);
  if (delay !== 0) o.push(`delay: ${delay}`);
  const cv = av.config?.value;
  if (av.config !== undefined) {
    if (av.config?.$$type !== 'config-v2' && av.config?.$$type !== 'animation-config') return null;   // animation-config = pre-1.8 emissions
    if (!cv || typeof cv !== 'object') return null;
    for (const [k, e] of Object.entries(cv)) {
      if (['easing', 'relativeTo', 'repeat'].includes(k)) { const s = sv(e); if (s == null) return null; o.push(`${k}: ${q(s)}`); }
      else if (k === 'replay') { if (e?.$$type !== 'boolean' || typeof e.value !== 'boolean') return null; o.push(`replay: ${e.value}`); }
      else if (k === 'times') { if (e?.$$type !== 'number' || typeof e.value !== 'number') return null; o.push(`times: ${e.value}`); }
      else if (k === 'start' || k === 'end') { const n2 = ms(e); if (n2 == null) return null; o.push(`${k}: ${n2}`); }
      else return null;
    }
  }
  if (v.breakpoints !== undefined) {
    const ex = v.breakpoints?.$$type === 'interaction-breakpoints' ? v.breakpoints.value?.excluded : null;
    if (ex?.$$type !== 'excluded-breakpoints' || !Array.isArray(ex.value)) return null;
    const bps = ex.value.map(sv);
    if (bps.some((b) => b == null)) return null;
    o.push(`excludeOn: [${bps.map(q).join(', ')}]`);
  }
  return `{ ${o.join(', ')} }`;
}

/* ── content extraction ── */
const htmlV3 = (v) => (v?.$$type === 'html-v3' ? (v.value?.content?.value ?? '') : (v?.value ?? ''));
const stringV = (v) => (v && typeof v === 'object' ? v.value : v);

/* ═══════════ native components — SPEC 2.0 phase 3 (the inverse of component.mjs) ═══════════
 *
 * A page that uses registered components stores `e-component` INSTANCE nodes: a component_id, an
 * overrides array, and NOTHING else (the inner tree lives in the component document and is rendered
 * server-side). Inverting one therefore needs a second source — the component document's element
 * tree + its `_elementor_component_overridable_props` registry — which arrives through an
 * INJECTABLE fetcher (`resolveComponents`), so tests never need a live site.
 *
 * The inversion, per referenced component:
 *   tree      → the `defineComponent(fn, {title, props})` body, emitted ONCE above the page;
 *   registry  → the fn's destructured parameters (names derived from the override keys when those
 *               are already valid identifiers — that keeps exjsx-authored uids byte-stable — else
 *               from the LABEL, with `key:` carrying the original wire key), their `label`/`group`
 *               and their defaults (registry `originValue`);
 *   instances → `<PriceCard plan="Pro"/>` built from each `override` envelope, and — for an
 *               instance nested INSIDE another component — `overridable`-wrapping-`override` (the
 *               chain) → prop FORWARDING from the enclosing component's own parameter.
 *
 * Inner element ids are DERIVED at render (djb2/base36 of instanceId+origin path, spec §7), so every
 * lookup keys on `origin_id` when present and never on a rendered id.
 *
 * Anything that cannot be spelled in JSX (an override landing on a prop with no JSX surface, a
 * non-literal default, an instance carrying its own styles, a component that failed to fetch) is
 * NOT forced: the component is skipped with a warning and its instances keep the verbatim `<Raw>`
 * passthrough — zero loss, exactly as before phase 3.
 */

/** Rendered inner ids are per-instance hashes; `origin_id` is the stable key (spec §7). */
const idOf = (n) => n.origin_id ?? n.id;

/** Distinct component ids an element tree references (one level — see resolveComponents). */
export function componentIdsIn(elements) {
  const ids = new Set();
  (function walk(ns) {
    for (const n of ns || []) {
      if (n.widgetType === 'e-component') {
        const v = Number(n.settings?.component_instance?.value?.component_id?.value);
        if (Number.isFinite(v) && v > 0) ids.add(v);
      }
      walk(n.elements);
    }
  })(elements);
  return [...ids];
}

/**
 * Resolve every component a tree references, TRANSITIVELY (components compose components).
 * `fetchComponent(id)` is injectable — any `(id) => {title, elements, overridable_props}` (or null).
 * A fetch that throws or answers nothing is a WARNING, never a crash: those instances stay `<Raw>`.
 */
export async function resolveComponents(elements, fetchComponent, { warn = () => {} } = {}) {
  const out = {}; const seen = new Set();
  const queue = componentIdsIn(elements);
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    let doc = null;
    try { doc = await fetchComponent(id); } catch (e) {
      warn(`component ${id}: fetch failed (${String(e?.message || e).slice(0, 140)}) — its instances stay <Raw>`);
      continue;
    }
    if (!doc || !Array.isArray(doc.elements)) {
      warn(`component ${id}: no element tree returned — its instances stay <Raw>`);
      continue;
    }
    out[id] = { id, ...doc };
    queue.push(...componentIdsIn(doc.elements));
  }
  return out;
}

/**
 * The LIVE fetcher (used by `exjsx decompile --url`): native routes first, ultra route as fallback.
 *   list      GET elementor/v1/components                        → [{id, name, uid}]   (ultra twin)
 *   registry  GET elementor/v1/components/overridable-props?…    → {data:{<id>:{props,groups}}}
 *   tree      GET elementor-ultra/v1/documents/<id>              → {data:{elements}}
 * The tree read has NO native twin — Elementor exposes list/styles/overridable-props only, so the
 * elementor-ultra-mcp plugin's document route is the one way to read a component's elements over
 * REST. Without it the registry alone cannot rebuild a definition and instances stay <Raw>.
 */
export function siteComponentFetcher({ url, auth, fetch: F = globalThis.fetch, warn = () => {} } = {}) {
  const base = String(url || '').replace(/\/$/, '');
  const head = auth ? { Authorization: auth } : {};
  const json = async (u) => { const r = await F(u, { headers: head }); return r.ok ? r.json().catch(() => null) : null; };
  let listP = null;
  const list = () => (listP ??= (async () => {
    const j = await json(`${base}/wp-json/elementor/v1/components`) || await json(`${base}/wp-json/elementor-ultra/v1/components`);
    const rows = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
    return new Map(rows.map((r) => [Number(r.id ?? r.component_id ?? r.post_id), r]));
  })());
  return async (id) => {
    const row = (await list()).get(Number(id));
    const props = await json(`${base}/wp-json/elementor/v1/components/overridable-props?componentIds%5B%5D=${encodeURIComponent(id)}`);
    const doc = await json(`${base}/wp-json/elementor-ultra/v1/documents/${encodeURIComponent(id)}`);
    const elements = doc?.data?.elements ?? doc?.elements;
    if (!Array.isArray(elements)) {
      warn(`component ${id}: elementor-ultra/v1/documents/${id} returned no tree (plugin missing? Elementor exposes no native component-tree route)`);
      return null;
    }
    return {
      title: row?.title ?? row?.name ?? `Component ${id}`,
      uid: row?.uid ?? row?.component_uid,
      elements,
      overridable_props: props?.data?.[String(id)] ?? props?.data?.[id] ?? null,
    };
  };
}

/* ── label → JS identifier ── */
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/* reserved words + the names defineComponent itself refuses per instance (`theme`, `children`) */
const RESERVED = new Set(('break case catch class const continue debugger default delete do else enum export extends false finally '
  + 'for function if implements import in instanceof interface let new null package private protected public return static super '
  + 'switch this throw true try typeof var void while with yield await async arguments eval theme children').split(' '));
/** unicode → ASCII words: NFKD + strip combining marks, then split on everything else. */
const words = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const uniq = (base, taken) => {
  let out = base; let i = 2;
  while (taken.has(out)) out = `${base}${i++}`;
  taken.add(out);
  return out;
};
/** 'Plan name' → planName · 'CTA label' → ctaLabel · '2 col' → _2Col · 'Prix Élevé' → prixEleve. */
export function identFromLabel(label, taken = new Set(), fallback = 'prop') {
  const w = words(label);
  let base = w.length ? w[0].toLowerCase() + w.slice(1).map((x) => x[0].toUpperCase() + x.slice(1)).join('') : '';
  if (/^[0-9]/.test(base)) base = `_${base}`;
  if (!base) base = fallback;
  if (RESERVED.has(base)) base = `${base}Prop`;
  return uniq(base, taken);
}
/** 'P3 Price Card' → P3PriceCard · '404 block' → C404Block. */
export function componentIdent(title, taken = new Set()) {
  const w = words(title);
  let base = w.map((x) => x[0].toUpperCase() + x.slice(1)).join('');
  if (/^[0-9]/.test(base)) base = `C${base}`;
  if (!base || RESERVED.has(base)) base = 'Component';
  return uniq(base, taken);
}

/* ── typed value → a JSX-expressible JS literal, or null when it isn't one ── */
export function valueLiteral(v) {
  if (v === null) return 'null';
  if (v === undefined) return null;
  if (typeof v === 'string') return q(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'object') return null;
  switch (v.$$type) {
    case 'html-v3': return q(String(v.value?.content?.value ?? ''));
    case 'string': return typeof v.value === 'string' ? q(v.value) : null;
    case 'number': return typeof v.value === 'number' ? String(v.value) : null;
    case 'boolean': return typeof v.value === 'boolean' ? String(v.value) : null;
    case 'url': return typeof v.value === 'string' ? q(v.value) : null;
    case 'link': { const d = v.value?.destination; return typeof d?.value === 'string' ? q(d.value) : null; }
    default: return null;
  }
}

/* settings props that HAVE a JSX spelling, per element type — an override landing anywhere else
 * (an image envelope, a form action, a Raw-only widget) cannot be re-authored as a prop. */
const LANDINGS = {
  'e-heading': ['title'],
  'e-paragraph': ['paragraph'],
  'e-button': ['text', 'link'],
  'e-component': ['component_instance'],
};

/** One fetched component document → everything the emitter needs (or `{invertible:false, reason}`). */
function analyzeComponent(raw, names) {
  const title = String(raw.title || `Component ${raw.id}`);
  const name = componentIdent(title, names);
  const reg = raw.overridable_props?.props || null;
  const groups = raw.overridable_props?.groups?.items || {};
  const out = { id: Number(raw.id), title, name, uid: raw.uid, params: {}, meta: {}, order: [], paramAt: new Map(), elements: [], invertible: false, reason: null };
  if (!reg) { out.reason = 'no overridable-props registry returned (GET /components/overridable-props)'; return out; }

  // deep-copy, then UNWRAP every `overridable` settings envelope back to its origin value while
  // recording where each override key landed (id keyed on origin_id — rendered ids are derived).
  const elements = JSON.parse(JSON.stringify(raw.elements || []));
  const landing = new Map();
  (function walk(ns) {
    for (const n of ns || []) {
      for (const [k, v] of Object.entries(n.settings || {})) {
        if (v?.$$type === 'overridable') {
          landing.set(v.value?.override_key, { elementId: idOf(n), propKey: k, type: n.widgetType ?? n.elType, origin: v.value?.origin_value });
          n.settings[k] = v.value?.origin_value;
        }
      }
      // CHAIN: a nested instance's forwarded override rides inside the overrides array, not settings
      for (const item of n.settings?.component_instance?.value?.overrides?.value || []) {
        if (item?.$$type === 'overridable') {
          landing.set(item.value?.override_key, { elementId: idOf(n), propKey: 'component_instance', type: 'e-component', origin: item.value?.origin_value?.value?.override_value });
        }
      }
      walk(n.elements);
    }
  })(elements);

  // two passes so a label-derived name can never steal an override key that IS an identifier
  const taken = new Set();
  const keys = Object.keys(reg);
  for (const k of keys) if (IDENT_RE.test(k) && !RESERVED.has(k)) taken.add(k);
  for (const k of keys) {
    const e = reg[k] || {};
    const L = landing.get(k);
    if (!L) { out.reason = `registered prop "${k}" does not appear in the component tree (registry/tree out of sync)`; return out; }
    if (!(LANDINGS[L.type] || []).includes(L.propKey)) {
      out.reason = `prop "${k}" overrides <${L.type}>.${L.propKey}, which has no JSX spelling`;
      return out;
    }
    const def = valueLiteral(e.originValue ?? L.origin);
    if (def == null) {
      out.reason = `prop "${k}" has a baseline value (${e.originValue?.$$type ?? typeof e.originValue}) with no JS literal form`;
      return out;
    }
    const param = (IDENT_RE.test(k) && !RESERVED.has(k)) ? k : identFromLabel(e.label || k, taken);
    out.params[k] = param;
    out.order.push(param);
    out.meta[param] = { label: e.label || k, group: groups[e.groupId]?.label, key: param === k ? null : k, def };
    const at = out.paramAt.get(L.elementId) || {};
    at[L.propKey] = param;
    out.paramAt.set(L.elementId, at);
  }
  out.elements = elements;
  out.invertible = true;
  return out;
}

/** All fetched documents → the emitter's component context (invertible ones only; rest are warned). */
export function analyzeComponents(docs = {}, warn = () => {}) {
  const names = new Set(); const out = {};
  for (const [id, raw] of Object.entries(docs)) {
    if (!raw) continue;
    const c = analyzeComponent({ ...raw, id: raw.id ?? Number(id) }, names);
    if (!c.invertible) {
      names.delete(c.name);
      warn(`component "${c.title}" (id ${c.id}): ${c.reason} — its instances stay <Raw> (verbatim, zero loss)`);
      continue;
    }
    out[Number(id)] = c;
  }
  return out;
}

/** One `e-component` instance node → `<PriceCard plan={"Pro"}/>`, or null → caller emits <Raw>. */
function emitInstance(n, pad, ctx) {
  const cid = Number(n.settings?.component_instance?.value?.component_id?.value);
  const c = ctx.components?.[cid];
  if (!c) return null;
  // instances render the REGISTERED tree: an instance carrying its own styles/classes/extra settings
  // has no JSX spelling (defineComponent invocations take declared props only) → verbatim <Raw>.
  const extra = Object.keys(n.settings || {}).filter((k) => k !== 'component_instance');
  if (extra.length || Object.keys(n.styles || {}).length) {
    ctx.warn(`instance of "${c.title}" (${n.id}) carries ${extra.length ? `extra settings (${extra.join(', ')})` : 'local styles'} — kept as <Raw>`);
    return null;
  }
  const attrs = [];
  for (const item of n.settings.component_instance.value?.overrides?.value || []) {
    if (item?.$$type === 'override') {
      const p = c.params[item.value?.override_key];
      if (!p) { ctx.warn(`instance of "${c.title}" (${n.id}): override "${item.value?.override_key}" is not in the component registry — dropped (Elementor drops it too)`); continue; }
      const lit = valueLiteral(item.value?.override_value);
      if (lit == null) { ctx.warn(`instance of "${c.title}" (${n.id}): override "${item.value?.override_key}" carries a ${item.value?.override_value?.$$type} envelope with no JS literal — kept as <Raw>`); return null; }
      attrs.push(`${p}={${lit}}`);
    } else if (item?.$$type === 'overridable') {
      // the CHAIN: this instance sits inside a component that forwards its own prop into it
      const inner = item.value?.origin_value;
      const childParam = c.params[inner?.value?.override_key];
      const outerParam = ctx.current?.params?.[item.value?.override_key];
      if (!childParam || !outerParam) { ctx.warn(`instance of "${c.title}" (${n.id}): unresolvable forwarding chain (${item.value?.override_key} → ${inner?.value?.override_key}) — kept as <Raw>`); return null; }
      attrs.push(`${childParam}={${outerParam}}`);
    } else { ctx.warn(`instance of "${c.title}" (${n.id}): unknown override envelope ${item?.$$type} — kept as <Raw>`); return null; }
  }
  return `${pad}<${c.name}${attrs.length ? ` ${attrs.join(' ')}` : ''} />`;
}

/** One analyzed component → its `export const X = defineComponent(…)` source. */
function emitComponentSource(c, ctx) {
  const cctx = { ...ctx, current: c, paramAt: c.paramAt };
  const body = c.elements.map((n) => emitNode(n, 2, cctx)).join(',\n');
  const params = c.order.map((p) => `${p} = ${c.meta[p].def}`).join(', ');
  const propsSrc = c.order.map((p) => {
    const m = c.meta[p];
    const bits = [`label: ${q(m.label)}`];
    if (m.group) bits.push(`group: ${q(m.group)}`);
    if (m.key) bits.push(`key: ${q(m.key)}`);   // wire override key ≠ JS parameter name
    return `      ${p}: { ${bits.join(', ')} },`;
  }).join('\n');
  const fnBody = c.elements.length === 1 ? `(\n${body}\n  )` : `[\n${body}\n  ]`;
  return `export const ${c.name} = defineComponent(
  ({ ${params} }) => ${fnBody},
  {
    title: ${q(c.title)},
    props: {
${propsSrc}
    },
  },
);`;
}

/** Definition sources in dependency order (a component is emitted after the ones it composes). */
function emitComponentSources(components, ctx) {
  const all = Object.values(components);
  const done = new Set(); const src = [];
  let left = [...all];
  while (left.length) {
    const ready = left.filter((c) => componentIdsIn(c.elements).every((d) => !components[d] || done.has(d) || d === c.id));
    const level = ready.length ? ready : left;    // cycles are impossible server-side; never loop forever
    for (const c of level) { src.push(emitComponentSource(c, ctx)); done.add(c.id); }
    left = left.filter((c) => !level.includes(c));
  }
  return src;
}

/* ── one node → JSX source lines ── */
function emitNode(n, ind, ctx) {
  const pad = '  '.repeat(ind);
  const s = n.settings || {};
  // COMPONENT INSTANCE (phase 3) — intercepted BEFORE the widget/Raw fallbacks; a null means the
  // instance isn't invertible (unresolved component, exotic override) and <Raw> takes over below.
  if (n.widgetType === 'e-component') {
    const inst = emitInstance(n, pad, ctx || {});
    if (inst) return inst;
  }
  // inside a defineComponent body, the props the registry marks overridable are emitted as the
  // function's PARAMETERS instead of their baseline literals (keyed on origin_id — spec §7)
  const param = (propKey) => ctx?.paramAt?.get(idOf(n))?.[propKey];
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
  // interactions round-trip: motion={…} — friendly opts where the envelope is fully invertible
  // (rebuilds byte-equivalent through interaction(); interaction_id is dropped, re-minted ix-N —
  // the server treats it as opaque), verbatim interaction-item envelopes otherwise (custom
  // keyframes, alien keys — interact() passes $$type:'interaction-item' through untouched).
  const ixItems = interactionItemsOf(n.interactions);
  if (ixItems.length) {
    const srcs = ixItems.map((it) => invertMotionItem(it) ?? JSON.stringify(it));
    attrs.push(`motion={${srcs.length === 1 ? srcs[0] : `[${srcs.join(', ')}]`}}`);
  }
  const link = s.link?.value?.href || s.link?.href || (s.link?.value?.destination);
  if (link) attrs.push(`href={${param('link') ?? q(typeof link === 'object' ? (link.value || '') : link)}}`);
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
    return `${pad}<heading ${A(tagA)}>{${param('title') ?? q(htmlV3(s.title))}}</heading>`;
  }
  if (w === 'e-paragraph') {
    if (isDynV(s.paragraph)) return `${pad}<text ${A()} dyn={${JSON.stringify(s.paragraph)}} />`;
    return `${pad}<text ${A()}>{${param('paragraph') ?? q(htmlV3(s.paragraph))}}</text>`;
  }
  if (w === 'e-button') return `${pad}<Button text={${param('text') ?? q(htmlV3(s.text))}} ${A()} />`;
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

/**
 * Decompile a tree (array of top-level elements) → a full .jsx module source string.
 * `components`: the fetched component documents keyed by component id (see `resolveComponents` /
 * `siteComponentFetcher`) — each referenced one is emitted ONCE as an exported `defineComponent`
 * ABOVE the page (single-module output, so the file stays copy-pasteable); without them,
 * `e-component` instances keep the verbatim `<Raw>` passthrough.
 * `warnings`: pass an array to collect what could not be inverted (also emitted as header comments).
 */
export function decompile(tree, { name = 'page', slug = 'page', components = {}, warnings } = {}) {
  const warns = warnings || [];
  const warn = (m) => { if (!warns.includes(m)) warns.push(m); };
  const analyzed = analyzeComponents(components, warn);
  const ctx = { components: analyzed, warn, current: null, paramAt: null };
  const defs = emitComponentSources(analyzed, ctx);
  // top-level siblings live in a JS ARRAY — they need commas (multi-root trees used to emit
  // invalid JS; single-root pages never hit it — caught by the test suite).
  const body = tree.map((n) => emitNode(n, 3, ctx)).join(',\n');
  return `import { defineSite } from '../../src/site.mjs';
import { Button, Raw } from '../../src/dcmp.mjs';${defs.length ? `\nimport { defineComponent } from '../../src/component.mjs';` : ''}
/* Decompiled from _elementor_data by exjsx decompile. Structure + local styles are inverted to
   sx/raw; global classes are kept as cls refs (defined in the sidecar classes file); anything the
   shorthand can't express is preserved verbatim in props={{…}}. Edit freely, then rebuild. */
${warns.length ? `${warns.map((w) => `// warn: ${w}`).join('\n')}\n` : ''}${defs.length ? `
/* Native Elementor components (SPEC 2.0): each definition below is the component DOCUMENT this
   page's e-component instances point at — edit it once, every instance follows. Props are the
   registry's overridable props (label/group as the editor shows them). */
${defs.join('\n\n')}
` : ''}
export const ${name} = () => [
${body}
];

export default defineSite({
  name: '${name}',
  pages: [{ title: '${name}', slug: '${slug}', node: <${name} /> }],
});
`;
}
