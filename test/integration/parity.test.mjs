/**
 * LIVE parity suite — the "no assumptions" tier. The fixture site is REALLY built
 * (esbuild → compile), REALLY deployed (variables + registry + pages), then verified at
 * every level DOWN THE STACK:
 *   1. deploy report        — what the deployer claims it did
 *   2. _elementor_data      — what WordPress actually stored
 *   3. live registry        — what the Class Manager actually holds
 *   4. kit variables meta   — what the variables store actually holds
 *   5. rendered HTML        — what a visitor's browser actually receives
 *   6. rendered CSS         — the declarations Elementor actually generated from our props
 * Then: idempotent re-deploy, --inline coexistence mode, and full DB restore.
 *
 * Runs in ONE file, serially — order matters. Gated by EXJSX_IT=1.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enabled, root, WP_URL, wp, dbSnapshot, dbRestore,
  rest, getRegistry, pageIdBySlug, elementorData, kitVariables, renderedPage, flat,
} from './harness.mjs';

const skip = enabled ? false : { skip: 'EXJSX_IT!=1 (live integration disabled)' };
const fixture = join(root, 'test', 'fixtures', 'site.jsx');
const S = { bundle: null, inlineBundle: null, report: null, ids: {} };
let deployBundle;

before(async () => {
  if (!enabled) return;
  // sanity: stack reachable — fail loudly, not silently green
  const ping = await fetch(WP_URL).catch(() => null);
  assert.ok(ping?.ok, `wpos stack unreachable at ${WP_URL}`);
  dbSnapshot();
  ({ deployBundle } = await import('../../src/deploy.mjs'));
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-it-'));
  const build = (extra, out) => {
    execFileSync('node', [join(root, 'src', 'cli.mjs'), 'build', fixture, out, ...extra], { encoding: 'utf8' });
    return JSON.parse(readFileSync(out, 'utf8'));
  };
  S.bundle = build([], join(dir, 'b.json'));
  S.inlineBundle = build(['--inline'], join(dir, 'bi.json'));
});

after(() => { if (enabled) dbRestore(); });

/* ── 1. deploy ── */
test('deploy: variables + registry + 2 pages land in one shot', skip, async () => {
  S.report = await deployBundle(S.bundle);
  assert.equal(S.report.variables, 6, 'all 6 theme variables written via ONE kit write');
  assert.equal(S.report.classes, S.bundle.classes.order.length, 'whole registry in ONE PUT');
  assert.equal(S.report.pages.length, 2);
  for (const p of S.report.pages) {
    assert.match(p.action, /^(created|updated)$/, `page ${p.slug}: ${p.action}`);
    assert.ok(p.id, 'page id assigned');
    S.ids[p.slug] = p.id;
  }
});

/* ── 2. stored tree (ground truth the editor loads) ── */
test('readback: _elementor_data holds the exact authored structure', skip, () => {
  const els = elementorData(S.ids['exjsx-t-home']);
  const nodes = flat(els);
  const hero = nodes.find((n) => n.widgetType === 'e-heading' && JSON.stringify(n.settings).includes('Parity Torture 9000'));
  assert.ok(hero, 'hero heading stored');
  assert.equal(hero.settings.tag.value, 'h1');
  assert.ok(hero.settings.classes.value.some((c) => c.startsWith('g-t-hero')), 'hero references its shared class');
  const link = nodes.find((n) => n.widgetType === 'e-paragraph' && n.settings.link);
  assert.equal(link.settings.link.value.destination.value, '/exjsx-t-branch/', 'cross-page anchor stored');
  const img = nodes.find((n) => n.widgetType === 'e-image');
  assert.equal(img.settings.image.value.src.value.id.value, Number(process.env.EXJSX_FIXTURE_IMG || 1583), 'attachment id stored');
  const probe = nodes.find((n) => n.widgetType === 'html');
  assert.match(probe.settings.html, /exjsx-html-probe/);
  assert.equal(nodes.filter((n) => n.widgetType === 'e-heading' && JSON.stringify(n.settings).includes('"h3"')).length, 3, 'three h3 card titles');
});

/* ── 3. live class registry ── */
test('registry: shared classes live in the Class Manager, deduped across pages', skip, async () => {
  const reg = await getRegistry();
  const ids = reg.map((c) => c.id);
  for (const want of ['g-t-hero', 'g-t-card', 'g-t-cell']) assert.ok(ids.includes(want), `${want} registered`);
  assert.equal(ids.filter((i) => i.startsWith('g-t-card')).length, 1, 'ONE card class serves both pages');
  assert.equal(ids.length, S.bundle.classes.order.length, 'registry exactly equals the bundle (namespace owned)');
});

/* ── 4. variables store ── */
test('variables: kit meta matches variablesMeta exactly (watermark intact)', skip, () => {
  const meta = kitVariables();
  assert.equal(Object.keys(meta.data).length, 6);
  assert.equal(meta.watermark, 6);
  const primary = Object.values(meta.data).find((v) => v.label === 'exjsx-test-primary');
  assert.deepEqual(primary.value, { $$type: 'color', value: '#B31E2C' });
});

/* ── 5. rendered HTML ── */
test('rendered HTML: a visitor receives every authored element', skip, async () => {
  const { status, html } = await renderedPage('exjsx-t-home');
  assert.equal(status, 200);
  assert.match(html, /<h1[^>]*>[\s\S]*?Parity Torture 9000/i, 'h1 tag + text');
  for (const t of ['Alpha', 'Beta', 'Gamma']) assert.ok(html.includes(t), `card ${t}`);
  assert.match(html, /href="\/exjsx-t-branch\/"/, 'cross-page anchor rendered');
  assert.match(html, /exjsx-html-probe/, 'raw html widget rendered');
  // markup carries the class LABEL, not the g- registry id (verified rendering fact)
  assert.match(html, /class="[^"]*t-hero[^"]*"/, 'global class LABEL present in markup');
  assert.match(html, /<img[^>]+(wp-content\/uploads|wp-image-1583)/, 'image resolved from the attachment');
  assert.match(html, /Cell 6/, 'grid cells rendered');
});

/* ── 6. rendered CSS: prop → actual declaration parity ── */
test('rendered CSS: authored props became real declarations (the parity proof)', skip, async () => {
  const { cssFlat } = await renderedPage('exjsx-t-home');
  const expects = [
    ['font-size:54px', 'heading size'],
    ['font-weight:800', 'heading weight'],
    ['text-transform:uppercase', 'raw custom_css on a global class'],
    ['grid-template-columns:repeat(3,1fr)', 'gridCols shorthand'],
    ['border-start-start-radius:18px', 'card radius (renders as logical longhands)'],
    ['object-fit:cover', 'img fit'],
    ['max-width:1080px', 'wrap maxw'],
  ];
  for (const [decl, what] of expects) assert.ok(cssFlat.includes(decl), `${what}: "${decl}" in generated CSS`);
});

test('rendered CSS: LIVE variable binding — color resolves via var(--…), variable defined', skip, async () => {
  const { cssFlat } = await renderedPage('exjsx-t-home');
  // Elementor emits variables by LABEL: usage var(--<label>) in class CSS, definition :root{--<label>:v}
  // in the kit stylesheet (post-<kit>.css). Verified rendering facts.
  assert.ok(cssFlat.includes('var(--exjsx-test-primary'), 'heading color references the variable (edits propagate live)');
  assert.ok(cssFlat.includes('--exjsx-test-primary:#B31E2C'), 'variable definition emitted in the kit CSS');
  assert.ok(cssFlat.includes('font-family:var(--exjsx-test-font-head'), 'font token bound live too');
});

test('rendered pages: branch page shares the SAME card class as home', skip, async () => {
  const { status, html } = await renderedPage('exjsx-t-branch');
  assert.equal(status, 200);
  assert.match(html, /Branch page/);
  assert.match(html, /class="[^"]*t-card[^"]*"/, 'cross-page shared class LABEL in markup');
});

/* ── 7. idempotency ── */
test('re-deploy: pure update, same page ids, registry stable (no dup pages/classes)', skip, async () => {
  const r2 = await deployBundle(S.bundle);
  for (const p of r2.pages) {
    assert.equal(p.action, 'updated', `${p.slug} updated, not re-created`);
    assert.equal(String(p.id), String(S.ids[p.slug]), `${p.slug} keeps id ${S.ids[p.slug]}`);
  }
  const reg = await getRegistry();
  assert.equal(reg.length, S.bundle.classes.order.length, 'registry count unchanged');
});

/* ── 8. --inline coexistence mode ── */
test('inline deploy: registry untouched, <style> block delivers raw CSS', skip, async () => {
  const regBefore = (await getRegistry()).map((c) => c.id).sort();
  const r = await deployBundle(S.inlineBundle);
  assert.equal(r.classes, 0, 'no registry PUT in inline mode');
  const regAfter = (await getRegistry()).map((c) => c.id).sort();
  assert.deepEqual(regAfter, regBefore, 'registry byte-identical (zero cross-site clobber)');
  const { html, cssFlat } = await renderedPage('exjsx-t-home');
  assert.match(html, /<style id="exjsx-raw-/, 'raw-CSS style block injected');
  assert.ok((html + cssFlat).replace(/\s+/g, '').includes('text-transform:uppercase'), 'raw CSS still effective without the registry');
  assert.match(html, /Parity Torture 9000/, 'content intact in inline form');
});

/* ── 9. restore proof (runs in after(), asserted here via a follow-up check) ── */
test('harness: snapshot exists so restore CAN run (resident sites will come back)', skip, async () => {
  // the actual restore runs in after(); this asserts the snapshot was taken (via harness plumbing)
  const { dbsh } = await import('./harness.mjs');
  assert.match(dbsh('ls /tmp/exjsx-it-snapshot.sql'), /exjsx-it-snapshot\.sql/);
});
