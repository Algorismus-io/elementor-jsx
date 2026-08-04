/**
 * lint.mjs — the conventions enforcer. Contract under test: every rule fires on a minimal
 * violating fixture, stays SILENT on the clean exemplar, and the formatter/severity gating
 * behaves as the CLI relies on. Each rule encodes a real incident (see CONVENTIONS.md).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lintBundle, formatLint } from '../../src/lint.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h } from '../../src/runtime.mjs';
import { fontLoader } from '../../src/kit/kit.mjs';
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

test('lint: font-not-loaded fires once per family; fontLoader and system stacks are clean', () => {
  const bad = build(page('a', h('box', {}, h('h1', { font: 'Poppins' }, 'x'), h('text', { font: 'Poppins' }, 'y'))));
  const f = of(lintBundle(bad), 'font-not-loaded');
  assert.equal(f.length, 1, 'deduped per family');
  assert.match(f[0].fix, /fontLoader\('Poppins'/);
  const loaded = build(page('a', h('box', {}, fontLoader('Poppins', [600]), h('h1', { font: 'Poppins' }, 'x'))));
  assert.equal(of(lintBundle(loaded), 'font-not-loaded').length, 0);
  const system = build(page('a', h('box', {}, h('h1', { font: '"SF Pro Display",-apple-system,sans-serif' }, 'x'))));
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
