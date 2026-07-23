/**
 * HEADING torture — every way a heading can be authored must produce a valid,
 * exactly-shaped e-heading widget. Tags × text forms × style props × link × raw CSS ×
 * class labels × global refs × responsive variants × theme tokens.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { h, render, renderPage } from '../../src/runtime.mjs';
import { defineTheme } from '../../src/theme.mjs';
import { resetIds, styleOf, deskProps, variantProps, customCssOf, textOf, classRefs } from '../helpers.mjs';
import { S, C, SZ } from '../../src/kit/kit.mjs';

beforeEach(() => resetIds());

/* ── tag mapping ── */
for (const tag of ['h1', 'h2', 'h3', 'h4']) {
  test(`heading: <${tag}> renders e-heading with tag=${tag}`, () => {
    const n = render(h(tag, {}, 'Hello'));
    assert.equal(n.elType, 'widget');
    assert.equal(n.widgetType, 'e-heading');
    assert.deepEqual(n.settings.tag, S(tag));
    assert.equal(textOf(n), 'Hello');
  });
}

test('heading: generic <heading> defaults to h2', () => {
  const n = render(h('heading', {}, 'T'));
  assert.deepEqual(n.settings.tag, S('h2'));
});

test('heading: generic <heading tag="h5"> and "h6" pass through (beyond the sugar aliases)', () => {
  for (const tag of ['h5', 'h6']) {
    const n = render(h('heading', { tag }, 'Deep'));
    assert.deepEqual(n.settings.tag, S(tag));
  }
});

/* ── text/children forms ── */
test('heading: title is the html-v3 envelope (content + children array)', () => {
  const n = render(h('h2', {}, 'Title'));
  assert.deepEqual(n.settings.title, { $$type: 'html-v3', value: { content: S('Title'), children: [] } });
});

test('heading: multiple string children concatenate', () => {
  assert.equal(textOf(render(h('h2', {}, 'Hello', ' ', 'World'))), 'Hello World');
});

test('heading: number children stringify', () => {
  assert.equal(textOf(render(h('h2', {}, 'Top ', 10, ' lists'))), 'Top 10 lists');
});

test('heading: null/false/empty-string children are dropped by the factory', () => {
  assert.equal(textOf(render(h('h2', {}, 'A', null, false, '', 'B'))), 'AB');
});

test('heading: nested array children flatten', () => {
  assert.equal(textOf(render(h('h2', {}, ['A', ['B', 'C']]))), 'ABC');
});

test('heading: inline HTML (span/em accents, entities) survives as content', () => {
  const html = 'Grow <em>faster</em> &amp; smarter';
  assert.equal(textOf(render(h('h1', {}, html))), html);
});

test('heading: empty heading (no children) → empty string content, still valid', () => {
  const n = render(h('h2', {}));
  assert.equal(textOf(n), '');
  assert.equal(n.widgetType, 'e-heading');
});

test('heading: non-inline vnode children THROW (was silently dropped — ate headline words; nebula build)', () => {
  assert.throws(() => render(h('h2', {}, 'Only', h('text', {}, 'ignored'))), /<text> inside a text intrinsic/);
});

test('heading: inline <em> vnode child serializes to whitelisted HTML', () => {
  const n = render(h('h1', {}, 'Ship ', h('em', {}, 'insight'), '.'));
  assert.equal(textOf(n), 'Ship <em>insight</em>.');
});

/* ── style props (the sx path) ── */
test('heading: full style prop sweep lands in the desktop variant', () => {
  const n = render(h('h1', {
    color: '#0A2230', size: 56, weight: 800, font: 'Poppins', ta: 'center',
    lh: 1.1, ls: -0.02, maxw: 900, m: [0, 0, 24, 0], w: '100%',
  }, 'Big'));
  const p = deskProps(n);
  assert.deepEqual(p.color, C('#0A2230'));
  assert.deepEqual(p['font-size'], SZ(56));
  assert.deepEqual(p['font-weight'], S('800'));
  assert.deepEqual(p['font-family'], S('Poppins'));
  assert.deepEqual(p['text-align'], S('center'));
  assert.deepEqual(p['line-height'], SZ(1.1, 'em'));
  assert.deepEqual(p['letter-spacing'], SZ(-0.02, 'em'));
  assert.deepEqual(p['max-width'], SZ(900));
});

test('heading: styleless heading has NO local style and empty class list', () => {
  const n = render(h('h2', {}, 'Plain'));
  assert.deepEqual(n.styles, {});
  assert.deepEqual(classRefs(n), []);
});

test('heading: local style id embeds element id and is referenced in classes (R4 by construction)', () => {
  const n = render(h('h2', { size: 20 }, 'X'));
  const st = styleOf(n);
  assert.equal(st.id, `e-${n.id}-s`);
  assert.ok(classRefs(n).includes(st.id));
});

test('heading: responsive variants — desktop/tablet/mobile in canonical breakpoint order', () => {
  const n = render(h('h1', { size: 56, tablet: { size: 40 }, mobile: { size: 28, ta: 'center' } }, 'R'));
  const st = styleOf(n);
  assert.deepEqual(st.variants.map((v) => v.meta.breakpoint), ['desktop', 'tablet', 'mobile']);
  assert.deepEqual(variantProps(n, 'tablet')['font-size'], SZ(40));
  assert.deepEqual(variantProps(n, 'mobile')['font-size'], SZ(28));
  assert.deepEqual(variantProps(n, 'mobile')['text-align'], S('center'));
});

/* ── link / raw / class labels ── */
test('heading: href → settings.link envelope (url destination, no target blank)', () => {
  const n = render(h('h3', { href: '/services/' }, 'Go'));
  assert.deepEqual(n.settings.link, {
    $$type: 'link',
    value: { destination: { $$type: 'url', value: '/services/' }, isTargetBlank: { $$type: 'boolean', value: false } },
  });
});

test('heading: raw CSS attaches base64 custom_css to the style variant', () => {
  const n = render(h('h2', { size: 20, raw: 'text-transform:uppercase;' }, 'Up'));
  assert.equal(customCssOf(n), 'text-transform:uppercase;');
});

test('heading: raw on a STYLELESS heading still creates a style holder (css() bootstrap)', () => {
  const n = render(h('h2', { raw: 'white-space:nowrap;' }, 'NoWrap'));
  assert.equal(customCssOf(n), 'white-space:nowrap;');
  assert.ok(classRefs(n).length === 1, 'bootstrap style is linked (R4)');
});

test('heading: cls semantic hint lands as __cls on the local style (dedup naming)', () => {
  const n = render(h('h2', { size: 20, cls: 'section-title' }, 'X'));
  assert.equal(styleOf(n).__cls, 'section-title');
});

test('heading: gcls global refs are PREPENDED before the local style ref', () => {
  const n = render(h('h2', { size: 20, gcls: 'g-kxh2 g-kxkicker' }, 'X'));
  const refs = classRefs(n);
  assert.deepEqual(refs.slice(0, 2), ['g-kxh2', 'g-kxkicker']);
  assert.equal(refs[2], `e-${n.id}-s`);
});

test('heading: gcls deduplicates against existing refs', () => {
  const n = render(h('h2', { gcls: 'g-a g-a' }, 'X'));
  assert.deepEqual(classRefs(n), ['g-a', 'g-a'].filter((v, i, a) => a.indexOf(v) === i));
});

/* ── theme tokens ── */
test('heading: theme color token → LIVE variable ref (cleaned, no __lit) in the tree', () => {
  const t = defineTheme({ name: 'tt', color: { ink: '#0A2230' }, font: { head: 'Sora' } });
  const n = render(h('h1', { color: t.color.ink, font: t.font.head }, 'Live'));
  const p = deskProps(n);
  assert.equal(p.color.$$type, 'global-color-variable');
  assert.equal(p.color.value, t.colorRef.ink.id);
  assert.equal(p.color.__lit, undefined, 'the __lit fallback must be stripped before the validator sees it');
  assert.equal(p['font-family'].$$type, 'global-font-variable');
});

test('heading: literal-mode theme token → plain hex', () => {
  const t = defineTheme({ name: 'tl', color: { ink: '#0A2230' }, mode: 'literal' });
  const p = deskProps(render(h('h1', { color: t.color.ink }, 'Lit')));
  assert.deepEqual(p.color, C('#0A2230'));
});

/* ── combined torture: everything at once, then structurally valid ── */
test('heading: ALL features simultaneously still yields one coherent widget', async () => {
  const { assertTree } = await import('../../src/kit/kit.mjs');
  const t = defineTheme({ name: 'tor', color: { brand: '#E01118' } });
  const n = render(h('heading', {
    tag: 'h1', color: t.color.brand, size: 64, weight: 900, font: 'Archivo', ta: 'center',
    lh: 1.05, ls: -0.03, maxw: 980, center: true, href: '/x/', raw: '& em{color:#F43;}',
    cls: 'hero-title', gcls: 'g-shared', tablet: { size: 44 }, mobile: { size: 30, ta: 'left' },
  }, 'The <em>works</em>, No.', 1));
  assert.equal(textOf(n), 'The <em>works</em>, No.1');
  assert.deepEqual(n.settings.tag, S('h1'));
  assert.ok(n.settings.link);
  assert.equal(styleOf(n).__cls, 'hero-title');
  assert.equal(classRefs(n)[0], 'g-shared');
  assert.equal(styleOf(n).variants.length, 3);
  assert.ok(customCssOf(n).includes('em{color:#F43;}'));
  // mobile ta:left maps to start
  assert.deepEqual(variantProps(n, 'mobile')['text-align'], S('start'));
  assertTree([n]); // structurally valid as-is
});
