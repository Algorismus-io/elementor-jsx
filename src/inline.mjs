/**
 * inline.mjs — reverse the compiler's global-class dedup so a page is SELF-CONTAINED (no shared kit
 * registry). Use it when MANY different designs must coexist on one WordPress (the kit's global-class
 * registry is single-site: it has a ~1000 cap AND a per-site deploy prunes it, which clobbers other
 * sites). Enable with `build … --inline`. It does three things (field-found by the batch-conversion tester):
 *  1. Re-inline every shared class as a per-element LOCAL style → the page never grows/prunes the shared
 *     kit; deploy skips the global-class PUT when `classes.order` is empty → zero cross-site clobber.
 *  2. SALT element/style ids per page (djb2(bundle.name)) → Elementor scopes local styles by the generic
 *     `.elementor` (not the page id), so unsalted ids would bleed between coexisting pages.
 *  3. Render every `raw`/`custom_css` declaration as a real `<style>` block. custom_css SILENTLY NO-OPS on
 *     a FREE-Elementor LOCAL style (it's a Pro/global-class feature) — which kills raw backgrounds,
 *     overlays, clip/overflow, shadows once a page is localized. We decode each variant's custom_css and
 *     emit a normal stylesheet (`.elementor .<sid>.<sid>{…}` — doubled class beats the atomic rule),
 *     @media-wrapped for tablet/mobile, injected as the first widget so it loads before content.
 */
// full base36 hash — slice(0,5) kept only the HIGH digits, so names differing in the last char
// ('site-a'/'site-b') salted IDENTICALLY and coexisting pages could bleed (caught by the test suite).
const djb2 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const MEDIA = { desktop: null, tablet: 'max-width:1024px', mobile: 'max-width:767px' };

/** Mutate a compiled bundle into self-contained/inline form. Returns { inlined, rawRules, dropped }. */
export function inlineLocal(bundle) {
  const items = bundle.classes?.items || {};
  const SALT = djb2(bundle.name || 'pg');
  const rawByBp = { desktop: [], tablet: [], mobile: [] };
  let inlined = 0, rawRules = 0;

  const collectRaw = (sid, variants) => {
    for (const v of variants || []) {
      const b64 = v?.custom_css?.raw;
      if (!b64) continue;
      const decls = Buffer.from(b64, 'base64').toString('utf8').trim();
      if (!decls) continue;
      const bp = MEDIA[v.meta?.breakpoint] !== undefined ? v.meta.breakpoint : 'desktop';
      (rawByBp[bp] || rawByBp.desktop).push(`.elementor .${sid}.${sid}{${decls}}`);
      rawRules++;
    }
  };

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
          collectRaw(sid, cls.variants);
          newRefs.push(sid);
          inlined++;
        } else { newRefs.push(ref); }
      }
      n.styles = styles;
      n.settings.classes = { $$type: 'classes', value: newRefs };
    }
    (n.elements || []).forEach(walk);
  };
  for (const p of bundle.pages) p.elements.forEach(walk);

  let cssText = rawByBp.desktop.join('');
  for (const bp of ['tablet', 'mobile']) {
    if (rawByBp[bp].length) cssText += `@media(${MEDIA[bp]}){${rawByBp[bp].join('')}}`;
  }
  if (cssText && bundle.pages[0]) {
    bundle.pages[0].elements.unshift({
      id: `erawcss${SALT}`, elType: 'widget', widgetType: 'html',
      settings: { html: `<style id="exjsx-raw-${SALT}">${cssText}</style>` }, styles: {}, elements: [],
    });
  }
  const dropped = Object.keys(items).length;
  bundle.classes = { items: {}, order: [] };
  bundle.stats = { ...(bundle.stats || {}), inlined, rawRules, sharedClasses: 0 };
  return { inlined, rawRules, dropped };
}
