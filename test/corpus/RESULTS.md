# tw corpus — pixel parity scoreboard

Generated 2026-08-17T11:53:21.725Z · viewport 1280 · bench http://127.0.0.1:8931 · scores are mean |Δ| luminance (0–255)
over the common region of the reference (real Tailwind, Play CDN) and the exjsx render (real pipeline,
`--inline`, free Elementor 4.2.1). Bands: ≤3 near-identical · 3–8 faithful · 8–20 visible · >20 structural.

| component | score | band | skipped | worst band | Δheight | diagnosis (score > 8) |
|---|---|---|---|---|---|---|
| cruip-cta | 40.66 | structural | 16 | y=0 (71.38) | -134px | dark card is `before:bg-gray-900` + button gradient is `bg-linear-to-t from-/to-` — both out of tw scope (skipped), so the card renders white → luminance inversion; layout itself matches |
| cruip-features | 126.26 | structural | 32 | y=0 (231) | 0px | entire dark theme (`before:bg-gray-900`), planet glow (before:/after: gradients) and per-cell padding/borders (`*:p-6`, `*:before:` child variants) are pseudo/child-combinator decoration tw declares out of scope — page renders light on white → worst score by construction, not a compile bug |
| cruip-header | 5.22 | faithful | 13 | y=0 (5.82) | +20px |  |
| cruip-hero | 13.89 | visible | 42 | y=250 (63.46) | 0px | reference hides the terminal lines (`[&_span]:opacity-0` reveal animation) and overlaps avatars (`-space-x-3`) — both skipped, so exjsx shows readable text and spread avatars; border-y gradient fades ([border-image:…--theme()] ) degrade to solid lines on both sides |
| cruip-testimonial | 11.67 | visible | 5 | y=150 (41.62) | +26px | byline inline spans (`text-gray-700`/`text-blue-500` inside one line) flatten to a single uniform-color text (inline styled runs are out of exjsx's text model); quote-svg overlap offset drifts a few px |
| hyperui-cta | 14.97 | visible | 3 | y=200 (22.07) | -8px | mean is dominated by the unsplash photo half: ~5px cumulative vertical drift (tw sizes don't carry Tailwind's paired line-heights → text block heights differ slightly) shifts the photo crop; left column is near-identical |
| hyperui-faq | 7.57 | faithful | 6 | y=50 (15.34) | -56px | closed-state chevrons can't rotate (`group-open:-rotate-180` skipped) and 2–5px item-height drift accumulates down the list; otherwise near-identical |
| hyperui-feature-grid | 3.56 | faithful | 1 | y=300 (22.29) | +8px |  |
| hyperui-footer | 4.11 | faithful | 2 | y=100 (23.38) | +18px |  |
| hyperui-header | 1.35 | near-identical | 0 | y=0 (1.73) | 0px |  |
| hyperui-pricing | 6.14 | faithful | 22 | y=400 (17.45) | +23px |  |
| hyperui-section | 6.91 | faithful | 0 | y=250 (15.77) | 0px |  |
| hyperui-stats | 7.00 | faithful | 2 | y=250 (15.84) | -12px |  |
| magicui-bento | 5.08 | faithful | 56 | y=250 (11.11) | -332px | score under-reports the real gap: `auto-rows-[22rem]` is skipped so bento rows collapse (Δheight −337px); card content, marquee and grid spans themselves are faithful — mask-image/dark:/group-hover: decoration skipped as designed |
| shadcn-login-block | 2.27 | near-identical | 6 | y=550 (13.53) | 0px |  |

Distribution: structural 2 · faithful 8 · visible 3 · near-identical 2 — mean of means 17.11.

## Method notes (what the numbers mean)

- **Mechanical conversion, one rulebook** (`lib/convert.mjs`): className → `tw` verbatim after a
  static breakpoint resolution at 1280px (sm:/md:/lg:/xl: hoist to base in cascade order;
  2xl:/dark:/rtl: are inactive in this render on BOTH sides and drop). Tokens the tw compiler
  throws on land in the per-component `skipped` list — the harness measures what the supported
  subset achieves, so reference-visible styling from skipped classes shows up in the score.
- **Environment neutralization**: text leaves carry the inheritance-resolved Tailwind-preflight
  typography (system-ui 16px/400/#000/1.5) computed only from tw tokens, because the bench theme
  styles widgets directly (Manrope 21.76px/300) and that difference is the theme's, not tw's.
  Boxes get pad/gap 0 unless a token sets them; `flex` without a direction token gets an explicit
  `flex-row` (see real-bug list); unsized children of rows get `w="hug"`.
- **Skipped ≠ bug**: before:/after: decoration, group-hover:, theme-var colors (bg-primary…),
  gradient synthesis (bg-linear-to-*/from-/to-) and v4-only arbitrary values are declared
  out-of-scope by tw.mjs (they throw with a recipe). Divergence they cause is attributed in the
  diagnosis column.

## Findings (real issues surfaced by this harness — measured, not masked)

1. **inline.mjs multi-page raw-CSS loss — REAL BUG, fixed in working tree.** `--inline` collected
   the raw-CSS rules of ALL pages into one `<style>` widget injected into `pages[0]` only: every
   page after the first silently lost ALL its raw CSS (space-y owl margins, text-transform,
   per-side borders, transforms, positioning offsets). First run measured it: hyperui-faq 13.07 →
   8.09, pricing 9.37 → 5.33, stats 9.41 → 4.65, footer 7.1 → 4.86 after the per-page fix
   (src/inline.mjs). The 637-test unit suite still passes.
2. **tw text-SIZE classes emit font-size only — Tailwind pairs each size with a line-height**
   (text-3xl = 30px/36px; tw.mjs emits 30px and leaves line-height to the theme). The harness pins
   `line-height: normal` on sized text (what tw output does on a neutral page) so the gap is
   measured: it is the main source of the 2–6px per-block vertical drift visible in nearly every
   score (hyperui-cta's 9.3 is mostly this drift shifting the photo half). NOT fixed (tw.mjs
   untouched per task).
3. **`flex` without a direction token compiles to a COLUMN** (tw.mjs emits only display:flex;
   box() defaults flex-direction:column) — Tailwind's default is ROW. The converter appends an
   explicit `flex-row` (counted per component as `flexRowFixups` in results.json — 62 hits across
   the corpus, i.e. this default divergence would break most real-world components). NOT fixed.
4. **Near-miss coverage gaps** (throw → skipped, so honest but cheap to add): `-space-x-N`
   (negative sibling spacing; positive is supported), `auto-rows-[…]`/`auto-cols-*`,
   `group-open:` (details disclosure), `ring-*`. Each caused a visible corpus divergence.

### Model notes (systematic, by construction)
- exjsx has no styled INLINE runs — `<span class="text-blue-500">` inside a sentence flattens to
  the parent's color (skipped as `inline <span>: …`). Multi-color one-liners degrade uniformly.
- Every container is a flexbox: block-flow subtleties (inline-block shrink-wrap, margin collapse)
  are emulated by the converter's hug/center rules; `details` renders its closed state (summary only).

## Rerun

```
EXJSX_IT_PLAYWRIGHT=…/playwright/index.mjs npm run corpus            # full run
npm run corpus -- --only shadcn                                       # one component
npm run corpus -- --skip-deploy                                       # rescore without deploying
```
Bench overrides: CORPUS_WP_URL / CORPUS_WP_USER / CORPUS_WP_PASSWORD. First run needs network once
(Tailwind CDN → .cache/, placeholder upload); screenshots land in shots/, generated JSX in build/.
