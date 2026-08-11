# elementor-jsx test suite — the parity engine, proven not assumed

Shift-left: every claim about "JSX → Elementor works" is enforced by a test, from the
prop-envelope mapping all the way down to the CSS a visitor's browser receives — plus a
real-browser audit gate on the deployed result.

## Tiers

| Tier | Command | Needs | What it proves |
|------|---------|-------|----------------|
| Unit (357 tests) | `npm test` | nothing | `sx()` prop matrix · every intrinsic (heading torture, text, box family, img incl. url+alt, html) · runtime semantics (fragments/components/theme context/**JSX-in-kit mixing**) · typed-envelope constructors (S/C/SZ/DIM/M/RAD/GRAD/SHADOW/IMG_ID/IMG_URL/…) · kit behaviors (css() merge, hover(), clone(), FA normalization, hero()/abs()/arch) · the ENTIRE component library (card/section/bento/stat/step/chip/testimonial/footer/ctaBand/navBar/charts) · theme tokens + `variablesMeta` hydrate shape · class dedup + labels · `normalizeIds` · `--inline` mode · every `assertTree` guard · content fidelity (emoji/RTL/CJK/entities/10k strings) · **decompile golden corpus: 18 REAL pages** (7 arrow-pp + 11 exported stack sites in `fixtures/corpus/`, ~2,900 nodes incl. an --inline deploy) round-trip decompile → esbuild rebuild with counts+text preserved · style-faithful decompile round-trips · the REAL cli on `fixtures/site.jsx` + `fixtures/kitchen.jsx` |
| Live integration (39 tests) | `npm run test:it` | wpos-stack (:8915) up | **hardening.test.mjs**: Elementor **version pin** (drift gate) → **editor smoke** (real Elementor editor boots on our page, zero uncaught errors, content in preview) → **visual regression** (pixelmatch vs committed baselines @1440+@390, seed run proves capture determinism) → **concurrency** (parallel deploys: corruption-free, defined semantics) → **scale** (30-page data-driven deploy + idempotent re-deploy). **kitchen.test.mjs**: whole component library past the PHP validator → hover/:focus-visible multi-prop variant + gradient + shadow CSS live → XSS sanitization posture → url-image with inline alt → satellites share classes → **update flow with live orphan pruning** → media sideload idempotency → graceful no-wp-cli degradation → **playwright audit gate**. **parity.test.mjs**: deploy report → `_elementor_data` → registry → variables meta → rendered HTML → rendered CSS declarations → live `var(--label)` binding → idempotency → `--inline` coexistence. **pro.test.mjs**: Elementor Pro 4.1.0 (files installed, ACTIVATED only inside this file's snapshot window) — activation health → **hamburgerNav/nav-menu renders in a V4 page** via the full pipeline → the local-custom_css fact under Pro → **atomic forms E2E** (kit `form()`+fields → deploy → real browser fill+submit → submission row + field values in `wp_e_submissions`) → parity pipeline unchanged under Pro |
| Both | `npm run test:all` | | |

Integration files run with `--test-concurrency=1` — each snapshots/restores the DB; they must
not interleave.

## Isolation model (integration)

The suite takes a **full DB snapshot** (`mysqldump` in the db container) before running and
restores it after. That is the only full-fidelity restore: the class registry is CPT-backed
(`e_global_class` posts + kit metas) and `GET /elementor/v1/global-classes` returns labels
only, so a REST-level snapshot cannot restore variants. Resident sites on the stack
(farmans etc.) survive the deploy's registry pruning untouched. Overridable plumbing:
`EXJSX_IT_DB_EXEC` / `EXJSX_IT_DB_CRED`.

## Verified rendering facts (assert against THESE, not assumptions)

Field-verified on Elementor V4 @ wpos-stack, encoded in the integration assertions:

- **Markup carries the class LABEL**, not the registry id: `class="t-hero e-heading-base"`,
  never `g-t-hero`. The `g-` ids exist only in `_elementor_data` refs and the REST registry.
- **Variables render by LABEL**: usage `var(--exjsx-test-primary)` inside class CSS;
  definitions `:root{--<label>:<value>}` in the kit stylesheet (`post-<kitid>.css`).
- **`border-radius` renders as logical longhands** (`border-start-start-radius:18px` ×4).
- **Padding renders as logical longhands** (`padding-block-start` etc.).
- **`raw` custom_css on a GLOBAL class renders on free Elementor**; on LOCAL styles it does
  NOT render **even with Pro active** (probed on Pro 4.1.0 + core 4.1.4 — refutes the old
  "Pro feature" theory; it's global-class-only, period). `--inline`'s `<style>`-block
  workaround is required on Pro too.
- **Pro 4.1.0 + core 4.1.4**: activates cleanly; the classic `nav-menu` widget (hamburgerNav)
  renders inside V4 atomic pages fed by a real WP menu; the parity pipeline (labels,
  var binding) is byte-identical under Pro.
- **Atomic forms (kit `form()` API)**: the `e-form` container is free core, the FIELD widgets
  (`e-form-input/-textarea/-select/-checkbox/-label/-submit-button`) + the action runner
  (email / collect-submissions / webhook) are Pro. `actions-after-submit` items must be FULL
  string envelopes (bare strings 422 — live-probed). Fields identify by `_cssid` (renders as
  `id`+`name`); labels link via `input-id`; select options are `key-value` envelopes; the email
  action is an `email` envelope (message default `[all-fields]`). Submission = Alpine `x-on:submit`
  → admin-ajax `elementor_pro_atomic_forms_send_form`; collect-submissions stores rows in
  `wp_e_submissions` / `wp_e_submissions_values` (values keyed by ELEMENT id; labels via the
  form snapshot). On WORDPRESS_DEBUG stacks the ajax body may carry warning prefixes — parse
  the trailing JSON.
- **Harness rule**: snapshot/restore is WHOLE-DATABASE (`--add-drop-database`) — tables created
  during a test window (e.g. `wp_e_submissions*` on first submission) survive a per-table
  import and clash with rolled-back version options on the next run (field-found).
- **Media/structure widgets (kit `divider()/youtube()/video()/tabs()`)**: e-divider renders a
  real `<hr>`; e-youtube renders a container whose **iframe is injected by a JS handler**;
  e-self-hosted-video renders `<video><source>` (source = `video-src` envelope, id-XOR-url,
  absolute URLs only); e-tabs is the element family `e-tabs > e-tabs-menu(e-tab×N) +
  e-tabs-content-area(e-tab-content×N)` with **POSITIONAL tab↔panel linking** — an explicit
  `tab-id` breaks the handler's `<tabsId>-tab-<n>` id scheme and hides every panel.
- **WEBPACK-RUNTIME GAP (live-probed Elementor 4.1.4 bug)**: interactive atomic handlers
  (e-tabs, e-youtube) ship as webpack CHUNKS, but pure-atomic pages never enqueue
  `webpack.runtime.min.js` (only classic-widget pages do) → dead tabs, no iframe.
  `compileSite` now injects an invisible classic `html` carrier on chunk-widget pages with no
  classic widget. Interactivity (tab switching, iframe injection) is browser-verified live.
- **Fixture asset**: `wp-content/uploads/exjsx-sample.mp4` (tiny ffmpeg-generated clip) must
  exist on the stack for the kitchen video widget — regenerate with
  `ffmpeg -f lavfi -i testsrc=duration=0.5:size=64x64:rate=10 -pix_fmt yuv420p out.mp4`.
- **DYNAMIC TAGS (Pro-only; free core registers ZERO tags)**: envelope
  `{$$type:'dynamic', value:{name, group, settings}}`, validated against the registry + prop
  categories. **Placement matrix (live-probed)**: TEXT props (heading title / paragraph /
  button text) take the envelope DIRECTLY; image nests it at `image.value.src`; link nests it
  at `link.value.destination`; top-level dynamic on image/link 422s. Kit: `dyn.*` catalog
  (postTitle/featuredImage/siteTitle/…, groups verified), `<h1 dyn={…}>`, `<img src={dyn…}>`,
  `href={dyn.postUrl()}`. `parts.single` → Pro single-post document (`include/singular/post`) —
  full CMS E2E proven: real post renders our template with resolved title/image/excerpt/date.
- **4.2.0 CERTIFIED (upgrade rehearsal 2026-07-22)**: full suite green on Elementor 4.2.0 with
  exactly ONE breaking change — `Span_Prop_Type` flipped Number→String base (4.1.4 wants
  `{$$type:'span',value:6}`, 4.2.0 wants `"span 6"`; neither passes the other's validator).
  `deploy.adaptSpansForVersion` detects the target version (wp-cli) and adapts grid-column/
  grid-row spans both directions; authors keep writing numbers. Version pin accepts 4.1.4|4.2.0.
  Rehearsal recipe: snapshot DB + `cp -r` the plugin dir (DB restore does NOT revert plugin
  FILES), upgrade, `npm run test:it`, catalog, restore both.
- **SEO (`pages[].seo` = {title, description, ogImage, canonical, noindex})**: WP core emits NO
  meta description/og without a plugin — deploy ships a tiny mu-plugin (`exjsx-seo.php`, reads
  `_exjsx_seo` post meta → `pre_get_document_title` + `wp_head`) and writes per-page meta via
  wp-cli. **The mu-plugins dir must be writable by the PHP user** (root-owned dirs fail
  silently — deploy verifies and reports UNWRITABLE). Stack fixture: dir chowned to 33:33;
  `exjsx-seo.php` persists file-level (inert without meta; DB restore clears the meta).
- **COLLECTION LOOP query surface (verified upstream boundary)**: Pro 4.1.0's dev-MVP schema is
  ONLY `source` (post|page) + `posts_per_page` — no orderby/taxonomy filter/pagination exist
  upstream yet. Not a kit gap; re-probe on Pro upgrades.
- **Test-design rule (field-found)**: any integration test that deploys its own NON-inline site
  PRUNES the shared registry (namespace ownership) and breaks later registry-dependent tests —
  deploy helper mini-sites through `inlineLocal()` unless the registry is the thing under test.
- **INTERACTIONS / MOTION (FREE core, experiment `e_interactions` default-active)**: stored as a
  TOP-LEVEL `interactions` key on the node — `{version:1, items:[{$$type:'interaction-item',
  value:{interaction_id, trigger, animation}}]}`. **THE fact: `animation.$$type` must be
  `'animation-preset-props'`** — `'animation-preset'` (the prop-type class name!) gets items
  SILENTLY STRIPPED to `[]` on save. Timing = ms `size` envelopes; free triggers load/scrollIn
  (Pro: hover/click/scrollOut/scrollOn); effects fade/slide/scale; **max 5 per element**
  (sanitizer cap, kit throws at 6). Rendered as a footer JSON blob
  (`#elementor-interactions-data`) + motion.min.js — cached in postmeta
  `elementor-interactions-cache` (delete after direct meta writes). Kit: `interaction()`
  (config key `config-v2`, `excludeOn` breakpoints, custom keyframes), `interact(node,
  opts|[opts])`, intrinsic `motion={{effect,trigger,…}}` (`animate` = pre-1.8 alias). Server
  strips invalid items SILENTLY → lint `invalid-interaction` mirrors validation.php;
  `pro-interaction` warns on pro-flagged fields (scrollOut also CRASHES free 4.2.1). Compiled
  trees with items get the reduced-motion guard widget (opt out via site `motion:
  {respectReducedMotion:false}`). Browser-proven: opacity caught mid-fade → settles at 1;
  reduced-motion emulation blanks the footer JSON (E2E 2026-08-12, :8947 Playground 4.2.1+Pro).
- **POPUPS (Pro; `parts.popup`)**: a theme-builder document (`_elementor_template_type=popup`,
  location `popup`, printed via `wp_footer` → `elementor_theme_do_location('popup')`) + display
  meta `_elementor_popup_display_settings`. **Trigger groups are PHP mixed-key arrays
  `['yes','delay'=>n]` → the JSON must be `{"0":"yes","delay":n}`** (a plain array decodes to
  the wrong shape). Sugar: `display:{pageLoad:secs|scrollPercent:n|exitIntent:true}`. Conditions
  cache regenerate applies (same as header/footer). Browser-proven: dialog-widget visible
  (display:flex) on page load.
- **COLLECTION LOOP (kit `loopGrid()`)**: Pro + HIDDEN dev experiment `e_pro_collection_loop`
  (option `elementor_experiment-e_pro_collection_loop=active`) — without it e-collection-loop is
  unregistered and 422s. The deploy auto-enables it (before page saves) when a bundle uses loops.
  Structure: `e-collection-loop{source: post|page, posts_per_page} > e-collection-loop-layout
  (grid props go HERE) > e-collection-loop-item (the repeating template) > dynamic-bound children`.
  Live-proven: 3 posts → item template repeated 3×, each iteration resolving its own
  post-title/excerpt.
- **THEME PARTS (`defineSite({ parts: { header, footer } })`)**: deployed as Pro theme-builder
  templates via wp-cli — `elementor_library` post + `_elementor_edit_mode=builder` +
  `_elementor_template_type` + `elementor_library_type` taxonomy term + `_elementor_conditions`
  meta (e.g. `['include/general']`) + atomic `_elementor_data`. **The conditions cache MUST be
  `regenerate()`d after writing** (deleting the option is NOT enough — without regenerate the
  part never renders; live-probed). Works on BLOCK themes (twentytwentyfive) and classic
  (hello-elementor). Pages showing parts need `template: 'elementor_header_footer'` —
  `elementor_canvas` suppresses them (verified). Parts compile through the same pipeline and
  SHARE the global-class registry with pages (one design system).
- **Global-class CSS** lives in `global-<pageid>-frontend-{desktop,tablet,mobile}.css`;
  mobile variants ship in the `(max-width:767px)`-media file, not inline `@media`.
- **`wp post meta get --format=json` double-encodes** meta stored as JSON strings —
  parse twice (`harness.metaJson`).
- **`GET /elementor/v1/global-classes` returns `{data:[{id,label}…]}`** — an ARRAY under
  `data`, labels only, no variants.

## Verified rendering facts (round 2)

- **hover() state variants render as `.elementor .<label>:hover,.elementor .<label>:focus-visible`**
  — hover works on free Elementor via global classes, and you get focus-visible for free.
- **Sanitization at render**: `<script>` tags and `onerror=` handlers in html-v3 content are
  STRIPPED (inner text survives); whitelisted inline markup (`<em>`, `<span>`, `<br>`) renders.
- **The mobile/tablet CSS files only exist when variants exist** for that page's classes.
- **`shortcode` widgets normalize to `html`** through decompile→rebuild (equivalent render).
- **img alt, both mechanisms verified**: attachment-id images take alt from the attachment's
  `_wp_attachment_image_alt` (set it via the media manifest `alt:`); **URL-src images support
  inline alt** (`src.alt` in the envelope). URL-src images REQUIRE an absolute http(s) URL —
  the PHP `Url_Prop_Type` rejects relative paths (live-probed). The `img` intrinsic now routes
  both correctly and THROWS on the unsupported combination instead of silently dropping alt.
- **Concurrency semantics** (proven): two simultaneous deploys to one kit are corruption-free;
  pages from both land; the class registry converges to last-writer-wins **plus possible
  stragglers from the loser** (GET/PUT race) — run deploys serially when registry exactness matters.
- **Editor**: the real Elementor editor boots our deployed pages with zero uncaught exceptions
  and renders our content in `#elementor-preview-iframe` (verified via a logged-in playwright session).
- **Version pin**: all facts above proven on **Elementor 4.1.4** — `hardening.test.mjs` fails
  loudly on any other version until facts are re-verified.

## Bugs this suite has already caught (fixed in src / canonical kit)

1. **`inline.mjs` salt collision** — `djb2(name).toString(36).slice(0,5)` kept only the HIGH
   base36 digits, so bundle names differing in the last char (`site-a`/`site-b`) salted
   identically → cross-page style bleed. Fix: full hash.
2. **`runtime.mjs addGcls`** didn't dedupe within its own input (`gcls="g-a g-a"` → double ref).
3. **`deploy.mjs` orphan cleanup was a silent no-op** — it read `cur.data.items` but current
   Elementor returns `data` as an array, so `deleted` was always `[]` and the registry only
   ever grew (namespace ownership dead). Fix: handle the array shape.
4. **`styled()` silently dropped sx on styleless nodes** (kit-components) — ctaBand's
   primary/ghost button styling never actually applied. Fix: bootstrap a style holder;
   responsive keys now go to their own variants instead of leaking `_m` into desktop props.
5. **`decompile()` emitted invalid JS for multi-root trees** (missing commas in the top-level
   array) and for top-level `<Raw>` nodes (sibling `{/*…*/}` comment is JSX-only syntax).
6. **JSX-in-kit mixing leaked unrendered vnodes** — `section({children:[<row/>]})` embedded
   `{$$v}` objects that passed every offline gate and 422'd at the live PHP validator (R1).
   Fix: the runtime now renders embedded vnodes recursively (`renderEmbedded`), and
   `assertTree` names any survivor clearly.
7. **url-src images require ABSOLUTE http(s) URLs** — the relative form passed every offline
   gate and 422'd live (error bubbling to 4 ancestors). Now a build-time throw in `IMG_URL`.
8. **`img` alt silently dropped** — now routed: url-src → inline `src.alt`; id-src + alt →
   loud error pointing at the media-manifest `alt:` mechanism.
9. **Theme-less bundles deployed an INVALID variables blob** — the no-theme fallback was
   `{data:{}}` without `watermark`/`version`, spraying "Undefined array key watermark"
   PHP warnings SITEWIDE after deploy. Caught by the Pro suite's first theme-less fixture;
   fixed in `compileSite` (and the unit test that had pinned the wrong shape).

## 100% surface coverage — self-enforcing

`unit/coverage-audit.test.mjs` is a meta-test that keeps parity coverage total BY CONSTRUCTION:
every public export of kit.mjs + kit-components.mjs + every src module (110+), every `sx()`
shorthand key (33), and every runtime intrinsic special prop must be referenced by the suite —
add an export or key without a test and the audit FAILS naming it. It already earned its keep
on day one: it flagged `src/components/index.jsx` (the theme-aware JSX library — Layout/Hero/
Section/Bento/Card/Stat/CTA/FAQ/RelatedLinks/…) as untested → now covered end-to-end by
`unit/jsx-components.test.mjs` + `fixtures/library.jsx` (theme context, live var refs through
components, mobile grid stacking, paragraph-link routing, shared-class dedup between twin Cards).

## Adding coverage

- New `sx` key → add a row to the `CASES` table in `unit/sx.test.mjs` (envelope parity)
  AND, if it has a distinctive rendered declaration, a row in the `expects` list of the
  "rendered CSS" integration test (rendered parity).
- New intrinsic → unit file mirroring `heading.test.mjs` (tags/props/link/raw/cls/gcls/
  responsive/torture-combo) + add it to `fixtures/site.jsx` so pipeline + live tiers cover it.
- New assertTree guard → a firing case AND a passing case in `unit/asserttree.test.mjs`.
