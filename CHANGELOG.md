# Changelog

## 1.1.0 — 2026-08-04

First public release, MIT licensed (© Algorismus).

### Framework
- `exjsx init` — scaffold a buildable fs-project (theme, config, sample page).
- fs-projects: `pages/*.page.jsx` + `parts/*.part.jsx` + `theme.mjs` discovery, slug from filename.
- `elementor-jsx` barrel + auto-injected prelude (~90 primitives usable with zero imports).
- Tailwind-subset `tw=""` prop (desktop-first, `max-lg:`/`max-md:` breakpoints) + CSS-name sx aliases.
- `exjsx lint` (+ `CONVENTIONS.md`), `inspect`, `watch --deploy`, `decompile`, `media`.
- Deploy: drift-hash protection for hand-edited pages, `--only <slug>`, `--inline` carriers,
  version adapters certified across Elementor 4.1.4 → 4.2.1.

### Fixes (all with regression tests; suite now 522)
- `box()` dropped `dir` when a semantic `tag` was set — `<section tw="flex-row">` rendered as a column.
- `loopGrid` accepts any post-type slug (server dry-run remains the authoritative validator).
- `dyn.customField()` emits `custom_key` (arbitrary meta keys; the `key` control is a select of registered keys).
- Local-style id case normalization; `--force` skip ordering; inline-carrier margin collapse.

### Known limits (upstream, documented)
- Elementor Pro ≤ 4.1 hardcodes collection-loop sources to `post|page` — CPT loops are rejected server-side.
- Only a subset of dynamic tags are atomic-valid in V4 (post-title, post-excerpt, URLs, images).
