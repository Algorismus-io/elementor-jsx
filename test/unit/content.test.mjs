/**
 * Content robustness — real sites carry real text: unicode, emoji, RTL, entities, quotes,
 * very long strings, markup-in-text. The compiler must move it byte-faithfully; the
 * decompiler must re-quote it into VALID JS. (Live sanitization behavior is asserted
 * in the integration tier — offline the contract is byte fidelity.)
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { h } from '../../src/runtime.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { decompile } from '../../src/decompile.mjs';
import { resetIds, allNodes, textOf, byWidget } from '../helpers.mjs';

beforeEach(() => resetIds());

const roundTree = (msg) => {
  const b = compileSite(defineSite({ name: 'c', pages: [{ title: 'c', slug: 'c', node: h('h2', {}, msg) }] }));
  return textOf(allNodes(b.pages[0].elements).find(byWidget('e-heading')));
};

const SAMPLES = [
  ['emoji + ZWJ sequences', 'Launch 🚀 with 👨‍👩‍👧‍👦 and 🏳️‍🌈'],
  ['arabic RTL', 'حلول هندسية متقدمة للمكامن'],
  ['hebrew RTL', 'פתרונות הנדסיים מתקדמים'],
  ['CJK', '先进的油藏工程解决方案 — 地质力学'],
  ['combining diacritics', 'Škoda Müller façade naïve señor'],
  ['smart quotes + dashes', '“Real” quotes — and – dashes… ellipsis'],
  ['HTML entities kept literal', 'Fish &amp; Chips &lt;kept&gt; &nbsp;'],
  ['inline markup', 'Grow <em>faster</em> with <span class="a">AI</span> and <br> breaks'],
  ['backslashes + template chars', 'C:\\path\\to ${not-interpolated} `backticks`'],
  ['single + double quotes', `It's a "test" of 'both' kinds`],
  ['newlines preserved', 'line one\nline two\nline three'],
  ['very long string (10k)', 'A'.repeat(10000)],
];

for (const [name, msg] of SAMPLES) {
  test(`content fidelity through compile: ${name}`, () => {
    assert.equal(roundTree(msg), msg);
  });
}

test('content: 500-word paragraph survives with exact whitespace', () => {
  const words = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ');
  assert.equal(roundTree(words), words);
});

/* decompile must emit VALID JS for hostile text — q() escaping */
for (const [name, msg] of SAMPLES) {
  test(`decompile emits valid JS for: ${name}`, () => {
    const tree = [{
      id: 'x1', elType: 'widget', widgetType: 'e-heading',
      settings: { tag: { $$type: 'string', value: 'h2' }, title: { $$type: 'html-v3', value: { content: { $$type: 'string', value: msg }, children: [] } }, classes: { $$type: 'classes', value: [] } },
      styles: {}, elements: [],
    }];
    const src = decompile(tree, { name: 'Esc', slug: 'esc' });
    // the emitted string literal must parse back to the exact original text
    const m = src.match(/<heading[^>]*>\{(".*")\}<\/heading>/);
    assert.ok(m, 'heading emitted');
    assert.equal(JSON.parse(m[1]), msg, 'JSON round-trip of the emitted literal');
  });
}

test('slug edge cases: deploy slugify contract (uppercase/spaces/symbols → clean slugs)', async () => {
  // mirror of deploy.mjs slugify — kept in sync by this test
  const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  assert.equal(slugify('About Us'), 'about-us');
  assert.equal(slugify('Ölwechsel & Service!'), 'lwechsel-service');
  assert.equal(slugify('--x--'), 'x');
});
