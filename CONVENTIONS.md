# elementor-jsx authoring conventions

The house style for writing sites with elementor-jsx — human or agent. Every convention here
earned its place by being violated in a real build and costing a debug cycle; where a rule can
be checked mechanically, `exjsx lint` enforces it (rule id in brackets). Compile-time gates
(`assertTree`, the tw/intrinsic error messages) enforce the rest — this document is the *why*
behind those errors, not a substitute for them.

## 1. Project layout — separation of concerns, enforced at discovery

The canonical form is an **fs-project** (`exjsx build <dir>`): the directory layout *is* the
site wiring, and each file holds exactly one concern.

```
mysite/
  site.config.mjs             # (optional) project config ONLY: { name?, template? }
  theme.mjs                   # (optional) defineTheme tokens ONLY — the one place brand values live
  pages/                      # CONTENT — *.page.jsx files only (discovery errors on strays)
    home.page.jsx             #   default-exports a component; `export const meta = {…}` per-page
    about-us.page.jsx         #   slug = filename (nested dirs join with '-'); meta.slug overrides
    locations/[city].page.jsx #   dynamic: `export const data = () => [{slug,title,seo?,props?}]`
  parts/                      # CHROME — <type>.part.jsx, type ∈ header|footer|single|archive|error404|popup
    header.part.jsx
  components/                 # shared section components (free-form, imported by pages)
  data/  media.manifest.mjs   # data arrays · image slots { slot: { url|file, alt } }
```

- Pages hold content, parts hold chrome, theme holds tokens, `data()` holds data. A file mixing
  concerns still compiles — the layout exists so the seams stay reviewable.
- Discovery validates the whole layout up front and throws **one** error listing every problem
  with its fix; per-file contract violations (missing default export, bad `data()` shape) throw
  at build naming the file.
- Chrome present → pages default to `elementor_header_footer` automatically; `meta.template` wins.
- Small sites may still use a single `site.jsx` default-exporting `defineSite` — same pipeline.

## 1b. Imports — the shorthand/using system

- **Usually: import nothing.** The build auto-injects the curated authoring surface (prelude) —
  `defineSite`, `defineTheme`, `fontLoader`, `tabs`, `dyn`, `sx`, the component library
  (`Page`, `Card`, …) and every common kit builder resolve as free variables in any built file.
  Unused names tree-shake away; your own binding of the same name **always wins** (only free
  variables are substituted), so the prelude can never break explicit code.
- **Everything else: one bare specifier.** `import { DIM, PDIM, node } from 'elementor-jsx'` —
  the full barrel (`src/x.mjs`) carries *every* public primitive, and the build resolves bare
  `elementor-jsx[/…]` specifiers from the package's own `exports` map, no node_modules needed.
- Short/generic names (`S`, `C`, `DIM`, `node`, `abs`, `hover`, …) are deliberately **not**
  auto-injected — a typo resolving to a helper instead of a ReferenceError is silent behavior.
  They stay explicit-import-only; `test/unit/surface.test.mjs` enforces both the barrel's
  completeness and this deny-list.

## 2. The styling ladder — always in this order

1. **`tw="…"`** for anything the Tailwind subset covers — layout, spacing, type scale, radii,
   shadows. It's the shortest, most reviewable form and models emit it natively.
2. **sx props** (`pad={{t:64}}`, `grad={[160,'#111','#333']}`, `size={47}`) for what tw can't
   express: partial sides, gradients, computed values, theme tokens.
3. **`raw="…"`** *last*, and only for genuinely non-atomic CSS: nested selectors (`& em {…}`),
   pseudo-classes, filters, absolute-position offsets. Raw compiles to `custom_css`, which only
   renders via global classes (or the `--inline` `<style>` workaround) — atomic props always
   render. [`raw-atomic-overlap`, `oversized-raw`]
4. Explicit sx props **win** over tw on conflict; don't set both for the same property.

Incident record: free-Elementor pages silently dropped raw backgrounds until `--inline` existed;
raw blocks are also invisible to the class dedup.

State styling follows the same ladder: state props / tw state prefixes first (they emit NATIVE
state variants when fully schema-mappable — editor-visible, schema-validated), `raw`/state-`raw`
only for CSS the schema can't hold. A tw state bucket with ANY raw-only utility compiles entirely
to a raw `&:state {…}` block (deterministic split — never half-and-half).

Custom CSS must be **sanitize-safe**: WordPress runs `sanitize_textarea_field` on save, which
strips/escapes any `<` (tag-like sequences) — the CSS reaches the renderer silently mangled; and
the renderer appends a literal `\n`, so an unterminated final declaration dies in the browser
parser. `css()` guards both at build; decompiled/imported foreign blobs are re-guarded by lint.
[`custom-css-sanitize`]

Motion (`motion={{…}}`) is the same doctrine at the interactions layer: the server SILENTLY
STRIPS any invalid interaction item on save (zero errors, the animation just never runs), so the
lint mirror of `validation.php` is the only honest failure surface — trust the lint, not the
save. Pro-flagged fields (hover/click/scrollOn/custom/easing/replay/…) save everywhere but
animate only with Pro, and `scrollOut` crashes the FREE 4.2.1 handler at trigger time — a
free-target bundle should ship none of them. Reduced motion is respected by default (compiler
guard — native Elementor ignores it); opt out only with a reason.
[`invalid-interaction`, `pro-interaction`]

## 3. Theme discipline

- Brand colors, fonts, radii, spacing live in `defineTheme` — components read `t.color.primary`,
  never re-declare hex. One-off accents may be literals.
- `mode:'var'` makes text color/font LIVE-editable in Elementor (variables); backgrounds degrade
  to literals automatically (4.1.4 limitation — the compiler handles it, don't work around it).
- Google fonts named in style props (`font=`) load NATIVELY — Elementor enqueues an
  `elementor-gf-<family>` stylesheet on render (verified live 2026-08-09), so no `fontLoader()`
  there (adding one double-loads). The exception: a family referenced ONLY inside raw `html`
  widgets or `raw=` CSS is invisible to Elementor's enqueue and falls back silently (every
  measurement you made is then wrong) — set it via a style prop somewhere, or add
  `fontLoader('Family',[400,700])` first in the tree. [`font-not-loaded`]

## 4. Components

- Small, props-driven function components; theme arrives via context (`<Page theme={t}>` +
  `useTheme()`), not prop-drilling.
- Any visual pattern used 3+ times gets `cls="card"` — the dedup pass names the shared class and
  the client sees `card`, not `c-1x9fq2`, in the Class Manager. [`unnamed-shared-class`]
- **Never reuse a kit-node instance** — `clone()` or a factory (`const Rule = () => divider(…)`).
  Shared instances mint duplicate ids; `assertTree` throws (incident: the Nebula divider).
- Mixing kit helpers (`tabs()`, `youtube()`, `loopGrid()`) with JSX children is supported and
  encouraged — the renderer resolves embedded vnodes anywhere in a kit subtree.

## 5. Content

- Text intrinsics accept **only** `<em>/<strong>/<br>` inline children (the html-v3 whitelist);
  anything else throws at compile. Two-tone copy: `<strong>` + `<em>` styled via one shared
  `raw="& strong {…} & em {…}"` constant. (Incident: a silently-dropped `<em>` ate a headline word.)
- Buttons and links are `<text href>` / `<heading href>` — they render real anchors. There is no
  `<button>`; the compile error tells you this, believe it. Bare `href="#"` is a placeholder —
  wire it or use a `#section` anchor. [`placeholder-link`]
- CMS-driven text binds with `dyn={dyn.postTitle()}`; children are ignored when `dyn` is set.
- Exactly one `<h1>` per page; heading levels step one at a time. [`heading-structure`]

## 6. Pages

- Every page ships `seo: { title, description }` (ogImage/canonical when known). [`page-seo`]
- Slugs are unique, kebab-case. [`duplicate-page-slug`]
- `template: 'elementor_canvas'` (default) for standalone pages; `'elementor_header_footer'`
  whenever theme parts must render.
- 3+ pages with the same shape → `fromData(items, map)`, not copy-paste.

## 7. Media

- Production images go through the media manifest (hash-cached sideload, alt_text set at the
  attachment). URL-src `<img>` takes inline `alt` — never leave it empty. [`img-alt`]
- Never bake dev-host URLs (`localhost:…`) into content that will deploy elsewhere — sideload to
  the target, or key off `WP_URL` at build. [`env-baked-url`] (Incident: the cold-start
  portability round found three hardcoded stack URLs.)
- Attachment-id images take alt from the attachment only — the compiler throws if you try `alt`
  there, and the error carries the recipe.

## 8. Responsive

- Desktop-first, mirroring sx: base = desktop, `max-lg:` = tablet, `max-md:` = mobile.
- Axis spacing responsively: partial sides (`max-md:py-16` → `{t,b}`) are atomic and safe.
- No `hover:`/state utilities in tw yet — state styling goes through `raw="&:hover {…}"`.
- Grids collapse by switching `grid-cols-*` per breakpoint or `col-span-12` on children —
  `col-span-full` is not atomic; the error says so.

## 9. Deploy discipline

- Shared/multi-site targets: **always `--inline`** — zero kit writes, no registry or variable
  clobber. Single-owned sites: normal deploys own the class registry namespace.
- Iterating one page of a big site: `deploy --only <slug>` (kit writes skipped — shared-class
  changes lag until a full deploy; the CLI warns).
- A drift warning (`skipped-drifted`) means a human edited the page in Elementor. **Stop.**
  Reconcile (decompile/adopt) or consciously `--force` — never reflex-force.
- Verify loop after any visual change: build → `deploy` → screenshot → compare. Pages >~8k px:
  the shot verb auto-stitches; trust viewport captures over old full-page ones.

## 10. Nesting & structure

- Keep container depth ≤ 10 — grid spans and partial-side spacing flatten most towers.
  [`deep-nesting`]
- No empty unstyled containers — delete them or give them a job. [`empty-container`]

## Enforcement map

| Layer | What it catches |
|---|---|
| compile gates (`assertTree`, tw/intrinsic/textOf errors) | invalid trees, duplicate ids, unknown utilities/tags, silent-content-loss |
| `exjsx lint` | the conventions above (rule ids in brackets); `--strict` for CI |
| `exjsx inspect` | reviewing what a bundle actually contains (decoded CSS) |
| drift hash on deploy | protecting hand edits from overwrites |
| unit suite (`npm test`) | the compiler's own contracts (489 tests) |
