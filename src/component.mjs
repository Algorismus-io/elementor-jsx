/**
 * component.mjs — SPEC 2.0 phase 1: JSX components → NATIVE Elementor components.
 *
 * `defineComponent(fn, {title, props})` marks a function as a REGISTERED component: the definition
 * renders ONCE into a component tree (deployed to the `elementor_component` CPT over REST) and every
 * invocation emits an `e-component` INSTANCE node whose JSX props ride as Elementor overridable-prop
 * overrides — the editor shows them as labeled controls on every instance; editing the component
 * updates all instances. Un-defineComponent'ed functions keep the inline expansion path untouched.
 *
 * The props→overrides mapping is SENTINEL-DIFF (spec §"the core algorithm"): render the definition
 * with defaults → tree A; for each declared prop re-render with a unique sentinel string → tree B;
 * both renders are id-NORMALIZED (deterministic walk-order ids), so A and B differ ONLY where the
 * prop landed. A prop must resolve to EXACTLY ONE whole settings prop — styles/classes landings and
 * multi-element landings are BUILD ERRORS (Elementor's own constraint: styles cannot be overridden).
 *
 * False-match safety: the sentinel embeds U+2063 (invisible separator) + the prop key — a string
 * that cannot occur in real content — and a diff is accepted ONLY if the changed settings value
 * actually CONTAINS the sentinel; any diff without it means the render is non-deterministic and
 * fails loudly instead of mis-mapping.
 *
 * Registration state lives on globalThis under a registered symbol (same reason as runtime's CTX:
 * the build bundles a second copy of this module into the entry; the collector must be shared).
 */
import { freshId } from './kit/kit.mjs';
import { stable, djb2 } from './classes.mjs';

const REG_KEY = Symbol.for('exjsx.COMPONENT_REG');
const getReg = () => globalThis[REG_KEY];

/* U+2063 INVISIBLE SEPARATOR brackets make collisions with authored content practically impossible;
 * deterministic (no nonce) so builds stay reproducible byte-for-byte. */
const SENTINEL = (key) => `\u2063EXJSX_PROP:${key}\u2063`;

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'props';
const isKitNode = (x) => x && typeof x === 'object' && typeof x.elType === 'string';

/**
 * Mark a component for native registration. `props` declares the OVERRIDABLE surface:
 *   { plan: { label: 'Plan name', group: 'Content', default: 'Basic' } }
 * `default` is the definition's baseline value (falls back to the fn's own JS param defaults).
 * NOTE (the loud constraint): overridable props can only land on SETTINGS (text, labels, links…).
 * Style-feeding props (tint/radius/sx-ish) are a build error — Elementor components cannot
 * override styles. The blessed idiom for visual variants: N registered components (one per
 * variant), or keep the component un-registered for inline expansion.
 */
export function defineComponent(fn, meta = {}) {
  if (typeof fn !== 'function') throw new Error('defineComponent: first argument must be a component function');
  const title = meta.title;
  if (typeof title !== 'string' || title.trim().length < 2 || title.length > 200) {
    throw new Error(`defineComponent(${fn.name || 'anonymous'}): meta.title is required, 2..200 chars (Elementor component titles are unique per site)`);
  }
  const propsMeta = meta.props || {};
  for (const [k, m] of Object.entries(propsMeta)) {
    if (!m || typeof m !== 'object') throw new Error(`defineComponent("${title}"): props.${k} must be an object ({label, group?, default?})`);
  }
  const wrapper = (props, ctx) => fn(props, ctx);   // direct call ≡ inline expansion (zero breakage outside compileSite)
  wrapper.$$component = { fn, title, propsMeta };
  return wrapper;
}

/* ── collection lifecycle (compileSite owns it) ── */

export function beginComponents() {
  globalThis[REG_KEY] = { defs: new Map(), order: [], stack: [] };
}
export const componentsActive = () => !!getReg();

/** Finish collection: site-level validation + the bundle `components` array. ALWAYS clears the
 * collector (finally-safe via endComponents in compileSite). */
export function finalizeComponents() {
  const reg = getReg();
  if (!reg) return [];
  const defs = reg.order.map((w) => reg.defs.get(w));
  if (defs.length > 100) throw new Error(`components: ${defs.length} registered components — Elementor's hard limit is 100 per site; inline-expand the long tail (drop defineComponent) or split the site`);
  const titles = new Map(); const uids = new Map();
  for (const d of defs) {
    if (titles.has(d.title)) throw new Error(`components: duplicate title "${d.title}" — Elementor requires unique component titles; two different defineComponent definitions share it`);
    titles.set(d.title, d);
    if (uids.has(d.uid) && uids.get(d.uid).title !== d.title) throw new Error(`components: uid collision between "${uids.get(d.uid).title}" and "${d.title}" — rename one`);
    uids.set(d.uid, d);
  }
  return defs.map((d) => ({ uid: d.uid, title: d.title, elements: d.elements, settings: { overridable_props: d.overridable_props }, treeHash: d.treeHash }));
}
export function endComponents() { globalThis[REG_KEY] = null; }

/* ── normalization (shared by definition, sentinel and extraction renders) ──
 * Deterministic walk-order ids (c00000…) so two renders of the same fn produce IDENTICAL trees
 * except where a changed prop landed — the property the sentinel diff and the uid hash both need.
 * Also strips the __cls dedup hint (page-only machinery; an unknown key would leak to the server —
 * component trees keep LOCAL styles, they are never routed through extractClasses). */
function normalizeComponentIds(elements) {
  let n = 0;
  const next = () => `c${(n++).toString(36).padStart(5, '0')}`;
  const walk = (node) => {
    const oldId = node.id; const newId = next();
    node.id = newId;
    if (node.styles && Object.keys(node.styles).length) {
      const restyled = {}; const map = {};
      for (const [sid, st] of Object.entries(node.styles)) {
        const nsid = sid.replace(oldId, newId);
        map[sid] = nsid;
        const { __cls, ...clean } = st;
        restyled[nsid] = { ...clean, id: nsid, label: st.label === oldId ? newId : st.label };
      }
      node.styles = restyled;
      if (node.settings?.classes?.value) node.settings.classes.value = node.settings.classes.value.map((c) => map[c] ?? c);
    }
    (node.elements || []).forEach(walk);
  };
  elements.forEach(walk);
  return elements;
}

/** Render a definition fn to a normalized flat elements array (lazy import dodges the ESM cycle
 * runtime ⇄ component at module-init time; both usages are call-time). */
function renderFn(fn, props) {
  // runtime.mjs imports this module (the seam), so a static import of render here would be
  // circular at init. The registered-symbol handoff keeps the import graph one-directional:
  // runtime publishes its render at module init (fresh per bundled copy — always current).
  const _render = globalThis[Symbol.for('exjsx.render')];
  if (!_render) throw new Error('component: runtime render not initialized — import order bug');
  const out = _render({ $$v: true, type: fn, props, children: [] });
  return normalizeComponentIds((Array.isArray(out) ? out : [out]).filter(isKitNode));
}

/* structural signature — same shape ⇒ ids align across renders */
const shapeOf = (els) => stable(els.map(function sig(n) { return [n.elType, n.widgetType ?? null, (n.elements || []).map(sig)]; }));

const findById = (els, id) => {
  for (const n of els) {
    if (n.id === id) return n;
    const hit = findById(n.elements || [], id);
    if (hit) return hit;
  }
  return null;
};

/* ── validation: atomic-only (mirrors server 422 non_atomic_element_in_component) ── */
function assertAtomicOnly(elements, title) {
  (function walk(ns, path) {
    ns.forEach((n, i) => {
      const p = `${path}[${i}]<${n.widgetType ?? n.elType}>`;
      if (n.elType === 'widget' && n.widgetType && !n.widgetType.startsWith('e-')) {
        throw new Error(
          `component "${title}": classic widget "${n.widgetType}" at ${p} — Elementor components accept ATOMIC elements only ` +
          `(the server 422s with non_atomic_element_in_component). navBar, browserMock and <html> all render the classic html ` +
          `widget; move that part out of the component, or drop defineComponent to keep inline expansion.`);
      }
      walk(n.elements || [], p + '.elements');
    });
  })(elements, '$');
}

/* ── sentinel diff ── */
function diffSettings(a, b, path, out) {
  if (a.length !== b.length) throw Object.assign(new Error('shape'), { shape: true });
  for (let i = 0; i < a.length; i++) {
    const an = a[i], bn = b[i];
    if (an.elType !== bn.elType || an.widgetType !== bn.widgetType) throw Object.assign(new Error('shape'), { shape: true });
    for (const k of new Set([...Object.keys(an.settings || {}), ...Object.keys(bn.settings || {})])) {
      if (stable(an.settings?.[k]) !== stable(bn.settings?.[k])) {
        out.push({ elementId: an.id, elType: an.elType, widgetType: an.widgetType, propKey: k, aVal: an.settings?.[k], bVal: bn.settings?.[k] });
      }
    }
    if (stable(an.styles || {}) !== stable(bn.styles || {})) {
      out.push({ elementId: an.id, elType: an.elType, widgetType: an.widgetType, propKey: null, styles: true });
    }
    diffSettings(an.elements || [], bn.elements || [], path, out);
  }
  return out;
}

function mapProp(def, key, title) {
  const sentinel = SENTINEL(key);
  let B;
  try {
    B = renderFn(def.fn, { ...def.baseProps, [key]: sentinel });
    if (shapeOf(B) !== def.shape) throw Object.assign(new Error('shape'), { shape: true });
  } catch (e) {
    if (e.shape) {
      throw new Error(
        `component "${title}": prop "${key}" CHANGES THE TREE STRUCTURE (conditional rendering?) — overridable props can ` +
        `only swap a settings value, never the shape. Bake the variants as separate registered components, or drop ` +
        `defineComponent for this one.`);
    }
    throw e;
  }
  const diffs = diffSettings(def.rawElements, B, '$', []);
  if (diffs.length === 0) {
    throw new Error(`component "${title}": prop "${key}" does not affect the rendered tree — remove it from props, or use it in the markup`);
  }
  const styleHit = diffs.find((d) => d.styles || d.propKey === 'classes');
  if (styleHit) {
    throw new Error(
      `component "${title}": prop "${key}" lands in STYLES${styleHit.propKey === 'classes' ? '/classes' : ''} on <${styleHit.widgetType ?? styleHit.elType}> — ` +
      `Elementor components CANNOT override styles (only settings; classes are explicitly excluded). ` +
      `The blessed idiom: bake each visual variant as its OWN registered component (variant prop pattern), ` +
      `or drop defineComponent to keep inline expansion for this component.`);
  }
  if (diffs.length > 1) {
    const where = diffs.map((d) => `<${d.widgetType ?? d.elType}>.${d.propKey}`).join(', ');
    throw new Error(
      `component "${title}": prop "${key}" lands on MULTIPLE settings (${where}) — v1 requires exactly ONE target per prop. ` +
      `Split it into one prop per target (fan-out is a v2 candidate).`);
  }
  const d = diffs[0];
  if (!stable(d.bVal).includes(sentinel)) {
    throw new Error(
      `component "${title}": prop "${key}" produced a diff at <${d.widgetType ?? d.elType}>.${d.propKey} that does NOT contain ` +
      `the sentinel — the component renders non-deterministically (Date.now()/random?); registered components must be pure.`);
  }
  /* PROP FORWARDING (spec §3/§4, phase 2): the prop lands inside a NESTED component instance's
   * component_instance envelope — locate WHICH child override key it feeds. The chain wire shape
   * (editor createOverrideValue / resolve-overrides-chain, verified 4.2.1) wraps that child
   * override in the overridable envelope keyed by OUR prop; here we only identify the landing. */
  if (d.propKey === 'component_instance') {
    const aOvs = d.aVal?.value?.overrides?.value || [];
    const bOvs = d.bVal?.value?.overrides?.value || [];
    const aBy = new Map(aOvs.map((o) => [o.value.override_key, o]));
    const changed = bOvs.filter((o) => stable(aBy.get(o.value.override_key)) !== stable(o));
    const dropped = aOvs.filter((o) => !bOvs.some((b) => b.value.override_key === o.value.override_key));
    if (changed.length !== 1 || dropped.length) {
      throw new Error(
        `component "${title}": prop "${key}" changes ${changed.length + dropped.length} override(s) on a nested component ` +
        `instance — forwarding must feed exactly ONE declared prop of the nested component.`);
    }
    const hit = changed[0];
    if (!stable(hit.value.override_value).includes(sentinel)) {
      throw new Error(
        `component "${title}": prop "${key}" diffs a nested instance override ("${hit.value.override_key}") that does NOT ` +
        `contain the sentinel — the component renders non-deterministically; registered components must be pure.`);
    }
    if (!aBy.has(hit.value.override_key)) {
      throw new Error(
        `component "${title}": prop "${key}" forwards into the nested component's "${hit.value.override_key}" but the ` +
        `DEFAULT render passes no value for it — give "${key}" a default (props meta \`default\` or a JS param default) ` +
        `so the chain has a baseline origin value.`);
    }
    return { elementId: d.elementId, propKey: d.propKey, elType: d.elType, widgetType: d.widgetType, innerKey: hit.value.override_key };
  }
  return { elementId: d.elementId, propKey: d.propKey, elType: d.elType, widgetType: d.widgetType };
}

/* ── registration (once per definition; lazy on first invocation) ── */
function ensureRegistered(wrapper, reg) {
  if (reg.defs.has(wrapper)) return reg.defs.get(wrapper);
  const { fn, title, propsMeta } = wrapper.$$component;
  if (reg.stack.includes(wrapper)) {
    const cycle = [...reg.stack.map((w) => w.$$component.title), title].join(' → ');
    throw new Error(`components: circular composition ${cycle} — a component cannot (transitively) contain itself (server 422: circular_dependency_detected)`);
  }
  if (reg.stack.length >= 50) throw new Error(`components: nesting depth > 50 while registering "${title}" — the server DFS caps at 50`);
  reg.stack.push(wrapper);
  try {
    const baseProps = {};
    for (const [k, m] of Object.entries(propsMeta)) if (m.default !== undefined) baseProps[k] = m.default;
    const rawElements = renderFn(fn, baseProps);      // tree A — the canonical definition render
    assertAtomicOnly(rawElements, title);
    const def = { fn, title, propsMeta, baseProps, rawElements, shape: shapeOf(rawElements), map: {} };

    // sentinel-diff every declared prop, then wrap the landings + build the registry
    const props = {}; const groups = { items: {}, order: [] };
    const byTarget = new Map();
    // deep-copy A BEFORE wrapping so extraction renders compare against the untouched shape
    const elements = JSON.parse(JSON.stringify(rawElements));
    for (const [key, m] of Object.entries(propsMeta)) {
      const t = mapProp(def, key, title);
      const tk = `${t.elementId} ${t.propKey} ${t.innerKey || ''}`;
      if (byTarget.has(tk)) {
        throw new Error(`component "${title}": props "${byTarget.get(tk)}" and "${key}" both land in <${t.widgetType ?? t.elType}>.${t.propKey} — one settings prop can carry only one override; merge them into a single prop`);
      }
      byTarget.set(tk, key);
      def.map[key] = t;
      const el = findById(elements, t.elementId);
      let originValue; let originPropFields = null;
      if (t.innerKey) {
        /* FORWARDED prop → the chain envelope (verified 4.2.1, editor createOverrideValue): the
         * nested instance's override item for the child key is WRAPPED in overridable keyed by OUR
         * prop; the registry keeps the UNWRAPPED baseline as originValue (editor
         * resolveOverridePropValue parity) plus originPropFields pointing at the true landing
         * element INSIDE the child (a forwarding child's own originPropFields carries through, so
         * deeper chains stay resolvable level by level — resolve-overrides-chain semantics). */
        const ovs = el.settings.component_instance.value.overrides.value;
        const idx = ovs.findIndex((o) => o.value.override_key === t.innerKey);
        const inner = ovs[idx];
        originValue = inner.value.override_value;
        ovs[idx] = { $$type: 'overridable', value: { override_key: key, origin_value: inner } };
        const childDef = [...reg.defs.values()].find((cd) => cd.uid === el.editor_settings?.component_uid);
        const childEntry = childDef?.overridable_props?.props?.[t.innerKey];
        if (!childEntry) throw new Error(`component "${title}": prop "${key}" forwards to "${t.innerKey}" but the nested component's registry has no such prop (bug; please report)`);
        originPropFields = childEntry.originPropFields
          ?? { elType: childEntry.elType, widgetType: childEntry.widgetType, propKey: childEntry.propKey, elementId: childEntry.elementId };
      } else {
        originValue = el.settings[t.propKey];
        // the overridable envelope (verified 4.2.1: universal-by-union on every atomic settings prop except classes)
        el.settings[t.propKey] = { $$type: 'overridable', value: { override_key: key, origin_value: originValue } };
      }
      const groupLabel = m.group || 'Props';
      const gid = slug(groupLabel);
      if (!groups.items[gid]) { groups.items[gid] = { id: gid, label: groupLabel, props: [] }; groups.order.push(gid); }
      groups.items[gid].props.push(key);
      props[key] = {
        overrideKey: key, label: m.label || key, elementId: t.elementId, propKey: t.propKey,
        elType: t.elType, ...(t.widgetType ? { widgetType: t.widgetType } : {}), originValue, groupId: gid,
        // forwarded props only: where the chain ultimately lands (the parser stores null otherwise)
        ...(originPropFields ? { originPropFields } : {}),
      };
    }
    def.elements = elements;
    def.overridable_props = { props, groups };
    /* uid STABILITY: djb2 of stable-stringified SHIPPED tree (normalized c00000… ids — walk-order
     * deterministic, independent of the global freshId counter) + NUL + title. Same source ⇒ same
     * uid on every build/machine; any tree or title change ⇒ new uid (which deploy uses as the
     * deployed-tree fingerprint — see deploy.mjs planComponents). */
    def.treeHash = djb2(stable(elements));
    def.uid = `x-${djb2(stable(elements) + ' ' + title)}`;
    reg.defs.set(wrapper, def);
    reg.order.push(wrapper);
    return def;
  } finally {
    reg.stack.pop();
  }
}

/* ── instance emission (the runtime seam target) ── */
export function emitComponentInstance(wrapper, props = {}, children = []) {
  const reg = getReg();
  const def = ensureRegistered(wrapper, reg);
  const { title, propsMeta } = wrapper.$$component;
  if (children && children.length) {
    throw new Error(`component "${title}": children passed to a registered component — instances render the REGISTERED tree; children cannot vary per instance. Take content via declared props, or drop defineComponent.`);
  }
  if ('theme' in props) throw new Error(`component "${title}": theme cannot be passed per instance — the definition bakes the active theme once`);
  const passed = Object.keys(props).filter((k) => k !== 'children' && props[k] !== undefined);
  const unknown = passed.filter((k) => !(k in propsMeta));
  if (unknown.length) {
    throw new Error(`component "${title}": unknown prop(s) ${unknown.join(', ')} — declared overridable props: ${Object.keys(propsMeta).join(', ') || '(none)'}. Only declared props vary per instance.`);
  }
  // ONE extraction render with the invocation's actual values yields the exact envelopes the
  // component would produce — the override_value is read from the mapped (elementId, propKey).
  const overrides = [];
  if (passed.length) {
    const E = renderFn(def.fn, { ...def.baseProps, ...Object.fromEntries(passed.map((k) => [k, props[k]])) });
    if (shapeOf(E) !== def.shape) {
      throw new Error(`component "${title}": this invocation's props change the rendered structure — per-instance structure cannot vary; only declared settings props can`);
    }
    for (const k of passed) {
      const m = def.map[k];
      const el = findById(E, m.elementId);
      // FORWARDED prop: the landing is a nested instance's override for the child key — the
      // extraction render's child emission already produced the exact override_value envelope.
      const val = m.innerKey
        ? el?.settings?.component_instance?.value?.overrides?.value?.find((o) => o.value.override_key === m.innerKey)?.value?.override_value
        : el?.settings?.[m.propKey];
      if (val === undefined) throw new Error(`component "${title}": could not extract prop "${k}" from the instance render — mapping drifted (bug; please report)`);
      overrides.push({
        $$type: 'override',
        // schema_source.id MUST equal component_id (server drops the whole prop otherwise) —
        // both are 0 placeholders here; deploy rewrites them together (rewriteComponentIds).
        value: { override_key: k, override_value: val, schema_source: { type: 'component', id: 0 } },
      });
    }
  }
  return {
    id: freshId(),
    elType: 'widget',
    widgetType: 'e-component',
    settings: {
      component_instance: {
        $$type: 'component-instance',
        value: {
          component_id: { $$type: 'number', value: 0 },
          overrides: { $$type: 'overrides', value: overrides },
        },
      },
    },
    editor_settings: { component_uid: def.uid },   // uid-keyed in the bundle; ids are per-site
    styles: {},
    elements: [],
  };
}

/* ── deploy-side tree machinery ── */

/** Rewrite every e-component instance's component_id (and each override's schema_source.id — the
 * invariant) from the uid→id map. Walks pages, parts AND component trees (nested composition). */
export function rewriteComponentIds(elements, uidToId) {
  (function walk(ns) {
    for (const n of ns || []) {
      if (n.widgetType === 'e-component') {
        const uid = n.editor_settings?.component_uid;
        const id = uidToId[uid];
        if (id === undefined) throw new Error(`components: instance references uid ${uid} which was not deployed — bundle/site out of sync`);
        const ci = n.settings?.component_instance?.value;
        if (ci) {
          ci.component_id = { $$type: 'number', value: id };
          for (const o of ci.overrides?.value || []) {
            // chain items (overridable-wrapping-override, prop forwarding) carry the schema_source
            // on the WRAPPED override — same id (Component_Instance_Prop_Type checks both against
            // component_id); plain overrides carry it directly.
            if (o.$$type === 'overridable') o.value.origin_value.value.schema_source = { type: 'component', id };
            else o.value.schema_source = { type: 'component', id };
          }
        }
      }
      walk(n.elements);
    }
  })(elements);
  return elements;
}

/** True if the tree contains any e-component instance node. */
export function hasComponentInstances(elements) {
  let hit = false;
  (function walk(ns) { for (const n of ns || []) { if (n.widgetType === 'e-component') hit = true; walk(n.elements); } })(elements);
  return hit;
}

/** Component uids referenced by a tree (dependency edges for topo-ordered creation). */
export function referencedComponentUids(elements) {
  const uids = new Set();
  (function walk(ns) { for (const n of ns || []) { if (n.widgetType === 'e-component' && n.editor_settings?.component_uid) uids.add(n.editor_settings.component_uid); walk(n.elements); } })(elements);
  return [...uids];
}

/**
 * INLINE-EXPANSION fallback (locked decision: builds stay portable): replace every instance node
 * with a deep copy of its component tree, overrides applied — the pre-2.0 rendering, used when the
 * target cannot create components (no active Pro → 403, or route absent). Overridable envelopes
 * unwrap to origin_value; an instance override replaces it; override_value:null = explicit clear
 * (the setting is REMOVED). Caller MUST re-normalize page ids afterwards (compile normalizeIds) —
 * expansion copies share ids with sibling copies until then.
 */
export function expandInstances(elements, componentsByUid) {
  const expand = (ns) => ns.flatMap((n) => {
    if (n.widgetType !== 'e-component') {
      if (n.elements?.length) n.elements = expand(n.elements);
      return [n];
    }
    const uid = n.editor_settings?.component_uid;
    const comp = componentsByUid[uid];
    if (!comp) throw new Error(`components: cannot inline-expand instance of uid ${uid} — not in the bundle`);
    const byKey = {};
    for (const o of n.settings?.component_instance?.value?.overrides?.value || []) byKey[o.value.override_key] = o.value;
    const copy = JSON.parse(JSON.stringify(comp.elements));
    (function unwrap(ms) {
      for (const m of ms || []) {
        // CHAIN resolution (prop forwarding — Overridable_Transformer parity): a nested instance's
        // overridable-wrapped override resolves to its inner override, with the OUTER instance's
        // value (when provided) carried onto the inner key — so the recursive expand below then
        // applies plain overrides only. override_value:null carries through as an explicit clear.
        const novs = m.settings?.component_instance?.value?.overrides?.value;
        if (novs) {
          m.settings.component_instance.value.overrides.value = novs.map((item) => {
            if (item.$$type !== 'overridable') return item;
            const inner = item.value.origin_value;                    // the baseline override envelope
            const ov = byKey[item.value.override_key];
            if (!ov) return inner;
            return { ...inner, value: { ...inner.value, override_value: ov.override_value } };
          });
        }
        for (const [k, v] of Object.entries(m.settings || {})) {
          if (v?.$$type === 'overridable') {
            const ov = byKey[v.value.override_key];
            if (ov && ov.override_value === null) delete m.settings[k];
            else m.settings[k] = ov ? ov.override_value : v.value.origin_value;
          }
        }
        unwrap(m.elements);
      }
    })(copy);
    return expand(copy);   // nested instances expand too (acyclic — validated at build)
  });
  return expand(elements);
}
