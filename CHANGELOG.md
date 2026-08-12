# Changelog

## Unreleased

**Components 1:1 (SPEC 2.0 — phase 2)** — the free-tier + update deploy path and prop forwarding:
- **Deploy route ladder** (`deploy.mjs`): native `POST /elementor/v1/components` first; on 403
  `insufficient_permissions` (no ACTIVE Pro) or 404 the phase escalates ONCE to the ultra-mcp
  plugin's `elementor-ultra/v1/components` controller (same body/validators/`{uid:id}` map,
  server-side validation reuses Elementor's own validator classes) — inline expansion is now the
  LAST resort, kept for targets with neither route; a 501 `EXPERIMENT_INACTIVE` ultra answer
  (components module off) names `e_components` + `e_atomic_elements` and falls through to inline.
  `report.componentsRoute` records the escalation; the ultra probe is memoized (one extra GET,
  only when needed).
- **Redeploy UPDATE path**: title-match-with-changed-uid now PUTs the new tree via
  `PUT elementor-ultra/v1/components/{id}/elements` (`{elements, settings:{overridable_props}}`,
  ids rewritten against the full uid→id map first, updates run AFTER creates so new nested refs
  resolve) — action `updated`, no warning. With only the native route the v1 warn-and-reuse
  semantics stay verbatim (WARN kept, action `reused-stale`); a 422 on update aborts with
  Elementor's code verbatim; other update failures degrade that ONE component to reused-stale.
  `planComponents(locals, remote, {updatable})` grew the pure `update` bucket (default signature
  unchanged — v1 callers/tests untouched).
- **Prop forwarding / composition (`overridable(override)` chain)** (`component.mjs`): a
  registered component nesting another may now forward its own props into the child — the
  phase-1 build error is replaced by the native chain envelope (editor createOverrideValue /
  resolve-overrides-chain semantics, verified 4.2.1): the nested instance's override item is
  wrapped as `overridable{override_key: OUTER, origin_value: override{override_key: INNER,
  override_value: baseline, schema_source:{component, CHILD id}}}`; the parent registry entry
  lands on the instance node (`widget/e-component/component_instance`) with `originPropFields`
  pointing at the true leaf element (carried through for 3+-level chains) and the UNWRAPPED
  baseline as `originValue` (editor parity). Page-level instance overrides of a forwarded prop
  stay PLAIN `override` envelopes with the extracted child value. Build errors: forwarding
  without a baseline default; one prop feeding multiple child overrides; two props feeding the
  same child prop. `rewriteComponentIds` rewrites the wrapped override's `schema_source` (the
  chain invariant: same id as `component_id`); `expandInstances` resolves chains
  (Overridable_Transformer parity — outer value rides to the inner key, `null` clears).
- **Per-component id salt** (live-found on the E2E): component element ids are now
  `c<djb2(title)><n>` instead of `c00000…`. Local-style ids embed the element id, so every
  component previously shipped the SAME `.e-c00000-s` selectors in its own per-component CSS
  file — on a page rendering two components the last-enqueued file won and one component stole
  the other's box styles (seen: the nested parent rendering the child's background). Titles are
  unique by validation, so the salt is too. Consequence: `treeHash` (a display-only drift
  fingerprint) now moves when a component is retitled.
- **uid re-stamp on update** (live-found on the E2E): the update PUT sends the new `uid`, so the
  target's `_elementor_component_uid` tracks the tree it actually holds. Without it the deployed
  uid stayed stale and EVERY later redeploy re-detected "changed tree" and PUT again; with it a
  second identical deploy reports `reused` (verified live: updated → reused).

**Components 1:1 (SPEC 2.0 — phase 1)** — `defineComponent(fn, {title, props})`: JSX components
compile to NATIVE registered Elementor components (`elementor_component` CPT) with per-instance
overridable props; wire formats live-verified against Elementor 4.2.1 + Pro 4.1.0:
- **Registration seam** (`runtime.mjs`): a marked function under `compileSite` renders ONCE into
  a component tree (stable uid = djb2 of normalized tree + title); every invocation emits the
  native `e-component` instance envelope (`component-instance`/`overrides`/`override` $$types,
  `schema_source.id ≡ component_id` invariant, uid carried in `editor_settings`). Outside
  `compileSite` (and for un-marked functions) inline expansion is byte-identical to 1.x.
- **Sentinel-diff props→overrides mapping** (`component.mjs`): render with defaults (tree A),
  re-render per prop with a U+2063-bracketed sentinel (tree B), id-normalized diff locates the
  exact `(elementId, propKey)`; a diff not containing the sentinel = non-determinism error.
  BUILD ERRORS mirror the platform constraints: style/classes-landing props (with the
  variants-idiom recommendation — **styles cannot be overridden, period**), multi-target props
  (v1), structure-changing props, prop forwarding into nested components (phase 2).
- **Build-time 422 mirrors**: atomic-only trees (classic `html`/navBar/browserMock named),
  cycle detection (uid-aware DFS via the render stack, depth ≤50), ≤100 components, unique
  titles/uids, title 2..200.
- **Bundle**: `components: [{uid, title, elements, settings:{overridable_props}, treeHash}]` —
  registry shape (props + groups items with `props` arrays + order) validated against
  `create-validate` on 4.2.1.
- **Deploy** (`deploy.mjs`): new phase before pages — batch `POST /elementor/v1/components`
  (status publish, topo-ordered for nested composition), uid→id map, instance rewrite. 403
  insufficient_permissions (no ACTIVE Pro) or missing route → WARN + **inline-expansion
  fallback** (locked: builds stay portable); 422 codes surface verbatim. Redeploy v1: uid match
  reuses silently (uid doubles as the deployed-tree fingerprint); title-match-with-changed-uid
  reuses + WARNS (no update route until the phase-2 ultra-mcp controller); `planComponents` is
  pure/exported.

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
