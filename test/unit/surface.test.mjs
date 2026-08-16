/**
 * The authoring surface contract: x.mjs (barrel) + prelude.mjs (auto-using) + bundler.mjs
 * (shorthand specifiers). Enforced BOTH ways so coverage can never silently rot:
 *   - every export of every source module is in the barrel OR in its documented EXCLUDES;
 *   - nothing in the barrel is stale (every barrel name exists in a source module);
 *   - the prelude is a subset of barrel ∪ component library, and its deny-list (short/generic
 *     names that would turn typos into silent behavior) stays OUT;
 *   - bare 'elementor-jsx' specifiers resolve via package.json exports (cli ≡ npm resolution);
 *   - an entry with ZERO imports builds through the pipeline (the auto-using proof).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import * as barrel from '../../src/x.mjs';
import { buildOptions, resolveSpecifier } from '../../src/bundler.mjs';
import { compileSite } from '../../src/compile.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', '..', 'src');

/* documented machinery exclusions — the ONLY names allowed to be missing from the barrel */
const EXCLUDES = {
  'kit/kit.mjs': ['freshId', 'resetIds'],
  'kit/kit-components.mjs': ['CInc'],
  'theme.mjs': ['S', 'C', 'SZ', 'BG', 'RAD', 'DIM'],   // re-exports of kit names — barrel takes them from kit
  'site.mjs': [], 'tw.mjs': [], 'runtime.mjs': [], 'a11y.mjs': [],
  // compile/deploy machinery — the authoring surface is defineComponent only
  'component.mjs': ['beginComponents', 'componentsActive', 'finalizeComponents', 'endComponents',
    'emitComponentInstance', 'rewriteComponentIds', 'hasComponentInstances', 'referencedComponentUids', 'expandInstances'],
};

test('surface: every source-module export is in the barrel or documented EXCLUDES (and none stale)', async () => {
  const barrelNames = new Set(Object.keys(barrel));
  const allSource = new Set();
  for (const [mod, excludes] of Object.entries(EXCLUDES)) {
    const m = await import(pathToFileURL(join(SRC, mod)).href);
    const missing = Object.keys(m).filter((k) => k !== 'default' && !barrelNames.has(k) && !excludes.includes(k));
    assert.deepEqual(missing, [], `${mod}: exports missing from x.mjs barrel (add them, or document in EXCLUDES): ${missing.join(', ')}`);
    for (const k of Object.keys(m)) allSource.add(k);
    const stale = excludes.filter((k) => !(k in m));
    assert.deepEqual(stale, [], `${mod}: stale EXCLUDES entries: ${stale.join(', ')}`);
  }
  const dangling = [...barrelNames].filter((k) => !allSource.has(k));
  assert.deepEqual(dangling, [], `x.mjs exports nothing sources provide: ${dangling.join(', ')}`);
});

test('surface: prelude ⊆ barrel ∪ component library, and the deny-list stays out', () => {
  const preludeSrc = readFileSync(join(SRC, 'prelude.mjs'), 'utf8').replace(/\/\/[^\n]*/g, '');
  const names = [...preludeSrc.matchAll(/export \{([^}]+)\} from/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean));
  assert.ok(names.length > 50, `prelude surface sanity (${names.length})`);
  const componentLib = ['Page', 'Section', 'Card', 'Bento', 'Stat', 'CTA', 'Footer', 'Nav', 'Mock', 'Layout', 'Hero', 'FeatureGrid', 'FAQ', 'RelatedLinks'];
  const valid = new Set([...Object.keys(barrel), ...componentLib]);
  const unknown = names.filter((n) => !valid.has(n));
  assert.deepEqual(unknown, [], `prelude exports not in barrel/component library: ${unknown.join(', ')}`);
  // short/generic names auto-injected would make typos silently resolve — they must stay explicit-import-only
  const DENY = ['S', 'C', 'N', 'B', 'M', 'SZ', 'DIM', 'P0', 'PDIM', 'RAD', 'BG', 'GRAD', 'HTML', 'CLS', 'KV', 'node', 'abs', 'bar', 'hover', 'fx', 'h2', 'h3', 'txt', 'render', 'renderPage', 'DYN', 'IMG_DYN'];
  const leaked = names.filter((n) => DENY.includes(n));
  assert.deepEqual(leaked, [], `deny-listed names leaked into the auto-using prelude: ${leaked.join(', ')}`);
});

test('surface: bare specifiers resolve via package.json exports; unknown subpaths throw the valid set', () => {
  assert.ok(resolveSpecifier('elementor-jsx').endsWith('src/x.mjs'), 'root → barrel');
  assert.ok(resolveSpecifier('elementor-jsx/kit').endsWith('kit/kit.mjs'));
  assert.ok(resolveSpecifier('elementor-jsx/theme').endsWith('theme.mjs'));
  // the scoped published name resolves identically (import by convention or by package name)
  assert.ok(resolveSpecifier('@algorismus/elementor-jsx').endsWith('src/x.mjs'), 'scoped root → barrel');
  assert.ok(resolveSpecifier('@algorismus/elementor-jsx/kit').endsWith('kit/kit.mjs'), 'scoped subpath');
  assert.equal(resolveSpecifier('some-other-pkg'), null, 'non-exjsx specifiers pass through');
  assert.throws(() => resolveSpecifier('elementor-jsx/nope'), /unknown subpath.*valid:.*elementor-jsx\/kit/);
});

async function buildEntry(srcText) {
  const tmp = join(mkdtempSync(join(tmpdir(), 'exjsx-sf-')), 'entry.jsx');
  writeFileSync(tmp, srcText);
  const res = await esbuild.build(buildOptions(tmp));
  const out = join(dirname(tmp), 'built.mjs');
  writeFileSync(out, res.outputFiles[0].text);
  return compileSite((await import(pathToFileURL(out).href)).default);
}

test('surface: an entry with ZERO imports builds — auto-using prelude + jsx shim (the whole point)', async () => {
  const b = await buildEntry(`
export default defineSite({ name: 'auto', pages: [{ title: 'A', slug: 'a', seo: { title: 't', description: 'd' },
  node: (
    <section tw="flex flex-col items-center py-16">
      {fontLoader('Inter', [400])}
      <h1 size={40} font="Inter">Auto</h1>
      {divider(sx({ w: 200, h: 1, bg: '#ccc' }))}
      {tabs([{ label: 'One', content: [para('one')] }, { label: 'Two', content: [para('two')] }])}
    </section>
  ) }] });
`);
  assert.equal(b.pages.length, 1);
  const flat = JSON.stringify(b.pages[0].elements);
  assert.ok(flat.includes('e-tabs') && flat.includes('e-divider') && flat.includes('fonts.googleapis'), 'kit widgets landed via free variables');
});

test('surface: explicit user bindings ALWAYS win over the prelude (free variables only)', async () => {
  const b = await buildEntry(`
const divider = () => para('not a widget');
export default defineSite({ name: 'shadow', pages: [{ title: 'A', slug: 'a', seo: { title: 't', description: 'd' },
  node: <section tw="py-8"><h1 size={20}>t</h1>{divider()}</section> }] });
`);
  const flat = JSON.stringify(b.pages[0].elements);
  assert.ok(!flat.includes('e-divider'), 'user-defined divider shadowed the prelude one');
  assert.ok(flat.includes('not a widget'));
});

test('surface: bare-specifier imports build without node_modules resolution', async () => {
  const b = await buildEntry(`
import { defineSite as ds, heading } from 'elementor-jsx';
import { defineTheme as dt } from 'elementor-jsx/theme';
const t = dt({ name: 'x', color: { a: '#111' }, mode: 'literal' });
export default ds({ name: 'bare', theme: t, pages: [{ title: 'A', slug: 'a', seo: { title: 't', description: 'd' },
  node: <section tw="py-8"><h1 size={20}>bare works</h1></section> }] });
`);
  assert.equal(b.name, 'bare');
  assert.ok(JSON.stringify(b.pages[0].elements).includes('bare works'));
});
