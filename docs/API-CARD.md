# elementor-jsx — the one-page API card

Read THIS instead of grepping the source. Everything an agent needs to author a site; every name
below is real and tested. Print it any time with `exjsx api`.

## fs-project layout

```
site/
  site.config.mjs        export default { name: 'mysite' }
  theme.mjs              export default defineTheme({ mode:'literal', colors:{...}, fonts:{...} })
  components/*.jsx       shared components (import-free — prelude provides the API as free vars)
  pages/home.page.jsx    export const meta = { title, slug?, seo?, template? }
                         export default ({ theme }) => <section>…</section>
                         (token access: theme.spec.colors.* / theme.spec.fonts.*)
                         Components DON'T need {t} prop-drilling: `useTheme()` (free var) returns
                         the active theme anywhere in the tree — const t = useTheme().
```

Build/deploy: `exjsx build <dir>` → `exjsx deploy <bundle.json>` (idempotent; self-primes CSS;
detects Elementor version over REST — no wp-cli needed; a stray EXJSX_WPCLI pointing at another
site is auto-ignored). `exjsx lint <dir>` before every deploy.
Live loop: `exjsx dev <dir> [--gates]` — watch + rebuild (ms) + smart deploy (page-only ~3s;
full only when classes/variables change) + preview at :4477 that reloads on save and shows build
errors in an overlay; `--gates` re-runs the eu-studio check on changed pages after each save.

## Intrinsics (the ONLY tags)

| tag | notes |
|---|---|
| `box` `div` `col` `row` `section` | flex containers. `row` forces dir row; `section` renders `<section>` |
| `grid` | NATIVE e-grid container (**Elementor ≥ 4.2** — on 4.1.x use `gridCols` on a box). `cols`/`rows`: number = equal fr tracks, string = custom list (`cols="240px 1fr"`). Defaults: cols 3, rows auto, gap 20, **mobile 1 column** (override: `mobile={{gridCols:2}}`). Children take `span`/`rowSpan` — a base `span` persists at mobile and creates an IMPLICIT extra column in the 1-col grid (screenshot-verified); reset it with `mobile={{span:1}}` when the grid collapses |
| `h1 h2 h3 h4` / `heading` | text props below apply; inline `<em>/<strong>/<br>` children OK |
| `text` `p` | paragraph; `href` renders a REAL anchor (use for links/buttons-as-links) |
| `img` | `src` = URL string (inline `alt` OK) or attachment id (alt comes from media manifest) |
| `html` | raw HTML/SVG/style/script carrier — `raw` prop or children |

NO `<nav> <main> <ul> <span> <a> <button>` intrinsics. Container tag override: `tag="header|footer|article|aside|a|button"`.
Special props on all intrinsics: `tw=""` (Tailwind subset), `raw=""` (CSS decls, auto-terminated),
`cls="name"` (semantic class label), `gcls="name"` (arbitrary extra class — style it yourself),
`id="anchor"` (real HTML id — `href="#anchor"` works), `motion={{effect:'fade'|'slide'|'scale', trigger:'load'|'scrollIn', ...}}` (see Motion),
`attrs={{'data-x':'y'}}` (HTML attributes — see below), state objects `hover/active/focus/focus-visible/checked={{…sx, raw}}` (see States).

## States (hover / active / focus / focus-visible / checked)

- **State props** on any intrinsic (and `box()`/`styled()`): `hover={{ bg:'#0f172a', color:'#fff' }}`
  → a NATIVE state variant (editor-visible in the state UI, schema-validated). Inside a state
  object: the full sx vocabulary, `raw: "…"` (per-state custom CSS), and `tablet:/mobile:` nests
  for breakpoint-scoped states (`hover={{ tablet: {…} }}`). Kit level: `stateVariant(node, state,
  props, {breakpoint})` (`hover()` is a thin wrapper) and `css(node, decls, {breakpoint, state})`.
- **tw prefixes** `hover:` `focus:` `active:` `focus-visible:` `checked:` — SPLIT BY
  EXPRESSIBILITY: if every utility in a state's bucket maps to a schema prop, it becomes the
  native state variant; if ANY utility needs raw CSS (`hover:underline`, transforms, opacity…),
  the WHOLE bucket compiles to one raw `&:state { … }` block instead. Deterministic — mixed
  buckets go raw.
- `group-hover:` / `focus-within:` / `visited:` / `disabled:` have NO native state — they throw
  with the `raw=""` recipe. `e--selected`/`e--disabled` (editor-machinery class states) are
  kit-only via `stateVariant()`.
- QUIRK (accepted, a11y-positive): Elementor renders the `hover` state as the comma pair
  `:hover, :focus-visible`. An authored `focus-visible` state keeps its own variant.
- Transitions live on the BASE: `raw="transition: background .18s ease;"` + `hover={{…}}`.

## Attributes (attrs)

`attrs={{'data-track':'cta', 'aria-label':'Close', rel:'noopener'}}` → the native
`settings.attributes` envelope (kit: `ATTRS(obj)`, or `node(type, {attrs})`). Names are
grammar-validated at build; `class`/`id`/`style`/`on*` are HARD-BLOCKED (use `cls`/`gcls`, `id`,
sx/`raw` instead — `on*` never). **Version gate**: stored & editor-validated on Elementor 4.2.1;
DOM emission depends on Elementor enabling its transformer — verified per-version by the
certification suite. Empirical status: FREE core's transformer is stubbed (no DOM emission);
**Elementor Pro ≥ 4.1 registers its own transformer** (license feature `atomic-custom-attributes`)
and attributes DO reach the front-end DOM there (live-verified 4.2.1 + Pro 4.1.0, 2026-08-12;
values are esc_attr'd at save). On free installs the runtime-carrier html widget + `_cssid`
remain the JS-hook path of record.

## Motion (native interactions — SPEC 1.8)

`motion={{…}}` (one spec or an array ≤5 — 6 throws at build; the server would throw the WHOLE
save) on any atomic intrinsic → Elementor's native Interactions (editable in the editor's
Interactions tab, delivered by Elementor's own Motion lib — no custom JS). Kit level:
`interact(node, opts|[opts])` / `interaction(opts)`; pre-built `interaction-item` envelopes pass
through verbatim (the decompile round-trip). NOT valid on `<html>` (classic widget — no
`data-interaction-id`).

```jsx
<section motion={{ effect: 'fade' }}>                      // scrollIn fade, 600ms (the defaults)
<box motion={[{ effect: 'slide', direction: 'top', duration: 500, delay: 120 },
              { trigger: 'load', effect: 'scale' }]}>
<h1 motion={{ effect: 'fade', excludeOn: ['mobile'] }}>    // breakpoints envelope
```

- Fields: `trigger` (default **scrollIn**) `effect` (default fade) `type` (in|out) `direction`
  `duration`/`delay` (ms) `excludeOn` (breakpoint names) + pro-flagged: `easing` `replay`
  `relativeTo` `repeat`/`times` `start`/`end` (scrollOn %), `keyframes` (effect `'custom'`:
  `[{stop: 0-100, opacity|move|rotate|scale|skew}]`, opacity ≤1 = fraction).
- **Free-tier reality (lint warns — `pro-interaction`)**: free animates `load|scrollIn` ×
  `fade|slide|scale` ONLY. hover/click/scrollOn/custom/easing/replay/repeat/… SAVE everywhere but
  animate only with Pro; **`scrollOut` additionally CRASHES the free 4.2.1 handler at trigger
  time** — never default to it.
- **Save semantics**: the server silently STRIPS invalid items (no error, the animation just
  never runs); `exjsx lint` mirrors validation.php exactly (`invalid-interaction`, error) — trust
  the lint, not the save.
- **Reduced motion (our a11y value-add — native Elementor ignores it)**: every compiled tree with
  interactions gets a tiny guard that blanks the interactions JSON when
  `prefers-reduced-motion: reduce` matches (elements render at final state). Opt out:
  `site.config.mjs → motion: { respectReducedMotion: false }`.
- **Delivery / gate detectability**: interactions ship as ONE footer JSON blob
  `<script type="application/json" id="elementor-interactions-data">` + `data-interaction-id`
  per element; Motion lib (`motion-js` handle) is enqueued only when items exist. Deterministic
  screenshots (eu-studio gates): strip before capture —
  `page.emulateMedia({ reducedMotion: 'reduce' })` (exjsx guard neutralizes everything), or
  generically `page.addInitScript` a MutationObserver that sets
  `#elementor-interactions-data`.textContent = '[]' on insertion (removing it AFTER load is too
  late — consumers read it at wp_footer parse time). Optional motion smoke pass: scrollIn into
  view, settle ≥ duration+delay, then capture.

## sx style props (on any intrinsic / box())

Sizes (`w h maxw minh gap size radius pad m`): number = px, or a unit string `'N<unit>'` with
px/%/em/rem/vw/vh/ch — units are honored (`maxw="88vw"` really is 88vw). `w h` also take `'hug'`/`'auto'`.
Anything else (`calc()`, `clamp()`, keywords, two-value gap) THROWS — put it in `raw=`.
`pad m` also take `[v,h]` | `[t,r,b,l]` | `{t,r,b,l}` partial | `'0 auto'` strings ·
`dir` (`'row'|'column'` — `'col'` throws) · `align justify` (Elementor enums, validated at build:
justify = center|start|end|flex-start|flex-end|space-between/around/evenly|stretch, shorthands
`'between'/'around'/'evenly'` auto-map; align = same minus the space-* plus self-start/self-end —
**NO baseline**, use flex-end) · `wrap center` · `display` · `flex` · `pos` ·
`span` `rowSpan` (grid-column/row spans, integers) · `gridCols` `gridRows` (e.g. `'repeat(3, 360px)'` — add `raw="justify-content:center;"` or grids left-pin) ·
`gapX gapY` (column/row gap — compile to ONE atomic two-axis gap envelope; tw `gap-x-*`/`gap-y-*` map here) ·
`color bg` (hex — NOT gradient strings) · `bgImage` (url|id) `bgOpts`
(`{color, size:'cover', position:'center center', repeat:'no-repeat', attachment}`) · `grad` (**array `[angle, from, to]`**,
e.g. `grad={[135,'#0ff','#f0f']}` — a CSS gradient STRING throws; freeform gradients go in `raw="background-image:…;"`) ·
`border` (`[w,'#color']` — bare number = width!) · `borderColor radius shadow` ·
`size weight font lh ls ta` (bare-number `lh`≤4 and `ls` read as EM — `ls={-1}` collapses a headline;
explicit units are honored: `lh="150%"`, `ls="2px"`) ·
`z`/`zIndex` · `fit` (object-fit) · `tablet={{…}} mobile={{…}}` (breakpoint overrides) · `sx={{…}}` (merge extra) · `props` (raw envelopes).

## Kit helpers (free vars via prelude — no imports)

- **Fonts load natively**: any Google font named in a style prop (`font=` / sx `font-family`) is
  enqueued by Elementor itself on render (`elementor-gf-*` link) — do NOT add `fontLoader()` for
  those (it double-loads). `fontLoader('Family', [400,700])` (place FIRST in the tree, one per
  family) is ONLY for families Elementor can't see: fonts referenced solely inside raw `html`
  widgets or `raw=` CSS.
- `navBar({logo, links:[[label,href],…], ctas, accent, ink})` — complete header (desktop rail +
  dropdown mega-menus + mobile hamburger) as ONE self-contained html widget: immune to the
  burger-steals-a-flex-slot bug by construction. Start here for navs; hand-roll only when the
  design demands it — and then follow the burger-wrapper gotcha below religiously.
- `button(text, href, envelopeProps?)` — real href REQUIRED (no '#'). Third arg takes ATOMIC
  ENVELOPES only (plain sx values throw with recipes) — for styled CTAs prefer a styled
  `<text href>` anchor or `box({...sx, tag:'a'})`.
- `divider(props)` · `tabs([{label,content}], {active})` · `youtube(url)` · `video(url)`
- Forms (Pro) — the COMPLETE recipe (all four parts required):
  ```
  form({ name:'contact', actions:['collect-submissions'] }, [
    field('name', 'Name'),
    field('email', 'Email', { type:'email' }),
    field('msg', 'Message', { textarea:true, rows:5 }),
    formSubmit('Send message'),          // ← form() does NOT add a submit button by itself
  ])
  ```
  Input types: text|email|number|tel|password, or `textarea:true`. **There is NO radio widget in
  atomic Pro forms** — option-picker UIs are styled CHECKBOX fields (one per option, distinct ids)
  or a select. `checkboxRow(id, label, {required})` emits the NATIVE checkbox row (e-flexbox with
  the `e-form-checkbox-row` class — it's a class, not an element type — checkbox + linked label).
  **Use `collect-submissions`, NOT `email`, on Elementor 4.2.x + Pro 4.1.0** (email
  action upstream-broken: validator and send-runner disagree). Submissions land in
  `wp_e_submissions`.
- Native feedback: `form()` auto-appends the e-form-success-message / e-form-error-message
  elements (the core form handler flips `form-state-*` on submit and core CSS reveals them — they
  are plain saved children, NOT runtime-created, so omitting them means zero feedback). Custom
  copy: `successMessage:`/`errorMessage:` or place `formSuccessMessage('…')`/`formErrorMessage('…')`
  yourself; opt out with `messages:false`.
- `formSuccess({ message, sub, accent })` — legacy html-widget success banner (hides the form on
  ajax success). Superseded by the native messages above; keep for pre-4.1.1 targets.

## Layout gotchas (each cost a real run)

- The prelude provides `Nav`/`Footer`/`Layout`… as BUILT-IN free vars — a project component named
  `Nav` gets silently shadowed. Name yours `SiteNav`/`SiteFooter` and import them explicitly.

- Row children get `flex:1` unless width-pinned — use `w:'hug'` for justify-between clusters.
- Absolute overlays inside FLEX parents: `pos:'absolute'` + `raw="inset:0;"` renders **0×0**
  (no width/height of its own) — give the overlay explicit `w="100%" h="100%"` (and the parent
  `pos:'relative'`).
- Media manifest (`data/media.manifest.mjs`, run `exjsx media <dir>`): default-export an array of
  `{ slot, file:'/abs/or/rel.jpg' }` or `{ slot, src:'https://…' }` (fonts:
  `{ slot, type:'font', file, family, role, weight }` → embedded data-URI). Idempotent by slot;
  writes `data/media-map.json` — read ids/urls from it, never hardcode.
- A hidden-on-desktop mobile burger must hide its WIDGET, not just its button: a bare `<html>`
  widget as the 3rd child of a `justify="space-between"` header still occupies the right flex slot
  even when its inner button is `display:none` — the links rail gets CENTERED, not right-pinned
  (invisible at 1200, glaring ≥1512; broke 8 of 10 batch sites). Wrap it:
  `<box w="hug" pad={0} display="none" mobile={{display:'flex'}}><html raw={...}/></box>`.
- Size units (`%`/`vw`/`vh`/`em`/`rem`/`ch`) are honored on all size props; unknown values throw
  at build time. `calc()`/`clamp()`/keywords still go through `raw=`.
- Class-only `display:grid` loses to Elementor's atomic flex CSS printed later in the body — set
  `display`/grid props via sx (atomic), keep only extras (auto-rows, dense, bleed) in `raw`.
- Text inside rotated/transformed cards needs explicit width (`w:'100%'` inner, fixed card width) —
  hug-width paragraphs in tilted containers collapse to one word per line.
- Headings inside flex columns need `w:'100%'` or they shrink to max-content and overflow mobile.
- Build width-general: absolutes `left:calc(50% ± Npx)` (never fixed `left:Npx`), grids centered.
- Absolute `<img>` inside an `html` widget needs `max-width:none` (theme clamps to wrapper width).
- `backdrop-filter` on a nav creates a containing block — `position:fixed` overlays inside get
  trapped. Toggle it off when the overlay opens (`.open{backdrop-filter:none}`).
- Mono/`white-space:nowrap` text wraps nowhere — cap or wrap it for 390px.
- Image URLs: absolute http(s) on the TARGET site, single query param.
- Marquee/bleed decorations: `raw="overflow:hidden;"` on the section.
- Dark themes: body text ≥ ~#b0b8c0 on near-black; verify contrast in screenshots, not by hex.

## Verify / test (studio commands — never hand-write playwright)

```
eu-studio verify --pages /,/about/ [--widths 1200,1512,390]   # structural matrix, one call
eu-studio clicktest --form /contact/ --accordion /pricing/ --burger / --nav /=about
eu-studio doctor            # health + auto-heal; NAMES failing stylesheets — run this instead of
                            # hand-grepping page HTML when styles look broken
eu-studio carry-css --page <id> …   # make pages independent of a flaky css file store
```
