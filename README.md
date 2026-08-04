# elementor-jsx

**Write small JSX components. Compile them to native Elementor pages. Deploy over REST.**

React-level JSX → Elementor V4 compiler + one-shot deployer. Full Elementor catalog
parity (atomic elements, theme parts, forms, loops, dynamic tags, interactions, SEO),
certified on Elementor **4.1.4 → 4.2.1** (version adapters translate prop-format changes
per version) by a **522-test** suite that runs against a real WordPress stack.

MIT licensed. Not affiliated with or endorsed by Elementor Ltd — "Elementor" is their
trademark; this is an independent compiler that targets their page format.

## Quickstart

Requirements: Node ≥ 18 · a WordPress site with **Elementor ≥ 4.1.4** (V4 atomic
experiments on) and the **[elementor-ultra companion plugin](https://github.com/itshahmir/elementor-ultra-mcp)** (ships the deploy/validate
REST endpoints — zip in the GitHub release, source in that repo) · an [application password](https://wordpress.org/documentation/article/application-passwords/).

```sh
npm i -D elementor-jsx
npx exjsx init site            # scaffold theme.mjs + pages/home.page.jsx
npx exjsx build site           # compile → site/site.bundle.json
WP_URL=https://your-site.com WP_USER=admin WP_APP_PASSWORD=xxxx \
npx exjsx deploy site/site.bundle.json
```

That's it — the page is live, native, and editable in the Elementor editor. Re-run
deploy any time: it's idempotent, and drift hashes protect pages someone hand-edited
in the editor (`--force` to overwrite deliberately).

## Authoring

```jsx
import { defineSite } from 'elementor-jsx';
import { defineTheme } from 'elementor-jsx/theme';
import { dyn, loopGrid } from 'elementor-jsx/kit';

const theme = defineTheme({ name: 'brand', color: { primary: '#B31E2C', ink: '#101418' }, font: { head: 'Sora' } });

export default defineSite({
  name: 'mysite', theme,
  parts: {
    header:  { node: <SiteHeader /> },                       // site-wide (Pro theme-builder)
    footer:  { node: <SiteFooter /> },
    single:  { node: <PostTemplate /> },                     // dynamic post template
    archive: { node: <BlogIndex /> },
    error404:{ node: <Lost /> },
    popup:   { node: <Offer />, display: { pageLoad: 2 } },
  },
  pages: [{
    title: 'Home', slug: 'home', template: 'elementor_header_footer',
    seo: { title: 'Home | Brand', description: '…', ogImage: 'https://…' },
    node: (
      <section pad={[96, 24]} bg={theme.color.primary}>
        <h1 animate={{ effect: 'fade', trigger: 'load' }} color="#fff" size={56}>Hello</h1>
        <text tw="text-lg leading-relaxed max-w-xl text-white max-md:text-[15px]">Tailwind subset works too.</text>
        {loopGrid({ source: 'post', perPage: 3 }, [/* dyn.postTitle() … */])}
      </section>
    ),
  }],
});
```

```
npx exjsx init  [dir]                # scaffold a minimal fs-project
npx exjsx build site.jsx             # offline: JSX -> deployable bundle
npx exjsx build mysite/                    # fs-project: pages/ + parts/ + theme.mjs discovered & wired
npx exjsx deploy site.bundle.json    # 2 kit writes + N page upserts (idempotent)
npx exjsx watch site.jsx --deploy   # rebuild+deploy on save
npx exjsx build site.jsx --inline   # self-contained pages (multi-tenant kits)
npx exjsx decompile tree.json        # adopt an existing Elementor page into JSX
npx exjsx lint site.jsx --strict     # conventions check (CONVENTIONS.md) — CI gate
npx exjsx inspect site.bundle.json   # readable bundle dump (custom_css decoded)
npx exjsx media manifest.mjs        # hash-cached asset sideloading
```

## What's inside

- `src/kit/` — **the canonical authoring kit** (typed envelopes, every atomic element,
  forms, tabs, video, dynamic tags, loops, interactions, `assertTree` shift-left gates).
  The elementor-ultra skill's old `lib/kit*.mjs` paths are re-export shims of these files.
- `src/x.mjs` + `src/prelude.mjs` + `src/bundler.mjs` — the import system: `elementor-jsx` barrel
  (every primitive, coverage-tested), auto-injected prelude (use `tabs`/`dyn`/`fontLoader`/`Page`…
  with ZERO imports in built files), bare-specifier resolution without node_modules.
- `src/runtime.mjs` — JSX render engine (theme context, intrinsics, kit-node mixing).
  Intrinsic tags: `box`/`div`/`row`/`col`/`section` (containers), `h1`–`h4`/`heading`,
  `text`/`p` (add `href` for a real anchor — there is no `<a>`/`<button>`), `img`, `html`.
- `src/tw.mjs` — Tailwind-subset `tw=""` prop (`tw="flex flex-col py-24 px-6 gap-8 bg-[#0A2230]"`),
  desktop-first (`max-lg:` → tablet, `max-md:` → mobile); plus standard CSS property-name
  aliases in sx (`padding`, `maxWidth`, `textAlign`, …). In-distribution authoring for
  models: no skill docs needed to write valid styles. Unknown utilities throw at compile.
- `src/compile.mjs` — site → bundle (id normalization, class dedup, theme parts, carriers)
- `src/deploy.mjs` — one-shot deploy (variables + registry + pages + parts + SEO runtime),
  version-adaptive (4.1↔4.2), idempotent, registry-namespace-owning
- `src/decompile.mjs` — any V4 tree → editable JSX (dynamic tags, interactions, full fidelity)
- `types.d.ts` — the typed public API (incl. global JSX namespace — editor autocomplete on intrinsics)
- `CONVENTIONS.md` — the authoring doctrine; every rule cites the incident it prevents, and
  `src/lint.mjs` (`exjsx lint`) enforces the mechanical subset

## Fresh dev environment (one command)

```
git clone https://github.com/itshahmir/elementor-jsx && cd elementor-jsx && npm install
EXJSX_ULTRA_ZIP=/path/to/elementor-ultra-mcp.zip sh dev/setup.sh
npm test                     # 522 offline tests
EXJSX_IT=1 npm run test:it   # 39 live tests against the fresh stack
```

`dev/setup.sh` is idempotent: it stands up an isolated docker stack (`exjsx-dev`,
WordPress + MySQL on :8918), installs Elementor (pinned, default 4.2.0) + the
elementor-ultra companion plugin (deploy endpoints), fixes mu-plugins perms, seeds
fixture media, creates an app password, and writes `.env` — including
`EXJSX_FIXTURE_IMG` (fixture attachment id) and the DB plumbing the integration
harness uses for snapshot/restore isolation. Optional `.env` extras for the browser
tiers: `EXJSX_IT_PLAYWRIGHT` (a playwright install) and `EXJSX_ULTRA_CLI` (the
elementor-ultra cli for audit/screenshots) — those tests skip gracefully without them.
Visual baselines are keyed per stack port (`test/baselines/*@<port>.png`); a new
stack seeds its own on first run. Pro tests skip unless elementor-pro is installed
(drop the zip in via `wp plugin install`, keep it inactive — tests activate it
inside their snapshot window).

## Tests = the contract

`npm test` (522 unit, offline) · `EXJSX_IT=1 npm run test:it` (live, needs the
wpos stack). **`test/README.md` is the verified-facts catalog** — every rendering
claim in this package is enforced there, incl. the 4.1↔4.2 span migration, XSS
posture, and 13 field-found bugs. The coverage audit fails the suite if any export
ships untested.

## License

[MIT](LICENSE) © 2026 [Algorismus](https://algorismus.io). Free forever — the whole stack is open source:
this compiler/CLI/kit (MIT), the [Elementor Ultra MCP server](https://github.com/itshahmir/elementor-ultra-mcp)
(MIT) and its companion WordPress plugin (GPL-2.0-or-later).
