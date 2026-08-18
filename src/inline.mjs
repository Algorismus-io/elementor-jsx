/**
 * inline.mjs — reverse the compiler's global-class dedup so a page is SELF-CONTAINED (no shared kit
 * registry). Use it when MANY different designs must coexist on one WordPress (the kit's global-class
 * registry is single-site: it has a ~1000 cap AND a per-site deploy prunes it, which clobbers other
 * sites). Enable with `build … --inline`. It does three things (field-found by the batch-conversion tester):
 *  1. Re-inline every shared class as a per-element LOCAL style → the page never grows/prunes the shared
 *     kit; deploy skips the global-class PUT when `classes.order` is empty → zero cross-site clobber.
 *     Marks the bundle `inline: true` (a plain JSON boolean — it must survive the bundle.json
 *     stringify/parse round-trip); deploy consults this flag to skip the kit variables write, so an
 *     inline deploy never overwrites the resident site's _elementor_global_variables.
 *  2. SALT element/style ids per page (djb2(bundle.name)) → Elementor scopes local styles by the generic
 *     `.elementor` (not the page id), so unsalted ids would bleed between coexisting pages.
 *  3. Render every `raw`/`custom_css` declaration as a real `<style>` block. custom_css SILENTLY NO-OPS on
 *     a FREE-Elementor LOCAL style (it's a Pro/global-class feature) — which kills raw backgrounds,
 *     overlays, clip/overflow, shadows once a page is localized. We decode each variant's custom_css and
 *     emit a normal stylesheet (`.elementor .<sid>.<sid>{…}` — doubled class beats the atomic rule),
 *     @media-wrapped for tablet/mobile, injected as the first widget so it loads before content.
 *
 * The `<style>` block of (3) SELECTS BY STYLE ID, and style ids embed the element id — so the block is
 * only valid for the exact id numbering it was built from. Anything that renumbers a tree after the
 * build MUST re-emit it (see `reinlineTree`), or every rule lands on the wrong element.
 */
// full base36 hash — slice(0,5) kept only the HIGH digits, so names differing in the last char
// ('site-a'/'site-b') salted IDENTICALLY and coexisting pages could bleed (caught by the test suite).
const djb2 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const MEDIA = { desktop: null, tablet: 'max-width:1024px', mobile: 'max-width:767px' };

/** The injected raw-CSS carrier widget, recognised by the marker its own <style> tag carries. */
const isCarrier = (n) => n?.elType === 'widget' && n.widgetType === 'html' && /^<style id="exjsx-raw-/.test(n.settings?.html || '');

/**
 * Collect the `<style>` body for a tree from the LOCAL STYLES IT CARRIES RIGHT NOW (not from the
 * class registry) — so it can be rebuilt at any point in the pipeline and always agrees with the ids
 * actually on the elements. Returns { cssText, rawRules }.
 */
function collectRawCss(elements, skip = null) {
  const byBp = { desktop: [], tablet: [], mobile: [] };
  let rawRules = 0;
  const walk = (n) => {
    for (const [sid, st] of Object.entries(n.styles || {})) {
      if (skip?.has(sid)) continue;
      for (const v of st.variants || []) {
        const b64 = v?.custom_css?.raw;
        if (!b64) continue;
        const decls = Buffer.from(b64, 'base64').toString('utf8').trim();
        if (!decls) continue;
        const bp = MEDIA[v.meta?.breakpoint] !== undefined ? v.meta.breakpoint : 'desktop';
        // STATE variants keep their selector (1.7.x per-state custom_css): pseudo states as
        // `:state` — hover gets core's `:hover, :focus-visible` comma pair (Style_States
        // additional-states map) — and the e-- editor states as class selectors.
        const state = v.meta?.state;
        const sels = !state ? ['']
          : state.startsWith('e--') ? [`.${state}`]
          : state === 'hover' ? [':hover', ':focus-visible']
          : [`:${state}`];
        const base = `.elementor .${sid}.${sid}`;
        (byBp[bp] || byBp.desktop).push(`${sels.map((s) => base + s).join(',')}{${decls}}`);
        rawRules++;
      }
    }
    (n.elements || []).forEach(walk);
  };
  elements.forEach(walk);
  let cssText = byBp.desktop.join('');
  for (const bp of ['tablet', 'mobile']) {
    if (byBp[bp].length) cssText += `@media(${MEDIA[bp]}){${byBp[bp].join('')}}`;
  }
  return { cssText, rawRules };
}

/**
 * (Re)build a tree's raw-CSS carrier widget. Any existing carrier is REMOVED FIRST and its widget id
 * reused, so calling this again after an id renumbering both refreshes every selector and keeps the
 * document diff-stable. Returns the number of rules emitted.
 *
 * PER PAGE: each page carries its OWN raw-rules <style> widget. The single-shot version pushed
 * one style block with EVERY page's rules into pages[0] only — visitors of pages 2..N never
 * loaded their raw CSS (space-y owls, text-transform, per-side borders, transforms all silently
 * gone; found by the tw-corpus pixel-parity harness, 2026-08-10).
 */
function emitRawCarrier(page, SALT, pi = 0, skip = null) {
  const at = page.elements.findIndex(isCarrier);
  const stale = at >= 0 ? page.elements.splice(at, 1)[0] : null;
  const { cssText, rawRules } = collectRawCss(page.elements, skip);
  if (!cssText) return 0;
  // the carrier widget is zero-height but still gets Elementor's DEFAULT 20px widget
  // bottom-margin — which pushed every inline page down 20px and exposed the theme's body
  // background as a dark strip at the top (field-found on /discord-safety/). The stylesheet
  // collapses its own wrapper by data-id — which is why the id must be the LIVE one.
  const wid = stale ? stale.id : `erawcss${SALT}${pi ? pi : ''}`;
  page.elements.unshift({
    id: wid, elType: 'widget', widgetType: 'html',
    settings: { html: `<style id="exjsx-raw-${SALT}-${pi}">.elementor-element-${wid}{margin:0 !important;height:0;line-height:0;}${cssText}</style>` }, styles: {}, elements: [],
  });
  return rawRules;
}

/**
 * Bring local style ids that this module did NOT mint into the salted namespace. Component subtrees
 * are inline-EXPANDED by deploy long after the build and arrive with the compiler's native
 * `e-<elementId>-s` ids; salting them keeps invariant (2) whole for the whole tree.
 */
function saltLocalStyles(elements, SALT) {
  const prefix = `e-${SALT}-`;
  const adopted = new Set();   // styles this module did not mint — i.e. what expansion brought in
  const walk = (n) => {
    const sids = Object.keys(n.styles || {});
    if (sids.length) {
      const map = {}; const restyled = {};
      for (const sid of sids) {
        const minted = sid.startsWith(prefix);
        const nsid = minted ? sid : sid.replace(/^e-/, prefix);
        if (!minted) adopted.add(nsid);
        map[sid] = nsid;
        restyled[nsid] = { ...n.styles[sid], id: nsid };
      }
      n.styles = restyled;
      const refs = n.settings?.classes?.value;
      if (Array.isArray(refs)) n.settings.classes = { $$type: 'classes', value: refs.map((r) => map[r] ?? r) };
    }
    (n.elements || []).forEach(walk);
  };
  elements.forEach(walk);
  return adopted;
}

/**
 * Re-apply the inline invariants to ONE tree that was mutated AFTER the build — the deploy-time
 * component inline-expansion fallback, which splices component subtrees in and then re-runs
 * `normalizeIds` over the whole page. That renumbering rewrites every element id and every local
 * style id, but it cannot know about the `<style>` carrier's text: the carrier kept selecting the
 * OLD ids, which after a renumbering belong to DIFFERENT elements, so every raw rule silently landed
 * on the wrong element (a hero's `font-size:20vw` on the 12px eyebrow above it). Returns the number
 * of rules emitted.
 *
 * `opts.componentRawCss` (default OFF) additionally routes the EXPANDED SUBTREES' own custom_css
 * into the carrier. A component tree skips class dedup, so its custom_css rides on a LOCAL style and
 * has therefore ALWAYS been silently dropped on free Elementor — in inline and non-inline builds
 * alike. Re-emitting from the live tree makes recovering it free, but it is a rendering CHANGE, not
 * a fix to this bug: turning it on can make an existing page grow borders/transforms/uppercase it
 * has never shown. Opt in per deploy once you have re-checked the affected pages.
 */
export function reinlineTree(bundle, page, pi = 0, opts = {}) {
  const SALT = djb2(bundle?.name || 'pg');
  const adopted = saltLocalStyles(page.elements, SALT);
  return emitRawCarrier(page, SALT, pi, opts.componentRawCss ? null : adopted);
}

/** Mutate a compiled bundle into self-contained/inline form. Returns { inlined, rawRules, dropped }. */
export function inlineLocal(bundle) {
  const items = bundle.classes?.items || {};
  const SALT = djb2(bundle.name || 'pg');
  let inlined = 0, rawRules = 0;

  const walk = (n) => {
    const refs = n.settings?.classes?.value;
    if (Array.isArray(refs) && refs.length) {
      const styles = {};
      const newRefs = [];
      let i = 0;
      for (const ref of refs) {
        const cls = items[ref];
        if (cls) {
          const sid = `e-${SALT}-${n.id}-s${i++ === 0 ? '' : i}`;
          styles[sid] = { id: sid, type: 'class', label: n.id, variants: cls.variants };
          newRefs.push(sid);
          inlined++;
        } else { newRefs.push(ref); }
      }
      n.styles = styles;
      n.settings.classes = { $$type: 'classes', value: newRefs };
    }
    (n.elements || []).forEach(walk);
  };
  bundle.pages.forEach((p, pi) => {
    p.elements.forEach(walk);
    rawRules += emitRawCarrier(p, SALT, pi);
  });
  const dropped = Object.keys(items).length;
  bundle.classes = { items: {}, order: [] };
  // plain JSON boolean — the deploy verb round-trips the bundle through bundle.json, so the marker
  // must survive JSON.stringify/parse; deploy consults it to skip the kit variables write.
  bundle.inline = true;
  bundle.stats = { ...(bundle.stats || {}), inlined, rawRules, sharedClasses: 0 };
  return { inlined, rawRules, dropped };
}
