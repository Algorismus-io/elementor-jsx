/**
 * Offline pipeline — the REAL cli: esbuild transpile (jsx-shim inject) → compile → bundle file.
 * Proves the whole authoring path works from an actual .jsx file, not just h() calls.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'test', 'fixtures', 'site.jsx');
const run = (args) => execFileSync('node', [join(root, 'src', 'cli.mjs'), ...args], { encoding: 'utf8' });

test('cli build: fixture .jsx → bundle with pages, variables, dedup stats', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'exjsx-t-')), 'b.json');
  const log = run(['build', fixture, out]);
  assert.match(log, /built exjsx-test: 2 page\(s\), 6 variables, 2 fonts/);
  const b = JSON.parse(readFileSync(out, 'utf8'));

  assert.equal(b.name, 'exjsx-test');
  assert.equal(b.pages.length, 2);
  assert.deepEqual(b.pages.map((p) => p.slug), ['exjsx-t-home', 'exjsx-t-branch']);
  assert.equal(b.variables.watermark, 6);
  assert.deepEqual([...b.fonts].sort(), ['Georgia', 'Verdana']);

  // dedup really happened: 3 identical Cards + 6 cells collapse
  assert.ok(b.stats.localStylesBefore > b.stats.sharedClasses, `dedup: ${b.stats.localStylesBefore} → ${b.stats.sharedClasses}`);
  // semantic labels made it through esbuild+compile
  assert.ok(b.classes.order.includes('g-t-card'), 't-card class');
  assert.ok(b.classes.order.includes('g-t-hero'), 't-hero class');
  // card class is shared ACROSS pages (only one t-card in the registry)
  assert.equal(b.classes.order.filter((id) => id.startsWith('g-t-card')).length, 1);

  // theme var binding survived: hero heading color is a live variable ref
  const flat = [];
  (function w(ns) { for (const n of ns || []) { flat.push(n); w(n.elements); } })(b.pages[0].elements);
  const hero = flat.find((n) => n.widgetType === 'e-heading' && n.settings?.title?.value?.content?.value?.includes('Parity Torture'));
  assert.ok(hero, 'hero heading present');
  const heroCls = hero.settings.classes.value.find((c) => c.startsWith('g-'));
  const variants = b.classes.items[heroCls].variants;
  assert.equal(variants[0].props.color.$$type, 'global-color-variable');
  assert.equal(variants[0].props.color.__lit, undefined, '__lit stripped in the bundle');
  // responsive mobile variant carried through
  assert.ok(variants.some((v) => v.meta.breakpoint === 'mobile'));
  // raw css carried as base64 custom_css
  const desk = variants.find((v) => v.meta.breakpoint === 'desktop');
  assert.equal(Buffer.from(desk.custom_css.raw, 'base64').toString(), 'text-transform:uppercase;');
});

test('cli build --inline: registry emptied, salted local styles, raw css → <style>', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'exjsx-t-')), 'b.json');
  const log = run(['build', fixture, out, '--inline']);
  assert.match(log, /inline: \d+ styles inlined/);
  const b = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(b.classes, { items: {}, order: [] });
  const first = b.pages[0].elements[0];
  assert.equal(first.widgetType, 'html');
  assert.match(first.settings.html, /text-transform:uppercase/);
});

test('jsx-shim: _jsx/_Fragment are exact aliases of the runtime factory (shadow-proof names)', async () => {
  const shim = await import('../../src/jsx-shim.mjs');
  const rt = await import('../../src/runtime.mjs');
  assert.equal(shim._jsx, rt.h);
  assert.equal(shim._Fragment, rt.Fragment);
});

test('cli: unknown command prints usage, exits 0', () => {
  assert.match(run(['bogus']), /usage: exjsx/);
});

test('cli build: an author bug (unknown intrinsic) fails the build with the real message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-t-'));
  const bad = join(dir, 'bad.jsx');
  writeFileSync(bad, `import { defineSite } from '${root}/src/site.mjs';
export default defineSite({ name: 'bad', pages: [{ title: 'x', slug: 'x', node: <blink>no</blink> }] });`);
  assert.throws(() => run(['build', bad]), /unknown intrinsic <blink>/);
});
