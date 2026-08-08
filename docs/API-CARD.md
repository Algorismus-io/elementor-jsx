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
```

Build/deploy: `exjsx build <dir>` → `exjsx deploy <bundle.json>` (idempotent; self-primes CSS;
detects Elementor version over REST — no wp-cli needed; a stray EXJSX_WPCLI pointing at another
site is auto-ignored). `exjsx lint <dir>` before every deploy.

## Intrinsics (the ONLY tags)

| tag | notes |
|---|---|
| `box` `div` `col` `row` `section` | flex containers. `row` forces dir row; `section` renders `<section>` |
| `h1 h2 h3 h4` / `heading` | text props below apply; inline `<em>/<strong>/<br>` children OK |
| `text` `p` | paragraph; `href` renders a REAL anchor (use for links/buttons-as-links) |
| `img` | `src` = URL string (inline `alt` OK) or attachment id (alt comes from media manifest) |
| `html` | raw HTML/SVG/style/script carrier — `raw` prop or children |

NO `<nav> <main> <ul> <span> <a> <button>` intrinsics. Container tag override: `tag="header|footer|article|aside|a|button"`.
Special props on all intrinsics: `tw=""` (Tailwind subset), `raw=""` (CSS decls, auto-terminated),
`cls="name"` (semantic class label), `gcls="name"` (arbitrary extra class — style it yourself),
`id="anchor"` (real HTML id — `href="#anchor"` works), `animate={{effect:'fade'|'slide'|'scale', trigger:'load'|'scrollIn', ...}}`.

## sx style props (on any intrinsic / box())

`w h` (number px | `'N%'` | `'hug'` | `'auto'`) · `maxw minh` · `pad m` (number | `[v,h]` | `[t,r,b,l]` | `{t,r,b,l}` partial) ·
`gap` · `dir` (`'row'|'column'` — `'col'` throws) · `align justify wrap center` · `display` · `flex` · `pos` ·
`span` · `gridCols` (e.g. `'repeat(3, 360px)'` — add `raw="justify-content:center;"` or grids left-pin) ·
`color bg` (hex) · `bgImage` (url|id) `bgOpts` · `grad` (CSS gradient string) · `border` (`[w,'#color']` — bare number = width!) ·
`borderColor radius shadow` · `size weight font lh ls ta` (**`lh`/`ls` are EM not px** — `ls={-1}` collapses a headline!) ·
`z`/`zIndex` · `fit` (object-fit) · `tablet={{…}} mobile={{…}}` (breakpoint overrides) · `sx={{…}}` (merge extra) · `props` (raw envelopes).

## Kit helpers (free vars via prelude — no imports)

- `fontLoader('Family', [400,700])` — Google font; place FIRST in the tree. One per family.
- `button(text, href, props)` — real href REQUIRED (no '#').
- `divider(props)` · `tabs([{label,content}], {active})` · `youtube(url)` · `video(url)`
- Forms (Pro): `form({ name, actions:['collect-submissions'], … }, [ field('name','Name'), field('email','Email',{type:'email'}), field('msg','Message',{textarea:true}) ])`
  — **on Elementor 4.2.x + Pro 4.1.0 use `collect-submissions`, NOT `email`** (email action is
  upstream-broken on that combo: validator and send-runner disagree). Submissions land in
  `wp_e_submissions`. Add `formSuccess()` (html snippet) anywhere on the page for a visible
  "sent" state — the atomic runner shows none.
- `formSuccess({ message, sub, accent })` — canned success banner: hides the form, shows the banner
  when the Pro ajax submit succeeds. One per page with a form.

## Layout gotchas (each cost a real run)

- Row children get `flex:1` unless width-pinned — use `w:'hug'` for justify-between clusters.
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
eu-studio doctor            # health + auto-heal (css, class store)
eu-studio carry-css --page <id> …   # make pages independent of a flaky css file store
```
