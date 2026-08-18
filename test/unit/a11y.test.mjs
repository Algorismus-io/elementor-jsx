/**
 * a11y.mjs — compile-time accessibility analysis.
 *
 * Contract under test:
 *  - the WCAG 2.x contrast maths is exact (against the published reference pairs);
 *  - the resolver walks the cascade the way the browser would (inheritance, alpha compositing,
 *    theme variable refs, gradient worst-stop);
 *  - anything it CANNOT resolve is reported `unresolved`, NEVER silently passed — this is the
 *    property that separates an honest checker from a green-tick generator;
 *  - the landmark API refuses to emit a landmark that would not actually be one (unnamed region),
 *    and records which Elementor tier can really render it.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor, relativeLuminance, contrastRatio, contrastRatioExact, meetsRatio, composite, isLargeText, requiredRatio,
  analyzeContrast, analyzePageContrast, landmarkSettings, readLandmark, LANDMARKS,
  variableMap, backgroundFromEnvelope, nodeText, colorFromEnvelope, nodeProps, toHex, UNIQUE_LANDMARKS,
  suggestAccessibleColor, rgbToHsl, rawCssOf,
} from '../../src/a11y.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineComponent } from '../../src/component.mjs';
import { defineSite } from '../../src/site.mjs';
import { defineTheme } from '../../src/theme.mjs';
import { h } from '../../src/runtime.mjs';
import { skipLink, srOnly, focusRing, keyboardScrollable, SR_ONLY_CSS } from '../../src/kit/kit-components.mjs';
import { resetIds } from '../helpers.mjs';

beforeEach(() => resetIds());

const seo = { title: 't', description: 'd' };
const page = (slug, node) => ({ title: slug, slug, seo, node });
const build = (...pages) => compileSite(defineSite({ name: 'a11y-t', pages }));
const buildWithTheme = (theme, ...pages) => compileSite(defineSite({ name: 'a11y-t', theme, pages }));

/* ── colour parsing ─────────────────────────────────────── */

test('parseColor: hex in 3/4/6/8 digit forms', () => {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor('#000000'), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('#FF8800'), { r: 255, g: 136, b: 0, a: 1 });
  assert.deepEqual(parseColor('#00000080').a, 128 / 255);
  assert.deepEqual(parseColor('#f008').r, 255);
});

test('parseColor: rgb/rgba/hsl, legacy and modern syntax', () => {
  assert.deepEqual(parseColor('rgb(255, 136, 0)'), { r: 255, g: 136, b: 0, a: 1 });
  assert.deepEqual(parseColor('rgba(0,0,0,0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor('rgb(255 136 0 / 0.25)').a, 0.25);
  assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('white'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(parseColor('transparent').a, 0);
});

test('parseColor: returns null for anything it cannot be SURE of (never a guess)', () => {
  for (const v of ['var(--brand)', 'color-mix(in oklab, red, blue)', 'oklch(0.7 0.1 200)', 'currentColor', 'rebeccapurple', '', null, undefined, '#12345']) {
    assert.equal(parseColor(v), null, `${v} must not parse`);
  }
});

/* ── contrast maths ─────────────────────────────────────── */

test('relativeLuminance: reference values from WCAG', () => {
  assert.equal(Math.round(relativeLuminance({ r: 255, g: 255, b: 255 }) * 1000) / 1000, 1);
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
});

test('contrastRatio: the published reference pairs', () => {
  assert.equal(contrastRatio(parseColor('#000'), parseColor('#fff')), 21);
  assert.equal(contrastRatio(parseColor('#fff'), parseColor('#fff')), 1);
  // #767676 on white is the canonical "exactly passes 4.5:1 for normal text" grey
  const g = contrastRatio(parseColor('#767676'), parseColor('#ffffff'));
  assert.ok(g >= 4.5 && g < 4.6, `#767676 on white should be ~4.54, got ${g}`);
  // #949494 on white is the canonical "exactly passes 3:1 for large text" grey
  const l = contrastRatio(parseColor('#949494'), parseColor('#ffffff'));
  assert.ok(l >= 3 && l < 3.1, `#949494 on white should be ~3.03, got ${l}`);
});

test('contrastRatio is symmetric', () => {
  const a = parseColor('#1a2b3c'); const b = parseColor('#f0e1d2');
  assert.equal(contrastRatio(a, b), contrastRatio(b, a));
});

test('composite: alpha blending onto a backdrop', () => {
  assert.deepEqual(composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 }), { r: 128, g: 128, b: 128, a: 1 });
  assert.deepEqual(composite({ r: 10, g: 20, b: 30, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }), { r: 10, g: 20, b: 30, a: 1 });
});

test('isLargeText / requiredRatio follow the 18pt & 14pt-bold thresholds', () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(23.9, 400), false);
  assert.equal(isLargeText(19, 700), true);
  assert.equal(isLargeText(19, 600), false);
  assert.equal(requiredRatio(16, 400), 4.5);
  assert.equal(requiredRatio(32, 400), 3);
});

/* ── resolution through a real compiled bundle ──────────── */

test('contrast: a failing pair on a literal background is caught with the ratio', () => {
  const b = build(page('home',
    h('box', { bg: '#ffffff', pad: 40 },
      h('text', { color: '#bbbbbb', size: 16 }, 'Low contrast body copy'))));
  const [f] = analyzeContrast(b).filter((x) => x.text.startsWith('Low contrast'));
  assert.equal(f.status, 'fail');
  assert.equal(f.bg, '#ffffff');
  assert.equal(f.required, 4.5);
  assert.ok(f.ratio < 4.5, `expected a failing ratio, got ${f.ratio}`);
});

test('contrast: a passing pair is a pass', () => {
  const b = build(page('home',
    h('box', { bg: '#ffffff', pad: 40 }, h('text', { color: '#333333', size: 16 }, 'Readable'))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'Readable');
  assert.equal(f.status, 'pass');
});

test('contrast: background INHERITS from the nearest painted ancestor', () => {
  const b = build(page('home',
    h('box', { bg: '#101010', pad: 40 },
      h('box', { pad: 10 },                       // no background of its own
        h('box', { pad: 10 }, h('text', { color: '#222222' }, 'Dark on dark'))))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'Dark on dark');
  assert.equal(f.status, 'fail');
  assert.equal(f.bg, '#101010', 'must have walked up two levels to find the painted backdrop');
});

test('contrast: text colour inherits from an ancestor container', () => {
  const b = build(page('home',
    h('box', { bg: '#ffffff', color: '#cccccc', pad: 40 }, h('text', {}, 'Inherited colour'))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'Inherited colour');
  assert.equal(f.status, 'fail');
  assert.equal(f.fg, '#cccccc');
});

test('contrast: large text uses the 3:1 threshold', () => {
  // #888 on white is ~3.54:1 — fails as body copy, passes as a 40px heading
  const b = build(page('home',
    h('box', { bg: '#ffffff' },
      h('text', { color: '#888888', size: 16 }, 'small'),
      h('h2', { color: '#888888', size: 40 }, 'big'))));
  const fs = analyzeContrast(b);
  assert.equal(fs.find((f) => f.text === 'small').status, 'fail');
  assert.equal(fs.find((f) => f.text === 'big').status, 'pass');
  assert.equal(fs.find((f) => f.text === 'big').required, 3);
});

test('contrast: 14pt BOLD counts as large text', () => {
  const b = build(page('home',
    h('box', { bg: '#ffffff' },
      h('text', { color: '#888888', size: 19, weight: 700 }, 'bold19'),
      h('text', { color: '#888888', size: 19, weight: 400 }, 'norm19'))));
  const fs = analyzeContrast(b);
  assert.equal(fs.find((f) => f.text === 'bold19').required, 3);
  assert.equal(fs.find((f) => f.text === 'norm19').required, 4.5);
});

test('contrast: a translucent text colour is composited over its backdrop', () => {
  const b = build(page('home',
    h('box', { bg: '#000000' }, h('text', { color: 'rgba(255,255,255,0.35)' }, 'faint'))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'faint');
  assert.equal(f.status, 'fail', 'white at 35% over black is far below 4.5:1');
});

test('contrast: a translucent BACKGROUND composites over what is behind it', () => {
  const b = build(page('home',
    h('box', { bg: '#000000', pad: 20 },
      h('box', { bg: 'rgba(255,255,255,0.9)', pad: 10 }, h('text', { color: '#111111' }, 'panel')))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'panel');
  assert.equal(f.status, 'pass', 'a 90% white panel over black is effectively light');
});

test('contrast: theme colour VARIABLES resolve through the theme', () => {
  const theme = defineTheme({ name: 'tt', color: { ink: '#cfcfcf', surface: '#ffffff' } });
  const b = buildWithTheme(theme, page('home',
    h('box', { bg: theme.color.surface }, h('text', { color: theme.color.ink }, 'tokened'))));
  assert.ok(Object.keys(variableMap(b)).length >= 2, 'theme variables must be discoverable');
  const [f] = analyzeContrast(b).filter((x) => x.text === 'tokened');
  assert.equal(f.status, 'fail', '#cfcfcf on white is ~1.9:1');
  assert.equal(f.fg, '#cfcfcf', 'the variable ref must resolve to its literal');
});

/* ── the honesty property ───────────────────────────────── */

test('contrast: text over a background IMAGE is unresolved, never a pass', () => {
  const b = build(page('home',
    h('box', { bgImage: 'https://cdn.example.com/hero.jpg', pad: 40 },
      h('h1', { color: '#ffffff' }, 'Over an image'))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'Over an image');
  assert.equal(f.status, 'unresolved');
  assert.match(f.reason, /background image/i);
});

test('contrast: a gradient is checked against its WORST stop', () => {
  // white text over a sweep from near-black to near-white must fail on the light end
  const b = build(page('home',
    h('box', { grad: [90, '#000000', '#f2f2f2'], pad: 40 },
      h('text', { color: '#ffffff' }, 'sweep'))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'sweep');
  assert.equal(f.over, 'gradient');
  assert.equal(f.status, 'fail');
  assert.equal(f.bg, '#f2f2f2', 'the light stop is the worst case for white text');
});

test('contrast: an ancestor opacity/filter makes the pair unresolved', () => {
  const b = build(page('home',
    h('box', { bg: '#ffffff', raw: 'opacity:0.5;' },
      h('box', { props: { opacity: { $$type: 'number', value: 0.5 } } },
        h('text', { color: '#777777' }, 'faded')))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'faded');
  assert.equal(f.status, 'unresolved');
  assert.match(f.reason, /opacity|filter|blend/i);
});

test('contrast: an unresolvable colour literal is unresolved, not a pass', () => {
  const b = build(page('home',
    h('box', { bg: '#ffffff' }, h('text', { color: 'var(--mystery)' }, 'varcolor'))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'varcolor');
  assert.equal(f.status, 'unresolved');
});

test('contrast: empty/decorative text produces no finding at all', () => {
  const b = build(page('home', h('box', { bg: '#fff' }, h('text', { color: '#eee' }, ' '))));
  assert.equal(analyzeContrast(b).length, 0);
});

test('contrast: the page ground colour is configurable and defaults to white', () => {
  const b = build(page('home', h('box', { pad: 20 }, h('text', { color: '#eeeeee' }, 'ground'))));
  const onWhite = analyzeContrast(b).find((f) => f.text === 'ground');
  assert.equal(onWhite.status, 'fail', 'near-white text on the default white ground fails');
  const onBlack = analyzePageContrast(b.pages[0], { classItems: b.classes.items, ground: '#000000' })
    .find((f) => f.text === 'ground');
  assert.equal(onBlack.status, 'pass', 'the same text passes on a dark ground');
});

test('nodeText: strips markup and entities from heading/paragraph/button content', () => {
  const b = build(page('home', h('box', {}, h('h1', {}, 'Hello ', h('em', {}, 'world')))));
  const el = b.pages[0].elements[0].elements[0];
  assert.equal(nodeText(el), 'Hello world');
});

test('backgroundFromEnvelope: distinguishes colour, gradient and image', () => {
  assert.equal(backgroundFromEnvelope({ $$type: 'background', value: { color: { $$type: 'color', value: '#abc' } } }, {}).color, '#abc');
  assert.equal(backgroundFromEnvelope(null, {}), null);
});

test('colorFromEnvelope: literals, variable refs, and the unresolved case', () => {
  assert.equal(colorFromEnvelope({ $$type: 'color', value: '#123456' }, {}), '#123456');
  assert.equal(colorFromEnvelope({ $$type: 'global-color-variable', value: 'e-gv-x' }, { 'e-gv-x': '#abcdef' }), '#abcdef');
  assert.equal(colorFromEnvelope({ $$type: 'global-color-variable', value: 'e-gv-x', __lit: '#fedcba' }, {}), '#fedcba');
  assert.match(colorFromEnvelope({ $$type: 'global-color-variable', value: 'e-gv-missing' }, {}).unresolved, /not in the theme/);
  assert.equal(colorFromEnvelope(null, {}), null);
});

test('nodeProps: resolves shared classes and local styles in cascade order', () => {
  const classItems = {
    'c-base': { variants: [{ meta: { breakpoint: 'desktop', state: null }, props: { color: { $$type: 'color', value: '#111111' } } }] },
  };
  const n = {
    settings: { classes: { $$type: 'classes', value: ['c-base', 'e-x-s'] } },
    styles: { 'e-x-s': { variants: [{ meta: { breakpoint: 'desktop', state: null }, props: { color: { $$type: 'color', value: '#222222' } } }] } },
  };
  assert.equal(nodeProps(n, classItems).color.value, '#222222', 'the later (local) style wins');
  assert.equal(nodeProps(n, {}).color.value, '#222222');
  // a variant for another breakpoint must not leak into the desktop resolution
  assert.deepEqual(nodeProps({ settings: {}, styles: { s: { variants: [{ meta: { breakpoint: 'mobile', state: null }, props: { color: 1 } }] } } }, {}), {});
});

test('toHex: rgb → #rrggbb with zero padding', () => {
  assert.equal(toHex({ r: 0, g: 0, b: 0 }), '#000000');
  assert.equal(toHex({ r: 255, g: 136, b: 5 }), '#ff8805');
});

test('UNIQUE_LANDMARKS names the at-most-once landmarks', () => {
  assert.ok(UNIQUE_LANDMARKS.has('main'));
  assert.ok(UNIQUE_LANDMARKS.has('banner'));
  assert.ok(UNIQUE_LANDMARKS.has('contentinfo'));
  assert.ok(!UNIQUE_LANDMARKS.has('region'), 'a page may carry many named regions');
});

/* ── landmarks ──────────────────────────────────────────── */

test('landmarkSettings: banner/contentinfo/complementary use NATIVE tags (free tier)', () => {
  assert.equal(landmarkSettings('banner').tag, 'header');
  assert.equal(landmarkSettings('contentinfo').tag, 'footer');
  assert.equal(landmarkSettings('complementary').tag, 'aside');
  for (const l of ['banner', 'contentinfo', 'complementary']) assert.equal(landmarkSettings(l).tier, 'free');
});

test('landmarkSettings: main/navigation need role= and are therefore Pro-tier', () => {
  const m = landmarkSettings('main');
  assert.equal(m.tag, 'div');
  assert.equal(m.attrs.role, 'main');
  assert.equal(m.tier, 'pro');
  assert.equal(landmarkSettings('navigation', 'Primary').attrs['aria-label'], 'Primary');
});

test('landmarkSettings: an UNNAMED region is refused (it would not be a landmark)', () => {
  assert.throws(() => landmarkSettings('region'), /requires a label|accessible name/i);
  assert.equal(landmarkSettings('region', 'Pricing').tag, 'section');
  assert.equal(landmarkSettings('region', 'Pricing').attrs['aria-label'], 'Pricing');
});

test('landmarkSettings: an unknown landmark throws with the vocabulary', () => {
  assert.throws(() => landmarkSettings('mainn'), /not a landmark role/);
  assert.throws(() => landmarkSettings('footer'), /not a landmark role/);
});

test('landmark prop on a container emits the tag (and the attrs) in the tree', () => {
  const b = build(page('home', h('box', {},
    h('box', { landmark: 'banner' }, h('text', {}, 'top')),
    h('box', { landmark: 'main' }, h('text', {}, 'body')),
    h('box', { landmark: 'region', label: 'Pricing' }, h('text', {}, 'prices')))));
  const [banner, main, region] = b.pages[0].elements[0].elements;
  assert.equal(banner.settings.tag.value, 'header');
  assert.equal(main.settings.tag.value, 'div');
  assert.equal(region.settings.tag.value, 'section');
  assert.deepEqual(readLandmark(banner), { landmark: 'banner', label: undefined, via: 'tag' });
  assert.equal(readLandmark(main).landmark, 'main');
  assert.equal(readLandmark(region).landmark, 'region');
  assert.equal(readLandmark(region).label, 'Pricing');
});

test('landmark and an explicit conflicting tag is a build-time error', () => {
  assert.throws(
    () => build(page('home', h('box', { landmark: 'banner', tag: 'section' }, h('text', {}, 'x')))),
    /landmark/i,
  );
});

test('LANDMARKS records the honest tier for every entry', () => {
  for (const [name, def] of Object.entries(LANDMARKS)) {
    assert.ok(['free', 'pro'].includes(def.tier), `${name} must declare a tier`);
    assert.ok(def.note, `${name} must explain how it is expressed`);
  }
});

/* ── kit accessibility primitives ───────────────────────── */

test('skipLink: emits a real anchor, the focus reveal, and a focusable target', () => {
  const n = skipLink('main-content', 'Skip to content');
  const html = n.settings.html;
  assert.equal(n.widgetType, 'html', 'must be raw markup — an atomic button cannot carry :focus styling on free Elementor');
  assert.match(html, /<a class="exjsx-skip" href="#main-content">Skip to content<\/a>/);
  assert.match(html, /\.exjsx-skip:focus/, 'must reveal itself on focus or it is a hidden trap');
  assert.match(html, /setAttribute\("tabindex","-1"\)/, 'the target needs tabindex=-1 for focus to actually move');
  assert.match(html, /DOMContentLoaded/, 'the target is rendered AFTER the link, so the script must wait for parse');
});

test('srOnly: visually hidden but present in the accessibility tree', () => {
  const html = srOnly('Opens in a new window').settings.html;
  assert.match(html, /Opens in a new window/);
  assert.match(html, /clip-path:inset\(50%\)/);
  assert.ok(!/display:\s*none/.test(html), 'display:none would hide it from screen readers too');
  assert.ok(!/visibility:\s*hidden/.test(html), 'visibility:hidden would hide it from screen readers too');
});

test('focusRing: a two-tone indicator scoped to :focus-visible only', () => {
  const html = focusRing().settings.html;
  assert.match(html, /:focus-visible/);
  assert.match(html, /outline:3px solid/);
  assert.match(html, /box-shadow:0 0 0 5px/, 'the halo keeps the ring visible on dark surfaces too');
  assert.ok(!/:focus\b(?!-visible)/.test(html), 'must not fire on mouse focus (that is why :focus-visible exists)');
});

test('keyboardScrollable: a scrolling filmstrip becomes reachable by keyboard', () => {
  // WCAG 2.2 SC 2.1.1 Level A (axe: scrollable-region-focusable). An overflow-x carousel whose
  // cards are plain text has no focusable descendant, so a keyboard-only reader cannot scroll it
  // and cannot reach anything past the fold.
  const html = keyboardScrollable('*', 'Recent commissions').settings.html;
  assert.match(html, /setAttribute\("tabindex","0"\)/, 'tabindex=0 is the whole fix — the browser supplies the arrow-key scrolling');
  assert.match(html, /scrollWidth>e\.clientWidth/, 'applied only while the element actually overflows');
  assert.match(html, /overflowX/, "and only when overflow is auto/scroll — an overflow:hidden box overflows too and nobody can scroll it");
  assert.match(html, /\^\(auto\|scroll\)\$/);
  assert.match(html, /removeAttribute\("tabindex"\)/, 'an element that fits its box must not keep a tab stop that goes nowhere');
  assert.match(html, /L="Recent commissions"/);
  assert.match(html, /setAttribute\("aria-label",L\)/, 'the label names the region so a reader knows what they landed on');
  assert.match(html, /DOMContentLoaded/);
  assert.match(html, /addEventListener\("resize"/, 'overflow is viewport-dependent, so it must be re-evaluated');
});

test('keyboardScrollable: without a label it adds no unnamed region', () => {
  // An unnamed role="region" is not a landmark and would be announced as an anonymous group.
  const html = keyboardScrollable().settings.html;
  assert.match(html, /L=null/, 'no label given → the guard `if(L&&…)` never sets role or aria-label');
  assert.match(html, /if\(L&&/);
});

test('SR_ONLY_CSS keeps the element in the accessibility tree', () => {
  assert.match(SR_ONLY_CSS, /position:absolute/);
  assert.ok(!/display:none|visibility:hidden/.test(SR_ONLY_CSS));
});

/* ── remediation suggestions ────────────────────────────── */

test('suggestAccessibleColor: darkens against a light backdrop, lightens against a dark one', () => {
  const onLight = suggestAccessibleColor('#999999', '#ffffff', 4.5);
  assert.ok(contrastRatio(parseColor(onLight.color), parseColor('#ffffff')) >= 4.5);
  assert.ok(rgbToHsl(parseColor(onLight.color)).l < rgbToHsl(parseColor('#999999')).l, 'must go darker on white');

  const onDark = suggestAccessibleColor('#4A5A57', '#0b0f10', 4.5);
  assert.ok(contrastRatio(parseColor(onDark.color), parseColor('#0b0f10')) >= 4.5);
  assert.ok(rgbToHsl(parseColor(onDark.color)).l > rgbToHsl(parseColor('#4A5A57')).l, 'must go lighter on near-black');
});

test('suggestAccessibleColor: preserves hue (a brand colour stays recognisable)', () => {
  const before = rgbToHsl(parseColor('#7A5CFF'));
  const after = rgbToHsl(parseColor(suggestAccessibleColor('#7A5CFF', '#12131b', 4.5).color));
  assert.ok(Math.abs(before.h - after.h) < 2, `hue drifted ${before.h} → ${after.h}`);
});

test('suggestAccessibleColor: returns null when the BACKGROUND is the thing that must change', () => {
  // nothing contrasts 4.5:1 against a mid grey in both directions... but something always does in
  // ONE direction, so use an impossible target instead to prove the null path
  assert.equal(suggestAccessibleColor('#808080', '#808080', 21), null);
  assert.equal(suggestAccessibleColor('not-a-colour', '#fff'), null);
});

test('suggestAccessibleColor: already-passing colours still return a passing answer', () => {
  const s = suggestAccessibleColor('#000000', '#ffffff', 4.5);
  assert.ok(s === null || s.ratio >= 4.5);
});

test('rgbToHsl: greyscale has zero saturation; primaries land on their hue', () => {
  assert.equal(rgbToHsl({ r: 128, g: 128, b: 128 }).s, 0);
  assert.equal(Math.round(rgbToHsl({ r: 255, g: 0, b: 0 }).h), 0);
  assert.equal(Math.round(rgbToHsl({ r: 0, g: 255, b: 0 }).h), 120);
});

test('contrast: a translucent panel over a GRADIENT tints the gradient, not the page ground', () => {
  // Regression (basis-tax): a 60%-opaque near-black panel sitting on a dark gradient used to
  // resolve against the default white ground and read as mid-grey, inventing 8 contrast failures.
  const b = build(page('home',
    h('box', { grad: [165, '#0C0D12', '#14101F'], pad: 40 },
      h('box', { bg: 'rgba(12,13,18,0.6)', pad: 20 },
        h('text', { color: '#9497AC', size: 15 }, 'panel copy')))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'panel copy');
  assert.equal(f.over, 'gradient');
  assert.equal(f.status, 'pass', `#9497AC over a dark tinted gradient should pass, got ${f.ratio}:1 on ${f.bg}`);
});

test('contrast: raw custom_css that sets colour poisons the subtree to UNRESOLVED', () => {
  // Regression (tracewell): tab labels coloured by a nested `& .e-tab p { color: … }` rule were
  // reported as black-on-black. Prop resolution cannot see nested CSS — so it must say so.
  const b = build(page('home',
    h('box', { bg: '#0B0F10', raw: "& .lbl p { color: #7B8B88; }" },
      h('text', { cls: 'lbl' }, 'python'))));
  const [f] = analyzeContrast(b).filter((x) => x.text === 'python');
  assert.equal(f.status, 'unresolved');
  assert.match(f.reason, /raw custom_css/);
});

test('rawCssOf: decodes the base64 custom_css attached to a node', () => {
  const b = build(page('home', h('box', { raw: 'color: #123456;' }, h('text', {}, 'x'))));
  assert.match(rawCssOf(b.pages[0].elements[0], b.classes.items), /color: #123456/);
  assert.equal(rawCssOf({ styles: {} }), '');
});

test('contrast: the threshold is compared at FULL precision, not on the rounded ratio', () => {
  // Regression: #6A817D on #0E1315 is 4.4951 — it rounds to 4.5 and used to be reported as a PASS,
  // while the browser (and axe) computes 4.49 and fails it. Four such nodes shipped in a build this
  // linter had called clean, and only the post-deploy axe run caught them.
  const fg = parseColor('#6A817D'); const bg = parseColor('#0E1315');
  assert.equal(contrastRatio(fg, bg), 4.5, 'the DISPLAY value still rounds to 2dp');
  assert.ok(contrastRatioExact(fg, bg) < 4.5, 'the exact value is below the threshold');
  assert.equal(meetsRatio(fg, bg, 4.5), false, 'so the pair must NOT be treated as passing');

  const b = build(page('home', h('box', { bg: '#0E1315' }, h('text', { color: '#6A817D', size: 12 }, 'edge'))));
  assert.equal(analyzeContrast(b).find((f) => f.text === 'edge').status, 'fail');
});

test('suggestAccessibleColor: its answer clears the threshold at full precision too', () => {
  const s = suggestAccessibleColor('#6A817D', '#0E1315', 4.5);
  assert.ok(meetsRatio(parseColor(s.color), parseColor('#0E1315'), 4.5));
});

test('<section landmark="contentinfo"> emits <footer>, not <section>', () => {
  // Regression: the section intrinsic defaulted tag='section' and silently overrode the landmark's
  // resolved tag, so four deployed pages carried NO landmarks while their source asked for them.
  const b = build(page('home', h('box', {},
    h('section', { landmark: 'contentinfo' }, h('text', {}, 'footer')),
    h('section', { landmark: 'banner' }, h('text', {}, 'top')),
    h('section', {}, h('text', {}, 'plain')))));
  const [foot, ban, plain] = b.pages[0].elements[0].elements;
  assert.equal(foot.settings.tag.value, 'footer');
  assert.equal(ban.settings.tag.value, 'header');
  assert.equal(plain.settings.tag.value, 'section', 'a plain <section> keeps its default tag');
});

test('contrast: a component INSTANCE resolves to its OWN definition, not components[0]', () => {
  // Regression (the 50-page a11y pass): every instance in a freshly compiled bundle carries the
  // placeholder `component_id: 0` — real ids are per-site and only stamped in by deploy's uid→id
  // rewrite — so an id-first lookup resolved EVERY instance to the first registered component.
  // On a multi-component page that invents failures for the wrong tree and never checks the right
  // one; 34 of the 50 corpus pages register more than one component. The true reference is the
  // instance's `editor_settings.component_uid`.
  const Alpha = defineComponent(({ label }) => h('text', { color: '#8A929C', size: 14 }, label),
    { title: 'Alpha row', props: { label: { label: 'Label' } } });
  const Beta = defineComponent(({ label }) => h('text', { color: '#F5F5F5', size: 14 }, label),
    { title: 'Beta row', props: { label: { label: 'Label' } } });

  const b = build(page('home', h('box', {},
    h('box', { bg: '#ffffff', pad: 20 }, h(Alpha, { label: 'on the light table' })),
    h('box', { bg: '#101418', pad: 20 }, h(Beta, { label: 'on the dark panel' })))));

  assert.equal(b.components.length, 2, 'both components register');
  const beta = analyzeContrast(b).find((f) => f.text === 'on the dark panel');
  assert.equal(beta.fg, '#F5F5F5', 'the dark-panel instance must carry BETA’s colour, not Alpha’s');
  assert.equal(beta.bg, '#101418');
  assert.equal(beta.status, 'pass');

  const alpha = analyzeContrast(b).find((f) => f.text === 'on the light table');
  assert.equal(alpha.fg, '#8A929C');
  assert.equal(alpha.status, 'fail', '#8A929C on white is 3.15:1');
});
