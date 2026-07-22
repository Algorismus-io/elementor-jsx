/**
 * KITCHEN-SINK live suite — the whole component library + operational edge cases:
 *   library deploy (PHP validator accepts everything the framework emits)
 *   hover/:focus-visible CSS · gradients · shadows · charts · navBar
 *   XSS sanitization behavior (verified security posture)
 *   UPDATE flow: content change + class removal → orphan pruning proven LIVE
 *   media pipeline: sideload + idempotency
 *   graceful degradation without wp-cli
 *   scale: data-driven satellite pages sharing the registry
 *   AUDIT gate: playwright overflow/h1/console/broken-image checks on the deployed page
 * Gated by EXJSX_IT=1; isolated by full DB snapshot/restore (harness).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enabled, root, WP_URL, dbSnapshot, dbRestore, getRegistry, renderedPage, flat,
} from './harness.mjs';

const PW = process.env.EXJSX_IT_PLAYWRIGHT
  || join(root, '..', 'wpos-elementor-toolset', 'packages', 'server', 'node_modules', 'playwright', 'index.mjs');

const skip = enabled ? false : { skip: 'EXJSX_IT!=1 (live integration disabled)' };
const fixture = join(root, 'test', 'fixtures', 'kitchen.jsx');
const S = { bundle: null, report: null };
let deployBundle;

before(async () => {
  if (!enabled) return;
  const ping = await fetch(WP_URL).catch(() => null);
  assert.ok(ping?.ok, `wpos stack unreachable at ${WP_URL}`);
  dbSnapshot();
  ({ deployBundle } = await import('../../src/deploy.mjs'));
  const out = join(mkdtempSync(join(tmpdir(), 'exjsx-k-')), 'k.json');
  execFileSync('node', [join(root, 'src', 'cli.mjs'), 'build', fixture, out], { encoding: 'utf8' });
  S.bundle = JSON.parse(readFileSync(out, 'utf8'));
});

after(() => { if (enabled) dbRestore(); });

/* ── library deploy: the PHP validator accepts every component the framework ships ── */
test('kitchen deploy: 4 pages, whole component library, zero validator rejections', skip, async () => {
  S.report = await deployBundle(S.bundle);
  assert.equal(S.report.pages.length, 4);
  for (const p of S.report.pages) assert.match(p.action, /^(created|updated)$/, `${p.slug}: ${p.action}`);
  assert.equal(S.report.classes, S.bundle.classes.order.length);
  // embedded-vnode regression guard: nothing $$v-shaped may reach the wire
  assert.ok(!JSON.stringify(S.bundle.pages).includes('"$$v"'), 'no unrendered vnodes in the bundle');
});

/* ── rendered library ── */
test('rendered: navBar, hero h1, cards, charts, ctaBand, footer all present', skip, async () => {
  const { status, html } = await renderedPage('exjsx-k-home');
  assert.equal(status, 200);
  for (const [probe, what] of [
    [/kn-mega/, 'navBar mega menu'],
    [/<h1[^>]*>[\s\S]*?Kitchen Sink Torture/, 'hero h1'],
    [/Hoverable/, 'hover card'],
    [/482→33|482&#8594;33/, 'stat value'],
    [/<svg viewBox="0 0 260 90"/, 'lineChart svg'],
    [/stroke-dasharray="64 100"/, 'donut at 64%'],
    [/kitchenx\.dev/, 'browserMock'],
    [/Deploy the whole library/, 'ctaBand title'],
    [/A fixture that proves the parity engine/, 'footer blurb'],
    [/href="\/exjsx-k-alpha\/"/, 'real hrefs'],
  ]) assert.match(html, probe, what);
});

test('rendered CSS: gradient band, box-shadow, transition, hover+focus-visible variant', skip, async () => {
  const { cssFlat } = await renderedPage('exjsx-k-home');
  assert.ok(cssFlat.includes('linear-gradient(130deg,#2A1B54 0%,#06293C 100%)'.replace(/\s+/g, '')), 'ctaBand gradient');
  assert.ok(cssFlat.includes('box-shadow:0px6px24px-10pxrgba(23,21,31,0.18)'), 'card shadow');
  assert.ok(cssFlat.includes('transition:background.18sease,box-shadow.18sease'), 'raw transition css');
  // hover() state variant renders as BOTH :hover and :focus-visible (verified rendering fact);
  // multi-prop state variant: bg + color + shadow all land in the one rule
  const hoverRules = [...cssFlat.matchAll(/\.elementor\.[a-z0-9-]+:hover,[^{]*:focus-visible\{([^}]*)\}/g)].map((m) => m[1]);
  const want = ['background-color:#F1EBFB', 'color:#2A1B54', 'box-shadow:0px10px30px-12px'];
  assert.ok(hoverRules.some((r) => want.every((d) => r.includes(d))),
    `one hover+focus-visible rule carries all of ${want.join(' · ')} (saw ${hoverRules.length} hover rules)`);
});

/* ── media + structure widgets, static markup ── */
test('rendered: divider <hr>, tabs family markup, youtube container, video element', skip, async () => {
  const { html } = await renderedPage('exjsx-k-home');
  assert.match(html, /<hr[^>]*e-divider-base/, 'divider renders a real <hr>');
  assert.match(html, /data-e-type="e-tabs"/, 'tabs container');
  assert.match(html, /role="tabpanel"/, 'tab panels');
  assert.match(html, /Tab Alpha[\s\S]*Tab Beta/, 'tab labels');
  assert.match(html, /data-e-type="e-youtube"/, 'youtube container (iframe injects via JS)');
  assert.match(html, /<video[\s\S]{0,400}?<source src="[^"]*exjsx-sample\.mp4/, 'self-hosted <video> with source');
});

/* ── interactive widgets: real-browser behavior ── */
test('interactive: tabs SWITCH on click and the youtube iframe INJECTS (webpack runtime alive)', skip, async (t) => {
  let chromium;
  try { ({ chromium } = await import(PW)); } catch { return t.skip(`playwright not found at ${PW}`); }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${WP_URL}/exjsx-k-home/`, { waitUntil: 'networkidle' });
    assert.ok(await page.evaluate(() => (window.webpackChunkelementorFrontend || { push: 0 }).push !== Array.prototype.push),
      'webpack runtime processed the handler chunks');
    assert.equal(await page.evaluate(() => !!document.querySelector('iframe[src*="youtube"]')), true, 'youtube iframe injected by the handler');
    // tabs: click the inactive tab → its panel becomes the visible one
    await page.click('button[role=tab]:not(.e--selected)');
    await page.waitForFunction(() => {
      const panels = [...document.querySelectorAll('[data-element_type="e-tab-content"]')];
      return panels[1] && getComputedStyle(panels[1]).display !== 'none' && getComputedStyle(panels[0]).display === 'none';
    }, null, { timeout: 5000 });
    assert.match(await page.evaluate(() => document.querySelector('button[aria-selected=true]').innerText), /Tab Beta/, 'second tab selected');
  } finally { await browser.close(); }
});

/* ── SEO / page meta ── */
test('seo: title tag, meta description, og:*, canonical, noindex all render from pages[].seo', skip, async () => {
  const { compileSite } = await import('../../src/compile.mjs');
  const { defineSite } = await import('../../src/site.mjs');
  const { h } = await import('../../src/runtime.mjs');
  const { inlineLocal } = await import('../../src/inline.mjs');
  const site = defineSite({
    name: 'exjsx-seo',
    pages: [{
      title: 'SEO Page', slug: 'exjsx-seo-page',
      seo: {
        title: 'Custom SEO Title | Brand',
        description: 'A hand-written meta description for the parity suite.',
        ogImage: `${WP_URL}/wp-content/uploads/exjsx-sample.mp4`.replace('.mp4', '.png') || `${WP_URL}/og.png`,
        canonical: `${WP_URL}/exjsx-seo-page/`,
        noindex: true,
      },
      node: h('section', { pad: [40, 24] }, h('h1', { size: 32 }, 'SEO body')),
    }],
  });
  // inline mode: this mini-site must NOT own/prune the kitchen's registry (namespace rule)
  const bundle = compileSite(site);
  inlineLocal(bundle);
  const r = await deployBundle(bundle);
  assert.equal(r.seoRuntime, 'installed', `mu-plugin runtime shipped (${r.seoRuntime})`);
  const { html } = await renderedPage('exjsx-seo-page');
  assert.match(html, /<title>Custom SEO Title \| Brand<\/title>/, 'document title overridden');
  assert.match(html, /<meta name="description" content="A hand-written meta description for the parity suite\."/, 'meta description');
  assert.match(html, /<meta property="og:title" content="Custom SEO Title \| Brand"/, 'og:title');
  assert.match(html, /<meta property="og:description"/, 'og:description');
  assert.match(html, /<meta property="og:image" content="http/, 'og:image');
  assert.match(html, new RegExp(`<link rel="canonical" href="${WP_URL.replace(/[/:]/g, '\\$&')}/exjsx-seo-page/"`), 'canonical');
  assert.match(html, /<meta name="robots" content="noindex,follow"/, 'noindex');
  // pages WITHOUT seo are untouched (no phantom meta)
  const { html: plain } = await renderedPage('exjsx-k-home');
  assert.ok(!plain.includes('name="robots" content="noindex'), 'no noindex leakage onto other pages');
});

/* ── interactions (FREE core motion) ── */
test('interactions: footer JSON blob + motion.js served, fade-in ANIMATES in a real browser', skip, async (t) => {
  const { html } = await renderedPage('exjsx-k-home');
  assert.match(html, /<script type="application\/json" id="elementor-interactions-data">/, 'interactions data blob');
  assert.match(html, /animation-preset-props/, 'validator-exact envelope survived to the frontend');
  assert.match(html, /motion\.min\.js/, 'motion engine enqueued');
  assert.match(html, /interactions\.min\.js/, 'interactions handler enqueued');
  let chromium;
  try { ({ chromium } = await import(PW)); } catch { return t.skip(`playwright not found at ${PW}`); }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${WP_URL}/exjsx-k-home/`, { waitUntil: 'domcontentloaded' });
    // catch the element mid-fade (duration 500ms), then settled
    const early = await page.evaluate(() => { const el = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Content lab')); return el ? parseFloat(getComputedStyle(el).opacity) : -1; });
    await page.waitForTimeout(1200);
    const late = await page.evaluate(() => { const el = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Content lab')); return parseFloat(getComputedStyle(el).opacity); });
    assert.ok(early < 0.9, `caught mid-fade (opacity ${early})`);
    assert.equal(late, 1, 'settled at opacity 1 — motion ran');
  } finally { await browser.close(); }
});

/* ── XSS / sanitization posture (verified 2026-07-22) ── */
test('sanitization: <script> and onerror are STRIPPED at render; whitelisted <em> renders', skip, async () => {
  const { html } = await renderedPage('exjsx-k-home');
  assert.ok(!html.includes('<script>alert(9101)'), 'script tag stripped from heading content');
  assert.ok(!html.includes('onerror=alert(9102)'), 'onerror handler stripped from paragraph content');
  assert.ok(html.includes('alert(9101)'), 'inner text survives (tags removed, not the text)');
  assert.ok(html.includes('<em>accent</em>'), 'whitelisted inline markup still renders');
});

/* ── data-driven satellites share the design system ── */
test('satellites: 3 data-driven pages render and share ONE card class with home', skip, async () => {
  const reg = await getRegistry();
  for (const slug of ['exjsx-k-alpha', 'exjsx-k-beta', 'exjsx-k-gamma']) {
    const { status, html } = await renderedPage(slug);
    assert.equal(status, 200, slug);
    assert.match(html, /Back to the kitchen/, `${slug} content`);
  }
  assert.equal(reg.filter((c) => c.label === 'k-title').length, 1, 'one k-title class across satellites');
});

/* ── UPDATE flow: content edit + class removal → live orphan pruning ── */
test('update flow: v2 deploy changes text AND prunes now-unused classes from the registry', skip, async () => {
  const v2 = JSON.parse(JSON.stringify(S.bundle));
  // edit: retitle the hero
  const retitle = (nodes) => { for (const n of flat(nodes)) { const t = n.settings?.title?.value?.content; if (t?.value?.includes('Kitchen Sink Torture')) t.value = 'Kitchen Sink v2'; } };
  v2.pages.forEach((p) => retitle(p.elements));
  // edit: drop the satellite-only classes from the registry (simulates deleting a design)
  for (const id of ['g-k-title', 'g-k-blurb']) { delete v2.classes.items[id]; v2.classes.order = v2.classes.order.filter((x) => x !== id); }
  const r2 = await deployBundle(v2);
  assert.ok(r2.orphansDeleted >= 2, `orphan cleanup ran (deleted ${r2.orphansDeleted})`);
  const { html } = await renderedPage('exjsx-k-home');
  assert.match(html, /Kitchen Sink v2/, 'new content live');
  assert.ok(!html.includes('Kitchen Sink Torture'), 'old content gone');
  const reg = await getRegistry();
  const ids = reg.map((c) => c.id);
  assert.ok(!ids.includes('g-k-title') && !ids.includes('g-k-blurb'), 'dropped classes pruned from the live registry');
  assert.equal(ids.length, v2.classes.order.length, 'registry exactly tracks the bundle');
});

/* ── media pipeline: sideload + idempotency ── */
test('media: sideload a generated PNG, re-run KEEPS the same attachment (idempotent by slug)', skip, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-media-'));
  // 1x1 red PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const img = join(dir, 'probe.png');
  writeFileSync(img, png);
  const manifest = join(dir, 'manifest.mjs');
  writeFileSync(manifest, `export default [{ slot: 'it-probe', file: ${JSON.stringify(img)}, alt: 'test probe' }];`);
  const map1 = join(dir, 'map1.json');
  const { sideloadManifest } = await import('../../src/media.mjs');
  const m1 = await sideloadManifest(manifest, map1);
  assert.ok(m1['it-probe']?.id, 'attachment created');
  const m2 = await sideloadManifest(manifest, join(dir, 'map2.json'));
  assert.equal(m2['it-probe'].id, m1['it-probe'].id, 'second run reuses the attachment (KEEP)');
  // hash-cache: re-running against the SAME map with unchanged bytes needs zero network (SAME path)
  assert.ok(m1['it-probe'].hash, 'hash recorded for local files');
  const m3 = await sideloadManifest(manifest, map1);
  assert.equal(m3['it-probe'].id, m1['it-probe'].id, 'hash match → skipped, id stable');
  const att = await (await fetch(`${WP_URL}/wp-json/wp/v2/media/${m1['it-probe'].id}`)).json();
  assert.equal(att.alt_text, 'test probe', 'alt text applied');
});

/* ── graceful degradation: REST-only environment (no wp-cli) ── */
test('deploy without wp-cli: variables skipped gracefully, pages still deploy', skip, async () => {
  const prev = process.env.EXJSX_WPCLI;
  process.env.EXJSX_WPCLI = 'definitely-not-a-command-9182';
  try {
    const r = await deployBundle(S.bundle);
    assert.equal(r.variables, 0);
    assert.match(r.variablesSkipped || '', /wp-cli unavailable/, 'skip reason reported');
    assert.equal(r.pages.length, 4);
    for (const p of r.pages) assert.match(p.action, /^(created|updated)$/, `${p.slug} deployed without wp-cli`);
  } finally { process.env.EXJSX_WPCLI = prev; }
});

/* ── AUDIT gate: real-browser checks on the deployed page (playwright via elementor-ultra cli) ── */
test('audit: overflow@1440+390, single h1, no console errors, no broken/dead artifacts', skip, async (t) => {
  // redeploy v1 so the audited page is the canonical kitchen
  await deployBundle(S.bundle);
  const cli = process.env.EXJSX_ULTRA_CLI || join(root, '..', '.claude', 'skills', 'elementor-ultra', 'lib', 'cli.mjs');
  const { existsSync } = await import('node:fs');
  if (!existsSync(cli)) return t.skip(`elementor-ultra cli not found (set EXJSX_ULTRA_CLI): ${cli}`);
  let out;
  try {
    out = execFileSync('node', [cli, 'audit', `${WP_URL}/exjsx-k-home/`], { encoding: 'utf8', timeout: 120000 });
  } catch (e) {
    if (/playwright|browser|Executable/i.test(String(e.message) + String(e.stdout))) return t.skip('playwright unavailable');
    out = String(e.stdout || ''); // audit exits non-zero when any check fails — assert per-gate below
  }
  for (const gate of ['overflow @1440', 'overflow @390', 'h1 count == 1', 'console errors', 'broken raster images', 'broken svg images', 'dead links']) {
    const line = out.split('\n').find((l) => l.includes(gate));
    assert.ok(line, `audit ran gate: ${gate}`);
    assert.match(line, /^(PASS|SKIP)/, `${gate}: ${line}`);
  }
});
