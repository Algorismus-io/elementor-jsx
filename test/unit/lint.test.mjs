/**
 * lint.mjs — the conventions enforcer. Contract under test: every rule fires on a minimal
 * violating fixture, stays SILENT on the clean exemplar, and the formatter/severity gating
 * behaves as the CLI relies on. Each rule encodes a real incident (see CONVENTIONS.md).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lintBundle, formatLint, inexpressibleBySx, PRO_ONLY_TYPES } from '../../src/lint.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h } from '../../src/runtime.mjs';
import { fontLoader, form, field, formSubmit } from '../../src/kit/kit.mjs';
import { resetIds } from '../helpers.mjs';

beforeEach(() => resetIds());

const seo = { title: 't', description: 'd' };
const page = (slug, node, extra = {}) => ({ title: slug, slug, seo, ...extra, node });
const build = (...pages) => compileSite(defineSite({ name: 'lint-t', pages }));
const rules = (r) => new Set(r.findings.map((f) => f.rule));
const of = (r, id) => r.findings.filter((f) => f.rule === id);

/* ── a clean exemplar must produce ZERO findings (the conventions are satisfiable) ── */
test('lint: clean exemplar site passes with no findings', () => {
  const b = build(page('home',
    h('section', { tw: 'flex flex-col items-center gap-6 py-24' },
      fontLoader('Poppins', [600]),
      h('h1', { size: 56, font: 'Poppins' }, 'Hello'),
      h('h2', { size: 32 }, 'Section'),
      h('text', { size: 18, href: '#section' }, 'Read more'),
      h('img', { src: 'https://cdn.example.com/a.jpg', alt: 'A thing', w: 400 }))));
  const r = lintBundle(b);
  assert.deepEqual(r.findings, [], formatLint(r));
  assert.deepEqual(r.counts, { error: 0, warn: 0, info: 0 });
});

test('lint: rejects a non-bundle input with the build-first recipe', () => {
  assert.throws(() => lintBundle({}), /build first|bundle\.json/);
});

/* ── rule-by-rule violation matrix ── */
test('lint: duplicate-page-slug is an error naming both titles', () => {
  const b = build(page('home', h('box', {}, h('h1', {}, 'a'))), { title: 'Second', slug: 'home', seo, node: h('box', {}, h('h1', {}, 'b')) });
  const f = of(lintBundle(b), 'duplicate-page-slug');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'error');
  assert.match(f[0].message, /"home"/);
});

test('lint: page-seo fires on missing title/description', () => {
  const b = compileSite(defineSite({ name: 't', pages: [{ title: 'NoSeo', slug: 'noseo', node: h('box', {}, h('h1', {}, 'x')) }] }));
  const f = of(lintBundle(b), 'page-seo');
  assert.equal(f.length, 1);
  assert.match(f[0].fix, /seo: \{ title, description \}/);
});

test('lint: heading-structure — zero h1, multiple h1, and level jumps', () => {
  const none = build(page('a', h('box', {}, h('h2', {}, 'only h2'))));
  assert.match(of(lintBundle(none), 'heading-structure')[0].message, /no <h1>/);
  const two = build(page('a', h('box', {}, h('h1', {}, 'x'), h('h1', {}, 'y'))));
  assert.match(of(lintBundle(two), 'heading-structure')[0].message, /2 <h1>/);
  const jump = build(page('a', h('box', {}, h('h1', {}, 'x'), h('h4', {}, 'y'))));
  assert.match(of(lintBundle(jump), 'heading-structure')[0].message, /jump h1 → h4/);
});

test('lint: font-not-loaded — style-prop families are native-loaded (clean); raw/html-only families warn', () => {
  // families in style props ride Elementor's native google-fonts enqueue (verified live 2026-08-09) — NO carrier demanded
  const native = build(page('a', h('box', {}, h('h1', { font: 'Poppins' }, 'x'), h('text', { font: 'Poppins' }, 'y'))));
  assert.equal(of(lintBundle(native), 'font-not-loaded').length, 0, 'font= props need no fontLoader');
  resetIds();
  // a family referenced ONLY in raw custom CSS never reaches Elementor's enqueue — warn, once per family
  const rawOnly = build(page('a', h('box', { raw: 'font-family: Poppins; & em { font-family: Poppins; }' }, h('h1', {}, 'x'))));
  const f = of(lintBundle(rawOnly), 'font-not-loaded');
  assert.equal(f.length, 1, 'deduped per family');
  assert.match(f[0].message, /only in raw\/html content/);
  assert.match(f[0].fix, /fontLoader\('Poppins'/);
  resetIds();
  // same family also set via a style prop elsewhere → Elementor enqueues it → raw usage is covered
  const covered = build(page('a', h('box', { raw: 'font-family: Poppins;' }, h('h1', { font: 'Poppins' }, 'x'))));
  assert.equal(of(lintBundle(covered), 'font-not-loaded').length, 0);
  resetIds();
  // html-widget-only family: warns without a loader, clean with the fontLoader carrier
  const htmlOnly = build(page('a', h('box', {}, h('html', { raw: '<div style="font-family: Baskervville">x</div>' }), h('h1', {}, 'x'))));
  assert.equal(of(lintBundle(htmlOnly), 'font-not-loaded').length, 1);
  resetIds();
  const htmlLoaded = build(page('a', h('box', {}, fontLoader('Baskervville', [400]), h('html', { raw: '<div style="font-family: Baskervville">x</div>' }), h('h1', {}, 'x'))));
  assert.equal(of(lintBundle(htmlLoaded), 'font-not-loaded').length, 0);
  resetIds();
  const system = build(page('a', h('box', { raw: 'font-family: "SF Pro Display",-apple-system,sans-serif;' }, h('h1', {}, 'x'))));
  assert.equal(of(lintBundle(system), 'font-not-loaded').length, 0);
});

test('lint: env-baked-url flags localhost content URLs', () => {
  const b = build(page('a', h('box', {}, h('h1', {}, 'x'), h('img', { src: 'http://localhost:8915/wp-content/uploads/x.jpg', alt: 'ok' }))));
  const f = of(lintBundle(b), 'env-baked-url');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /localhost/);
});

test('lint: raw-atomic-overlap flags atomic-coverable declarations, spares nested/pseudo raw', () => {
  const flat = build(page('a', h('box', { raw: 'padding: 24px; color: #fff;' }, h('h1', {}, 'x'))));
  const f = of(lintBundle(flat), 'raw-atomic-overlap');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /padding/);
  const nested = build(page('a', h('h1', { raw: '& em { color: #0f0; } &:hover { opacity: .8; }' }, 'x')));
  assert.equal(of(lintBundle(nested), 'raw-atomic-overlap').length, 0, 'nested/pseudo raw is legitimate');
});

test('lint: custom-css-sanitize (error) re-guards FOREIGN blobs — tag-like "<" and unterminated declarations', () => {
  // css() blocks these at build, so simulate a foreign/imported bundle by swapping the blob
  const b = build(page('a', h('box', { raw: 'color: #fff;' }, h('h1', {}, 'x'))));
  const cls = Object.values(b.classes.items).find((c) => c.variants.some((v) => v.custom_css));
  const variant = cls.variants.find((v) => v.custom_css);
  variant.custom_css.raw = Buffer.from('&::before { content: "<"; }', 'utf8').toString('base64');
  const mangled = of(lintBundle(b), 'custom-css-sanitize');
  assert.equal(mangled.length, 1);
  assert.equal(mangled[0].severity, 'error');
  assert.match(mangled[0].message, /sanitize_textarea_field/);
  assert.match(mangled[0].fix, /\\3C/);
  variant.custom_css.raw = Buffer.from('color: red; top: 598px', 'utf8').toString('base64');
  const unterminated = of(lintBundle(b), 'custom-css-sanitize');
  assert.equal(unterminated.length, 1);
  assert.match(unterminated[0].message, /without ';' or '}'/);
  // clean blobs get the positive assertion (silence isn't trusted; a stated verification is)
  variant.custom_css.raw = Buffer.from('color: red;', 'utf8').toString('base64');
  const clean = lintBundle(b);
  assert.equal(of(clean, 'custom-css-sanitize').length, 0);
  assert.ok(clean.verified.some((v) => /custom_css blob\(s\) sanitize-safe/.test(v)));
});

test('lint: oversized-raw (info) on >8 real declarations (custom properties don\'t count)', () => {
  const decls = 'opacity:.5; cursor:pointer; user-select:none; pointer-events:auto; transition:all .2s; transform:none; filter:blur(1px); isolation:isolate; content-visibility:auto; backdrop-filter:none;';
  const b = build(page('a', h('box', { raw: decls }, h('h1', {}, 'x'))));
  assert.equal(of(lintBundle(b), 'oversized-raw').length, 1);
  resetIds();
  const vars = build(page('a', h('box', { raw: Array.from({ length: 10 }, (_, i) => `--v${i}: ${i}px;`).join(' ') }, h('h1', {}, 'x'))));
  assert.equal(of(lintBundle(vars), 'oversized-raw').length, 0, 'custom-property blocks are not declaration bloat');
});

test('lint: unnamed-shared-class fires on hash-labeled classes reused 3+, silent with cls hints', () => {
  const Card = (cls) => h('box', { pad: 24, ...(cls ? { cls: 'card' } : {}) }, h('h3', {}, 'x'));
  const unnamed = build(page('a', h('box', {}, h('h1', {}, 't'), Card(), Card(), Card())));
  assert.equal(of(lintBundle(unnamed), 'unnamed-shared-class').length, 1);
  resetIds();
  const named = build(page('a', h('box', {}, h('h1', {}, 't'), Card(true), Card(true), Card(true))));
  assert.equal(of(lintBundle(named), 'unnamed-shared-class').length, 0);
});

test('lint: placeholder-link counts bare "#" hrefs; section anchors are fine', () => {
  const b = build(page('a', h('box', {}, h('h1', {}, 't'), h('text', { href: '#' }, 'x'), h('text', { href: '#' }, 'y'), h('text', { href: '#pricing' }, 'ok'))));
  const f = of(lintBundle(b), 'placeholder-link');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /2 link/);
});

test('lint: empty-container flags bare boxes, spares styled spacers', () => {
  const bare = build(page('a', h('box', {}, h('h1', {}, 't'), h('box', {}))));
  assert.equal(of(lintBundle(bare), 'empty-container').length, 1);
  const spacer = build(page('a', h('box', {}, h('h1', {}, 't'), h('box', { minh: 40 }))));
  assert.equal(of(lintBundle(spacer), 'empty-container').length, 0);
});

test('lint: deep-nesting (info) beyond depth 10', () => {
  let node = h('text', {}, 'leaf');
  for (let i = 0; i < 12; i++) node = h('box', {}, node);
  const b = build(page('a', h('box', {}, h('h1', {}, 't'), node)));
  assert.equal(of(lintBundle(b), 'deep-nesting').length, 1);
});

/* ── formatter + severity gating (what the CLI exit code relies on) ── */
test('lint: formatLint orders error > warn > info and carries the fix line', () => {
  const b = build(page('home', h('box', {}, h('h2', {}, 'no h1'), h('box', {}))), { title: 'B', slug: 'home', seo, node: h('box', {}, h('h1', {}, 'x')) });
  const r = lintBundle(b);
  const out = formatLint(r);
  assert.ok(r.counts.error >= 1 && r.counts.warn >= 1 && r.counts.info >= 1, out);
  const idx = { e: out.indexOf('ERROR'), w: out.indexOf('WARN'), i: out.indexOf('INFO') };
  assert.ok(idx.e < idx.w && idx.w < idx.i, 'severity ordering');
  assert.match(out, /fix: /);
  assert.match(out.split('\n')[0], /error\(s\).*warning\(s\).*info/);
});

/* ── grid envelopes (invalid-envelope rule additions) ── */
const rawBundle = (props) => ({
  pages: [{ title: 'g', slug: 'g', seo, elements: [{
    id: 'g1', elType: 'e-grid',
    settings: { classes: { $$type: 'classes', value: ['e-g1-s'] } },
    styles: { 'e-g1-s': { id: 'e-g1-s', type: 'class', label: 'g1', variants: [{ meta: { breakpoint: 'desktop', state: null }, props }] } },
    elements: [{ id: 'g2', elType: 'widget', widgetType: 'e-heading', settings: { tag: { $$type: 'string', value: 'h1' }, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] }],
  }] }],
  classes: { items: {}, order: [] },
});

test('lint: invalid-envelope catches broken grid-track-size shapes, passes valid TRACKS forms', () => {
  const bad = rawBundle({
    'grid-template-columns': { $$type: 'grid-track-size', value: { unit: 'fr', size: 0 } },
    'grid-template-rows': { $$type: 'grid-track-size', value: { unit: 'em', size: 2 } },
  });
  const f = of(lintBundle(bad), 'invalid-envelope');
  assert.equal(f.length, 2, formatLint(lintBundle(bad)));
  assert.match(f[0].message, /positive integer/);
  assert.match(f[1].message, /unknown unit 'em'/);
  const good = rawBundle({
    padding: { $$type: 'dimensions', value: {} },
    'grid-template-columns': { $$type: 'grid-track-size', value: { unit: 'fr', size: 3 } },
    'grid-template-rows': { $$type: 'grid-track-size', value: { unit: 'custom', size: 'auto 1fr' } },
    gap: { $$type: 'layout-direction', value: { column: { $$type: 'size', value: { unit: 'px', size: 16 } } } },
  });
  assert.equal(of(lintBundle(good), 'invalid-envelope').length, 0, formatLint(lintBundle(good)));
});

test('lint: empty-container covers e-grid too', () => {
  const b = rawBundle({ padding: { $$type: 'dimensions', value: {} } });
  b.pages[0].elements[0].elements = [];
  assert.equal(of(lintBundle(b), 'empty-container').length, 1);
});

/* ── interactions (SPEC 1.8): the server strips invalid items SILENTLY — lint is the only honest
 * failure surface. Fixture per enum + shape rule, mirroring validation.php 4.2.1. ── */
import { interaction } from '../../src/kit/kit.mjs';

const ixBundle = (interactions) => ({
  pages: [{ title: 'ix', slug: 'ix', seo, elements: [{ id: 'n1', elType: 'e-flexbox', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [], interactions }] }],
  classes: { items: {}, order: [] },
});
const withItems = (...items) => ixBundle({ version: 1, items });
/** one valid item, then surgically broken via mutate(value, animationValue). */
const broken = (mutate) => {
  const item = structuredClone(interaction({ trigger: 'load' }));
  mutate(item.value, item.value.animation.value, item);
  return withItems(item);
};
const errsOf = (b) => of(lintBundle(b), 'invalid-interaction');

test('lint: invalid-interaction is SILENT on kit-built items and states the positive verification', () => {
  const clean = lintBundle(withItems(interaction(), interaction({ trigger: 'load', excludeOn: ['mobile'] })));
  assert.equal(of(clean, 'invalid-interaction').length, 0, formatLint(clean));
  assert.ok(clean.verified.some((v) => /2 interaction item\(s\) validator-exact/.test(v)), 'positive assertion present');
});

test('lint: invalid-interaction — every enum fixture fires (trigger/effect/type/direction/repeat)', () => {
  assert.match(errsOf(broken((v) => { v.trigger.value = 'blur'; }))[0].message, /trigger 'blur'.*load\|scrollIn/);
  assert.match(errsOf(broken((v, a) => { a.effect.value = 'bounce'; }))[0].message, /effect 'bounce'.*fade\|slide\|scale\|custom/);
  assert.match(errsOf(broken((v, a) => { a.type.value = 'inout'; }))[0].message, /type 'inout'.*in\|out/);
  assert.match(errsOf(broken((v, a) => { a.direction.value = 'up'; }))[0].message, /direction 'up'/);
  assert.match(errsOf(broken((v, a) => { a.config = { $$type: 'config-v2', value: { repeat: { $$type: 'string', value: 'forever' } } }; }))[0].message, /repeat 'forever'.*loop\|times/);
  // every message carries the silent-strip warning — that's the point of the rule
  for (const f of errsOf(broken((v) => { v.trigger.value = 'blur'; }))) assert.match(f.message, /strips this item SILENTLY/);
});

test('lint: invalid-interaction — envelope shapes (item wrapper, preset-props, timing, config, breakpoints)', () => {
  assert.match(errsOf(withItems({ effect: 'fade' }))[0].message, /not an \{\$\$type:'interaction-item'/, 'bare opts object is NOT an envelope');
  assert.match(errsOf(broken((v, a, item) => { v.animation.$$type = 'animation-preset'; }))[0].message, /must be 'animation-preset-props'/, 'the #1 silent-strip cause');
  assert.match(errsOf(broken((v, a) => { a.timing_config.value.duration = { $$type: 'size', value: { unit: 'ms', size: -5 } }; }))[0].message, /duration/);
  assert.match(errsOf(broken((v, a) => { delete a.timing_config.value.delay; }))[0].message, /delay/);
  assert.match(errsOf(broken((v, a) => { a.config = { $$type: 'config-v2', value: { times: { $$type: 'number', value: 0 } } }; }))[0].message, /times.*≥ 1/);
  assert.match(errsOf(broken((v, a) => { a.config = { $$type: 'config-v2', value: { start: { $$type: 'size', value: { unit: '%', size: 150 } } } }; }))[0].message, /start.*0-100/);
  assert.match(errsOf(broken((v, a) => { a.config = { $$type: 'config-v2', value: { replay: { $$type: 'boolean', value: 'yes' } } }; }))[0].message, /replay is not a boolean/);
  assert.match(errsOf(broken((v) => { v.breakpoints = { $$type: 'interaction-breakpoints', value: { excluded: ['mobile'] } }; }))[0].message, /breakpoints/, 'bare strings are not string envelopes');
  assert.match(errsOf(broken((v) => { v.interaction_id = 'ix9'; }))[0].message, /interaction_id/, 'bare string id (must be an envelope)');
});

test('lint: invalid-interaction — custom-effect keyframe rules (non-empty, stop+settings, allowed keys)', () => {
  const customize = (kfMutate) => broken((v, a) => {
    a.effect.value = 'custom';
    a.custom_effect = { $$type: 'custom-effect', value: { keyframes: { $$type: 'keyframes', value: [{ $$type: 'keyframe-stop', value: { stop: { $$type: 'size', value: { unit: '%', size: 0 } }, settings: { $$type: 'keyframe-stop-settings', value: { opacity: { $$type: 'size', value: { unit: '%', size: 0 } } } } } }] } } };
    kfMutate(a.custom_effect.value.keyframes);
  });
  assert.match(errsOf(broken((v, a) => { a.effect.value = 'custom'; }))[0].message, /custom' without a non-empty custom_effect/);
  assert.match(errsOf(customize((kfs) => { kfs.value = []; }))[0].message, /non-empty/);
  assert.match(errsOf(customize((kfs) => { delete kfs.value[0].value.stop; }))[0].message, /stop.*required/);
  assert.match(errsOf(customize((kfs) => { delete kfs.value[0].value.settings; }))[0].message, /settings.*required/);
  assert.match(errsOf(customize((kfs) => { kfs.value[0].value.settings.value.blur = { $$type: 'size', value: { unit: 'px', size: 4 } }; }))[0].message, /blur.*opacity\|move\|rotate\|scale\|skew/);
  assert.equal(errsOf(customize(() => {})).length, 0, 'the unmutated custom item is valid');
});

test('lint: invalid-interaction — >5 items is the ONE hard server failure (whole save throws)', () => {
  const six = withItems(...Array.from({ length: 6 }, () => interaction()));
  const f = errsOf(six);
  assert.equal(f.length, 1);
  assert.match(f[0].message, /6 interactions.*WHOLE page save fails/);
});

test('lint: invalid-interaction decodes the SAVED shape (JSON string / $$type array wrapper)', () => {
  const bad = structuredClone(interaction());
  bad.value.trigger.value = 'blur';
  assert.equal(errsOf(ixBundle(JSON.stringify({ items: [bad], version: 1 }))).length, 1, 'JSON-string interactions decoded');
  assert.equal(errsOf(ixBundle({ version: 1, items: { $$type: 'array', value: [bad] } })).length, 1, '$$type array wrapper decoded');
});

test('lint: pro-interaction warns on pro-flagged fields ("saves everywhere, animates with Pro")', () => {
  const proish = withItems(
    interaction({ trigger: 'hover' }),
    interaction({ trigger: 'scrollOut' }),
    interaction({ effect: 'custom', keyframes: [{ stop: 0, opacity: 0 }] }),
    interaction({ easing: 'easeOut', replay: true }),
  );
  const f = of(lintBundle(proish), 'pro-interaction');
  assert.equal(f.length, 4, formatLint(lintBundle(proish)));
  assert.ok(f.every((x) => x.severity === 'warn'));
  assert.match(f[0].message, /'hover' saves everywhere but animates only with Pro/);
  assert.match(f[1].message, /scrollOut.*crashes the free 4\.2\.1 handler/, 'the latent free bug is named');
  assert.match(f[2].message, /'custom' \(keyframes\) renders only with Pro/);
  assert.match(f[3].message, /easing, replay are DEAD on free/);
  const free = lintBundle(withItems(interaction(), interaction({ trigger: 'load', effect: 'slide', direction: 'top' })));
  assert.equal(of(free, 'pro-interaction').length, 0, 'free-tier surface stays silent');
});

/* ── 1.9.2 field report #4: horizontal slide parks the element off-canvas on the X axis until the
   trigger fires — real document overflow (a gate caught scrollWidth 442 at a 390px viewport). ── */
test('lint: horizontal-slide-overflow warns on slide left/right and names the clipping fix', () => {
  const b = withItems(
    interaction({ effect: 'slide', direction: 'left' }),
    interaction({ effect: 'slide', direction: 'bottom-right' }),
  );
  const f = of(lintBundle(b), 'horizontal-slide-overflow');
  assert.equal(f.length, 2, formatLint(lintBundle(b)));
  assert.ok(f.every((x) => x.severity === 'warn'));
  assert.match(f[0].message, /slide direction 'left' parks the element OFF-CANVAS on the X axis/);
  assert.match(f[0].message, /never resolves if the trigger doesn't fire/);
  assert.match(f[0].fix, /overflow-x:clip/);
  assert.match(f[1].message, /'bottom-right'/, 'diagonals carry an X component too');
});

test('lint: horizontal-slide-overflow is SILENT on vertical slide, fade and scale', () => {
  const b = withItems(
    interaction({ effect: 'slide', direction: 'top' }),
    interaction({ effect: 'slide', direction: 'bottom' }),
    interaction({ effect: 'fade' }),
    interaction({ effect: 'scale', direction: 'left' }),   // direction is inert for scale
  );
  assert.equal(of(lintBundle(b), 'horizontal-slide-overflow').length, 0, formatLint(lintBundle(b)));
});

/* ── 1.9.2 field report #1 (offline half): Pro-only atomic types are invisible to lint's target,
   so this WARNS and points at the deploy gate — which is where the hard failure belongs. ── */
test('lint: pro-only-element warns on every e-form-* field widget and names the Pro requirement', () => {
  const b = build(page('contact', h('box', { pad: 0 }, h('h1', {}, 'Contact'),
    form({ name: 'c' }, [field('email', 'Email'), formSubmit('Send')]))));
  const f = of(lintBundle(b), 'pro-only-element');
  assert.ok(f.length >= 4, formatLint(lintBundle(b)));
  const types = f.map((x) => x.message.match(/<(e-[a-z-]+)>/)[1]).sort();
  assert.deepEqual(types, ['e-form-error-message', 'e-form-input', 'e-form-label', 'e-form-submit-button', 'e-form-success-message']);
  assert.ok(f.every((x) => x.severity === 'warn'), 'lint cannot know the target — warn, never error');
  assert.match(f[0].message, /e_pro_atomic_form/);
  assert.match(f[0].message, /Unknown type e-form-\w+ is not registered on this site/);
  assert.match(f[0].fix, /lint is offline and cannot see the deploy target — deploy probes the site/);
  // the e-form CONTAINER itself IS free-core registered — it must not be flagged
  assert.equal(PRO_ONLY_TYPES['e-form'], undefined);
});

test('lint: pro-only-element is SILENT on a page with no Pro atomic elements', () => {
  const b = build(page('home', h('box', { pad: 0 }, h('h1', {}, 'Hi'), h('text', {}, 'copy'))));
  assert.equal(of(lintBundle(b), 'pro-only-element').length, 0);
});

/* ── 1.9.2 field report #6: raw-atomic-overlap fired on every element whose raw CSS was the ONLY
   way to write the value. Half the fix is that multi-layer shadows are now atomic (so those
   warnings became true), half is that genuinely inexpressible values stop warning. ── */
test('lint: inexpressibleBySx — sx cannot emit CSS functions, !important or layered backgrounds', () => {
  assert.equal(inexpressibleBySx('width', 'calc(100% - 32px)'), true);
  assert.equal(inexpressibleBySx('font-size', 'clamp(16px, 2vw, 24px)'), true);
  assert.equal(inexpressibleBySx('padding', '12px !important'), true);
  assert.equal(inexpressibleBySx('max-width', 'var(--wrap)'), true, 'var() in a SIZE has no sx form');
  assert.equal(inexpressibleBySx('background', 'url(a.png) center/cover no-repeat'), true);
  assert.equal(inexpressibleBySx('background', '#fff, #000'), true, 'multiple layers');
  // …and what it CAN emit stays flagged
  assert.equal(inexpressibleBySx('padding', '24px'), false);
  assert.equal(inexpressibleBySx('color', 'var(--brand)'), false, 'var() IS a colour value C() passes through');
  assert.equal(inexpressibleBySx('background', 'linear-gradient(135deg, #0ff, #f0f)'), false);
  assert.equal(inexpressibleBySx('box-shadow', '1px 0 0 #000, 2px 0 0 #000'), false, 'multi-layer shadows are atomic since 1.9.2');
});

test('lint: raw-atomic-overlap stays SILENT on values the sx layer cannot express', () => {
  const b = build(page('home', h('box', { pad: 0, raw: 'width:calc(100% - 32px);max-width:var(--wrap);padding:8px !important;' },
    h('h1', {}, 'Hi'))));
  assert.equal(of(lintBundle(b), 'raw-atomic-overlap').length, 0, formatLint(lintBundle(b)));
});

test('lint: raw-atomic-overlap still fires on expressible raw — incl. multi-layer shadows, and names the array form', () => {
  const b = build(page('home', h('box', { pad: 0, raw: 'box-shadow:1px 0 0 #000, 2px 0 0 #000;padding:24px;' }, h('h1', {}, 'Hi'))));
  const f = of(lintBundle(b), 'raw-atomic-overlap');
  assert.equal(f.length, 1, formatLint(lintBundle(b)));
  assert.match(f[0].message, /raw CSS sets \[box-shadow, padding\]/);
  assert.match(f[0].fix, /shadow=\{\[\[v,blur,spread,color,h\],\[…\]\]\}/);
});
