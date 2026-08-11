/** compile.mjs — pure, offline: a site definition → a deployable bundle (trees + kit + fonts). NO MCP. */
import { renderPage } from './runtime.mjs';
import { assertTree } from './kit/kit.mjs';
import { extractClasses, mergeClasses } from './classes.mjs';
import { beginComponents, finalizeComponents, endComponents } from './component.mjs';

/**
 * Normalize every element id to be globally unique within a page, rekeying local styles (whose ids
 * embed the element id) and settings.classes local refs. A compiler must guarantee this regardless of
 * how many kit instances / eager helper calls contributed subtrees — sidesteps id-counter collisions.
 * (exported: deploy.mjs re-normalizes pages after the inline-expansion component fallback.)
 */
export function normalizeIds(elements) {
  let n = 0;
  const next = () => `e${(n++).toString(36).padStart(5, '0')}`;
  const walk = (node) => {
    const oldId = node.id; const newId = next();
    node.id = newId;
    if (node.styles && Object.keys(node.styles).length) {
      const restyled = {};
      const map = {};
      for (const [sid, st] of Object.entries(node.styles)) {
        const nsid = sid.replace(oldId, newId);
        map[sid] = nsid;
        restyled[nsid] = { ...st, id: nsid, label: st.label === oldId ? newId : st.label };
      }
      node.styles = restyled;
      if (node.settings?.classes?.value) node.settings.classes.value = node.settings.classes.value.map((c) => map[c] ?? c);
    }
    (node.elements || []).forEach(walk);
  };
  elements.forEach(walk);
  return elements;
}

const countStyles = (els) => els.reduce((a, n) => a + Object.keys(n.styles || {}).length + countStyles(n.elements || []), 0);

/* Interactive atomic widgets ship as webpack CHUNKS that need elementor's webpack.runtime —
 * which Elementor 4.1.4 only enqueues when a CLASSIC widget is on the page. A pure-atomic page
 * with e-tabs/e-youtube gets stranded chunks (dead tabs, no iframe — live-probed). Guarantee the
 * runtime by injecting an invisible classic html carrier when needed. */
const CHUNK_WIDGETS = new Set(['e-tabs', 'e-youtube']);
function ensureRuntimeCarrier(elements) {
  let hasChunk = false, hasClassic = false;
  (function walk(ns) {
    for (const n of ns || []) {
      if (n.elType === 'e-tabs' || CHUNK_WIDGETS.has(n.widgetType)) hasChunk = true;
      if (n.elType === 'widget' && n.widgetType && !n.widgetType.startsWith('e-')) hasClassic = true;
      walk(n.elements);
    }
  })(elements);
  if (hasChunk && !hasClassic) {
    elements.push({ id: 'ecarrier', elType: 'widget', widgetType: 'html', settings: { html: '<span data-exjsx-runtime-carrier hidden></span>' }, styles: {}, elements: [] });
  }
  return elements;
}

/* Reduced-motion guard (a11y — OUR value-add: native Elementor ships ZERO prefers-reduced-motion
 * handling, source-verified 4.2.1). Interactions are JS-driven, so a CSS @media guard can't
 * express the opt-out; instead every tree that carries interactions gets a tiny inline script
 * that neutralizes the footer interactions JSON (#elementor-interactions-data → '[]') when the
 * user prefers reduced motion — elements then simply render at their natural final state.
 * TIMING: the JSON prints at wp_footer:10, its consumer scripts at wp_footer:20, and MutationObserver
 * microtasks flush between parser-executed scripts — so neutralizing on the node's INSERTION always
 * beats the consumer (plus a DOMContentLoaded sweep as belt-and-suspenders). Opt out via
 * site.config.mjs / defineSite `motion: { respectReducedMotion: false }`. */
export const MOTION_GUARD_SNIPPET = '<script data-exjsx-motion-guard>(function(){if(!matchMedia("(prefers-reduced-motion: reduce)").matches)return;var z=function(){var s=document.getElementById("elementor-interactions-data");return!!(s&&s.textContent!=="[]")&&(s.textContent="[]",!0)};if(!z()){var o=new MutationObserver(function(){z()&&o.disconnect()});o.observe(document.documentElement,{childList:true,subtree:true});addEventListener("DOMContentLoaded",function(){z();o.disconnect()})}})()</script>';
function ensureMotionGuard(elements, respect) {
  if (!respect) return elements;
  let hasMotion = false;
  (function walk(ns) { for (const n of ns || []) { if (n.interactions?.items?.length) hasMotion = true; walk(n.elements); } })(elements);
  if (hasMotion) {
    elements.push({ id: 'emguard', elType: 'widget', widgetType: 'html', settings: { html: MOTION_GUARD_SNIPPET }, styles: {}, elements: [] });
  }
  return elements;
}

/** popup display sugar → the meta shape Pro's Triggers reads. PHP stores each trigger group as
 * ['yes', 'delay'=>n] — mixed int+string keys — so the JSON must be {"0":"yes","delay":n}
 * (an ARRAY ['yes',{delay}] would decode to the wrong PHP shape). */
const trg = (extra = {}) => ({ 0: 'yes', ...extra });
function normalizePopupDisplay(display) {
  if (!display) return { triggers: { page_load: trg({ delay: 0 }) }, timing: [] };
  if (display.triggers) return display;                       // already canonical
  const triggers = {};
  if (display.pageLoad !== undefined) triggers.page_load = trg({ delay: Number(display.pageLoad) || 0 });
  if (display.scrollPercent !== undefined) triggers.scrolling = trg({ direction: 'down', offset: Number(display.scrollPercent) });
  if (display.exitIntent) triggers.exit_intent = trg();
  return { triggers, timing: display.timing || [] };
}

export function compileSite(site) {
  if (!site?.$$site) throw new Error('compile: entry must default-export defineSite({...})');
  // component collection (spec 2.0): active for the WHOLE compile so defineComponent invocations
  // in any page/part emit instance nodes into ONE shared registry; finally-cleared so a failed
  // compile can never leak the collector into later bare renderPage() calls.
  try {
    beginComponents();
    return compileSiteInner(site);
  } finally {
    endComponents();
  }
}

function compileSiteInner(site) {
  const { name, theme, pages, parts } = site;
  const respectReducedMotion = site.motion?.respectReducedMotion !== false;   // default ON
  const fonts = new Set();
  const classMaps = [];
  let localStyleCount = 0;
  const compileTree = (node) => {
    // motion guard BEFORE the runtime carrier: the guard IS a classic widget, so it doubles as
    // the webpack-runtime carrier when both would apply (one injected widget, not two).
    const elements = normalizeIds(ensureRuntimeCarrier(ensureMotionGuard(renderPage(node), respectReducedMotion)));
    assertTree(elements);                       // validate WITH local styles (checks read style props)
    localStyleCount += countStyles(elements);
    classMaps.push(extractClasses(elements));   // dedup → shared classes; strips local styles in place
    return elements;
  };
  const compiledPages = pages.map((p) => {
    const elements = compileTree(p.node);
    for (const f of Object.values(theme?.spec?.font || {})) fonts.add(f);
    // seo: {title, description, ogImage, canonical, noindex} → _exjsx_seo meta (deploy ships the runtime)
    return { title: p.title, slug: p.slug, template: p.template || 'elementor_canvas', ...(p.seo ? { seo: p.seo } : {}), elements };
  });
  // theme PARTS compile through the SAME pipeline + registry — header/footer/single share the
  // design system. `single` maps to the Pro single-post document (conditions: singular posts).
  const PART_TYPES = {
    header: { type: 'header', cond: ['include/general'] },
    footer: { type: 'footer', cond: ['include/general'] },
    single: { type: 'single-post', cond: ['include/singular/post'] },
    popup: { type: 'popup', cond: ['include/general'] },
    archive: { type: 'archive', cond: ['include/archive'] },          // blog index / category / tag
    error404: { type: 'error-404', cond: ['include/general'] },       // the 404 document matches via its own location
  };
  const compiledParts = [];
  for (const [key, def] of Object.entries(PART_TYPES)) {
    const part = parts?.[key];
    if (!part) continue;
    compiledParts.push({
      type: def.type,
      title: part.title || `${name} ${key}`,
      conditions: part.conditions || def.cond,
      // popup-only: display settings ({triggers, timing}) → _elementor_popup_display_settings.
      // Sugar: display:{pageLoad:secs} → the canonical page_load trigger group.
      ...(key === 'popup' ? { display: normalizePopupDisplay(part.display) } : {}),
      elements: compileTree(part.node),
    });
  }
  const classes = mergeClasses(classMaps);
  // registered components (spec 2.0): validated (≤100, unique titles/uids) + shaped for
  // POST /elementor/v1/components — [{uid, title, elements, settings:{overridable_props}, treeHash}].
  // uid-keyed; deploy maps uid→per-site id and rewrites the instance nodes.
  const components = finalizeComponents();
  return {
    name,
    // no-theme fallback MUST still carry watermark+version — deploying bare {data:{}} writes an
    // invalid blob that sprays "Undefined array key watermark" warnings sitewide (caught by the
    // Pro suite: first theme-less fixture ever deployed).
    variables: theme ? theme.variablesMeta() : { data: {}, watermark: 0, version: 1 },
    variableList: theme?._vars || [],
    classes,                                    // { items, order } → PUT /elementor/v1/global-classes
    fonts: [...fonts],
    pages: compiledPages,
    parts: compiledParts,                       // theme-builder templates (header/footer)
    components,                                 // native Elementor components (spec 2.0)
    stats: { localStylesBefore: localStyleCount, sharedClasses: classes.order.length, components: components.length },
    generatedBy: 'elementor-jsx',
  };
}
