// Elementor Ultra authoring kit — structural guarantees for atomic V4 trees.
//
// Fixes the generator-pattern footguns at the source:
//   1. IDs are minted by a per-build registry — node identity is NEVER shared, and
//      reusing a node object in two places is caught locally (assertTree) before
//      any REST call. Reuse is explicit: clone(subtree) re-mints every id.
//   2. Local-style ids embed the element id and are auto-linked into
//      settings.classes — the R4 linkage rule cannot be violated by construction.
//   3. Every container primitive bakes padding:0 (the intrinsic-10px leak) and
//      assertTree() rejects any raw e-flexbox/e-div-block without an explicit padding.
//   4. emit() runs all structural checks, then writes the spec JSON for the CLI
//      (file-based — large trees never ride inline through MCP params).
//
// Usage: see reference/patterns.md. CLI: lib/cli.mjs (dry | build | replace | deploy | canvas |
// shot | audit | capture | crops | diff | fonts | font-install | upload-from-path | …).

let _n = 0;
const _seen = new Set();

/** Mint a fresh, build-unique element id. */
export function freshId() {
  let v;
  do {
    v = 'u' + (_n++).toString(36).padStart(5, '0');
  } while (_seen.has(v));
  _seen.add(v);
  return v;
}

/** Reset the id registry (one builder process = one build; call only in tests). */
export function resetIds() {
  _n = 0;
  _seen.clear();
}

/* ───────── typed-envelope constructors (verified shapes — reference/prop-shapes.md) ───────── */

export const S = (v) => ({ $$type: 'string', value: v });
export const C = (v) => ({ $$type: 'color', value: v });
export const N = (v) => ({ $$type: 'number', value: v });
export const B = (v) => ({ $$type: 'boolean', value: v });
export const SZ = (x, u = 'px') => ({ $$type: 'size', value: { unit: u, size: x } });
/** number → px size; a prebuilt size envelope (unit-suffixed sx token) passes through. */
const szv = (v) => (v?.$$type ? v : SZ(v));
export const DIM = (t, r = t, b = t, l = r) => ({
  $$type: 'dimensions',
  value: { 'block-start': szv(t), 'inline-end': szv(r), 'block-end': szv(b), 'inline-start': szv(l) },
});
export const P0 = DIM(0);
/** One dimensions side: number → px size, 'auto'/AUTO → auto, an envelope passes through. */
const side = (v) => (v === 'auto' || v === AUTO ? AUTO : v?.$$type ? v : SZ(v));
/**
 * Margin helper (CSS shorthand order: top, right, bottom, left — physical→logical mapped).
 * Sides accept numbers (px), 'auto'/AUTO (centering — `M(0,'auto')`), or any size envelope.
 */
export const M = (t, r = t, b = t, l = r) => ({
  $$type: 'dimensions',
  value: { 'block-start': side(t), 'inline-end': side(r), 'block-end': side(b), 'inline-start': side(l) },
});
/**
 * PARTIAL dimensions: only the given sides are emitted; unset sides inherit (base breakpoint /
 * element default). Live-verified 2026-07-23 (:8915 dry-run + rendered CSS): a partial envelope
 * validates AND renders per-side (`padding-block-start` alone, `margin-inline: auto` on mobile).
 * This is what makes axis spacing (`py-16`, `mx-auto`) atomic inside responsive variants.
 */
export const PDIM = ({ t, r, b, l }) => ({
  $$type: 'dimensions',
  value: {
    ...(t !== undefined ? { 'block-start': side(t) } : {}),
    ...(r !== undefined ? { 'inline-end': side(r) } : {}),
    ...(b !== undefined ? { 'block-end': side(b) } : {}),
    ...(l !== undefined ? { 'inline-start': side(l) } : {}),
  },
});
export const RAD = (r) => ({
  $$type: 'border-radius',
  value: { 'start-start': szv(r), 'start-end': szv(r), 'end-end': szv(r), 'end-start': szv(r) },
});
/**
 * Grid track list for e-grid's grid-template-columns/rows ($$type 'grid-track-size' — verified
 * against grid-track-size-prop-type.php + its transformer, Elementor 4.2.1). Number N → N equal
 * fr tracks (renders `repeat(N, 1fr)` via Grid_Track_Renderer); string → CUSTOM track list
 * verbatim ('240px 1fr 1fr', 'auto'). 4.2+ ONLY: the 4.1.x style schema has no grid-track-size
 * (plain string envelopes still validate everywhere — the sx gridCols path).
 */
export const TRACKS = (v) => {
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 1) throw new Error(`TRACKS: ${v} — fr track count must be a positive integer (repeat(N, 1fr)); custom lists go as strings`);
    return { $$type: 'grid-track-size', value: { unit: 'fr', size: v } };
  }
  return { $$type: 'grid-track-size', value: { unit: 'custom', size: String(v) } };
};
/**
 * Two-axis gap ($$type 'layout-direction', {column, row} of sizes — verified against
 * layout-direction-prop-type.php; Multi_Props_Transformer renders column-gap/row-gap and
 * isset-filters, so a SINGLE axis is legal). Numbers are px; size envelopes pass through.
 * Validates on 4.1.4 too (gap is a Union of layout-direction | size in both schemas).
 */
export const GAPXY = (x, y = x) => ({
  $$type: 'layout-direction',
  value: { ...(x != null ? { column: szv(x) } : {}), ...(y != null ? { row: szv(y) } : {}) },
});
/** Top-corners-only radius (cards over flush footers, tab headers). */
export const RADT = (r) => ({
  $$type: 'border-radius',
  value: { 'start-start': SZ(r), 'start-end': SZ(r), 'end-end': SZ(0), 'end-start': SZ(0) },
});
/** Bottom-corners-only radius. */
export const RADB = (r) => ({
  $$type: 'border-radius',
  value: { 'start-start': SZ(0), 'start-end': SZ(0), 'end-end': SZ(r), 'end-start': SZ(r) },
});
export const BG = (c) => ({ $$type: 'background', value: { color: C(c) } });
export const GRAD = (angle, c1, c2) => {
  // Defense against the string-spread trap: GRAD(...'linear-gradient(…)') calls this with
  // angle:'l', c1:'i', c2:'n' — the characters of the string. Shipped as a real 400 once.
  const a = Number(angle);
  if (!Number.isFinite(a)) throw new Error(`GRAD: angle '${angle}' is not a number (degrees) — for CSS gradient strings use raw="background-image:…;"`);
  if ([c1, c2].some((c) => typeof c === 'string' && c.length < 3)) throw new Error(`GRAD: '${c1}'/'${c2}' don't look like colors — expected [angle, from, to]`);
  return GRAD_(a, c1, c2);
};
const GRAD_ = (angle, c1, c2) => ({
  $$type: 'background',
  value: {
    'background-overlay': {
      $$type: 'background-overlay',
      value: [
        {
          $$type: 'background-gradient-overlay',
          value: {
            type: S('linear'),
            angle: N(angle),
            stops: {
              $$type: 'gradient-color-stop',
              value: [
                { $$type: 'color-stop', value: { color: C(c1), offset: N(0) } },
                { $$type: 'color-stop', value: { color: C(c2), offset: N(100) } },
              ],
            },
          },
        },
      ],
    },
  },
});
export const SHADOW = (v, blur, spread, color, h = 0) => ({
  $$type: 'box-shadow',
  value: [
    {
      $$type: 'shadow',
      value: { hOffset: SZ(h), vOffset: SZ(v), blur: SZ(blur), spread: SZ(spread), color: C(color) },
    },
  ],
});
/** Hug width — containers default to width:100%; use this on any container child of a flex ROW. */
export const HUG = { $$type: 'size', value: { unit: 'custom', size: 'fit-content' } };
export const AUTO = { $$type: 'size', value: { unit: 'auto', size: null } };
export const HTML = (t) => ({ $$type: 'html-v3', value: { content: S(t), children: [] } });
export const LINK = (href, blank = false) => ({
  $$type: 'link',
  // a dynamic tag (e.g. dyn.postUrl()) nests at destination — the only accepted placement (live-probed)
  value: { destination: (href && href.$$type === 'dynamic') ? href : { $$type: 'url', value: href }, isTargetBlank: B(blank) },
});
export const CLS = (a) => ({ $$type: 'classes', value: a });
/** e-image src — id XOR url enforced by construction. */
export const IMG_ID = (attachmentId, size = 'full') => ({
  $$type: 'image',
  value: {
    src: {
      $$type: 'image-src',
      value: { id: { $$type: 'image-attachment-id', value: attachmentId }, url: null },
    },
    size: S(size),
  },
});
/** e-image src by URL — supports INLINE alt (the transformer reads src.alt for url images;
 * id-based images take alt from the attachment's _wp_attachment_image_alt instead — verified
 * against atomic-image + image-transformer 4.1.4). id-XOR-url holds: id null here. */
export const IMG_URL = (url, alt = '', size = 'full') => {
  // the PHP Url_Prop_Type REJECTS relative paths (live-probed: absolute OK, "/wp-…" 422s) — fail at build.
  if (!/^https?:\/\//.test(url)) throw new Error(`IMG_URL: "${url}" — url-src images need an ABSOLUTE http(s) URL (relative paths fail the PHP validator; media-map urls are absolute)`);
  return {
    $$type: 'image',
    value: {
      src: { $$type: 'image-src', value: { id: null, url: { $$type: 'url', value: url }, ...(alt ? { alt: S(alt) } : {}) } },
      size: S(size),
    },
  };
};
export const SVG_ID = (attachmentId) => ({
  $$type: 'svg-src',
  value: { id: { $$type: 'image-attachment-id', value: attachmentId }, url: null },
});
/** base64-wrapped custom_css (the renderer base64-decodes; plain CSS silently no-ops). */
export const CUSTOM_CSS = (declarations) => ({
  raw: Buffer.from(declarations, 'utf8').toString('base64'),
});

/* ── attributes (settings-level HTML attributes; storage verified on 4.2.1) ──
 * Envelope: {$$type:'attributes', value:[key-value…]} — declared on effectively every atomic
 * element schema. NOTE the honest contract: attributes are STORED & editor-validated on Elementor
 * 4.2.1, but the DOM transformer is STUBBED there (PHP returns null) — DOM emission depends on
 * Elementor enabling its transformer, verified per-version by the certification suite. Until then
 * the runtime-carrier html widget + `_cssid` remain the JS-hook path of record. */
const ATTR_NAME_RE = /^[a-zA-Z][a-zA-Z0-9:._-]*$/;
const ATTR_BLOCKED = {
  class: 'Elementor owns the class attribute (settings.classes) — use cls=/gcls= (or bindClass) instead',
  id: 'the id attribute is the _cssid setting — use the id prop (id="anchor") instead',
  style: 'inline style attributes never reach atomic output — use sx/tw props, or raw= custom CSS',
};
/** {name: value} → the attributes envelope. Validates attribute-name grammar and hard-blocks
 * class/id/style/on* (core esc_attr's key+value but does NO name filtering — we must). */
export const ATTRS = (obj) => {
  const entries = Object.entries(obj || {});
  for (const [k] of entries) {
    const lk = k.toLowerCase();
    if (ATTR_BLOCKED[lk]) throw new Error(`ATTRS: "${k}" is blocked — ${ATTR_BLOCKED[lk]}`);
    if (/^on/.test(lk)) throw new Error(`ATTRS: "${k}" is blocked — on* event-handler attributes are not allowed (core would store them verbatim; script injection). JS hooks go through the runtime-carrier html widget + _cssid`);
    if (!ATTR_NAME_RE.test(k)) throw new Error(`ATTRS: "${k}" is not a valid attribute name — must match ${ATTR_NAME_RE} (letters first, then letters/digits/:._-)`);
  }
  return { $$type: 'attributes', value: entries.map(([k, v]) => KV(k, String(v))) };
};

/* ───────────────────────────────── node construction ───────────────────────────────── */

/**
 * Build an element node. Style props go under `props` (desktop) with optional
 * `props._t` (tablet variant) and `props._m` (mobile variant). The local style
 * id embeds the element id and is auto-linked into settings.classes (R4 by
 * construction). Breakpoint keys match the canonical set (`BreakpointKey` in
 * authoring/contract.ts): `desktop` / `tablet` / `mobile`.
 */
export function node(elType, opts = {}, _positionalChildren) {
  // Footgun guard (workbench cold-run 2026-06-11): the col/row/grid/sect helpers take
  // (props, children) positionally, and agents pattern-match that onto raw node() — which used to
  // silently drop the children (empty boxes that only screenshots catch). Throw loudly instead.
  if (Array.isArray(_positionalChildren)) {
    throw new Error(
      `node('${elType}', …): children go INSIDE the options object — ` +
        `node('${elType}', { props, children: [...] }). ` +
        `Positional (props, children) is the col/row/grid/sect helper convention only.`,
    );
  }
  const { tag, widgetType, props = {}, settings = {}, attrs, children = [] } = opts;
  const nid = freshId();
  const n = {
    id: nid,
    elType,
    settings: { ...(tag ? { tag: S(tag) } : {}), ...(attrs && Object.keys(attrs).length ? { attributes: ATTRS(attrs) } : {}), ...settings },
    styles: {},
    elements: children,
  };
  if (widgetType) n.widgetType = widgetType;
  const cl = [];
  const tab = props._t;
  const mob = props._m;
  const dp = { ...props };
  delete dp._t;
  delete dp._m;
  if (Object.keys(dp).length || tab || mob) {
    const sid = `e-${nid}-s`;
    const variants = [{ meta: { breakpoint: 'desktop', state: null }, props: dp }];
    if (tab) variants.push({ meta: { breakpoint: 'tablet', state: null }, props: tab });
    if (mob) variants.push({ meta: { breakpoint: 'mobile', state: null }, props: mob });
    n.styles[sid] = { id: sid, type: 'class', label: nid, variants };
    cl.push(sid);
  }
  n.settings.classes = CLS(cl);
  return n;
}

/* Valid variant states, verbatim from Elementor's Style_States (style-states.php, 4.2.1).
 * Pseudo states render as `:state` — with the documented QUIRK that `hover` renders as the
 * comma pair `:hover, :focus-visible` (core's additional-states map; a11y-positive, accepted).
 * The two e-- states render as CLASS selectors (editor/tabs machinery toggles them). */
export const STYLE_STATES = new Set(['hover', 'active', 'focus', 'focus-visible', 'checked', 'e--selected', 'e--disabled']);
const assertState = (state, who) => {
  if (state != null && !STYLE_STATES.has(state)) {
    throw new Error(`${who}: unknown state "${state}" — valid states are ${[...STYLE_STATES].join(' | ')} (Elementor Style_States)`);
  }
};
/** Bootstrap a node's local style holder (and its R4 class link) if absent; returns the style record. */
function ensureStyle(n) {
  let sid = Object.keys(n.styles ?? {})[0];
  if (!sid) {
    sid = `e-${n.id}-s`;
    n.styles = { [sid]: { id: sid, type: 'class', label: n.id, variants: [{ meta: { breakpoint: 'desktop', state: null }, props: {} }] } };
    const refs = n.settings.classes?.value ?? [];
    n.settings.classes = CLS(refs.includes(sid) ? refs : [...refs, sid]);
  }
  return n.styles[sid];
}

/**
 * Attach raw CSS declarations to a node's style variant as `custom_css` (Pro-only escape hatch;
 * base64-encoded `{raw}` per contract 11 — plain CSS silently no-ops). `decls` are declarations
 * for the element itself (`color: red;`) or nested rules (`& em { color: #f43; }` — the accent
 * recipe: html-v3 strips inline style attrs, so accents MUST go through nested custom_css).
 * `{state}` targets a state variant ('hover' | 'active' | 'focus' | 'focus-visible' | 'checked' |
 * 'e--selected' | 'e--disabled') — the CSS renders inside the state selector block (per-state
 * custom CSS, combinable with {breakpoint} for e.g. tablet-hover).
 * NEVER put this object shape into PAGE settings — page-settings custom_css is a PLAIN STRING
 * (the AF1 inverse trap; the object shape fatals Pro sitewide there).
 */
export function css(n, decls, { breakpoint = 'desktop', state = null } = {}) {
  // Terminate the chunk: the renderer joins chunks/lines with \n, so a final declaration missing
  // its ';' silently dies in the browser's CSS parser (real incident: a raw ending in `top:598px`
  // dropped top/overflow/background across a whole hero). `}`-terminated chunks (nested rules,
  // @media blocks) need no ';'.
  decls = String(decls).trimEnd();
  if (decls && !decls.endsWith(';') && !decls.endsWith('}')) decls += ';';
  // Sanitize simulation: on save Elementor decodes → wp sanitize_textarea_field → re-encodes.
  // ANY '<' is mangled there ('<…>' sequences are stripped as tags, a bare '<' is entity-escaped)
  // — the CSS reaches the renderer altered with zero errors. Fail at build instead.
  const lt = decls.indexOf('<');
  if (lt !== -1) {
    throw new Error(
      `css: declarations contain '<' (…${decls.slice(Math.max(0, lt - 12), lt + 12)}…) — ` +
        `sanitize_textarea_field runs on save and strips/escapes tag-like sequences, so this CSS ` +
        `arrives mangled. Use the CSS escape \\3C (content:"\\3C") or restructure the rule.`,
    );
  }
  assertState(state, 'css');
  const st = ensureStyle(n);
  let v = (st.variants ?? []).find((x) => x.meta?.breakpoint === breakpoint && (x.meta?.state ?? null) === state);
  if (!v) {
    v = { meta: { breakpoint, state }, props: {} };
    st.variants.push(v);
  }
  // MERGE, don't overwrite (§css-overwrites-not-merges, field-found 2026-06-14): two css() calls on
  // the same node+breakpoint used to silently clobber each other — a gradient written first then an
  // inset-anchor written second left the card flat with no error. Concatenate instead; on a true
  // property conflict the later declaration wins (CSS cascade), matching the old overwrite per-prop.
  const prior = v.custom_css?.raw ? Buffer.from(v.custom_css.raw, 'base64').toString('utf8') : '';
  v.custom_css = CUSTOM_CSS(prior ? `${prior.trimEnd()}\n${decls}` : decls);
  return n;
}

/**
 * Webfont loader for Google-catalog families: ONE classic V3 `html` widget (flat-string settings,
 * same shape as the converter's font-carry widget) emitting preconnect + css2 stylesheet links.
 * Place it FIRST in the tree. For NON-catalog faces use `cli.mjs font-install` (S4) instead.
 */
/**
 * Visible success state for the Pro atomic form — the runner itself renders NO feedback on submit
 * (field reality: every build with a form hand-wrote this fetch/XHR hook, ~2 min each). Drop ONE
 * `formSuccess()` anywhere on a page that contains the form: when the Pro admin-ajax submit
 * returns success, the form hides and the banner appears. Zero-height wrapper (carrier pattern).
 */
export const formSuccess = ({ message = 'Message sent.', sub = "We'll get back to you shortly.", accent = '#1a7f37' } = {}) => {
  const id = freshId();
  return {
    id,
    elType: 'widget',
    widgetType: 'html',
    settings: {
      html:
        `<style>.elementor-element-${id}{margin:0!important;height:0;line-height:0;overflow:visible}` +
        `.exjsx-form-ok{display:none;padding:20px 24px;border:1px solid ${accent};border-radius:8px;text-align:center}` +
        `.exjsx-form-ok b{display:block;font-size:18px;color:${accent};margin-bottom:4px}</style>` +
        `<script>(function(){var of_=window.fetch;window.fetch=function(){return of_.apply(this,arguments).then(function(r){try{` +
        `var u=String(arguments&&r.url||'');if(r.ok&&u.indexOf('admin-ajax')>-1){r.clone().json().then(function(j){if(j&&j.success)done();}).catch(function(){});}}catch(e){}return r;});};` +
        `var ox=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__exu=u;return ox.apply(this,arguments);};` +
        `var os=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(){this.addEventListener('load',function(){try{` +
        `if(String(this.__exu).indexOf('admin-ajax')>-1){var j=JSON.parse(this.responseText);if(j&&j.success)done();}}catch(e){}});return os.apply(this,arguments);};` +
        `function done(){var f=document.querySelector('form');if(f){f.style.display='none';var b=document.createElement('div');b.className='exjsx-form-ok';` +
        `b.style.display='block';b.innerHTML='<b>${message.replace(/'/g, "\\'")}</b>${sub.replace(/'/g, "\\'")}';f.parentNode.insertBefore(b,f);}}})();</script>`,
    },
    styles: {},
    elements: [],
  };
};

export const fontLoader = (family, weights = [400, 700]) => ({
  id: freshId(),
  elType: 'widget',
  widgetType: 'html',
  settings: {
    html:
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family.trim().replace(/ /g, '+')}` +
      `:wght@${[...weights].sort((a, b) => a - b).join(';')}&display=swap">`,
  },
  styles: {},
  elements: [],
});

/**
 * Deep-clone a subtree with FRESH ids everywhere — the ONLY correct way to reuse
 * a component in two places. Re-mints element ids, re-keys local styles (which
 * embed the element id), and rewrites settings.classes references.
 */
export function clone(subtree) {
  const n = JSON.parse(JSON.stringify(subtree));
  (function remint(x) {
    const newId = freshId();
    const map = {};
    if (x.styles && Object.keys(x.styles).length) {
      const restyled = {};
      for (const [oldSid, st] of Object.entries(x.styles)) {
        const newSid = oldSid.replace(x.id, newId);
        map[oldSid] = newSid;
        restyled[newSid] = { ...st, id: newSid, label: st.label === x.id ? newId : st.label };
      }
      x.styles = restyled;
    }
    if (x.settings?.classes?.value) {
      x.settings.classes.value = x.settings.classes.value.map((c) => map[c] ?? c);
    }
    x.id = newId;
    for (const ch of x.elements ?? []) remint(ch);
  })(n);
  return n;
}

/* ─────────────────────────── container & widget primitives ─────────────────────────── */

const CONTAINER_TYPES = new Set(['e-flexbox', 'e-div-block', 'e-grid']);

export const fx = (p, ch = []) =>
  node('e-flexbox', { tag: 'div', props: { display: S('flex'), padding: P0, ...p }, children: ch });
export const col = (p, ch = []) => fx({ 'flex-direction': S('column'), ...p }, ch);
export const row = (p, ch = []) => fx({ 'flex-direction': S('row'), ...p }, ch);
/** Gap-aware columns — the ONLY correct multi-column primitive (never width% + gap). */
export const grid = (tmpl, gap, p, ch = []) =>
  node('e-flexbox', {
    tag: 'div',
    props: {
      display: S('grid'),
      'grid-template-columns': S(tmpl),
      gap: SZ(gap),
      width: SZ(100, '%'),
      padding: P0,
      ...p,
    },
    children: ch,
  });
/**
 * NATIVE e-grid container (Elementor ≥ 4.2 — the 4.1.x validator has neither the e-grid element
 * nor grid-track-size; on 4.1.x keep using grid(), the e-flexbox display:grid emulation).
 * Explicitness doctrine, same policy as the padding rule: e-grid's BASE styles bake display:grid,
 * 3fr/2fr tracks, 20px two-axis gap, 10px padding AND a mobile 1-column override (grid.php) — so
 * every one of those is re-emitted explicitly on the local class where the author controls it.
 *   cols/rows: number = that many equal fr tracks (TRACKS → repeat(N,1fr)), string = custom track
 *   list ('240px 1fr'). rows defaults to 'auto' (kills the base repeat(2,1fr) equal-height leak).
 *   gap: number or [column, row] → ONE layout-direction envelope (never row-gap/column-gap keys).
 *   The mobile 1-col default merges UNDER props._m — an author _m grid-template-columns wins.
 */
export const nativeGrid = ({ cols = 3, rows, gap = 20, tag = 'div', props = {} } = {}, ch = []) => {
  const { _m, ...rest } = props;
  const mob = { ...('grid-template-columns' in (_m ?? {}) ? {} : { 'grid-template-columns': TRACKS(1) }), ...(_m ?? {}) };
  return node('e-grid', {
    tag,
    props: {
      display: S('grid'),
      'grid-template-columns': TRACKS(cols),
      'grid-template-rows': TRACKS(rows ?? 'auto'),
      gap: Array.isArray(gap) ? GAPXY(...gap) : GAPXY(gap),
      padding: P0,
      ...rest,
      _m: mob,
    },
    children: ch,
  });
};

/** A hug-width row — container children of flex rows MUST hug or they claim 100% and wrap to a new line. */
export const hugRow = (p, ch = []) => row({ width: HUG, ...p }, ch);
export const hugCol = (p, ch = []) => col({ width: HUG, ...p }, ch);
/**
 * Header/footer bar: full-width space-between row whose container children hug.
 * Pass children ALREADY hug-sized (hugRow/hugCol or explicit width) — assertTree enforces it.
 */
export const bar = (p, ch = []) =>
  row({ 'justify-content': S('space-between'), 'align-items': S('center'), width: SZ(100, '%'), ...p }, ch);
/**
 * Image hero WITHOUT an editor-blocking overlay div: section(relative) > absolute e-image >
 * content col carrying the tint as its OWN background (full-bleed, relative — paints above the
 * image, stays clickable in the editor). Use this instead of an empty absolute tint div.
 */
export const hero = (attachmentId, tint, p, ch = []) =>
  node('e-flexbox', {
    tag: 'section',
    props: { position: S('relative'), overflow: S('hidden'), display: S('flex'), 'flex-direction': S('column'), padding: P0 },
    children: [
      image(attachmentId, {
        position: S('absolute'),
        'inset-block-start': SZ(0), 'inset-inline-end': SZ(0), 'inset-block-end': SZ(0), 'inset-inline-start': SZ(0),
        width: SZ(100, '%'), height: SZ(100, '%'), 'object-fit': S('cover'),
      }),
      col({ position: S('relative'), width: SZ(100, '%'), background: BG(tint), 'align-items': S('center'), ...p }, ch),
    ],
  });

/**
 * Mobile hamburger nav — Elementor Pro's classic `nav-menu` widget (built-in toggle, classic
 * widgets render inside v4 pages — recon-verified) wrapped in an atomic container that owns the
 * responsive visibility (classic widgets carry no atomic styles): hidden on desktop, shown at
 * mobile. Pair it with a desktop links row carrying `_m:{display:S('none')}`.
 * Flow: elementor_nav_menus_create → build with hamburgerNav(slug) → after save, call
 * elementor_nav_bind_widget {post_id, element_id, term_id, base_hash} to bind the term properly.
 * The classic widget node gets a fresh kit id; read it back from the spec/tree for binding.
 */
export const hamburgerNav = (menuSlug, p = {}) => {
  // margin-inline-start auto: when the desktop links row goes display:none at mobile,
  // a space-between bar has only this in-flow child left — without the auto margin the
  // toggle lands LEFT (field-found on the Figma build, under an absolute logo).
  // A caller-supplied `_m` MERGES with these defaults per prop key (it used to REPLACE
  // them wholesale, silently dropping display:flex — the toggle never appeared at 390).
  const { _m: customM, ...rest } = p;
  return hugCol({
    display: S('none'),
    _m: { display: S('flex'), margin: M(0, 0, 0, 'auto'), ...customM },
    ...rest,
  }, [
    { id: freshId(), elType: 'widget', widgetType: 'nav-menu',
      settings: { menu: menuSlug, layout: 'dropdown' }, styles: {}, elements: [] },
  ]);
};

/** Semantic container (header/section/footer/article/aside) — padding:0 baked like fx/col/row/grid (override via p). */
export const sect = (tag, p, ch = []) =>
  node('e-flexbox', {
    tag,
    props: { display: S('flex'), 'flex-direction': S('column'), 'align-items': S('center'), padding: P0, ...p },
    children: ch,
  });

/**
 * Absolute-layer props — spread into a node's props to position it over a RELATIVE parent (the fix for
 * Figma LAYERED groups that figma-plan flags; offsets are the Figma child x/y). Set the parent to
 * `position:S('relative')` (a sect/col with a fixed height/min-height) and place each overlapping child
 * with `...abs({top,left,width,height})`. Example: image(id,{...abs({top:64,left:713}),width:SZ(608)}).
 */
export const abs = ({ top, left, right, bottom, width, height } = {}) => ({
  position: S('absolute'),
  ...(top != null ? { 'inset-block-start': SZ(top) } : {}),
  ...(bottom != null ? { 'inset-block-end': SZ(bottom) } : {}),
  ...(left != null ? { 'inset-inline-start': SZ(left) } : {}),
  ...(right != null ? { 'inset-inline-end': SZ(right) } : {}),
  ...(width != null ? { width: SZ(width) } : {}),
  ...(height != null ? { height: SZ(height) } : {}),
});

/**
 * Arched section transition (a common Figma pattern — one band curves into the next). Apply to a
 * `position:S('relative')` section. **MEASURE the direction first — do NOT eyeball it** (a build flipped
 * convex↔concave twice): get_screenshot the boundary and compare the boundary pixel-y at the centre vs
 * the edges — centre HIGHER ⇒ CONVEX (this section domes UP into the band above), centre LOWER ⇒ CONCAVE.
 * `color` = the dome colour (the section's own bg for convex; the band-above colour for concave).
 * width:100% + height=2·depth ⇒ the ellipse meets the edges exactly on the top line and NEVER overflows
 * horizontally (a 132%-wide ellipse + overflow:visible spilled 230px and broke the overflow gate).
 */
export const archConvex = (n, { color = '#ffffff', depth = 84 } = {}) =>
  css(n, `overflow:visible; &::before{ content:""; position:absolute; left:0; top:-${depth}px; width:100%; height:${depth * 2}px; background:${color}; border-radius:50%; pointer-events:none; }`);
/** Concave variant — this section's top DIPS down (the band-above colour bulges into it). Tune depth. */
export const archConcave = (n, { color = '#ffffff', depth = 84 } = {}) =>
  css(n, `overflow:hidden; &::before{ content:""; position:absolute; left:0; top:-${depth * 3}px; width:100%; height:${depth * 4}px; background:${color}; border-radius:50%; pointer-events:none; }`);

/** text-ish content: a dynamic-tag envelope passes DIRECTLY (verified placement), else html-v3. */
const textContent = (t) => (t && t.$$type === 'dynamic' ? t : HTML(t));
export const heading = (tag, text, p = {}) =>
  node('widget', { widgetType: 'e-heading', settings: { tag: S(tag), title: textContent(text) }, props: p });
export const para = (text, p = {}) =>
  node('widget', { widgetType: 'e-paragraph', settings: { paragraph: textContent(text) }, props: p });
/** Real anchor button — href is REQUIRED (no "#"); href may be a dynamic url tag (dyn.postUrl()). */
export const button = (text, href, p = {}) => {
  if (!href || href === '#') throw new Error(`button "${text}": a real href is required (got "${href}")`);
  // p must be ATOMIC PROP ENVELOPES; every agent instinctively passes sx shorthand ({bg:'#a67c00'}),
  // which lands as invalid class props and 400s the kit write MUCH later, far from this call site
  // (field incident). Fail HERE, loudly, with the working recipes.
  const isEnvelope = (v) => v && typeof v === 'object' && '$$type' in v;
  // _t/_m are breakpoint variant maps (objects OF envelopes) — validate one level in
  const bare = Object.entries(p).find(([k, v]) =>
    k === '_t' || k === '_m'
      ? !(v && typeof v === 'object' && Object.values(v).every(isEnvelope))
      : !isEnvelope(v));
  if (bare) {
    throw new Error(
      `button "${text}": props must be atomic envelopes, got plain value for "${bare[0]}". ` +
        `For sx-styled buttons use box({...sx, tag:'a'},[…]) or a styled <text href="${href}">; ` +
        `or wrap: button(text, href, sx({ ${bare[0]}: … })) with sx from the prelude.`,
    );
  }
  return node('widget', {
    widgetType: 'e-button',
    settings: { tag: S('a'), text: textContent(text), link: LINK(href) },
    props: p,
  });
};
/** e-image by attachment id — or a dynamic image tag (dyn.featuredImage()/dyn.siteLogo()). */
export const image = (attachmentId, p = {}) =>
  node('widget', {
    widgetType: 'e-image',
    settings: { image: (attachmentId && attachmentId.$$type === 'dynamic') ? IMG_DYN(attachmentId) : IMG_ID(attachmentId) },
    props: p,
  });
/** URL-sourced e-image with inline alt (per-instance alt is only possible for URL images). */
export const imageUrl = (url, alt = '', p = {}) =>
  node('widget', { widgetType: 'e-image', settings: { image: IMG_URL(url, alt) }, props: p });
/**
 * Text-style link (nav/footer links): an e-button with the blue-pill defaults reset.
 * Use rgba(0,0,0,0) — the 'transparent' keyword is unverified against the PHP validator.
 */
export const textLink = (text, href, p = {}) =>
  button(text, href, {
    background: BG('rgba(0,0,0,0)'),
    color: C('#222222'),
    'font-size': SZ(15),
    'font-weight': S('500'),
    padding: DIM(8, 10, 8, 10),
    'border-radius': RAD(8),
    ...p,
  });

/* ───────────────────────── dynamic tags (Pro; live-verified matrix 4.1.4+Pro 4.1.0) ─────────────────────────
 * Envelope: {$$type:'dynamic', value:{name, group, settings}} — the tag must exist in the registry
 * (Pro registers them; free core has ZERO tags) and match the target prop's categories.
 * PLACEMENT RULES (live-probed): TEXT props (heading title / paragraph / button text) take the
 * envelope DIRECTLY; image takes it NESTED at image.value.src; link takes it NESTED at
 * link.value.destination. Top-level dynamic on image/link 422s. */
export const DYN = (name, group, settings = {}) => ({ $$type: 'dynamic', value: { name, group, settings } });
export const isDyn = (v) => v && typeof v === 'object' && v.$$type === 'dynamic';
/** catalog of verified tags with their correct groups (from the live registry). */
export const dyn = {
  postTitle: () => DYN('post-title', 'post'),
  postExcerpt: () => DYN('post-excerpt', 'post'),
  postDate: (s = {}) => DYN('post-date', 'post', s),
  postTime: (s = {}) => DYN('post-time', 'post', s),
  postUrl: () => DYN('post-url', 'post'),
  postId: () => DYN('post-id', 'post'),
  postTerms: (s = {}) => DYN('post-terms', 'post', s),
  featuredImage: () => DYN('post-featured-image', 'post'),
  // arbitrary meta keys go in custom_key (the `key` control is a SELECT of registered keys —
  // an unlisted key fails Elementor's validator with paragraph: invalid_value)
  customField: (key) => DYN('post-custom-field', 'post', key ? { key: '', custom_key: key } : {}),
  pageTitle: () => DYN('page-title', 'site'),
  siteTitle: () => DYN('site-title', 'site'),
  siteTagline: () => DYN('site-tagline', 'site'),
  siteUrl: () => DYN('site-url', 'site'),
  siteLogo: () => DYN('site-logo', 'site'),
  authorName: () => DYN('author-name', 'author'),
  authorUrl: () => DYN('author-url', 'author'),
  archiveTitle: () => DYN('archive-title', 'archive'),
  currentDateTime: (s = {}) => DYN('current-date-time', 'site', s),
};
/** dynamic-src e-image envelope (nested placement — the only accepted shape). */
export const IMG_DYN = (dynEnvelope, size = 'full') => ({
  $$type: 'image',
  value: { src: dynEnvelope, size: S(size) },
});

/* ───────────────────── media + structure atomic widgets (free core, 4.1.4) ─────────────────────
 * Schemas verified against atomic-widgets source: e-divider, e-youtube, e-self-hosted-video,
 * and the e-tabs element family (e-tabs > e-tabs-menu > e-tab×N + e-tabs-content-area >
 * e-tab-content×N, content linked to its tab via `tab-id` = the e-tab's ELEMENT id). */

/** horizontal rule — styling via atomic props (w/h/bg/m…). */
export const divider = (p = {}) => node('widget', { widgetType: 'e-divider', props: p });

/** YouTube embed. source = watch/share URL. */
export const youtube = (source, { start, end, autoplay = false, mute = false, loop = false, lazyload = false, controls = true, captions = false, privacyMode = false, rel = true } = {}, p = {}) =>
  node('widget', {
    widgetType: 'e-youtube',
    settings: {
      source: S(source),
      ...(start != null ? { start: S(String(start)) } : {}), ...(end != null ? { end: S(String(end)) } : {}),
      autoplay: B(autoplay), mute: B(mute), loop: B(loop), lazyload: B(lazyload),
      player_controls: B(controls), captions: B(captions), privacy_mode: B(privacyMode), rel: B(rel),
    },
    props: p,
  });

/** video-src envelope: URL form (absolute) or attachment id — id XOR url, like images. */
export const VIDEO_URL = (url) => {
  if (!/^https?:\/\//.test(url)) throw new Error(`VIDEO_URL: "${url}" — needs an ABSOLUTE http(s) URL`);
  return { $$type: 'video-src', value: { id: null, url: { $$type: 'url', value: url } } };
};
export const VIDEO_ID = (attachmentId) => ({ $$type: 'video-src', value: { id: { $$type: 'video-attachment-id', value: attachmentId }, url: null } });
/** self-hosted <video>. source = VIDEO_URL(...) | VIDEO_ID(...) | an absolute URL string. */
export const video = (source, { autoplay = false, playsinline = false, mute = false, loop = false, controls = true, preload, download = false, startTime, endTime, poster } = {}, p = {}) =>
  node('widget', {
    widgetType: 'e-self-hosted-video',
    settings: {
      source: typeof source === 'string' ? VIDEO_URL(source) : source,
      autoplay: B(autoplay), playsinline: B(playsinline), mute: B(mute), loop: B(loop), controls: B(controls), download: B(download),
      ...(preload ? { preload: S(preload) } : {}),
      ...(startTime != null ? { start_time: N(startTime) } : {}),
      ...(endTime != null ? { end_time: N(endTime) } : {}),
      ...(poster ? { poster_enabled: B(true), poster } : {}),
    },
    props: p,
  });

/**
 * Interactive tabs. items: [{ label, content: [kit nodes] }]. Renders the canonical element
 * family with explicit tab-id linking; Alpine handler ships with free core.
 */
export const tabs = (items, { active = 0 } = {}, p = {}) => {
  const tabEls = items.map((it) => node('e-tab', { children: [para(String(it.label))] }));
  // NO explicit tab-id: the frontend handler links tab↔panel POSITIONALLY (`<tabsId>-tab-<n>`);
  // setting tab-id to an element id breaks the match and hides every panel (live-probed).
  const contentEls = items.map((it) => node('e-tab-content', { children: it.content ?? [] }));
  return node('e-tabs', {
    settings: { 'default-active-tab': N(active) },
    props: { padding: P0, ...p },
    children: [
      node('e-tabs-menu', { props: { padding: P0 }, children: tabEls }),
      node('e-tabs-content-area', { props: { padding: P0 }, children: contentEls }),
    ],
  });
};

/* ───────────────────────── interactions (FREE core `e_interactions`, default-active) ─────────────────────────
 * Motion presets on any element. Stored as a TOP-LEVEL `interactions` key on the node:
 * {version:1, items:[{$$type:'interaction-item', value:{interaction_id, trigger, animation}}]}.
 * FIELD-FOUND: the runtime sanitizer requires animation.$$type = 'animation-preset-props'
 * (NOT 'animation-preset' as the prop-type class suggests) — wrong type = interactions silently
 * stripped to []. Rendered via a footer JSON blob + motion.js; free triggers load/scrollIn,
 * Pro adds scrollOut/scrollOn/hover/click; effects fade/slide/scale (+Pro custom). Max 5/element. */
const IX_TRIGGERS = new Set(['load', 'scrollIn', 'scrollOut', 'scrollOn', 'hover', 'click']);
const IX_EFFECTS = new Set(['fade', 'slide', 'scale', 'custom']);
const SZms = (v) => ({ $$type: 'size', value: { unit: 'ms', size: v } });
let _ixN = 0;
/** one interaction-item envelope (validator-exact). */
export const interaction = ({ trigger = 'load', effect = 'fade', type = 'in', direction = '', duration = 600, delay = 0, easing, replay } = {}) => {
  if (!IX_TRIGGERS.has(trigger)) throw new Error(`interaction: trigger "${trigger}" — enum is ${[...IX_TRIGGERS].join('|')}`);
  if (!IX_EFFECTS.has(effect)) throw new Error(`interaction: effect "${effect}" — enum is ${[...IX_EFFECTS].join('|')}`);
  const value = {
    interaction_id: S(`ix-${(_ixN++).toString(36)}`),
    trigger: S(trigger),
    animation: { $$type: 'animation-preset-props', value: {
      effect: S(effect), type: S(type), direction: S(direction),
      timing_config: { $$type: 'timing-config', value: { duration: SZms(duration), delay: SZms(delay) } },
      ...(easing || replay !== undefined ? { config: { $$type: 'animation-config', value: { ...(easing ? { easing: S(easing) } : {}), ...(replay !== undefined ? { replay: B(replay) } : {}) } } } : {}),
    } },
  };
  return { $$type: 'interaction-item', value };
};
/** attach interactions to a node (chainable). `list` = one opts object or an array of them. */
export const interact = (n, list) => {
  const items = (Array.isArray(list) ? list : [list]).map((o) => (o && o.$$type === 'interaction-item' ? o : interaction(o)));
  const existing = n.interactions?.items || [];
  if (existing.length + items.length > 5) throw new Error(`interact: element ${n.id} would have ${existing.length + items.length} interactions — the sanitizer caps at 5`);
  n.interactions = { version: 1, items: [...existing, ...items] };
  return n;
};

/* ───────────────────── collection loop (Pro, EXPERIMENT-gated; live-verified) ─────────────────────
 * Repeating dynamic content: e-collection-loop{source, posts_per_page} > e-collection-loop-layout
 * > e-collection-loop-item (the repeating template) > dynamic-bound children. Requires the hidden
 * dev experiment `e_pro_collection_loop` (option elementor_experiment-e_pro_collection_loop=active)
 * — the exjsx deploy enables it automatically when a bundle contains loops. */
export const loopGrid = ({ source = 'post', perPage = 6, layout = {}, item = {} } = {}, children = []) => {
  // Any registered post type is a valid source (CPTs included); Elementor's PHP dry_run is the
  // authoritative validator. Guard only the obviously-broken inputs loudly.
  if (typeof source !== 'string' || !/^[a-z0-9_-]+$/.test(source)) throw new Error(`loopGrid: source "${source}" — pass a post-type slug (post, page, or a registered CPT)`);
  return node('e-collection-loop', {
    settings: { source: S(source), posts_per_page: N(perPage) },
    props: { padding: P0 },
    children: [
      node('e-collection-loop-layout', { props: { padding: P0, ...layout }, children: [
        node('e-collection-loop-item', { props: { padding: P0, ...item }, children }),
      ] }),
    ],
  });
};

/* ───────────────────────────── atomic forms (e-form + Pro field widgets) ─────────────────────────────
 * The e-form CONTAINER ships in free core; the FIELD widgets (e-form-input/-textarea/-select/
 * -checkbox/-label/-submit-button) and the action runner (email / collect-submissions / webhook)
 * are Elementor Pro. Schemas verified against atomic-form 4.1.4 + Pro 4.1.0 source. */

/** key-value envelope (select options). */
export const KV = (key, value = key) => ({ $$type: 'key-value', value: { key: S(key), value: S(value) } });
/** email-action envelope for form(). message default '[all-fields]'; send-as html|plain. */
export const EMAIL_ACTION = ({ to, subject, message = '[all-fields]', from, fromName, replyTo, cc, bcc, sendAs = 'html' } = {}) => ({
  $$type: 'email',
  value: {
    ...(to ? { to: S(to) } : {}), ...(subject ? { subject: S(subject) } : {}), message: S(message),
    ...(from ? { from: S(from) } : {}), ...(fromName ? { 'from-name': S(fromName) } : {}),
    ...(replyTo ? { 'reply-to': S(replyTo) } : {}), ...(cc ? { cc: S(cc) } : {}), ...(bcc ? { bcc: S(bcc) } : {}),
    'send-as': S(sendAs),
  },
});

const INPUT_TYPES = new Set(['text', 'email', 'number', 'tel', 'password']);
/** text-ish input. `id` is the field identity (maps to a formLabel's forId; unique per form). */
export const formInput = (id, { placeholder = '', type = 'text', required = false, readonly = false } = {}, p = {}) => {
  if (!INPUT_TYPES.has(type)) throw new Error(`formInput "${id}": type "${type}" — enum is ${[...INPUT_TYPES].join('|')}`);
  return node('widget', {
    widgetType: 'e-form-input',
    settings: { _cssid: S(id), placeholder: S(placeholder), type: S(type), required: B(required), readonly: B(readonly) },
    props: p,
  });
};
export const formTextarea = (id, { placeholder = '', rows = 4, required = false, resizable = true } = {}, p = {}) =>
  node('widget', {
    widgetType: 'e-form-textarea',
    settings: { _cssid: S(id), placeholder: S(placeholder), rows: N(rows), required: B(required), resizable: B(resizable) },
    props: p,
  });
/** options: array of 'Label' strings or [submittedValue, 'Label'] pairs. */
export const formSelect = (name, options = [], { required = false, multiple = false } = {}, p = {}) =>
  node('widget', {
    widgetType: 'e-form-select',
    settings: {
      name: S(name), required: B(required), multiple: B(multiple),
      options: { $$type: 'options', value: options.map((o) => (Array.isArray(o) ? KV(o[0], o[1]) : KV(o))) },
    },
    props: p,
  });
export const formCheckbox = (name, { value = 'on', checked = false, required = false } = {}, p = {}) =>
  node('widget', { widgetType: 'e-form-checkbox', settings: { name: S(name), value: S(value), checked: B(checked), required: B(required) }, props: p });
export const formLabel = (forId, text, p = {}) =>
  node('widget', { widgetType: 'e-form-label', settings: { tag: S('label'), text: HTML(text), 'input-id': S(forId) }, props: p });
export const formSubmit = (text = 'Submit', p = {}) =>
  node('widget', { widgetType: 'e-form-submit-button', settings: { text: HTML(text), tag: S('button') }, props: p });
/**
 * Native form status messages (free core ≥ 4.1.1): e-form-success-message / e-form-error-message
 * container elements, hidden by their base styles. On submit the core form handler flips
 * `form-state-success|error` on the e-form and core inline CSS reveals the matching child
 * (`form[data-element_type=e-form].form-state-success [data-element_type=e-form-success-message]
 * { display:block }` — module.php add_inline_styles). They are ORDINARY SAVED CHILDREN — the
 * server does NOT auto-create them on REST save (live-probed on 4.2.1: saved tree ≡ sent tree),
 * so the compiler must emit them or submissions render zero feedback. form() adds both by
 * default; use these directly for custom copy/placement. Only e-paragraph children are allowed
 * (define_allowed_child_types). Default texts mirror the native builder's.
 */
export const formSuccessMessage = (text = 'Great! We’ve received your information.', p = {}) =>
  node('e-form-success-message', { props: p, children: [para(text)] });
export const formErrorMessage = (text = 'We couldn’t process your submission. Please retry', p = {}) =>
  node('e-form-error-message', { props: p, children: [para(text)] });

/**
 * Native checkbox row — `e-form-checkbox-row` is NOT an element type: it's a literal CSS class on
 * a plain e-flexbox that atomic-form.php's build_checkbox_row() emits, styled by the form's OWN
 * scoped base rule (`.e-<base> .e-form-checkbox-row` → align-center/gap 8/padding 0). This mirrors
 * that exactly: e-form-checkbox + e-form-label linked by _cssid ↔ input-id, class attached.
 * `opts` go to the checkbox (value/checked/required; `name` defaults to the id).
 */
export const checkboxRow = (id, label, opts = {}, p = {}) => {
  const { name, ...cbOpts } = opts;
  const cb = formCheckbox(name ?? id, cbOpts);
  cb.settings._cssid = S(id);
  const r = row({ 'align-items': S('center'), gap: SZ(8), padding: P0, width: SZ(100, '%'), ...p }, [cb, formLabel(id, label)]);
  r.settings.classes = CLS(['e-form-checkbox-row', ...(r.settings.classes?.value ?? [])]);
  return r;
};

/** label+input pair in a column — the everyday field group. `opts` go to the input (type/required/…).
 * `{ textarea: true, rows? }` routes to formTextarea (field-report: agents expect this spelling —
 * it used to throw into the input-type enum). */
export const field = (id, label, opts = {}, p = {}) => {
  const { textarea, ...rest } = opts;
  return col({ gap: SZ(6), padding: P0, width: SZ(100, '%'), ...p }, [
    formLabel(id, label),
    textarea ? formTextarea(id, rest) : formInput(id, rest),
  ]);
};

/**
 * The e-form container element. actions: 'email' | 'collect-submissions' | 'webhook' (array).
 *   form({ name:'contact', actions:['email'], email: EMAIL_ACTION({to:'x@y.z'}) }, [ …fields… ])
 * Children are field widgets/containers. Pro required for fields + submission handling.
 * Native SUCCESS/ERROR status messages are appended by default (they're plain saved children —
 * without them a submit renders zero feedback; see formSuccessMessage). Override the copy with
 * successMessage/errorMessage, place your own formSuccessMessage()/formErrorMessage() among the
 * children (form() detects and won't duplicate), or opt out entirely with messages:false.
 */
export const form = ({ name = 'form', actions = ['email'], email, webhook, messages = true, successMessage, errorMessage, props = {} } = {}, children = []) => {
  const settings = {
    'form-name': S(name),
    'actions-after-submit': { $$type: 'string-array', value: actions.map(S) }, // items are FULL string envelopes
    ...(email ? { email } : {}),
    ...(webhook ? { webhook_url: S(webhook) } : {}),
  };
  const kids = [...children];
  if (messages) {
    const has = (t) => kids.some((c) => c?.elType === t);
    if (!has('e-form-success-message')) kids.push(formSuccessMessage(successMessage));
    if (!has('e-form-error-message')) kids.push(formErrorMessage(errorMessage));
  }
  return node('e-form', { settings, props: { padding: P0, ...props }, children: kids });
};

/* ─────────────────────────────── icons + interactivity ─────────────────────────────── */

/**
 * Font Awesome icon via the classic `icon` widget (the FA catalog renders inside V4 atomic pages —
 * classic-in-v4 is recon-verified, same as nav-menu/html). FLAT classic settings (no atomic envelopes):
 * `selected_icon {value,library}` + `primary_color` + `size {unit,size}`. No upload needed — the quick
 * path to REAL iconography (closes the "letter-chip" gap). `name` is a full FA class, e.g. "fas fa-bolt";
 * library defaults to "fa-solid" (use "fa-brands" for brand logos). For a custom uploaded SVG use svgIcon().
 */
/**
 * Normalize a Font Awesome icon value to the full class the classic `icon` widget requires
 * (`fas fa-desktop`), not a bare name (`fa-desktop`) — a bare name makes font-awesome.php
 * str_replace(null) and spray "Undefined array key 0" warnings across the page (field-found on the
 * farmans build; the reason faIcon was previously discouraged). Accepts bare/prefixed/full input.
 */
const FA_STYLE = { 'fa-solid': 'fas', 'fa-regular': 'far', 'fa-brands': 'fab', solid: 'fas', regular: 'far', brands: 'fab' };
export const normalizeFaValue = (name, library = 'fa-solid') => {
  const v = String(name).trim();
  if (/^(fas|far|fab|fa-solid|fa-regular|fa-brands)\s/.test(v)) return v; // already has a style prefix
  const style = FA_STYLE[library] || 'fas';
  return `${style} ${v.startsWith('fa-') ? v : `fa-${v}`}`;
};
export const faIcon = (name, { color = '#6D5EF6', size = 24, library = 'fa-solid' } = {}) => ({
  id: freshId(),
  elType: 'widget',
  widgetType: 'icon',
  settings: { selected_icon: { value: normalizeFaValue(name, library), library }, primary_color: color, size: { unit: 'px', size } },
  styles: {},
  elements: [],
});

/** Atomic SVG icon — the `e-svg` widget from an uploaded SVG attachment id (id-XOR-url via SVG_ID). */
export const svgIcon = (attachmentId, p = {}) =>
  node('widget', { widgetType: 'e-svg', settings: { svg: SVG_ID(attachmentId) }, props: p });

/**
 * Icon chip — an FA icon centered in a soft rounded tinted square (the feature-card affordance the
 * Halcyon build was missing). Returns an e-flexbox; pass it as a card's first child.
 */
export const iconChip = (
  name,
  { icon = '#6D5EF6', bg = 'rgba(109,94,246,0.10)', box = 44, size = 22, radius = 12 } = {},
) =>
  col(
    {
      width: SZ(box), height: SZ(box), 'align-items': S('center'), 'justify-content': S('center'),
      background: BG(bg), 'border-radius': RAD(radius), padding: P0,
    },
    [faIcon(name, { color: icon, size })],
  );

/**
 * Add a STATE style variant to a node (native, editor-visible in the state UI, schema-validated).
 * `state` ∈ hover | active | focus | focus-visible | checked | e--selected | e--disabled (the two
 * e-- states are editor-machinery CLASS selectors — kit-only, no tw/sx spelling). Create-or-merge
 * on the {breakpoint, state} variant, mirroring css(). QUIRK (accepted, a11y-positive): Elementor
 * renders the `hover` state as the comma pair `:hover, :focus-visible`; authored `focus-visible`
 * maps to its own meta.state. For a smooth transition, add one on the BASE via custom_css:
 * `css(card, 'transition: transform .18s ease;')` then `stateVariant(card, 'hover', {...})`.
 * Returns the node (chainable). State variants are validated by the PHP dry_run — run it.
 */
export function stateVariant(n, state, props, { breakpoint = 'desktop' } = {}) {
  if (state == null) throw new Error(`stateVariant: state is required — for base props use node()/styled(); valid states: ${[...STYLE_STATES].join(' | ')}`);
  assertState(state, 'stateVariant');
  const st = ensureStyle(n);
  let v = (st.variants ?? []).find((x) => x.meta?.breakpoint === breakpoint && (x.meta?.state ?? null) === state);
  if (!v) {
    v = { meta: { breakpoint, state }, props: {} };
    st.variants.push(v);
  }
  Object.assign(v.props, props);
  return n;
}

/** :hover state variant — thin wrapper over stateVariant (kept exported for compat). */
export function hover(n, props, { breakpoint = 'desktop' } = {}) {
  return stateVariant(n, 'hover', props, { breakpoint });
}

/* ──────────────────────────── structural validation + emit ─────────────────────────── */

/**
 * Local structural checks (a fast subset of the PHP validator, tuned to the
 * generator footguns). Throws with every violation listed.
 */
export function assertTree(elements) {
  const errs = [];
  const ids = new Set();
  const styleIds = new Set();
  (function walk(ns, path) {
    ns.forEach((n, i) => {
      const p = `${path}[${i}]<${n?.widgetType ?? n?.elType}>`;
      // an UNRENDERED JSX vnode leaked into kit children (mixing <jsx> inside a kit component's
      // children array) — it would 422 at the PHP validator with a cryptic R1. Name it here.
      if (n && n.$$v) { errs.push(`${p}: unrendered JSX vnode <${typeof n.type === 'string' ? n.type : n.type?.name ?? '?'}> embedded in kit children — the runtime renders these now; rebuild, or wrap with render() if constructing trees manually`); return; }
      if (!n || typeof n.elType !== 'string') { errs.push(`${p}: not a kit node (missing elType) — invalid child in elements[]`); return; }
      if (ids.has(n.id)) errs.push(`${p}: duplicate element id "${n.id}" — reuse a subtree only via clone()`);
      ids.add(n.id);
      const classRefs = n.settings?.classes?.value ?? [];
      for (const [sid, st] of Object.entries(n.styles ?? {})) {
        if (styleIds.has(sid)) errs.push(`${p}: duplicate local-style id "${sid}" (R4) — use clone()`);
        styleIds.add(sid);
        if (!classRefs.includes(sid)) errs.push(`${p}: style "${sid}" not referenced in settings.classes (R4)`);
        for (const v of st.variants ?? []) {
          if (v.meta?.breakpoint == null) errs.push(`${p}: variant breakpoint is null — base must be "desktop"`);
          for (const [key, val] of Object.entries(v.props ?? {})) {
            if (/^(flex-grow|flex-shrink|flex-basis|background-color|row-gap|column-gap|overflow-x|overflow-y)$/.test(key))
              errs.push(`${p}: prop "${key}" is not a schema key — see prop-shapes.md${/^overflow-/.test(key) ? ' (only plain "overflow" exists)' : ''}`);
            if (key === 'text-align' && val?.value && !['start', 'center', 'end', 'justify'].includes(val.value))
              errs.push(`${p}: text-align "${val.value}" rejected by the validator — enum is start|center|end|justify (use start/end, not left/right)`);
            if (key === 'z-index' && val?.$$type !== 'number')
              errs.push(`${p}: z-index must be a number envelope N(v), not ${val?.$$type ?? 'unknown'}`);
          }
        }
      }
      if (CONTAINER_TYPES.has(n.elType)) {
        const hasPadding = Object.values(n.styles ?? {}).some((st) =>
          (st.variants ?? []).some((v) => 'padding' in (v.props ?? {})),
        );
        if (!hasPadding) errs.push(`${p}: container without explicit padding — intrinsic 10px will leak`);
        // e-flexbox's BASE style is flex-direction: ROW (flexbox.php:141 — verified live on page
        // 3856; the old "defaults to column" doc was wrong). A bare multi-child flexbox renders
        // its children side-by-side (newspaper columns) with no error — force explicitness.
        if (n.elType === 'e-flexbox' && (n.elements?.length ?? 0) >= 2) {
          const desktop = Object.values(n.styles ?? {}).flatMap((st) =>
            (st.variants ?? []).filter((v) => v.meta?.breakpoint === 'desktop').map((v) => v.props ?? {}),
          );
          const hasDirection = desktop.some((pr) => 'flex-direction' in pr);
          const isGrid = desktop.some((pr) => pr.display?.value === 'grid');
          if (!hasDirection && !isGrid)
            errs.push(
              `${p}: e-flexbox with ${n.elements.length} children and no explicit flex-direction — ` +
                `the BASE default is ROW (not column); children will render side-by-side. ` +
                `Set 'flex-direction' (or use the col()/row() helpers, which set it).`,
            );
        }
      }
      if (n.elType === 'widget' && !n.widgetType) errs.push(`${p}: widget without widgetType (renders a 500)`);
      // Desktop props of this node (for the structural layout rules below).
      const deskProps = Object.values(n.styles ?? {}).flatMap((st) => st.variants ?? [])
        .filter((v) => v.meta?.breakpoint === 'desktop').map((v) => v.props ?? {})
        .reduce((a, b) => ({ ...a, ...b }), {});
      const propOf = (x, key) => Object.values(x.styles ?? {}).flatMap((st) => st.variants ?? [])
        .map((v) => v.props?.[key]).find(Boolean);
      // RULE: container children of a flex ROW must hug or set a width — they default to
      // width:100% and stack/wrap onto their own line (the two-row header/footer bug).
      const isFlexRow = deskProps.display?.value === 'flex' && deskProps['flex-direction']?.value === 'row';
      if (isFlexRow) {
        const containerKids = (n.elements ?? []).filter((c) => CONTAINER_TYPES.has(c.elType));
        if (containerKids.length >= 1 && (n.elements ?? []).length >= 2) {
          for (const c of containerKids) {
            if (!propOf(c, 'width') && !propOf(c, 'flex')) {
              errs.push(`${p}: flex-row container child <${c.elType}> has no width/flex — it defaults to 100% and wraps the row (use width:HUG / hugRow)`);
            }
          }
        }
      }
      // RULE: an EMPTY absolutely-positioned container is an editor-blocking overlay — the
      // top hit-target swallows clicks in the Elementor editor. Bake tints into the content
      // container's own background instead (see hero()).
      if (CONTAINER_TYPES.has(n.elType) && (n.elements ?? []).length === 0
        && deskProps.position?.value === 'absolute') {
        errs.push(`${p}: empty absolute container (overlay) — blocks editor clicks; put the tint on the content container's background (hero())`);
      }
      walk(n.elements ?? [], p + '.elements');
    });
  })(elements, '$');
  if (errs.length) throw new Error(`assertTree: ${errs.length} structural error(s)\n - ` + errs.join('\n - '));
  return elements;
}

/**
 * Validate structurally and write the spec MANIFEST the CLI consumes (contract 18 S3):
 *   { title, elements, settings?, template?, nav_bindings? }
 * - `template`: page template applied after save (e.g. "elementor_canvas").
 * - `nav_bindings`: [{ element_id? | widget_index?, menu_slug }] — `cli.mjs deploy`/`replace`
 *   resolve the slug to a term id and bind after save (build-or-replace, one command).
 * File-based so large trees never ride inline through MCP tool params.
 */
export async function emit(spec, outPath) {
  assertTree(spec.elements);
  const errs = [];
  for (const [i, b] of (spec.nav_bindings ?? []).entries()) {
    if (!b.menu_slug) errs.push(`nav_bindings[${i}]: menu_slug is required`);
    if (b.element_id !== undefined && typeof b.element_id !== 'string') errs.push(`nav_bindings[${i}]: element_id must be a string`);
    if (b.widget_index !== undefined && !Number.isInteger(b.widget_index)) errs.push(`nav_bindings[${i}]: widget_index must be an integer`);
  }
  if (spec.template !== undefined && typeof spec.template !== 'string') errs.push('template must be a string (e.g. "elementor_canvas")');
  if (typeof spec.settings?.custom_css === 'object' && spec.settings?.custom_css !== null) {
    // AF1 inverse trap: PAGE settings custom_css is a PLAIN STRING; the {raw:base64} object
    // shape (correct for STYLE variants) fatals Pro sitewide when it reaches page settings.
    errs.push('settings.custom_css must be a plain CSS STRING in page settings (the {raw:base64} object fatals Pro — AF1)');
  }
  if (errs.length) throw new Error(`emit: ${errs.length} manifest error(s)\n - ` + errs.join('\n - '));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, JSON.stringify(spec));
  const count = (function c(ns) { return ns.reduce((a, n) => a + 1 + c(n.elements ?? []), 0); })(spec.elements);
  console.error(`emit: ${count} nodes -> ${outPath}`);
  return outPath;
}
