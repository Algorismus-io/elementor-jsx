# Changelog

## Unreleased

**Interactions / motion (SPEC 1.8)** — native entrance/scroll animations, source-verified
against Elementor 4.2.1 free + live-verified on a 4.2.1+Pro Playground stack:
- **`motion={{…}}` prop** (or array ≤5; 6 throws) on every atomic intrinsic → `interact()` /
  `interaction()` — thin JSX adapter, kit stays canonical. `animate` remains as the pre-1.8
  alias (both at once throws); `motion` on `<html>` throws (classic widget never gets
  `data-interaction-id`). Default trigger is now **scrollIn** (never scrollOut — the free 4.2.1
  handler CRASHES on it at trigger time).
- **kit `interaction()`**: config envelope key fixed `'animation-config'` → **`'config-v2'`**
  (Animation_Config_Prop_Type::get_key); `excludeOn: ['mobile']` → the interaction-breakpoints
  envelope; pro config fields (`relativeTo`, `repeat`/`times`, `start`/`end`); custom-effect
  `keyframes` with editor-exact envelopes (stop %, opacity fraction ×100, move px / rotate deg /
  scale factor / skew deg with identity axis defaults); full enum guards (type, direction,
  repeat, timing numbers).
- **lint**: `invalid-interaction` (error) mirrors validation.php field-by-field — the server
  SILENTLY STRIPS invalid items on save, so lint is the only honest failure surface (the one
  hard server failure, >5 items, fails the whole save); `pro-interaction` (warn) flags
  pro-only triggers/effects/config ("saves everywhere, animates with Pro"; scrollOut's free
  crash is named). Positive verification line counts validated items.
- **Reduced-motion guard (a11y value-add — native Elementor ships ZERO prefers-reduced-motion
  handling)**: compiled trees carrying interactions get a tiny inline guard widget that blanks
  the footer `#elementor-interactions-data` JSON on insertion when the user prefers reduced
  motion (elements render at final state). Default ON; opt out via `site.config.mjs` /
  `defineSite` → `motion: { respectReducedMotion: false }`.
- **decompile**: interactions invert to friendly `motion={{…}}` opts (defaults omitted;
  interaction_id re-minted — server treats it as opaque); custom-effect / alien-key items fall
  back to verbatim envelopes (zero loss). Saved-shape (JSON string) interactions decode.
- types: `MotionSpec` (+`MotionKeyframe`) with every pro-flagged field documented;
  `AnimateOptions` deprecated alias. API card: Motion section incl. the gates strip-before-capture
  recipe (`page.emulateMedia({reducedMotion:'reduce'})` or init-script JSON blanking).

100% atomic-element coverage against Elementor 4.2.x:
- **Native `e-grid`**: new `<grid cols rows>` intrinsic + `nativeGrid()` kit helper + `TRACKS`
  (grid-track-size: fr count / custom list) and `GAPXY` (two-axis layout-direction gap) envelopes.
  Every base-style leak (display, 3fr/2fr tracks, 20px gap, 10px padding, mobile 1-column) is
  re-emitted explicitly. Elementor ≥ 4.2 only — the 4.1.x validator has neither the element nor
  the prop type; `gridCols` on a box remains the portable path.
- **tw grid subset**: `grid-rows-N`, `row-span-N`, and `gap-x-*`/`gap-y-*` now compile to ATOMIC
  envelopes (two-axis gap; previously raw CSS). New sx keys: `gapX gapY gridRows rowSpan` (+ CSS
  aliases columnGap/rowGap/gridTemplateRows).
- **Native form feedback**: `form()` auto-appends `e-form-success-message` / `e-form-error-message`
  (they are plain saved children — live-probed that the server does NOT auto-create them, so
  omitting them meant zero submit feedback). `formSuccessMessage()/formErrorMessage()` for custom
  copy/placement, `messages:false` to opt out. `checkboxRow()` mirrors the native checkbox row
  (`e-form-checkbox-row` is a CLASS on an e-flexbox, not an element type).
- decompile: `e-grid` → `<grid>` (fr/custom tracks, two-axis gap, mobile track overrides — bare
  variant track lists used to be dropped), `grid-row`/'span N' string inversion; form messages
  round-trip verbatim via `<Raw>`. lint: grid-track-size/span envelope validation; e-grid joins
  the container rules.

## 1.2.0 — 2026-08-05

New styling capability + footgun fixes (from field runs):
- **Container background images**: `bgImage` (URL / attachment id / envelope) + `bgOpts`
  ({size, position, repeat, attachment}) emit a validated `background-image-overlay` — a
  photo-behind-text hero is now reachable through the compiler (previously `bg={url}` dropped).
- **`sx={{…}}` as a prop is respected**, merged as a shorthand object, instead of being silently
  dropped (the React/MUI reflex). Outer props win over the sx object.
- **`zIndex` / `z` shorthand** → `z-index` number envelope (previously only reachable via `raw`).

## 1.1.3 — 2026-08-05

- **`border={number}` is a width, not a color.** A bare number used to be read as the border color,
  emitting `border-color:{value:1}` which 422s the deploy (`border-color: invalid_value`). Now
  `border={1}` is `border-width:1px` (color from `borderColor` or currentColor), `border="#ccc"` is
  a color, `border={[w,c]}` is both, and a new `borderColor` prop works standalone. (Found via a
  field run.)

## 1.1.2 — 2026-08-05

- **Deploy adapts to Elementor 4.2+ without wp-cli.** Version detection now falls back to the
  companion plugin's REST capabilities endpoint when wp-cli is absent — so no-Docker / REST-only
  targets (WordPress Playground, remote hosts) get the 4.2 font-family / span / border-radius
  adapters instead of shipping 4.1 forms that 422 there. (Found via a field run on WordPress
  Playground where the class-registry write failed on `font-family: invalid_value`.)

## 1.1.1 — 2026-08-04

Field-report fixes (a fresh agent building on Windows against Elementor 4.1.5):
- **Windows paths**: `init`/`decompile` derived the project name via `dir.split('/')`, which
  doesn't split backslash paths — the whole path became the name and `\n`/`\t` in it injected
  escapes into the generated theme. Now uses cross-platform `path.basename` + sanitization.
- **Unstyled text on Elementor 4.1.x**: the default `var` color mode compiles text color/font to
  variable refs 4.1.x doesn't resolve, so Elementor drops them. The `init` scaffold now defaults
  to `mode: 'literal'` (renders on every version); opt into `var` for live Class-Manager binding.

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
