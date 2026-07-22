/**
 * src/components/index.jsx — the theme-aware JSX component library (the layer the farmans
 * multi-page build proved in production, flagged UNTESTED by the coverage audit). Every
 * component renders through the real pipeline: theme context, zero brand literals, dedup.
 * Built with esbuild via a fixture entry since these are .jsx sources.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(mkdtempSync(join(tmpdir(), 'exjsx-jc-')), 'b.json');
execFileSync('node', [join(root, 'src', 'cli.mjs'), 'build', join(root, 'test', 'fixtures', 'library.jsx'), out], { encoding: 'utf8' });
const bundle = JSON.parse(readFileSync(out, 'utf8'));

const flat = (els) => { const o = []; (function w(ns) { for (const n of ns || []) { o.push(n); w(n.elements); } })(els); return o; };
const text = (n) => n.settings?.title?.value?.content?.value ?? n.settings?.paragraph?.value?.content?.value ?? null;
const texts = (els) => flat(els).map(text).filter(Boolean);
const pageBy = (slug) => bundle.pages.find((p) => p.slug === slug);
const variantsOf = (n) => {
  const ref = (n.settings.classes?.value || []).find((c) => bundle.classes.items[c]);
  return ref ? bundle.classes.items[ref].variants : Object.values(n.styles || {})[0]?.variants || [];
};
const deskOf = (n) => variantsOf(n).find((v) => v.meta.breakpoint === 'desktop')?.props || {};

test('library fixture compiles: 2 pages, dedup engaged, no vnode leaks', () => {
  assert.equal(bundle.pages.length, 2);
  assert.ok(bundle.stats.localStylesBefore > bundle.stats.sharedClasses);
  assert.ok(!JSON.stringify(bundle.pages).includes('"$$v"'));
});

test('Layout: nav + content + footer shell wraps the page (navBar html widget + Footer section)', () => {
  const els = pageBy('exjsx-lib-home').elements;
  const nav = flat(els).find((n) => n.widgetType === 'html' && (n.settings.html || '').includes('kn-logo'));
  assert.ok(nav, 'Nav (navBar) is the first shell piece');
  assert.match(nav.settings.html, /LibBrand/);
  assert.ok(texts(els).includes('LibBrand'), 'Footer brand rendered');
  assert.ok(texts(els).includes('Docs'), 'footer column links rendered');
});

test('Hero: h1 with theme tokens (live color ref, head font), lede constrained', () => {
  const els = pageBy('exjsx-lib-home').elements;
  const h1 = flat(els).find((n) => n.widgetType === 'e-heading' && text(n) === 'Library torture home');
  assert.ok(h1, 'hero h1');
  assert.equal(h1.settings.tag.value, 'h1');
  const p = deskOf(h1);
  assert.equal(p.color.$$type, 'global-color-variable', 'theme token stays LIVE through the component');
  assert.equal(p['font-size'].value.size, 54);
});

test('Section: eyebrow/title/body header + centered wrap + _cssid anchor', () => {
  const els = pageBy('exjsx-lib-home').elements;
  const anchor = flat(els).find((n) => n.settings?._cssid?.value === 'features');
  assert.ok(anchor, 'Section id → _cssid');
  for (const t of ['FEATURES', 'Feature section', 'A body line.']) assert.ok(texts(els).includes(t), t);
});

test('Bento + Card: native grid with spans, mobile single-column stack, cards share ONE class', () => {
  const els = pageBy('exjsx-lib-home').elements;
  const bento = flat(els).find((n) => deskOf(n)['grid-template-columns']?.value === 'repeat(12, 1fr)');
  assert.ok(bento, 'Bento grid');
  const mob = variantsOf(bento).find((v) => v.meta.breakpoint === 'mobile');
  assert.equal(mob.props['grid-template-columns'].value, 'repeat(1, 1fr)', 'stacks to 1 col on mobile');
  const cards = bento.elements.filter((n) => deskOf(n)['grid-column']?.value === 6);
  assert.equal(cards.length, 2, 'Card span=6 × 2');
  assert.deepEqual(cards[0].settings.classes.value, cards[1].settings.classes.value, 'identical Cards → same shared class');
});

test('Stat: value+label typography from the theme scale', () => {
  const els = pageBy('exjsx-lib-home').elements;
  const stat = flat(els).find((n) => text(n) === '99.9%');
  assert.ok(stat, 'stat value');
  assert.equal(deskOf(stat)['font-size'].value.size, 40);
});

test('CTA: primary band (theme bg literal fallback) + centered heading', () => {
  const els = pageBy('exjsx-lib-home').elements;
  const cta = flat(els).find((n) => text(n) === 'Ship the library');
  assert.ok(cta, 'CTA title');
  assert.equal(deskOf(cta)['text-align'].value, 'center');
});

test('FAQ: q/a rows with themed borders; FeatureGrid: Section+Bento+Card composition', () => {
  const els = pageBy('exjsx-lib-sub').elements;
  for (const t of ['Is it tested?', 'Yes — 300+ checks.', 'Grid A', 'Grid B']) {
    assert.ok(texts(els).includes(t), t);
  }
  const faqBox = flat(els).find((n) => deskOf(n)['border-style']?.value === 'solid');
  assert.ok(faqBox, 'FAQ row carries the themed border');
});

test('RelatedLinks: cross-page chips route through paragraph links (atomic containers render no anchor)', () => {
  const els = pageBy('exjsx-lib-sub').elements;
  const link = flat(els).find((n) => n.widgetType === 'e-paragraph' && n.settings.link);
  assert.ok(link, 'chip link is a PARAGRAPH link');
  assert.equal(link.settings.link.value.destination.value, '/exjsx-lib-home/');
  assert.equal(text(link), 'Back home');
});

test('Mock: chart/mocks bag re-exports the kit widgets', () => {
  const els = pageBy('exjsx-lib-sub').elements;
  const svg = flat(els).find((n) => n.widgetType === 'html' && /svg viewBox/.test(n.settings.html || ''));
  assert.ok(svg, 'Mock.line rendered an svg html widget');
});

test('Page: fragment-like passthrough (sections stay top-level siblings)', () => {
  const els = pageBy('exjsx-lib-home').elements;
  assert.ok(els.length >= 4, `top-level sections stay siblings (${els.length})`);
  assert.ok(els.every((n) => n.elType), 'all kit nodes');
});
