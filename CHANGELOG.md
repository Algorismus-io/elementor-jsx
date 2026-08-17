# Changelog

## 2.1.0

**`exjsx import` now reproduces a design without hand-repair.** Measured on two real Google Stitch
exports deployed to Elementor 4.2.2 + Pro: **99.5%** and **99.1%** pixel fidelity with exact page
heights and zero manual edits. Before this release the same two pages needed roughly six hand fixes
each, and one of them failed `assertTree` outright and could not be built at all.

*Authored heights are recovered.* Computed styles cannot distinguish an authored height from a
content-driven one, so `import` never emitted heights. That silently destroyed Tailwind's
`absolute inset-0` (height 0 — invisible background images) and `size-N` squares (collapsed to their
content, shifting every following section). The capture now probes `height:auto` and re-measures,
skipping only boxes whose height could legitimately come from flex-row/grid stretch.

*`inset-0` is detected by probe, not by reading.* A positioned element reports a RESOLVED
`bottom`/`right` even when the author never set one — a `fixed top-0` header reports
`bottom: 819px`. Trusting that pinned both edges and stretched a nav to 181px instead of 81px.

*Paint-only children fold into the parent background.* Stitch draws tints, gradients and hairline
rules as childless divs, and `assertTree` rejects an empty absolute one (it swallows editor clicks).
They now fold in correct layer order — an absolute overlay paints ABOVE its in-flow siblings while a
parent background paints below them, so folding only the absolute one inverted the stacking. Element
opacity over a known ground colour is reproduced as an equivalent veil layer. `filter`,
`backdrop-filter`, `transform`, `opacity` and `mix-blend-mode` are NOT hoisted — they apply to the
whole element, and carrying a decorative `blur(64px)` onto the parent erased a photograph inside it.

*Theme-cascade defence.* Text leaves now pin `letter-spacing` even when the source says `normal`,
and set `text-wrap: wrap`. A WordPress theme shipping `body{letter-spacing:-0.1px}` or
`text-wrap: pretty` otherwise leaks in and re-wraps paragraphs at different words.

*Webfonts travel with the page.* The capture reads computed styles but never the document's `<link>`
tags, so imported pages fell back to a system stack. `collectFonts` gathers each real family with
the weights actually used and injects loaders; Material Symbols gets its variable-axis URL, which
`fontLoader`'s `:wght@` form cannot express. An inline icon `<span>` used to flatten to text and
render the ligature NAME as body copy — its font is now promoted onto the leaf.

*Inline-level boxes hug.* A pill that was `inline-flex` in the source no longer stretches to the
full width of its flex parent.

**New: `exjsx import --atomic-forms`** maps `<form>` and bare `<input>/<textarea>/<select>` onto the
native atomic `e-form` family instead of a raw HTML carrier, reconstructing each control's skin from
its computed styles. Opt-in, because those widgets ride the Pro-only `e_pro_atomic_form` experiment —
without the flag behaviour is unchanged and free-core imports keep working.

**Fix: `bgImage` emitted an invalid `background` envelope for any non-keyword position or size.**
Elementor validates overlay `size` and `position` as unions whose string member is a keyword enum
only — `position` accepts nine `'top left'`-style values, so a `50% 50%` pair was rejected with
`background: invalid_value`. Percentages that map exactly now become keywords (CSS `x y` order
swapped to Elementor's vertical-first), and anything else uses `background-image-position-offset` /
`background-image-size-scale`. This was invisible for a long time because `--inline` skips the
class-registry write entirely.
## 2.0.1

**Fix: `--inline` pages that also use `defineComponent` had their raw CSS applied to the wrong
elements.** An inline build emits a `<style>` carrier whose selectors are style ids, and style ids
embed element ids. When a deploy cannot create native components (free Elementor, no ultra route) it
inline-expands them and re-runs `normalizeIds`, which renumbers the whole tree — after which every
carrier rule still selected the id it was built for and therefore hit a *different* element. The
symptom is silent and severe: a hero's `text-[20vw]` landing on the 12px eyebrow above it, dropped
colour treatments, panels losing their overflow rules, images escaping their containers. Pages
without `defineComponent`, and non-inline builds, were never affected.

- `inline.mjs` now builds the carrier from the tree's **live** local styles and can re-emit it;
  `deploy.mjs` re-emits after the expansion. Style ids the expansion brings in join the salted
  namespace. The carrier's own margin-collapse rule again names its live widget id (a stale one cost
  every affected page 20px of top offset).
- `normalizeIds` rekeys style ids on the id **segment**, so a salt containing the element-id string
  can no longer capture the rename.
- New `reinlineTree(bundle, page, pageIndex, opts)` on the `./inline` export.
- Opt-in `opts.componentRawCss` / `deployBundle(cfg.componentRawCss)` additionally routes an expanded
  component subtree's own `custom_css` into the carrier. It is **off by default**: that CSS has
  always been dropped on free Elementor (it rides a local style, where `custom_css` no-ops) in inline
  and non-inline builds alike, so emitting it is a rendering change, not part of this fix.

## 2.0.0

**Components, both directions.** A JSX component registered with `defineComponent` compiles to a
native Elementor component, deploys as a real component document with editable per-instance props,
and — new in this release — decompiles back to source. The abstraction now survives the round trip:
source → site → source.

Everything since 1.6.x, in one line each:
- **1.7.0** native `e-grid` + `e-form` status messages → 100% of free-core V4 atomic elements.
- **1.7.1** per-state `custom_css`, the `attrs` prop, native state variants (`hover:`/`active:`/
  `focus-visible:`/`checked:` emit editor-visible variants when every declaration maps to a schema
  prop, raw CSS otherwise).
- **1.8.0** `motion={…}` → native Elementor interactions, lint-mirrored against the server's own
  validator (it strips invalid items SILENTLY, so lint is the only honest failure surface) plus a
  reduced-motion guard Elementor itself does not ship.
- **1.9.0/1.9.1** `defineComponent` phases 1–2: registration seam, sentinel-diff prop mapping,
  the native → ultra → inline-expansion deploy ladder, in-place updates through the route Elementor
  lacks, and prop forwarding into nested components.
- **1.9.2** deploy capability gate (fails BEFORE creating posts when the target lacks an element
  type) + deploy atomicity, `exjsx dev` surfacing deploy failures instead of reporting success,
  component build guards, and `shadow` accepting arrays.

**Known behaviour:** a component's uid fingerprints the AUTHORED tree while the site stores the
version-adapted one, so `decompile → redeploy` reads as an UPDATE (in-place via the ultra route)
rather than a no-op. `source → deploy → redeploy` is idempotent as before.

## Unreleased

**SPEC 2.0 components — PHASE 3: the decompile round trip.** `e-component` instances used to fall
into the `<Raw>` verbatim branch; they now invert all the way back to source.

- **`decompile.mjs`**: `widgetType === 'e-component'` is intercepted BEFORE the Raw fallback. Each
  referenced component document is emitted ONCE as an exported `defineComponent(fn, {title, props})`
  above the page (single-module output), and every usage becomes `<PriceCard plan={"Pro"}/>` built
  from that instance's `override` envelopes. The definition's parameters, their `label`/`group` and
  their defaults are reconstructed from the `_elementor_component_overridable_props` registry;
  overridable settings envelopes are unwrapped and their landings emitted as the PARAMETER
  (`<heading>{plan}</heading>`). A nested instance carrying the `overridable`-wrapping-`override`
  chain decompiles to prop FORWARDING from the enclosing component's own parameter
  (`<PriceCard plan={tier}/>`), and definitions are emitted in dependency order.
  New exports: `componentIdsIn`, `resolveComponents`, `siteComponentFetcher`, `analyzeComponents`,
  `identFromLabel`, `componentIdent`, `valueLiteral`; `decompile()` gained `{components, warnings}`.
- **The fetcher is INJECTABLE** (`resolveComponents(tree, fetchComponent)`) so tests need no live
  site. The live one (`siteComponentFetcher`) reads the native `elementor/v1/components` list +
  `…/components/overridable-props` and falls back to the ultra list; the element tree comes from
  `elementor-ultra/v1/documents/{id}` because **Elementor exposes no native component-tree route**.
- **Nothing is ever forced.** A component that fails to fetch, returns no registry, overrides a prop
  with no JSX spelling (media, form actions), carries a non-literal baseline, or whose instance has
  its own styles/settings keeps the exact pre-phase-3 `<Raw>` passthrough — with a warning collected
  into `warnings` and emitted as `// warn:` header comments. A decompile never crashes on this.
- **Inner ids are derived** (per-instance djb2/base36 hash — verified live: rendered `data-id`s are
  7-char hashes, never the authored ones), so every lookup keys on `origin_id` / the component
  document's own ids.
- **`props.<k>.key` on `defineComponent`** — decouples the WIRE override key from the JS parameter
  name. Needed because an editor-authored registry can use override keys that are not valid JS
  identifiers: the decompiler then derives the parameter from the LABEL and carries the original key,
  so the recompiled registry and every override envelope keep Elementor's exact keys.
- **`exjsx decompile` CLI**: `--page <id>` pulls the tree straight off `WP_URL`, `--components`
  resolves the component documents (implied by `--page`); warnings print to stderr.
- **Fix (E2E-found)**: the stale-component warning printed the LOCAL uid on both sides of the `≠`
  when an update degraded to reuse (the plan item's `uid` is the local fingerprint) — it now prints
  the deployed uid.
- Round-trip integrity is a test: `defineComponent` → compile → deploy-rewrite → decompile →
  recompile reproduces the same component uids, tree hashes, registries, trees and instance
  overrides. Verified live on Elementor 4.2.1 + Pro 4.1.0 too, with one documented divergence: the
  uid fingerprints the AUTHORED tree while the site stores the version-ADAPTED one
  (`border-radius` → `border-radius-v2` on 4.2.1), so a decompile → redeploy reads as a component
  UPDATE rather than a no-op. Applying the deploy adapter to the original makes the uids identical.

**1.9.2 field report — seven defects from two recorded builds on 1.9.1.**

- **Pro form helpers no longer strand orphan pages (HIGHEST)** — `form()/field()/formSubmit()/
  formSuccess()` emit `e-form-input/-label/-textarea/-submit-button/-success-message/-error-message`,
  none of which FREE Elementor registers (they ride the Pro-only `e_pro_atomic_form` experiment).
  `lint` passed clean, then the deploy created the post, 422'd the tree save with 11 "Unknown type
  … is not registered on this site" errors, and LEFT THE POST BEHIND — the retry made a second.
  Both halves fixed:
  - **Capability gate** (`deploy.mjs` step 0b): the `/site/capabilities` probe is now fetched
    unconditionally (it already supplied the Elementor version) and its `registered_types` is
    checked against every element type the bundle would ship — pages (post `--only` filtering),
    parts and component trees — BEFORE the kit write and before any post is created. Missing types
    abort with a message naming each type, its count, where it first appears, the Pro/experiment
    requirement and the free-target workaround. `widget` (the wrapper elType) and `e-component`
    (its own native → ultra → inline-expansion ladder) are exempt; a site that cannot report
    `registered_types` SKIPS the gate rather than blocking. Escape hatch: `--allow-unregistered`.
    New pure exports: `bundleElementTypes`, `unregisteredTypes`, `capabilityError`.
  - **Deploy atomicity**: create + tree-save is ONE logical operation — a failed save now DELETEs
    the just-created post (`?force=true`, so a retry sees a free slug), reported as
    `report.orphansRolledBack`. An EXISTING page is never deleted; it keeps its previous tree.
  - `lint` gained **`pro-only-element`** (warn): lint is OFFLINE and cannot know the target, so it
    flags the risk and points at the deploy gate, which is where the hard failure belongs.
- **`exjsx dev` no longer swallows deploy 422s** (`dev.mjs`) — deployBundle records a rejected save
  as `action:'ERR save …'` on the page entry (one bad page must not abort the rest) and the dev
  loop dropped the report, printing "deployed" over two consecutive failures. A failed save now
  reads exactly like a failed BUILD: `error` frame (red dot + overlay, titled `deploy failed`, not
  `build failed`), a FAILING gates pill, the full validator text in the dev log, and `prev` NOT
  advanced so the next save retries. New shared reader `deployFailures(report)`; the `deploy` CLI
  verb uses it too and now **exits 1** on per-page failures instead of reporting success.
  `summarizeSaveError` lifts `data.errors[]` (the element ids + failing settings keys) out of the
  raw body — the old 100-char slice truncated exactly the actionable part. `dev()` now returns a
  server whose `close()` also stops the fs watcher.
- **`defineComponent` image props fail the BUILD with the real reason** (`component.mjs`) — a media
  prop cannot be a per-instance override (Elementor resolves component media once; the override
  envelope carries settings scalars, and an image rides a site-local attachment id or a validated
  absolute URL). Both landings are caught: the sentinel dying inside a validating builder
  (`IMG_URL`'s "needs an ABSOLUTE http(s) URL" riddle) and the attachment-id path where the
  sentinel lands INSIDE the image envelope and used to map to a nonsense target. The message names
  the three workarounds. Any other build-time-validated prop gets the generic sibling error.
- **`horizontal-slide-overflow` lint rule** (warn) — `motion={{effect:'slide', direction:'left'|
  'right'}}` parks the element off-canvas on the X axis until the trigger fires: real document
  overflow (a gate caught `scrollWidth 442` at 390px) that never resolves if the trigger doesn't
  fire (reduced motion, below the fold, JS blocked). Suggests vertical/fade/scale or an
  `overflow-x:clip` parent. Documented in the API card's Motion section.
- **Non-atomic elements inside `defineComponent`** (`component.mjs`) — the check only looked at
  `elType === 'widget'`, so a V3 container (`container`/`section`/`column`) or any other non-`e-`
  node reached `POST /components` and 422'd there. It now mirrors Elementor's
  `Non_Atomic_Widget_Validator` exactly (identity = `widgetType ?? elType`), names the offender and
  its path, and distinguishes classic widgets (incl. `<html raw>` carrying `<details>`/`<summary>`)
  from legacy containers.
- **Multi-layer shadows are atomic; `raw-atomic-overlap` stops crying wolf** — `Box_Shadow_Prop_Type`
  is an ARRAY of shadow items, so **`shadow` now accepts an array of specs**:
  `shadow={[[v,blur,spread,color,h],[…]]}` → one `box-shadow` envelope with N `shadow` items
  (pixel-stepped "borders", layered elevation). `SHADOW(...)` gained the schema's optional 6th arg
  `'inset'`; new kit/barrel export `SHADOWS(...specs)`. The lint rule now checks the VALUE, not just
  the property name: declarations the sx layer genuinely cannot emit (CSS functions in a size,
  `!important`, `var()` outside colour props, layered/url backgrounds — `inexpressibleBySx`) no
  longer warn, and the fix text names the shadow-array form.

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
