# elementor-jsx

React-level JSX → Elementor V4 compiler + one-shot deployer. **v1.0.0** — full
Elementor catalog parity, certified on Elementor **4.1.4 / 4.2.0** by a 396-test
suite that runs against a real WordPress stack.

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
node src/cli.mjs build  site.jsx            # offline: JSX -> deployable bundle
node src/cli.mjs deploy site.bundle.json    # 2 kit writes + N page upserts (idempotent)
node src/cli.mjs watch  site.jsx --deploy   # rebuild+deploy on save
node src/cli.mjs build  site.jsx --inline   # self-contained pages (multi-tenant kits)
node src/cli.mjs decompile tree.json        # adopt an existing Elementor page into JSX
node src/cli.mjs media  manifest.mjs        # hash-cached asset sideloading
```

## What's inside

- `src/kit/` — **the canonical authoring kit** (typed envelopes, every atomic element,
  forms, tabs, video, dynamic tags, loops, interactions, `assertTree` shift-left gates).
  The elementor-ultra skill's old `lib/kit*.mjs` paths are re-export shims of these files.
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
- `types.d.ts` — the typed public API

## Fresh dev environment (one command)

```
git clone https://github.com/WPCursor/elementor-jsx && cd elementor-jsx && npm install
EXJSX_ULTRA_ZIP=/path/to/elementor-ultra-mcp.zip sh dev/setup.sh
npm test                     # 357 offline tests
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

`npm test` (357 unit, offline) · `EXJSX_IT=1 npm run test:it` (39 live, needs the
wpos stack). **`test/README.md` is the verified-facts catalog** — every rendering
claim in this package is enforced there, incl. the 4.1↔4.2 span migration, XSS
posture, and 13 field-found bugs. The coverage audit fails the suite if any export
ships untested.
