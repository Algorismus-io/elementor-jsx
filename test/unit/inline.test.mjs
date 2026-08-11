/**
 * inline.mjs — --inline mode: self-contained pages (multi-tenancy). Classes re-inlined
 * as SALTED local styles, registry emptied, raw CSS re-emitted as a real <style> block
 * (the free-Elementor custom_css no-op workaround).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compileSite } from '../../src/compile.mjs';
import { inlineLocal } from '../../src/inline.mjs';
import { shouldWriteVariables, deployBundle } from '../../src/deploy.mjs';
import { defineSite } from '../../src/site.mjs';
import { defineTheme } from '../../src/theme.mjs';
import { h } from '../../src/runtime.mjs';
import { resetIds, allNodes, classRefs, findNode } from '../helpers.mjs';

beforeEach(() => resetIds());

const page = (slug, node) => ({ title: slug, slug, node });
const buildBundle = (name, node) => compileSite(defineSite({ name, pages: [page('p', node)] }));

test('inline: registry emptied, refs become salted LOCAL styles, deploy would skip the PUT', () => {
  const b = buildBundle('site-a', h('box', { pad: 24 }, h('text', { size: 14 }, 'x')));
  const stats = inlineLocal(b);
  assert.deepEqual(b.classes, { items: {}, order: [] });
  assert.equal(stats.inlined, 2);
  assert.equal(stats.dropped, 2);
  for (const n of allNodes(b.pages[0].elements)) {
    for (const ref of classRefs(n)) {
      assert.ok(n.styles[ref], `ref ${ref} resolves to a local style on the node`);
      assert.ok(/^e-[0-9a-z]{1,8}-/.test(ref), 'salted id form');
    }
  }
});

test('inline: salt differs per bundle NAME (coexisting pages cannot bleed)', () => {
  const mk = (name) => { resetIds(); const b = buildBundle(name, h('text', { size: 14 }, 'x')); inlineLocal(b); return b; };
  const a = mk('site-a'), c = mk('site-b');
  const sidsA = allNodes(a.pages[0].elements).flatMap((n) => Object.keys(n.styles || {}));
  const sidsB = allNodes(c.pages[0].elements).flatMap((n) => Object.keys(n.styles || {}));
  assert.ok(sidsA.length && sidsB.length);
  for (const s of sidsA) assert.ok(!sidsB.includes(s), `sid ${s} must not collide across bundles`);
});

test('inline: variants are preserved exactly through the re-inline (no style loss)', () => {
  const b = buildBundle('s', h('text', { size: 14, mobile: { size: 12 } }, 'x'));
  const before = JSON.stringify(Object.values(b.classes.items)[0].variants);
  inlineLocal(b);
  const n = findNode(b.pages[0].elements, (x) => x.widgetType === 'e-paragraph');
  const st = n.styles[Object.keys(n.styles)[0]];
  assert.equal(JSON.stringify(st.variants), before);
});

test('inline: raw CSS becomes a real <style> block injected FIRST (free-Elementor fix)', () => {
  const b = buildBundle('s', h('box', { pad: 0, raw: 'clip-path:polygon(0 0,100% 0,100% 80%,0 100%);' }));
  const stats = inlineLocal(b);
  assert.equal(stats.rawRules, 1);
  const first = b.pages[0].elements[0];
  assert.equal(first.widgetType, 'html');
  assert.match(first.settings.html, /^<style id="exjsx-raw-/);
  assert.match(first.settings.html, /clip-path:polygon/);
  // doubled-class specificity so the rule beats the atomic one
  assert.match(first.settings.html, /\.elementor \.(e-[0-9a-z-]+)\.\1\{/);
});

test('inline: responsive raw CSS is @media-wrapped per breakpoint', () => {
  // author a tablet-scoped custom_css by hand on a compiled class
  const b = buildBundle('s', h('box', { pad: 0 }));
  const cls = Object.values(b.classes.items)[0];
  cls.variants.push({ meta: { breakpoint: 'mobile', state: null }, props: {}, custom_css: { raw: Buffer.from('display:none;').toString('base64') } });
  inlineLocal(b);
  const style = b.pages[0].elements[0].settings.html;
  assert.match(style, /@media\(max-width:767px\)\{[^}]*display:none/);
});

test('inline: no raw CSS → no style widget injected', () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  inlineLocal(b);
  assert.notEqual(b.pages[0].elements[0]?.widgetType, 'html');
});

test('inline: EXTERNAL refs (gcls to kit classes) are left as refs, not inlined', () => {
  const b = buildBundle('s', h('text', { size: 14, gcls: 'g-kxbody' }, 'x'));
  inlineLocal(b);
  const n = findNode(b.pages[0].elements, (x) => x.widgetType === 'e-paragraph');
  const refs = classRefs(n);
  assert.ok(refs.includes('g-kxbody'), 'external class ref preserved');
  assert.equal(refs.filter((r) => r !== 'g-kxbody').length, 1, 'own style inlined next to it');
});

test('inline: stats.sharedClasses reset to 0 (deploy display honesty)', () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  inlineLocal(b);
  assert.equal(b.stats.sharedClasses, 0);
});

const buildThemed = (name, node) => {
  const theme = defineTheme({ name: 'x', color: { a: '#111' } });
  return compileSite(defineSite({ name, theme, pages: [page('p', node)] }));
};

test('inline: bundle carries a JSON-serializable inline marker (survives bundle.json round-trip)', () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  inlineLocal(b);
  assert.equal(b.inline, true);
  assert.equal(shouldWriteVariables(JSON.parse(JSON.stringify(b))), false);
});

test('deploy plan: variables write decision matrix (inline skips, watermark fallback kept)', () => {
  const inlineThemed = buildThemed('s', h('text', { size: 14 }, 'x'));
  inlineLocal(inlineThemed);
  // populated data proves the FLAG, not empty variables.data, drives the skip
  assert.ok(Object.keys(inlineThemed.variables.data).length > 0);
  resetIds();
  const themeless = buildBundle('s', h('text', { size: 14 }, 'x'));
  // the PHP-warning regression envelope: theme-less fallback MUST still be written
  assert.deepEqual(themeless.variables, { data: {}, watermark: 0, version: 1 });
  resetIds();
  const themed = buildThemed('s', h('text', { size: 14 }, 'x'));
  const cases = [
    ['inline themed bundle skips (flag wins over populated data)', inlineThemed, false],
    ['non-inline theme-less writes the watermark fallback', themeless, true],
    ['non-inline themed writes', themed, true],
    ['pre-fix inline bundle.json (stats.inlined, no flag) skips', { stats: { inlined: 0 } }, false],
    ['bare bundle writes (safe default)', {}, true],
  ];
  for (const [name, bundle, want] of cases) assert.equal(shouldWriteVariables(bundle), want, name);
});

test('deployBundle dry: inline bundle reports variablesSkipped=inline and never attempts the kit write', async () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  inlineLocal(b);
  b.pages = [];                                  // fully offline — no fetch
  // wpcli 'false' exits 1: IF the write path ran it would take the wp-cli-unavailable catch instead
  const r = await deployBundle(b, { dry: true, wpcli: 'false' });
  assert.equal(r.variables, 0);
  assert.match(r.variablesSkipped, /inline/);
  assert.doesNotMatch(r.variablesSkipped, /wp-cli unavailable/);
});

test('inline: per-state custom_css keeps its state selector (hover gets the :hover,:focus-visible comma pair) — 1.7.x', () => {
  const b = buildBundle('site-st', h('box', { pad: 0, hover: { raw: 'outline: 2px solid red;' }, active: { raw: 'letter-spacing: 2px;' } }, h('text', { size: 14 }, 'x')));
  inlineLocal(b);
  const styleW = allNodes(b.pages[0].elements).find((n) => n.widgetType === 'html' && /outline: 2px solid red/.test(n.settings.html || ''));
  assert.ok(styleW, 'state raw reaches the inline <style> block');
  const html = styleW.settings.html;
  assert.match(html, /\.elementor \.(e-[^.]+)\.\1:hover,\.elementor \.(e-[^.]+)\.\2:focus-visible\{outline: 2px solid red;\}/, 'hover rule carries the native comma pair, not a bare always-on selector');
  assert.match(html, /:active\{letter-spacing: 2px;\}/, 'other pseudo states render as :state');
});
