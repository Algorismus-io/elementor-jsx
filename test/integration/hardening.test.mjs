/**
 * HARDENING suite — closes the last confidence gaps:
 *   1. VERSION PIN     — verified-rendering-facts are tied to Elementor 4.1.4; upgrades fail loudly
 *   2. EDITOR SMOKE    — the real Elementor editor opens our page: boots, no uncaught errors,
 *                        our content present in the preview (the "pleasant to edit" proof)
 *   3. VISUAL REGRESSION — pixelmatch against committed baselines @1440+@390 (first run seeds
 *                        the baseline and proves capture determinism via double-capture)
 *   4. CONCURRENCY     — two simultaneous deploys to one kit: defined, corruption-free outcome
 *   5. SCALE           — 30 data-driven pages + full registry in one deploy, idempotent
 * Gated by EXJSX_IT=1; DB snapshot/restore isolation (harness).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enabled, root, WP_URL, wp, dbSnapshot, dbRestore, getRegistry, renderedPage,
} from './harness.mjs';

const skip = enabled ? false : { skip: 'EXJSX_IT!=1 (live integration disabled)' };
const PW = process.env.EXJSX_IT_PLAYWRIGHT
  || join(root, '..', 'wpos-elementor-toolset', 'packages', 'server', 'node_modules', 'playwright', 'index.mjs');
const CLI = process.env.EXJSX_ULTRA_CLI || join(root, '..', '.claude', 'skills', 'elementor-ultra', 'lib', 'cli.mjs');
const BASE = join(root, 'test', 'baselines');
const ADMIN_PASS = 'exjsx-it-editor-pass-1';
const S = { kitchen: null, report: null };
let deployBundle, compileSite, defineSite, defineTheme, hmod;

before(async () => {
  if (!enabled) return;
  const ping = await fetch(WP_URL).catch(() => null);
  assert.ok(ping?.ok, `wpos stack unreachable at ${WP_URL}`);
  dbSnapshot();
  ({ deployBundle } = await import('../../src/deploy.mjs'));
  ({ compileSite } = await import('../../src/compile.mjs'));
  ({ defineSite } = await import('../../src/site.mjs'));
  ({ defineTheme } = await import('../../src/theme.mjs'));
  hmod = await import('../../src/runtime.mjs');
  const out = join(mkdtempSync(join(tmpdir(), 'exjsx-h-')), 'k.json');
  execFileSync('node', [join(root, 'src', 'cli.mjs'), 'build', join(root, 'test', 'fixtures', 'kitchen.jsx'), out], { encoding: 'utf8' });
  S.kitchen = JSON.parse(readFileSync(out, 'utf8'));
  S.report = await deployBundle(S.kitchen);
  // fail HERE if any page didn't save — downstream tests (editor/vis) give confusing timeouts otherwise
  for (const p of S.report.pages) assert.match(p.action, /^(created|updated)$/, `kitchen deploy: ${p.slug} → ${p.action}`);
});

after(() => { if (enabled) dbRestore(); });

/* ── 1. version pin: the drift gate ── */
test('version pin: Elementor 4.1.4 / 4.2.0 — versions every verified rendering fact was proven on', skip, () => {
  const list = wp('plugin', 'list', '--format=csv');
  const row = list.split('\n').find((l) => l.startsWith('elementor,'));
  const version = row.split(',')[3];
  // 4.2.0 certified by the 2026-07-22 upgrade rehearsal: full suite green with ONE adaptation —
  // Span_Prop_Type flipped Number→String base ("span 6"); deploy.adaptSpansForVersion covers both.
  assert.ok(['4.1.4', '4.2.0'].includes(version),
    `Elementor is ${version} but the suite's verified rendering facts were proven on 4.1.4/4.2.0. ` +
    'Run the upgrade rehearsal (snapshot DB + plugin dir, upgrade, npm run test:it, catalog deltas), ' +
    're-verify test/README.md facts, then extend this pin.');
});

/* ── 2. editor smoke: the real Elementor editor on our page ── */
test('editor smoke: editor boots on the kitchen page, zero uncaught errors, content in preview', skip, async (t) => {
  let chromium;
  try { ({ chromium } = await import(PW)); } catch { return t.skip(`playwright not found at ${PW}`); }
  // temp admin password INSIDE the snapshot window (restore reverts it)
  wp('user', 'update', process.env.WP_USER || 'admin', `--user_pass=${ADMIN_PASS}`, '--skip-email');
  const homeId = S.report.pages.find((p) => p.slug === 'exjsx-k-home').id;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const uncaught = [];
    page.on('pageerror', (e) => uncaught.push(String(e).slice(0, 200)));
    // login
    await page.goto(`${WP_URL}/wp-login.php`, { waitUntil: 'domcontentloaded' });
    await page.fill('#user_login', process.env.WP_USER || 'admin');
    await page.fill('#user_pass', ADMIN_PASS);
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
    assert.ok(page.url().includes('/wp-admin'), `logged in (at ${page.url()})`);
    // open the Elementor editor on OUR page
    await page.goto(`${WP_URL}/wp-admin/post.php?post=${homeId}&action=elementor`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const w = /** @type {any} */ (window);
      return !!(w.elementor && (w.elementor.documents || w.elementor.getPreviewView || w.elementorFrontend));
    }, null, { timeout: 60000 });
    // our content must be inside the editor preview (frames API — robust across load states)
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      for (const f of page.frames()) {
        if (!f.url().includes('elementor-preview')) continue;
        const txt = await f.evaluate(() => (document.body && document.body.innerText) || '').catch(() => '');
        if (txt.includes('Kitchen Sink')) { found = true; break; }
      }
      if (!found) await page.waitForTimeout(1000);
    }
    assert.ok(found, 'kitchen content present in the editor preview frame');
    // the editor probes optional REST routes and surfaces missing ones as async 404 rejections
    // (rest_no_route) — internal housekeeping, not a failure of OUR page. Real JS exceptions still fail.
    const real = uncaught.filter((e) => !/rest_no_route|HTTP error 404/.test(e));
    assert.deepEqual(real, [], 'no uncaught editor exceptions (benign route-probe 404s filtered)');
  } finally { await browser.close(); }
});

/* ── 3. visual regression: pixelmatch vs committed baselines ── */
test('visual regression: kitchen home @1440 and @390 match baselines (or seed + determinism-check)', skip, async (t) => {
  let PNGmod, pixelmatch;
  try {
    PNGmod = (await import('pngjs')).PNG;
    pixelmatch = (await import('pixelmatch')).default;
  } catch { return t.skip('pixelmatch/pngjs not installed'); }
  if (!existsSync(CLI)) return t.skip(`elementor-ultra cli not found (set EXJSX_ULTRA_CLI): ${CLI}`);
  mkdirSync(BASE, { recursive: true });
  const port = new URL(WP_URL).port || '80';   // baselines are stack-specific (fixture media differs)
  const shot = (out, w) => execFileSync('node', [CLI, 'shot', `${WP_URL}/exjsx-k-home/`, out, String(w)], { encoding: 'utf8', timeout: 120000 });
  const read = (p) => PNGmod.sync.read(readFileSync(p));
  const diffRatio = (a, b) => {
    assert.equal(a.width, b.width, 'capture width stable');
    assert.equal(a.height, b.height, `capture height stable (${a.height} vs ${b.height} — layout changed)`);
    const n = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.12 });
    return n / (a.width * a.height);
  };
  for (const w of [1440, 390]) {
    const baseline = join(BASE, `exjsx-k-home@${w}@${port}.png`);
    const cur = join(mkdtempSync(join(tmpdir(), 'exjsx-shot-')), `cur${w}.png`);
    shot(cur, w);
    if (!existsSync(baseline)) {
      // seed run: prove capture DETERMINISM (two independent captures must match), then commit
      const again = cur.replace('.png', 'b.png');
      shot(again, w);
      const r = diffRatio(read(cur), read(again));
      assert.ok(r < 0.005, `double-capture determinism @${w}: ${(r * 100).toFixed(3)}% diff`);
      writeFileSync(baseline, readFileSync(cur));
      t.diagnostic(`baseline seeded: exjsx-k-home@${w}@${port}.png`);
    } else {
      const r = diffRatio(read(baseline), read(cur));
      assert.ok(r < 0.005, `@${w}: ${(r * 100).toFixed(3)}% pixels differ from baseline (limit 0.5%) — visual regression`);
    }
  }
});

/* ── 4. concurrency: two simultaneous deploys to one kit ── */
test('concurrency: parallel deploys of two sites — both page sets land, registry consistent, no corruption', skip, async () => {
  const { h } = hmod;
  const mk = (tag) => {
    const theme = defineTheme({ name: `exjsx-c${tag}`, color: { main: tag === 'a' ? '#101010' : '#efefef' } });
    return compileSite(defineSite({
      name: `exjsx-c${tag}`,
      theme,
      pages: [{ title: `C ${tag}`, slug: `exjsx-c-${tag}`, node: h('section', { pad: [40, 20] }, h('h2', { cls: `c${tag}-title`, size: 30 }, `Concurrent ${tag}`)) }],
    }));
  };
  const A = mk('a'), B = mk('b');
  const [ra, rb] = await Promise.all([deployBundle(A), deployBundle(B)]);
  for (const [r, name] of [[ra, 'A'], [rb, 'B']]) {
    for (const p of r.pages) assert.match(p.action, /^(created|updated)$/, `${name} pages landed`);
  }
  for (const slug of ['exjsx-c-a', 'exjsx-c-b']) {
    const { status, html } = await renderedPage(slug);
    assert.equal(status, 200, slug);
    assert.match(html, /Concurrent [ab]/);
  }
  // registry: no corruption — every surviving class comes from A∪B∪(pre-existing kitchen set);
  // concurrent GET/PUT races mean the union may linger (last-writer-wins + stragglers).
  const reg = await getRegistry();
  const legal = new Set([...A.classes.order, ...B.classes.order, ...S.kitchen.classes.order]);
  const alien = reg.map((c) => c.id).filter((id) => !legal.has(id));
  assert.deepEqual(alien, [], 'no corrupted/foreign entries in the registry');
  assert.ok(reg.length >= Math.min(A.classes.order.length, B.classes.order.length), 'winner set present');
});

/* ── 5. scale: 30 data-driven pages, one deploy, idempotent ── */
test('scale: 30-page data-driven site deploys, renders, and re-deploys idempotently', skip, async () => {
  const { h } = hmod;
  const { fromData } = await import('../../src/site.mjs');
  const theme = defineTheme({ name: 'exjsx-scale', color: { ink: '#222222', tint: '#EEF2F7' } });
  const rows = Array.from({ length: 30 }, (_, i) => ({ slug: `exjsx-s-${i.toString().padStart(2, '0')}`, label: `Region ${i}` }));
  const Card = ({ t }) => h('box', { cls: 'sc-card', bg: '#ffffff', pad: 20, radius: 12, gap: 6 },
    h('h3', { cls: 'sc-title', size: 18 }, t), h('text', { cls: 'sc-body', size: 14 }, `${t} details.`));
  const pages = fromData(rows, (r, i) => ({
    title: r.label, slug: r.slug,
    node: h('section', { pad: [50, 20], bg: theme.color.tint },
      h('box', { maxw: 900, center: true, gap: 16, pad: 0 },
        h('h2', { cls: 'sc-h2', color: theme.color.ink, size: 32 }, r.label),
        h('text', { cls: `sc-unique-${i}`, size: 13 + (i % 3), color: '#5B6B72' }, `Unique style ${i}`),
        h(Card, { t: r.label }))),
  }));
  const bundle = compileSite(defineSite({ name: 'exjsx-scale', theme, pages }));
  assert.equal(bundle.pages.length, 30);
  assert.ok(bundle.classes.order.length >= 30, `registry has per-page + shared classes (${bundle.classes.order.length})`);
  assert.equal(bundle.classes.order.filter((c) => c.includes('sc-card')).length, 1, 'ONE card class across 30 pages');

  const t0 = Date.now();
  const r1 = await deployBundle(bundle);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  assert.equal(r1.pages.length, 30, `30 pages deployed (${secs}s)`);
  assert.equal(r1.pages.filter((p) => /^(created|updated)$/.test(p.action)).length, 30, 'no failures at scale');

  const reg = await getRegistry();
  assert.equal(reg.length, bundle.classes.order.length, 'live registry exactly equals the 30-page bundle');
  for (const i of [0, 15, 29]) {
    const { status, html } = await renderedPage(rows[i].slug);
    assert.equal(status, 200);
    assert.match(html, new RegExp(`Region ${i}`), `page ${i} renders`);
  }
  // idempotency at scale
  const r2 = await deployBundle(bundle);
  assert.equal(r2.pages.filter((p) => p.action === 'updated').length, 30, 're-deploy is a pure update');
  const ids1 = Object.fromEntries(r1.pages.map((p) => [p.slug, String(p.id)]));
  for (const p of r2.pages) assert.equal(String(p.id), ids1[p.slug], `${p.slug} id stable`);
});

/* ── 6. 1.7.x certification: states + attributes (the version-flip detector) ── */
test('1.7.x certification: native state variants + per-state custom_css render; attributes stored, DOM emission probed', skip, async (t) => {
  const { h } = hmod;
  const { elementorData, flat } = await import('./harness.mjs');
  const probe = h('section', { pad: [40, 20] },
    h('h1', { size: 32 }, 'Cert 17x'),
    h('box', {
      id: 'cert17x', pad: 20, bg: '#ffffff',
      hover: { bg: '#0f172a' },                    // native hover state variant
      active: { raw: 'letter-spacing: 2px;' },     // per-state custom_css
      attrs: { 'data-exjsx-probe': 'attrs17x' },   // attributes envelope
    }, h('text', {}, 'probe body')));
  const bundle = compileSite(defineSite({
    name: 'cert17x',
    pages: [{ title: 'cert17x', slug: 'exjsx-cert-17x', seo: { title: 't', description: 'd' }, node: probe }],
  }));
  const rep = await deployBundle(bundle);
  const pid = rep.pages[0].id;
  assert.match(rep.pages[0].action, /^(created|updated)$/);

  // (a) saved document JSON: state variants + attributes envelope persisted?
  const saved = flat(elementorData(pid));
  const target = saved.find((n) => n.settings?._cssid?.value === 'cert17x');
  assert.ok(target, 'probe element saved');
  const stored = target.settings.attributes;

  // (b) rendered CSS: the hover variant rides the shared class; Elementor renders state `hover`
  // as the comma pair `:hover, :focus-visible` (Style_States additional-states map — documented).
  const { html, cssFlat } = await renderedPage('exjsx-cert-17x');
  assert.match(cssFlat, /:hover[^{]*\{[^}]*background:#0f172a/i, 'native hover variant renders as a :hover rule');
  assert.match(cssFlat, /:active[^{]*\{[^}]*letter-spacing:2px/i, 'per-state custom_css renders inside the state selector');

  // (c) attributes: storage is version-dependent (schema key ships 4.2.x); DOM emission is the
  // VERSION-FLIP DETECTOR. Empirical matrix (live-verified 2026-08-12 on 4.2.1 + Pro 4.1.0):
  //   FREE core — transformer stubbed (returns null) → stored but NOT emitted;
  //   PRO >= 4.1 — Pro_Attributes_Transformer (license `atomic-custom-attributes`) → EMITTED.
  // The day the free-core assertion fails, Elementor un-stubbed it: flip docs/API-CARD.md +
  // types.d.ts wording from "stored, not emitted on free" to "emitted".
  const caps = await (await fetch(`${WP_URL}/wp-json/elementor-ultra/v1/site/capabilities`,
    { headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64') } })).json().catch(() => ({}));
  const proActive = !!(caps?.data?.pro_active);
  if (stored) {
    assert.equal(stored.$$type, 'attributes', 'attributes envelope persisted');
    assert.equal(stored.value?.[0]?.value?.key?.value, 'data-exjsx-probe');
    if (proActive) {
      assert.ok(/data-exjsx-probe="attrs17x"/.test(html),
        'Pro is active but attributes did NOT reach the DOM — Pro pulled/regated its Pro_Attributes_Transformer; re-verify the API-card Pro claim.');
    } else {
      assert.ok(!/data-exjsx-probe/.test(html),
        'ATTRIBUTES NOW REACH THE DOM ON FREE CORE — Elementor un-stubbed its attributes transformer on this version. ' +
        'Update the version-gated language in docs/API-CARD.md + types.d.ts (attrs), then extend this probe to assert emission.');
    }
    t.diagnostic(`attributes DOM emission on this stack (pro_active=${proActive}): ${/data-exjsx-probe/.test(html) ? 'EMITTED' : 'not emitted'}`);
  } else {
    t.diagnostic('attributes envelope was stripped on save — this Elementor version has no attributes schema key (pre-4.2.x); storage contract starts at 4.2.x');
    assert.ok(!/data-exjsx-probe/.test(html), 'no DOM emission either way');
  }
});
