/**
 * inspect.mjs — the read-only `exjsx inspect` formatter: summary line, depth-indented
 * element tree, DECODED custom_css (the base64 form must never leak into the output),
 * --page/--el filters, and the CLI wiring end-to-end.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSite } from '../../src/compile.mjs';
import { inspectBundle } from '../../src/inspect.mjs';
import { inlineLocal } from '../../src/inline.mjs';
import { defineSite } from '../../src/site.mjs';
import { dyn } from '../../src/kit/kit.mjs';
import { h } from '../../src/runtime.mjs';
import { resetIds, findNode, byWidget } from '../helpers.mjs';

beforeEach(() => resetIds());

const page = (slug, node) => ({ title: slug, slug, node });
const buildBundle = (name, node) => compileSite(defineSite({ name, pages: [page('p', node)] }));

const RAW = 'clip-path:polygon(0 0,100% 0,100% 80%,0 100%);';
const RAW_B64 = Buffer.from(RAW).toString('base64');

test('inspect: summary line reports pages, parts, classes, variables, fonts', () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  const out = inspectBundle(b);
  assert.match(out.split('\n')[0], /^bundle s — 1 page\(s\), 0 part\(s\), \d+ classes, 0 variables, 0 fonts$/);
  assert.ok(!out.includes(' · inline'), 'non-inline bundle carries no inline marker');
});

test('inspect: tree outline is depth-indented with elType/widgetType, id, and class refs', () => {
  const b = buildBundle('s', h('box', { pad: 24 }, h('heading', { size: 32 }, 'Hello World')));
  const out = inspectBundle(b);
  assert.ok(out.includes('page "p" (/p/) template=elementor_canvas'), 'page header line');
  assert.match(out, /^e-flexbox #e\w{5} \[g-/m, 'depth-0 container line');
  assert.match(out, /^  widget:e-heading #e\w{5} "Hello World" \[g-/m, 'depth-1 widget line');
});

test('inspect: text snippets strip tags and truncate at 40 chars with ellipsis', () => {
  const long = 'x'.repeat(60);
  const b = buildBundle('s', h('heading', { size: 20 }, long));
  const out = inspectBundle(b);
  assert.ok(out.includes(`"${'x'.repeat(40)}…"`), '40 chars + ellipsis');
  assert.ok(!out.includes(long), 'full 60-char string absent');
});

test('inspect: dynamic-tag content renders as [dyn:name]', () => {
  const b = buildBundle('s', h('heading', { size: 20, dyn: dyn.postTitle() }));
  assert.match(inspectBundle(b), /"\[dyn:post-title\]"/);
});

test('inspect: shared-class custom_css is DECODED and labeled per class and breakpoint', () => {
  const b = buildBundle('s', h('box', { pad: 0, raw: RAW }));
  const cls = Object.values(b.classes.items)[0];
  cls.variants.push({ meta: { breakpoint: 'mobile', state: null }, props: {}, custom_css: { raw: Buffer.from('display:none;').toString('base64') } });
  const before = JSON.stringify(b);
  const out = inspectBundle(b);
  assert.equal(JSON.stringify(b), before, 'inspectBundle never mutates the bundle');
  assert.ok(out.includes('custom css:'), 'css section header');
  assert.match(out, /class g-\S+ @desktop:\n\s+clip-path:polygon/, 'desktop label + decoded css');
  assert.match(out, /@mobile:\n\s+display:none;/, 'mobile label + decoded css');
  assert.ok(!out.includes(RAW_B64), 'base64 never appears in the output');
});

test('inspect: --inline bundle decodes custom_css from element LOCAL styles and flags inline', () => {
  const b = buildBundle('s', h('box', { pad: 0, raw: RAW }));
  inlineLocal(b);
  const out = inspectBundle(b);
  assert.match(out.split('\n')[0], / · inline$/, 'summary carries the inline marker');
  assert.match(out, /element #\w+ @desktop:\n\s+clip-path:polygon/, 'element-local label + decoded css');
  assert.ok(!out.includes(RAW_B64), 'base64 never appears in the output');
});

test('inspect: --page filters to one slug; unknown slug fails naming the available slugs', () => {
  const b = compileSite(defineSite({
    name: 's',
    pages: [page('p1', h('text', { size: 14 }, 'one')), page('p2', h('text', { size: 14 }, 'two'))],
  }));
  const out = inspectBundle(b, { page: 'p2' });
  assert.ok(out.includes('(/p2/)'), 'requested page rendered');
  assert.ok(!out.includes('(/p1/)'), 'other page suppressed');
  assert.throws(() => inspectBundle(b, { page: 'nope' }), /no page with slug "nope" — available: p1, p2/);
});

test('inspect: --el dumps one element with settings, DECODED styles, and child-id list', () => {
  const b = buildBundle('s', h('box', { pad: 0 }, h('heading', { size: 20, raw: 'text-transform:uppercase;' }, 'T')));
  inlineLocal(b);                                  // styles live ON the node in --inline bundles
  const id = findNode(b.pages[0].elements, byWidget('e-heading')).id;
  const before = JSON.stringify(b);
  const out = inspectBundle(b, { el: id });
  assert.equal(JSON.stringify(b), before, 'inspectBundle never mutates the bundle');
  assert.ok(out.includes(`element #${id} widget:e-heading`), 'element header');
  assert.ok(out.includes('"title"'), 'settings JSON present');
  assert.ok(out.includes('text-transform:uppercase;'), 'decoded css in the styles JSON');
  assert.ok(!out.includes(Buffer.from('text-transform:uppercase;').toString('base64')), 'base64 absent');
  assert.ok(out.includes('children: none'), 'leaf child list');
  assert.throws(() => inspectBundle(b, { el: 'zzz' }), /no element "zzz"/);
});

test('inspect: non-bundle JSON fails loudly with the build hint', () => {
  assert.throws(() => inspectBundle({ foo: 1 }), /not an exjsx bundle \(missing pages\[\]\)/);
});

test('inspect: parts appear in the tree with their type', () => {
  const b = compileSite(defineSite({
    name: 's',
    pages: [page('p', h('text', { size: 14 }, 'x'))],
    parts: { header: { node: h('box', { pad: 0 }, h('text', { size: 12 }, 'nav')) } },
  }));
  const out = inspectBundle(b);
  assert.match(out, /^part header "s header"$/m, 'part header line');
  const partAt = out.indexOf('part header');
  assert.match(out.slice(partAt), /\n {2}widget:e-paragraph #e\w{5} "nav"/, 'part children indented under it');
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'test', 'fixtures', 'site.jsx');
const run = (args) => execFileSync('node', [join(root, 'src', 'cli.mjs'), ...args], { encoding: 'utf8' });

test('cli inspect: built fixture bundle prints summary, tree, and decoded raw css end-to-end', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'exjsx-i-')), 'b.json');
  run(['build', fixture, out]);
  const log = run(['inspect', out]);
  assert.match(log, /^bundle exjsx-test — 2 page\(s\)/);
  assert.match(log, /widget:e-heading #e\w{5} "Parity Torture/);
  assert.ok(log.includes('custom css:'), 'css section present');
  assert.ok(log.includes('text-transform:uppercase;'), 'decoded raw css');
  assert.ok(!log.includes(Buffer.from('text-transform:uppercase;').toString('base64')), 'base64 absent');
});

test('cli inspect: missing bundle arg prints usage and exits 2', () => {
  try {
    run(['inspect']);
    assert.fail('expected exit 2');
  } catch (e) {
    assert.equal(e.status, 2);
    assert.match(String(e.stderr), /usage: exjsx inspect/);
  }
});
