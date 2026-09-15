/**
 * a11y.mjs — compile-time accessibility analysis. Pure, offline, no DOM.
 *
 * The doctrine (see docs/A11Y.md): a compiler ENFORCES what is decidable from the source tree +
 * design tokens; a render-time checker (axe) owns what needs a browser; human judgement is
 * PROMPTED, never silently "passed". This module is the first tier.
 *
 * Its centrepiece is contrast (WCAG 2.2 SC 1.4.3 / 1.4.11), which is decidable here and ONLY here
 * — by the time a page is rendered the theme tokens have collapsed into computed pixels and the
 * author has no idea which token to change. We resolve the foreground/background pair by walking
 * the tree the way the cascade would, and when we CANNOT resolve a pair (gradient, image, alpha
 * over an unknown backdrop) we say so explicitly rather than passing it silently — an unresolved
 * pair is reported as `unresolved`, never as a pass.
 *
 * Scope honesty: axe's `region` / `landmark-one-main` / `heading-order` are Deque BEST PRACTICE,
 * not WCAG success criteria (verified against axe-core doc/rule-descriptions.md). Contrast is the
 * only WCAG-normative rule in this module. The landmark helpers exist because they genuinely help
 * screen-reader users navigate, not because conformance demands them.
 */

/* ───────────────────────────── colour ───────────────────────────── */

/* The 16 CSS2 named colours + the handful that actually show up in design tokens. A full CSS named
 * colour table is 148 entries of dead weight; anything outside this set resolves to null, which
 * lands in `unresolved` rather than being guessed at. */
const NAMED = {
  black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080', white: '#ffffff',
  maroon: '#800000', red: '#ff0000', purple: '#800080', fuchsia: '#ff00ff', magenta: '#ff00ff',
  green: '#008000', lime: '#00ff00', olive: '#808000', yellow: '#ffff00', navy: '#000080',
  blue: '#0000ff', teal: '#008080', aqua: '#00ffff', cyan: '#00ffff', orange: '#ffa500',
  gold: '#ffd700', pink: '#ffc0cb', brown: '#a52a2a', beige: '#f5f5dc', ivory: '#fffff0',
  indigo: '#4b0082', violet: '#ee82ee', tan: '#d2b48c', crimson: '#dc143c', salmon: '#fa8072',
  khaki: '#f0e68c', plum: '#dda0dd', orchid: '#da70d6', turquoise: '#40e0d0', lavender: '#e6e6fa',
  transparent: 'rgba(0,0,0,0)',
};

const hex2 = (s) => parseInt(s, 16);
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** hsl → rgb (0-255), h in degrees, s/l in 0-1. */
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return seg.map((v) => Math.round((v + m) * 255));
}

/**
 * Parse a CSS colour to {r,g,b,a} (r/g/b 0-255, a 0-1) or null when we can't be sure.
 * Deliberately NARROW: #hex(3/4/6/8), rgb()/rgba(), hsl()/hsla(), a small named table.
 * var(), color-mix(), oklch(), currentColor and anything else → null → reported as unresolved.
 */
export function parseColor(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (NAMED[s]) s = NAMED[s];
  if (s[0] === '#') {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = [...h].map((c) => hex2(c + c));
      return { r, g, b, a: h.length === 4 ? a / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      const r = hex2(h.slice(0, 2)); const g = hex2(h.slice(2, 4)); const b = hex2(h.slice(4, 6));
      return { r, g, b, a: h.length === 8 ? hex2(h.slice(6, 8)) / 255 : 1 };
    }
    return null;
  }
  const fn = /^(rgba?|hsla?)\(([^)]+)\)$/.exec(s);
  if (!fn) return null;
  // both legacy comma syntax and modern space syntax (with an optional `/ alpha`)
  const parts = fn[2].replace(/\//g, ' ').split(/[,\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (p, pct255 = false) => {
    if (typeof p !== 'string') return NaN;
    if (p.endsWith('%')) { const v = parseFloat(p); return pct255 ? (v / 100) * 255 : v / 100; }
    return parseFloat(p);
  };
  const alpha = parts.length > 3 ? clamp01(num(parts[3])) : 1;
  if (Number.isNaN(alpha)) return null;
  if (fn[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => num(p, true));
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r: Math.round(clamp01(r / 255) * 255), g: Math.round(clamp01(g / 255) * 255), b: Math.round(clamp01(b / 255) * 255), a: alpha };
  }
  const h = parseFloat(parts[0]);
  const sat = clamp01(num(parts[1]));
  const li = clamp01(num(parts[2]));
  if ([h, sat, li].some(Number.isNaN)) return null;
  const [r, g, b] = hslToRgb(h, sat, li);
  return { r, g, b, a: alpha };
}

/**
 * WCAG 2.x relative luminance. NOTE the 0.04045 threshold — W3C corrected this from 0.03928 by
 * errata in May 2021 and roughly half of npm still ships the old constant; the difference is
 * numerically tiny at 8-bit but it is the usual reason two tools disagree in the last decimal.
 */
export function relativeLuminance({ r, g, b }) {
  const ch = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Composite a (possibly translucent) colour over an opaque backdrop → opaque colour. */
export function composite(fg, bg) {
  const a = fg.a ?? 1;
  if (a >= 1) return { ...fg, a: 1 };
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

/** WCAG 2.x contrast ratio between two OPAQUE colours, FULL precision (1..21). */
export function contrastRatioExact(c1, c2) {
  const l1 = relativeLuminance(c1); const l2 = relativeLuminance(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
/** The same ratio rounded to 2dp — for DISPLAY only.
 * Comparing the rounded value is a real bug, not a nicety: a true 4.4951 rounds to 4.5 and would
 * be reported as passing, while the browser (and axe) sees 4.49 and fails it. Four such nodes
 * survived a "clean" build on the tracewell page and were caught only by the post-deploy axe run.
 * Round to show, compare exact. */
export function contrastRatio(c1, c2) {
  return Math.round(contrastRatioExact(c1, c2) * 100) / 100;
}
/** Does this pair MEET the threshold? Always ask this rather than comparing a rounded ratio. */
export const meetsRatio = (c1, c2, target) => contrastRatioExact(c1, c2) >= target;

/**
 * WCAG 1.4.3 "large scale" text: >=18pt, or >=14pt bold. Understanding 1.4.3 gives the conversion
 * 1pt = 1.333px, so 18pt = 24px and 14pt = 18.66px. Weight >= 700 counts as bold.
 */
export function isLargeText(px, weight) {
  const w = Number(weight) || 400;
  return px >= 24 || (px >= 18.66 && w >= 700);
}
/** The ratio SC 1.4.3 (AA) demands for this text: 3:1 large, else 4.5:1. */
export const requiredRatio = (px, weight) => (isLargeText(px, weight) ? 3 : 4.5);

/* ───────────────────────── style resolution ───────────────────────── */

/* Which element types actually paint text (and therefore have a contrast obligation). Containers
 * only matter as backdrop providers. */
const TEXT_TYPES = new Set(['e-heading', 'e-paragraph', 'e-button']);
/* Elementor's own defaults for a bare atomic page (canvas template, no theme typography). */
const DEFAULTS = { fontSize: 16, fontWeight: 400 };

/** id → hex for the theme's global colour variables. */
export function variableMap(bundle) {
  const m = {};
  for (const v of bundle.variableList || []) {
    if (v?.type === 'global-color-variable' && typeof v.value?.value === 'string') m[v.id] = v.value.value;
  }
  for (const [id, v] of Object.entries(bundle.variables?.data || {})) {
    if (v?.type === 'global-color-variable' && typeof v.value?.value === 'string' && !m[id]) m[id] = v.value.value;
  }
  return m;
}

/**
 * A colour prop envelope → a CSS colour string, or {unresolved:reason}.
 * Handles literal colour envelopes and global-colour-variable refs (resolved through the theme).
 */
export function colorFromEnvelope(env, vars) {
  if (env == null) return null;
  if (typeof env === 'string') return env;
  if (env.$$type === 'color') return typeof env.value === 'string' ? env.value : null;
  if (env.$$type === 'global-color-variable') {
    const lit = vars[env.value] ?? env.__lit;
    return lit ?? { unresolved: `global colour variable ${env.value} is not in the theme's variable list` };
  }
  return null;
}

/**
 * A `background` prop envelope → {color} | {unresolved: reason}. A gradient or image overlay is
 * NOT collapsed into a single colour — that is exactly the "text over an image" case a compiler
 * must refuse to guess at, so it returns an explicit unresolved reason instead.
 */
export function backgroundFromEnvelope(env, vars) {
  if (env == null) return null;
  if (env.$$type !== 'background') return null;
  const v = env.value || {};
  const overlays = v['background-overlay']?.value;
  if (Array.isArray(overlays) && overlays.length) {
    const kinds = overlays.map((o) => o?.$$type);
    if (kinds.some((k) => k === 'background-image-overlay')) {
      return { unresolved: 'background image — the pixel behind the text is not knowable at compile time' };
    }
    if (kinds.some((k) => k === 'background-gradient-overlay')) {
      // A gradient HAS knowable stops; we surface them so the caller can check the worst case.
      const stops = [];
      for (const o of overlays) {
        for (const st of o?.value?.stops?.value || []) {
          const c = colorFromEnvelope(st?.value?.color, vars);
          if (typeof c === 'string') stops.push(c);
        }
      }
      return stops.length ? { gradientStops: stops } : { unresolved: 'gradient background with unreadable stops' };
    }
  }
  const c = colorFromEnvelope(v.color, vars);
  if (c && typeof c === 'object' && c.unresolved) return c;
  return c ? { color: c } : null;
}

/**
 * Merge every style source that applies to a node, in CASCADE ORDER, for one breakpoint/state.
 * settings.classes.value is an ordered list holding BOTH shared registry classes and the node's
 * own local style id — resolving it in order and letting later win mirrors what the browser does
 * with Elementor's emitted stylesheet closely enough for colour/size purposes.
 */
export function nodeProps(node, classItems, { breakpoint = 'desktop', state = null } = {}) {
  const out = {};
  const take = (variants) => {
    for (const v of variants || []) {
      if ((v.meta?.breakpoint ?? 'desktop') !== breakpoint) continue;
      if ((v.meta?.state ?? null) !== state) continue;
      Object.assign(out, v.props || {});
    }
  };
  for (const ref of node.settings?.classes?.value || []) {
    if (classItems[ref]) take(classItems[ref].variants);
    else if (node.styles?.[ref]) take(node.styles[ref].variants);
  }
  // local styles that were never linked through settings.classes (hand-built / decompiled trees)
  for (const [sid, st] of Object.entries(node.styles || {})) {
    if ((node.settings?.classes?.value || []).includes(sid)) continue;
    take(st.variants);
  }
  return out;
}

const px = (env, inheritedPx) => {
  if (env?.$$type !== 'size') return null;
  const { unit, size } = env.value || {};
  const n = Number(size);
  if (!Number.isFinite(n)) return null;
  if (unit === 'px' || unit == null) return n;
  if (unit === 'rem') return n * 16;
  if (unit === 'em') return n * (inheritedPx ?? DEFAULTS.fontSize);
  return null;                      // %, vw, ch … → not resolvable to a px size here
};

/** Plain text of a heading/paragraph/button node, for reporting. */
export function nodeText(n, overrides = null) {
  const s = n.settings || {};
  let src = s.title ?? s.paragraph ?? s.text;
  // inside a component instance the author may have overridden the text for THIS instance
  if (overrides) {
    for (const key of ['title', 'paragraph', 'text']) {
      const o = overrides[`${n.id}:${key}`];
      if (o !== undefined) { src = o; break; }
    }
  }
  const raw = src?.$$type === 'html-v3' ? src.value?.content?.value : typeof src === 'string' ? src : src?.value;
  if (typeof raw !== 'string') return '';
  return raw.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
};

/** Every custom_css blob that applies to a node, decoded. After dedup the raw CSS has MOVED from
 * the node's local styles into the shared class registry, so both sources must be read or the
 * blind-spot detection silently stops working on exactly the bundles that ship. */
export function rawCssOf(n, classItems = {}) {
  let out = '';
  const take = (variants) => {
    for (const v of variants || []) {
      if (v?.custom_css?.raw) { try { out += Buffer.from(v.custom_css.raw, 'base64').toString('utf8') + '\n'; } catch { /* ignore */ } }
    }
  };
  for (const ref of n.settings?.classes?.value || []) {
    if (classItems[ref]) take(classItems[ref].variants);
    else if (n.styles?.[ref]) take(n.styles[ref].variants);
  }
  for (const [sid, st] of Object.entries(n.styles || {})) {
    if ((n.settings?.classes?.value || []).includes(sid)) continue;
    take(st.variants);
  }
  return out;
}

/**
 * Walk one page's tree resolving the effective text colour, backdrop, font size and weight for
 * every node, and evaluate contrast on the ones that paint text.
 *
 * `ground` is the page's backdrop of last resort — what is behind the outermost element. It is a
 * genuine unknown to the compiler (it comes from the WordPress theme), so it is CONFIGURABLE and
 * defaults to white, which is what the canvas template gives on a stock install.
 */
export function analyzePageContrast(page, { classItems = {}, vars = {}, ground = '#ffffff', groundText = '#000000', components = [] } = {}) {
  const findings = [];
  const groundRgb = parseColor(ground) || { r: 255, g: 255, b: 255, a: 1 };

  const walk = (nodes, inherited, overrides = null) => {
    for (const n of nodes || []) {
      // A registered component INSTANCE carries no children of its own — its tree lives in the
      // bundle's component registry and is stamped in at deploy. Contrast is a property of the
      // rendered page, so we must follow the reference or we silently under-report every reused
      // card/row on the site (648 instances across the 50-page corpus).
      if ((n.widgetType || n.elType) === 'e-component') {
        const inst = n.settings?.component_instance?.value;
        // Resolve by UID first. In a freshly compiled bundle EVERY instance carries the placeholder
        // `component_id: 0` — real ids are per-site and only stamped in by deploy's uid→id rewrite —
        // so an id-first lookup silently resolves every instance on the page to components[0]. On a
        // page with more than one registered component that both invents contrast nodes for the
        // wrong tree AND never checks the right one; 34 of the 50-page corpus are multi-component.
        // The bundle keeps the true reference in `editor_settings.component_uid`.
        const uid = n.editor_settings?.component_uid;
        const cid = inst?.component_id?.value;
        const def = (uid != null ? components.find((c) => c.uid === uid) : null)
          ?? (typeof cid === 'number' ? components[cid] : components.find((c) => c.uid === cid));
        if (def) {
          const ov = {};
          for (const o of inst?.overrides?.value || []) {
            const key = o?.value?.override_key;
            const spec = def.settings?.overridable_props?.props?.[key];
            if (spec?.elementId) ov[`${spec.elementId}:${spec.propKey}`] = o.value.override_value;
          }
          walk(def.elements, inherited, ov);
        }
        continue;
      }
      const props = nodeProps(n, classItems);
      const ctx = { ...inherited };

      // font size / weight inherit
      const fs = px(props['font-size'], inherited.fontSize);
      if (fs != null) ctx.fontSize = fs;
      const fw = props['font-weight'];
      if (fw?.$$type === 'string' || fw?.$$type === 'number') {
        const w = Number(fw.value);
        if (Number.isFinite(w)) ctx.fontWeight = w;
        else if (fw.value === 'bold') ctx.fontWeight = 700;
      }

      // RAW CSS IS A BLIND SPOT, AND IT MUST BE DECLARED AS ONE. custom_css can restyle a whole
      // subtree through nested selectors (`& .e-tab p { color: … }`) which no amount of prop
      // resolution can see. Assuming the inherited value there produces confident nonsense — it
      // reported 3 "black on near-black" failures on the tracewell page whose real colour was set
      // in a nested rule and passed fine. So: any custom_css touching colour poisons the subtree
      // into `unresolved`, which is the honest answer.
      const rawCss = rawCssOf(n, classItems);
      if (/(^|[;{\s])color\s*:/.test(rawCss)) ctx.color = { unresolved: 'colour is set in raw custom_css (possibly a nested selector), which compile-time prop resolution cannot see' };
      if (/(^|[;{\s])background(-color)?\s*:/.test(rawCss)) ctx.bg = { unresolved: 'background is set in raw custom_css, which compile-time prop resolution cannot see' };

      // text colour inherits
      const col = colorFromEnvelope(props.color, vars);
      if (col && typeof col === 'object' && col.unresolved) ctx.color = { unresolved: col.unresolved };
      else if (typeof col === 'string') ctx.color = col;

      // backdrop: an OPAQUE own background replaces the inherited one; a translucent one composites
      const bg = backgroundFromEnvelope(props.background, vars);
      if (bg?.unresolved) ctx.bg = { unresolved: bg.unresolved };
      else if (bg?.gradientStops) ctx.bg = { gradientStops: bg.gradientStops };
      else if (bg?.color) {
        const parsed = parseColor(bg.color);
        if (!parsed) ctx.bg = { unresolved: `background colour "${bg.color}" is not a resolvable literal (var()/color-mix()/oklch() cannot be evaluated at compile time)` };
        else if (parsed.a === 0) { /* fully transparent: the inherited backdrop shows through unchanged */ }
        else if (parsed.a < 1) {
          // A translucent panel takes the colour of WHAT IS BEHIND IT. Getting this wrong is not a
          // rounding error: a 60%-opaque dark panel over a dark gradient resolved against the page
          // ground instead reads as mid-grey, which invents contrast failures that do not exist
          // (caught on the basis-tax page — 8 phantom findings).
          if (ctx.bg?.unresolved) { /* keep the unresolved reason — we still cannot know */ }
          else if (ctx.bg?.gradientStops) {
            // composite over EVERY stop; the sweep stays a sweep, just tinted by the panel
            const under = ctx.bg.gradientStops.map(parseColor).filter(Boolean);
            ctx.bg = under.length
              ? { gradientStops: under.map((u) => toHex(composite(parsed, u.a < 1 ? composite(u, groundRgb) : u))) }
              : { unresolved: 'translucent background over a gradient with unreadable stops' };
          } else {
            const under = ctx.bg?.rgb ?? groundRgb;
            ctx.bg = { rgb: composite(parsed, under) };
          }
        } else ctx.bg = { rgb: parsed };
      }

      // opacity/filter on an ancestor invalidates any computed pair — bail loudly rather than lie
      if (props.opacity != null || props.filter != null || props['mix-blend-mode'] != null) {
        ctx.bg = { unresolved: 'an ancestor sets opacity/filter/mix-blend-mode, which changes the painted colours' };
      }

      if (TEXT_TYPES.has(n.widgetType) || TEXT_TYPES.has(n.elType)) {
        findings.push(evaluate(n, ctx, groundRgb, page, overrides));
      }
      walk(n.elements, ctx, overrides);
    }
  };

  walk(page.elements, {
    color: groundText, bg: { rgb: groundRgb },
    fontSize: DEFAULTS.fontSize, fontWeight: DEFAULTS.fontWeight,
  });
  return findings.filter(Boolean);
}

function evaluate(n, ctx, groundRgb, page, overrides) {
  const where = `${page.slug ?? page.type ?? 'page'}#${n.id}`;
  const text = nodeText(n, overrides);
  const size = ctx.fontSize ?? DEFAULTS.fontSize;
  const weight = ctx.fontWeight ?? DEFAULTS.fontWeight;
  const need = requiredRatio(size, weight);
  const base = { where, text, size, weight, required: need, tag: n.settings?.tag?.value, type: n.widgetType || n.elType };

  // Empty text has nothing to contrast — and an icon-only button is a 1.4.11 question, not 1.4.3.
  if (!text) return null;

  if (ctx.color && typeof ctx.color === 'object' && ctx.color.unresolved) {
    return { ...base, status: 'unresolved', reason: ctx.color.unresolved };
  }
  const fg = parseColor(ctx.color);
  if (!fg) return { ...base, status: 'unresolved', reason: `text colour "${ctx.color}" is not a resolvable literal` };

  if (ctx.bg?.unresolved) return { ...base, status: 'unresolved', reason: ctx.bg.unresolved, fg: ctx.color };

  // A gradient backdrop IS checkable: the text must pass against the WORST stop, because the
  // author cannot control which part of the sweep a given glyph lands on.
  if (ctx.bg?.gradientStops) {
    const stops = ctx.bg.gradientStops.map(parseColor).filter(Boolean);
    if (!stops.length) return { ...base, status: 'unresolved', reason: 'gradient stops are not resolvable literals', fg: ctx.color };
    const opaque = stops.map((s) => (s.a < 1 ? composite(s, groundRgb) : s));
    const fgOn = (b) => contrastRatioExact(fg.a < 1 ? composite(fg, b) : fg, b);
    const ratios = opaque.map(fgOn);
    const worstExact = Math.min(...ratios);
    const idx = ratios.indexOf(worstExact);
    const worst = Math.round(worstExact * 100) / 100;
    return {
      ...base, status: worstExact >= need ? 'pass' : 'fail', ratio: worst,
      fg: ctx.color, bg: ctx.bg.gradientStops[idx], over: 'gradient',
      reason: worst >= need ? undefined : `worst gradient stop ${ctx.bg.gradientStops[idx]}`,
    };
  }

  const bgRgb = ctx.bg?.rgb ?? groundRgb;
  const fgOpaque = fg.a < 1 ? composite(fg, bgRgb) : fg;
  const exact = contrastRatioExact(fgOpaque, bgRgb);
  const bgHex = toHex(bgRgb);
  return { ...base, status: exact >= need ? 'pass' : 'fail', ratio: Math.round(exact * 100) / 100, fg: ctx.color, bg: bgHex };
}

export const toHex = ({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Every page + part of a bundle → contrast findings. */
export function analyzeContrast(bundle, opts = {}) {
  const vars = variableMap(bundle);
  const classItems = bundle.classes?.items || {};
  const cfg = { classItems, vars, components: bundle.components || [], ...(bundle.a11y || {}), ...opts };
  const out = [];
  for (const page of [...(bundle.pages || []), ...(bundle.parts || [])]) out.push(...analyzePageContrast(page, cfg));
  return out;
}

/* ───────────────────────── landmarks ───────────────────────── */

/**
 * The landmark vocabulary, and how each one is EXPRESSED on an Elementor atomic element.
 *
 * Two independent mechanisms, with very different reliability — both live-verified against
 * Elementor 4.2.1 free on a real install (see docs/A11Y.md "the two routes"):
 *
 *   tag   — `settings.tag`, enum ['div','header','section','article','aside','footer','a','button']
 *           (Flexbox/Div_Block/Grid define_props_schema). Renders on EVERY tier, free included.
 *           `main` and `nav` are NOT in the enum: passing them fails the save with a 422
 *           `tag: invalid_value`, so they are simply unavailable as native elements.
 *   attrs — `settings.attributes`. STORED and editor-validated everywhere, but free core's
 *           Attributes_Transformer::transform() `return null`s, so NOTHING is emitted to the DOM.
 *           Elementor Pro >= 4.1 registers a real transformer (licence feature
 *           `atomic-custom-attributes`) and does emit them.
 *
 * Consequence, stated plainly: banner / contentinfo / complementary are reachable on free
 * Elementor via native tags. main / navigation / search / a NAMED region need `role`+`aria-label`,
 * which means they need Pro. `tier` records which is which so lint can tell the truth about it.
 */
export const LANDMARKS = {
  banner: { tag: 'header', role: 'banner', tier: 'free', note: 'native <header>' },
  contentinfo: { tag: 'footer', role: 'contentinfo', tier: 'free', note: 'native <footer>' },
  complementary: { tag: 'aside', role: 'complementary', tier: 'free', note: 'native <aside>' },
  main: { tag: 'div', role: 'main', tier: 'pro', note: '<main> is not in Elementor\'s tag enum, so this needs role="main" (Pro emits attributes; free drops them)' },
  navigation: { tag: 'div', role: 'navigation', tier: 'pro', note: '<nav> is not in Elementor\'s tag enum, so this needs role="navigation" (Pro only)' },
  search: { tag: 'div', role: 'search', tier: 'pro', note: 'role="search" has no native element (Pro only)' },
  region: { tag: 'section', role: null, tier: 'pro', needsLabel: true, note: '<section> only exposes a region landmark once it has an accessible name, which needs aria-label (Pro only)' },
  article: { tag: 'article', role: null, tier: 'free', note: 'native <article> (note: article is NOT a landmark for axe\'s region rule)' },
};

/** Landmarks that may appear at most once per page. */
export const UNIQUE_LANDMARKS = new Set(['banner', 'contentinfo', 'main']);

/**
 * landmark="…" (+ optional label) → the { tag, attrs } an atomic container should carry.
 * Throws on an unknown landmark, and on a `region` with no label (an unnamed region is not a
 * landmark at all — silently emitting one would be the exact "looks fixed, isn't" failure this
 * module exists to prevent).
 */
export function landmarkSettings(landmark, label) {
  const def = LANDMARKS[landmark];
  if (!def) {
    throw new Error(`landmark="${landmark}" is not a landmark role — use one of ${Object.keys(LANDMARKS).join(' | ')}`);
  }
  if (def.needsLabel && !label) {
    throw new Error(`landmark="${landmark}" requires a label: <section> exposes a region landmark ONLY when it has an accessible name. Write landmark="${landmark}" label="What this section is", or drop the landmark and use a plain container.`);
  }
  const attrs = {};
  // Emit `role` ONLY where the native tag cannot express the landmark. A <header> already IS a
  // banner; adding role="banner" is redundant markup that some linters flag (prefer-tag-over-role)
  // and that would wrongly assert bannerhood on a NESTED header. The Pro-tier landmarks have no
  // native tag available at all, so for them role is the whole mechanism.
  if (def.role && def.tier === 'pro') attrs.role = def.role;
  if (label) attrs['aria-label'] = label;
  return { tag: def.tag, attrs, tier: def.tier, role: def.role };
}

/** Read the landmark a node carries back out of a compiled tree (tag + attributes). */
export function readLandmark(n) {
  const tag = n.settings?.tag?.value;
  const attrs = {};
  for (const kv of n.settings?.attributes?.value || []) {
    const k = kv?.value?.key?.value; const v = kv?.value?.value?.value;
    if (k) attrs[k] = v;
  }
  const role = attrs.role;
  if (role && Object.values(LANDMARKS).some((d) => d.role === role)) {
    return { landmark: Object.entries(LANDMARKS).find(([, d]) => d.role === role)[0], label: attrs['aria-label'], via: 'role' };
  }
  const byTag = Object.entries(LANDMARKS).find(([, d]) => d.tag === tag && d.tier === 'free' && !d.needsLabel);
  if (byTag) return { landmark: byTag[0], label: attrs['aria-label'], via: 'tag' };
  if (tag === 'section' && attrs['aria-label']) return { landmark: 'region', label: attrs['aria-label'], via: 'tag+label' };
  return null;
}

/* ───────────────────────── remediation ───────────────────────── */

/**
 * The nearest colour to `fg` that reaches `target` contrast against `bg`, found by walking the
 * foreground's own lightness toward whichever end of the scale the backdrop is not.
 *
 * This is the other half of what makes contrast a COMPILE-TIME concern. At build time the failing
 * value is still a token the author owns, so we can hand back a concrete replacement ("#4A5A57 →
 * #6E8480") instead of the usual "insufficient contrast" that leaves them guessing. It preserves
 * hue and saturation and moves only lightness, so a brand palette stays recognisably itself.
 *
 * Returns { color, ratio, steps } or null when even pure black/white cannot reach the target
 * (which means the BACKGROUND is the thing that has to change — reported as such).
 */
export function suggestAccessibleColor(fg, bg, target = 4.5) {
  const f = parseColor(fg); const b = parseColor(bg);
  if (!f || !b) return null;
  const bOpaque = b.a < 1 ? composite(b, { r: 255, g: 255, b: 255, a: 1 }) : b;
  // move away from the backdrop's luminance: light backdrop → darken, dark backdrop → lighten
  const goDark = relativeLuminance(bOpaque) > 0.18;
  const { h, s } = rgbToHsl(f);
  const startL = rgbToHsl(f).l;
  for (let i = 1; i <= 100; i++) {
    const l = clamp01(goDark ? startL - i / 100 : startL + i / 100);
    const [r, g, bl] = hslToRgb(h, s, l);
    const cand = { r, g, b: bl, a: 1 };
    const exact = contrastRatioExact(cand, bOpaque);
    if (exact >= target) return { color: toHex(cand), ratio: Math.round(exact * 100) / 100, steps: i };
    if (l === 0 || l === 1) break;
  }
  return null;
}

/** rgb (0-255) → {h (deg), s, l} (0-1). */
export function rgbToHsl({ r, g, b }) {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const max = Math.max(R, G, B); const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}
