/** defineSite — the top-level artifact a .jsx entry default-exports.
 * `parts` (optional): site-wide THEME PARTS — { header: {node, conditions?}, footer: {node, conditions?} }.
 * Deployed as Elementor Pro theme-builder templates (conditions default to include/general).
 * Pages that should show them need template: 'elementor_header_footer' (canvas suppresses parts).
 * `motion` (optional): { respectReducedMotion: true } — see compile.mjs ensureMotionGuard. */
export function defineSite({ name = 'site', theme, pages = [], parts = null, motion = null }) {
  return { $$site: true, name, theme, pages, parts, motion };
}

/** Data-driven pages: map a data collection into page definitions. `map(item, i) → {title, slug, node}`.
 * The agency-scale primitive — one template + N rows of data → N pages that all share the design system. */
export function fromData(items, map) { return items.map((item, i) => map(item, i)); }
