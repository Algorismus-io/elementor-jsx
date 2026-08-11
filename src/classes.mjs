/**
 * classes.mjs — style DEDUPLICATION → a shared global-class registry (the design-system maturity step).
 *
 * Per-element local styles are the "inline styles everywhere" smell: a 256-node page = 256 style blocks,
 * no reuse, not editable as a system. This pass hashes each element's style variants, collapses identical
 * ones into ONE shared global class, rewrites elements to REFERENCE the class (dropping their local style),
 * and emits the {items, order} registry the Class Manager reads (PUT /elementor/v1/global-classes).
 * Result: far smaller trees, real class reuse, an editable class-based design system.
 */

/** canonical JSON (sorted keys) so structurally-identical variant sets hash equal.
 * (exported: component.mjs reuses the hasher pair for uid/tree fingerprints — spec 2.0) */
export function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export const djb2 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

/**
 * Extract shared classes from a page's elements (mutates: strips local styles, adds class refs).
 * Returns { items, order } for the global-classes registry. A style may carry `__cls` (a semantic
 * label hint, e.g. 'card'); otherwise the class is named by content hash (`c-<hash>`).
 */
export function extractClasses(elements) {
  const byHash = new Map();  // variant-hash → class record
  const order = [];
  const takenLabels = new Set();

  const uniqueLabel = (base) => {
    let label = base, n = 1;
    while (takenLabels.has(label)) label = `${base}-${++n}`;
    takenLabels.add(label);
    return label;
  };

  const walk = (node) => {
    const sids = Object.keys(node.styles || {});
    for (const sid of sids) {
      const st = node.styles[sid];
      if (!st.variants?.length) continue;
      const key = stable(st.variants);
      let cls = byHash.get(key);
      if (!cls) {
        const label = uniqueLabel(st.__cls || `c-${djb2(key).slice(0, 6)}`);
        cls = { id: `g-${label}`, label, type: 'class', variants: st.variants };
        byHash.set(key, cls);
        order.push(cls.id);
      }
      // rewrite: drop the local style, reference the shared class (preserve any other class refs)
      const refs = (node.settings.classes?.value || []).filter((c) => c !== sid);
      node.settings.classes = { $$type: 'classes', value: [...refs, cls.id] };
    }
    if (sids.length) node.styles = {};
    (node.elements || []).forEach(walk);
  };
  elements.forEach(walk);

  const items = {};
  for (const c of byHash.values()) items[c.id] = { id: c.id, label: c.label, type: c.type, variants: c.variants };
  return { items, order };
}

/** merge per-page class maps into one site registry (dedup across pages too). */
export function mergeClasses(maps) {
  const items = {}; const order = [];
  for (const m of maps) for (const id of m.order) if (!items[id]) { items[id] = m.items[id]; order.push(id); }
  return { items, order };
}
