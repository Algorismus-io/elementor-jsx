/**
 * theme.mjs — the design-token layer. A theme file compiles LOCALLY into the exact Elementor kit
 * artifacts (V4 global variables + global-classes registry). Deploy writes them in ONE pass — setting
 * 22 tokens is not 22 REST calls. Components read tokens via useTheme(); tokens resolve to a live
 * `var(--…)` reference (editable in the Class Manager) or a literal (config).
 */
import { S, C, SZ, BG, RAD, DIM } from '../../.claude/skills/elementor-ultra/lib/kit.mjs';

/* deterministic id from a label (stable across builds → idempotent re-deploys, no Date/random) */
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).slice(0, 7); };
const gvId = (label) => `e-gv-${hash('v:' + label)}`;

/**
 * defineTheme({ name, color:{}, font:{head,body}, radius:{}, space:[], shadow:{} })
 * Returns a theme with token accessors and .compileKit() for the one-shot deploy artifact.
 */
export function defineTheme(spec) {
  const { name = 'theme', color = {}, font = {}, radius = {}, space = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96], shadow = {}, tints = [], mode = 'var' } = spec;
  // variable registry: every color + font becomes a global variable
  const vars = [];
  const colorRef = {}; const fontRef = {};
  let order = 1;
  for (const [k, v] of Object.entries(color)) {
    const label = `${name}-${k}`; const id = gvId(label);
    vars.push({ id, type: 'global-color-variable', label, value: { $$type: 'color', value: v }, order: order++ });
    colorRef[k] = { id, label, literal: v };
  }
  for (const [k, v] of Object.entries(font)) {
    const label = `${name}-font-${k}`; const id = gvId(label);
    vars.push({ id, type: 'global-font-variable', label, value: { $$type: 'string', value: v }, order: order++ });
    fontRef[k] = { id, label, literal: v };
  }
  // token accessors — in 'var' mode return the atomic VARIABLE-REFERENCE envelope (live: edits in the
  // Class Manager propagate); in 'literal' mode the raw hex. Unknown keys pass through (inline values).
  const col = (k) => {
    const r = colorRef[k];
    if (!r) return k;
    // var mode: a variable ref carrying a literal fallback (__lit). sx uses the ref for `color`/`font`
    // (live, resolves) and the literal for `bg` (Elementor 4.1.4 atomic backgrounds don't resolve
    // variable refs yet — flip the fallback off the day it does, no author change).
    return mode === 'var' ? { $$type: 'global-color-variable', value: r.id, __lit: r.literal } : r.literal;
  };
  const fnt = (k) => {
    const r = fontRef[k];
    if (!r) return k;
    return mode === 'var' ? { $$type: 'global-font-variable', value: r.id } : r.literal;
  };
  const t = {
    name, spec, _vars: vars, mode,
    color: new Proxy({}, { get: (_, k) => col(k) }),          // t.color.primary → variable ref (var mode) or hex
    lit: new Proxy({}, { get: (_, k) => colorRef[k]?.literal }), // t.lit.primary → always the hex (raw-CSS widgets)
    font: new Proxy({}, { get: (_, k) => fnt(k) }),
    litFont: (k) => fontRef[k]?.literal ?? k,
    radius: (k) => radius[k] ?? (typeof k === 'number' ? k : 24),
    space: (n) => space[n] ?? n,
    shadow: (k) => shadow[k],
    // brand-appropriate card tint by index (+ whether its text should be light) — drives re-skin
    tint: (i) => (tints.length ? tints[i % tints.length] : { bg: colorRef.surface?.literal || '#fff', dark: false }),
    colorRef, fontRef,
    /** the variables blob for _elementor_global_variables (one-shot write).
     * Shape per Variables_Collection::hydrate — `data` + required int `watermark` + `version`
     * (FORMAT_VERSION_V1). Missing watermark → "Cannot assign null to $watermark" fatal. */
    variablesMeta() {
      const data = {};
      for (const v of vars) data[v.id] = { type: v.type, label: v.label, value: v.value, order: v.order, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' };
      return { data, watermark: vars.length, version: 1 };
    },
  };
  return t;
}

/* Re-export token helpers so components can build style values from a theme concisely. */
export { S, C, SZ, BG, RAD, DIM };
