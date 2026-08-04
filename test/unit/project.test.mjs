/**
 * project.mjs — fs-project discovery + entry synthesis (separation-of-concerns layout).
 * Contracts under test: discovery finds the right files and AGGREGATES every layout violation
 * into one error (no whack-a-mole); synthesis emits an entry whose runtime guards name the
 * offending FILE; the full pipeline (discover → synthesize → esbuild → compile) produces the
 * assembled site with SoC defaults (chrome present → header_footer template) and lints clean.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { buildOptions } from '../../src/bundler.mjs';
import { discoverProject, synthesizeEntry } from '../../src/project.mjs';
import { compileSite } from '../../src/compile.mjs';
import { lintBundle, formatLint } from '../../src/lint.mjs';
import { resetIds } from '../helpers.mjs';

beforeEach(() => resetIds());

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dir, '..', 'fixtures', 'fsproject');
const SRC = join(__dir, '..', '..', 'src');

/** replicate the cli build pipeline for a project dir (same esbuild settings as cli.mjs). */
async function buildProject(dir) {
  const manifest = discoverProject(dir);
  const entrySrc = synthesizeEntry(manifest);
  const tmp = join(mkdtempSync(join(tmpdir(), 'exjsx-pt-')), 'entry.mjs');
  writeFileSync(tmp, entrySrc);
  const res = await esbuild.build(buildOptions(tmp));
  const out = join(dirname(tmp), 'built.mjs');
  writeFileSync(out, res.outputFiles[0].text);
  const mod = await import(pathToFileURL(out).href);
  return compileSite(mod.default);
}

/* ── discovery ── */
test('project: discovery maps pages/parts/theme/config of the fixture', () => {
  const m = discoverProject(FIXTURE);
  assert.equal(m.name, 'fsproject');
  assert.ok(m.themeFile.endsWith('theme.mjs'));
  assert.ok(m.configFile.endsWith('site.config.mjs'));
  const slugs = m.pages.filter((p) => !p.dynamic).map((p) => p.slug).sort();
  assert.deepEqual(slugs, ['about-us', 'home']);
  const dyn = m.pages.find((p) => p.dynamic);
  assert.equal(dyn.param, 'city');
  assert.deepEqual(m.parts.map((p) => p.type).sort(), ['footer', 'header']);
});

test('project: discovery aggregates EVERY layout violation into one error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-bad-'));
  mkdirSync(join(dir, 'pages'), { recursive: true });
  mkdirSync(join(dir, 'parts'), { recursive: true });
  writeFileSync(join(dir, 'pages', 'helpers.jsx'), 'export const x = 1;');            // stray non-page
  // distinct filenames that kebab to the SAME slug (case-collision is untestable on APFS)
  writeFileSync(join(dir, 'pages', 'aboutUs.page.jsx'), 'export default () => null;');
  writeFileSync(join(dir, 'pages', 'about-us.page.jsx'), 'export default () => null;');
  writeFileSync(join(dir, 'parts', 'sidebar.part.jsx'), 'export default () => null;'); // unknown part type
  writeFileSync(join(dir, 'parts', 'nav.jsx'), 'export default () => null;');          // wrong pattern
  assert.throws(() => discoverProject(dir), (e) => {
    assert.match(e.message, /4 layout problem\(s\)/);
    assert.match(e.message, /helpers\.jsx: not a \*\.page\.jsx/);
    assert.match(e.message, /collides with/);
    assert.match(e.message, /unknown part type "sidebar"/);
    assert.match(e.message, /nav\.jsx: parts are <type>\.part\.jsx/);
    return true;
  });
});

test('project: no pages/ at all is a loud, actionable error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-empty-'));
  assert.throws(() => discoverProject(dir), /no pages\/ directory/);
});

/* ── synthesis ── */
test('project: synthesized entry wires defineSite with per-file runtime guards', () => {
  const src = synthesizeEntry(discoverProject(FIXTURE));
  assert.match(src, /defineSite\(\{ name: __config\.name/);
  assert.match(src, /elementor_header_footer/, 'chrome present → header_footer default template');
  assert.match(src, /dynamic \[city\] page requires/, 'dynamic contract error names the param');
  assert.match(src, /default export must be a component function/);
});

test('project: page with a non-function default export throws naming the FILE at entry runtime', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-badpage-'));
  mkdirSync(join(dir, 'pages'), { recursive: true });
  writeFileSync(join(dir, 'pages', 'home.page.jsx'), 'export default 42;');
  await assert.rejects(() => buildProject(dir), /pages\/home\.page\.jsx.*component function.*got number/);
});

test('project: dynamic page with missing/invalid data() throws with the data-concern recipe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-dyn-'));
  mkdirSync(join(dir, 'pages'), { recursive: true });
  writeFileSync(join(dir, 'pages', '[city].page.jsx'), 'export default () => null;');
  await assert.rejects(() => buildProject(dir), /requires `export const data/);
  writeFileSync(join(dir, 'pages', '[city].page.jsx'), 'export const data = () => [{ title: "no slug" }];\nexport default () => null;');
  await assert.rejects(() => buildProject(dir), /data\(\)\[0\] needs \{ slug, title \}/);
});

/* ── full pipeline on the fixture ── */
test('project: fixture builds end-to-end — dynamic expansion, SoC defaults, theme flow', async () => {
  const b = await buildProject(FIXTURE);
  assert.equal(b.name, 'fsdemo', 'site.config.mjs name wins over dirname');
  assert.deepEqual(b.pages.map((p) => p.slug).sort(), ['about-us', 'home', 'locations-berlin', 'locations-tokyo']);
  assert.ok(b.pages.every((p) => p.template === 'elementor_header_footer'), 'chrome present → header_footer everywhere');
  const berlin = b.pages.find((p) => p.slug === 'locations-berlin');
  assert.equal(berlin.title, 'Berlin');
  assert.ok(JSON.stringify(berlin.elements).includes('Our Berlin office'), 'data() props reached the component');
  assert.deepEqual(b.parts.map((p) => p.type).sort(), ['footer', 'header']);
  assert.equal(b.parts.find((p) => p.type === 'header').title, 'FS Demo Header', 'part meta.title honored');
  assert.deepEqual(b.fonts, ['Poppins'], 'theme flowed through the synthesized entry');
});

test('project: fixture passes lint with zero findings (the SoC layout satisfies the conventions)', async () => {
  const b = await buildProject(FIXTURE);
  const r = lintBundle(b);
  assert.deepEqual(r.findings, [], formatLint(r));
});
