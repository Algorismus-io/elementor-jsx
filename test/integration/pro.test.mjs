/**
 * ELEMENTOR PRO suite — closes the Pro coverage column. Pro plugin FILES live on the stack
 * permanently but stay INACTIVE; this file activates Pro inside its own snapshot window
 * (DB restore reverts activation), so every other test file still runs against free Elementor
 * and the free-stack verified facts stay authoritative.
 *
 * Proves:
 *   - Pro 4.1.0 activates cleanly against core 4.1.4 (site stays healthy)
 *   - hamburgerNav / classic nav-menu widget renders INSIDE a V4 atomic page (the Pro-gated
 *     kit component), fed by a real WP menu, with its responsive visibility classes emitted
 *   - FACT (refutes the old theory): local-style custom_css does NOT render even WITH Pro —
 *     it is global-class-only on 4.1.4; the --inline <style>-block workaround is needed on Pro too
 *   - the free-stack parity pipeline is UNCHANGED under Pro (labels, var binding still emit)
 * Gated by EXJSX_IT=1 and the presence of the elementor-pro plugin.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { enabled, root, WP_URL, wp, dbSnapshot, dbRestore, rest, renderedPage } from './harness.mjs';

const PW = process.env.EXJSX_IT_PLAYWRIGHT
  || join(root, '..', 'wpos-elementor-toolset', 'packages', 'server', 'node_modules', 'playwright', 'index.mjs');
const dbq = (sql) => execSync(`docker exec wpos-stack-db sh -c 'mysql -uroot -prootpass wp_wpos -N -e "${sql}" 2>/dev/null'`, { encoding: 'utf8' }).trim();

let proInstalled = false;
try { proInstalled = enabled && /^elementor-pro,/m.test(wp('plugin', 'list', '--format=csv')); } catch {}
const skip = enabled ? (proInstalled ? false : { skip: 'elementor-pro not installed on the stack' }) : { skip: 'EXJSX_IT!=1' };

const S = { report: null, bundle: null };
let deployBundle, compileSite, defineSite, h, kit;

before(async () => {
  if (!enabled || !proInstalled) return;
  const ping = await fetch(WP_URL).catch(() => null);
  assert.ok(ping?.ok, `wpos stack unreachable at ${WP_URL}`);
  dbSnapshot();
  wp('plugin', 'activate', 'elementor-pro');
  wp('menu', 'create', 'ExjsxPro Menu');
  wp('menu', 'item', 'add-custom', 'exjsxpro-menu', 'Home', `${WP_URL}/`);
  wp('menu', 'item', 'add-custom', 'exjsxpro-menu', 'Services', `${WP_URL}/services/`);
  ({ deployBundle } = await import('../../src/deploy.mjs'));
  ({ compileSite } = await import('../../src/compile.mjs'));
  ({ defineSite } = await import('../../src/site.mjs'));
  ({ h } = await import('../../src/runtime.mjs'));
  kit = await import('../../../.claude/skills/elementor-ultra/lib/kit.mjs');
});

after(() => { if (enabled && proInstalled) dbRestore(); });

test('pro activation: 4.1.0 loads against core 4.1.4, site healthy', skip, async () => {
  assert.match(wp('plugin', 'list', '--format=csv'), /^elementor-pro,active,/m, 'pro active');
  assert.match(wp('eval', 'echo defined("ELEMENTOR_PRO_VERSION") ? ELEMENTOR_PRO_VERSION : "no";'), /4\.1\.0/);
  const r = await fetch(WP_URL);
  assert.equal(r.status, 200, 'frontend healthy with Pro active');
});

test('hamburgerNav: the Pro nav-menu widget renders inside a V4 page via the full pipeline', skip, async () => {
  const node = h('box', { pad: 0 },
    kit.bar({ padding: kit.P0 }, [
      kit.hugCol({}, [kit.heading('h2', 'ProNav Brand')]),
      kit.hamburgerNav('exjsxpro-menu'),
    ]),
    h('h1', { size: 40 }, 'Pro nav page'),
    h('text', { size: 15 }, 'hamburgerNav under Pro.'));
  S.bundle = compileSite(defineSite({ name: 'exjsx-pro', pages: [{ title: 'Pro Nav', slug: 'exjsx-pro-nav', node }] }));
  S.report = await deployBundle(S.bundle);
  for (const p of S.report.pages) assert.match(p.action, /^(created|updated)$/, `${p.slug}: ${p.action}`);

  const { status, html, cssFlat } = await renderedPage('exjsx-pro-nav');
  assert.equal(status, 200);
  assert.match(html, /elementor-widget-nav-menu/, 'classic nav-menu widget rendered inside the atomic page');
  assert.match(html, /elementor-nav-menu--dropdown/, 'dropdown layout markup');
  assert.match(html, /elementor-menu-toggle|elementor-nav-menu--toggle/, 'hamburger toggle present');
  assert.match(html, /Services/, 'real menu items from the WP menu');
  // hamburgerNav's responsive shell: hidden on desktop, flex at mobile
  assert.ok(cssFlat.includes('display:none'), 'desktop hidden');
  assert.match(cssFlat, /@media\(max-width:767px\)|display:flex/, 'mobile visibility variant emitted');
});

test('FACT: local-style custom_css does NOT render even with Pro (global-class-only on 4.1.4)', skip, async () => {
  // save a page with a LOCAL style carrying custom_css straight through the save endpoint
  const b64 = Buffer.from('outline: 3px dashed rgb(11,22,33);').toString('base64');
  const tree = [{
    id: 'q1', elType: 'e-flexbox',
    settings: { tag: { $$type: 'string', value: 'div' }, classes: { $$type: 'classes', value: ['e-q1-s'] } },
    styles: { 'e-q1-s': { id: 'e-q1-s', type: 'class', label: 'q1', variants: [{
      meta: { breakpoint: 'desktop', state: null },
      props: { padding: kit.P0, display: { $$type: 'string', value: 'flex' }, 'flex-direction': { $$type: 'string', value: 'column' } },
      custom_css: { raw: b64 },
    }] } },
    elements: [{ id: 'q2', elType: 'widget', widgetType: 'e-heading', settings: { tag: { $$type: 'string', value: 'h2' }, title: { $$type: 'html-v3', value: { content: { $$type: 'string', value: 'Local css probe' }, children: [] } }, classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] }],
  }];
  const { json: doc } = await rest('/wp-json/elementor-ultra/v1/documents', { method: 'POST', body: JSON.stringify({ title: 'Pro Local CSS', status: 'publish', template: 'elementor_canvas' }) });
  const d = doc.data || doc; const id = d.id || d.post_id;
  const save = await rest(`/wp-json/elementor-ultra/v1/documents/${id}/save`, { method: 'POST', body: JSON.stringify({ elements: tree }) });
  assert.equal(save.status, 200, 'tree with local custom_css SAVES fine (accepted, just not rendered)');
  await rest(`/wp-json/elementor-ultra/v1/documents/${id}/prime-css`, { method: 'POST', body: '{}' });
  try { wp('elementor', 'flush-css'); } catch {}
  await fetch(`${WP_URL}/?p=${id}`); // visit FIRST — flush-css deletes files; a view regenerates them
  const local = await (await fetch(`${WP_URL}/wp-content/uploads/elementor/css/local-${id}-frontend-desktop.css`)).text();
  assert.ok(local.includes('.e-q1-s'), 'atomic props DID render into the local css');
  assert.ok(!local.includes('outline: 3px dashed'), 'custom_css declaration ABSENT from local css (the fact)');
  const page = await (await fetch(`${WP_URL}/?p=${id}`)).text();
  assert.ok(!page.includes('outline: 3px dashed'), 'nor anywhere in the rendered page');
});

test('atomic form: full pipeline deploy → real browser fill+submit → submission row in the DB', skip, async (t) => {
  let chromium;
  try { ({ chromium } = await import(PW)); } catch { return t.skip(`playwright not found at ${PW}`); }
  const { form, field, formTextarea, formLabel, formSelect, formCheckbox, formSubmit, col, SZ, P0 } = kit;
  const node = h('box', { pad: 0 },
    h('h2', { size: 28 }, 'Talk to us'),
    form({ name: 'exjsx-e2e-form', actions: ['collect-submissions'] }, [
      field('f-name', 'Your name', { required: true }),
      field('f-email', 'Work email', { type: 'email', required: true }),
      col({ gap: SZ(6), padding: P0 }, [formLabel('f-msg', 'Message'), formTextarea('f-msg', { rows: 4 })]),
      formSelect('industry', ['Oil & Gas', ['mining', 'Mining']]),
      formCheckbox('consent', { required: true }),
      formSubmit('Send message'),
    ]));
  const b = compileSite(defineSite({ name: 'exjsx-form', pages: [{ title: 'Form E2E', slug: 'exjsx-form-e2e', node }] }));
  const r = await deployBundle(b);
  assert.match(r.pages[0].action, /^(created|updated)$/, 'form page past the PHP validator');

  // rendered semantics: real form + linked labels + typed/required fields
  const { status, html } = await renderedPage('exjsx-form-e2e');
  assert.equal(status, 200);
  assert.match(html, /<form[^>]*data-form-name="exjsx-e2e-form"/, 'e-form renders a real <form>');
  assert.match(html, /<label[^>]*for=f-name/, 'label linked to input');
  assert.match(html, /<input[^>]*id=f-name[^>]*name=f-name[^>]*type="text"[^>]*required/s, 'named required input');
  assert.match(html, /<input[^>]*type="email"/s, 'typed email input');
  assert.match(html, /<option value="Mining">/, '[value,label] select option');
  assert.match(html, /<button[^>]*type="submit"/s, 'submit button');

  // real browser E2E: fill → Alpine submit → admin-ajax → wp_e_submissions
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${WP_URL}/exjsx-form-e2e/`, { waitUntil: 'networkidle' });
    await page.fill('#f-name', 'Suite Tester');
    await page.fill('#f-email', 'suite@parity.test');
    await page.fill('#f-msg', 'Submitted by pro.test.mjs');
    await page.selectOption('select[name=industry]', 'Mining');
    await page.check('input[name=consent]');
    const [resp] = await Promise.all([
      // several things ping admin-ajax — match the FORM's request by its action param
      page.waitForResponse((x) => x.url().includes('admin-ajax') && (x.request().postData() || '').includes('elementor_pro_atomic_forms_send_form'), { timeout: 20000 }),
      page.click('button[type=submit]'),
    ]);
    // WORDPRESS_DEBUG stacks may prefix warnings to the ajax body — parse the trailing JSON
    const raw = await resp.text();
    const body = JSON.parse(raw.slice(raw.lastIndexOf('{"success')));
    assert.equal(body.success, true, `submission accepted: ${raw.slice(-200)}`);
  } finally { await browser.close(); }

  const row = dbq('SELECT form_name, status FROM wp_e_submissions ORDER BY id DESC LIMIT 1');
  assert.match(row, /exjsx-e2e-form\s+new/, 'submission row stored');
  const values = dbq('SELECT value FROM wp_e_submissions_values ORDER BY id DESC LIMIT 8');
  for (const v of ['Suite Tester', 'suite@parity.test', 'Submitted by pro.test.mjs', 'Mining']) {
    assert.ok(values.includes(v), `field value stored: ${v}`);
  }
});

test('theme parts: header+footer deploy as theme-builder templates and render SITE-WIDE (block theme)', skip, async () => {
  const { defineTheme } = await import('../../src/theme.mjs');
  const theme = defineTheme({ name: 'exjsx-tb', color: { ink: '#101418', paper: '#F6F4EF' } });
  const Bar = ({ label, tag }) => h('box', { tag, cls: 'tb-bar', dir: 'row', pad: [14, 24], gap: 12, bg: theme.color.ink, justify: 'space-between', align: 'center' },
    h('h4', { cls: 'tb-brand', color: '#ffffff', size: 17 }, label),
    h('text', { href: '/exjsx-tb-page/', color: '#C9C4BA', size: 14 }, 'Nav link'));
  const site = defineSite({
    name: 'exjsx-tb',
    theme,
    parts: {
      header: { node: h(Bar, { label: 'EXJSX-TB-HEADER', tag: 'header' }) },
      footer: { node: h(Bar, { label: 'EXJSX-TB-FOOTER', tag: 'footer' }) },
    },
    pages: [{ title: 'TB Page', slug: 'exjsx-tb-page', template: 'elementor_header_footer', node: h('section', { pad: [60, 24] }, h('h1', { size: 40 }, 'Body between parts')) }],
  });
  const b = compileSite(site);
  assert.equal(b.parts.length, 2);
  const r = await deployBundle(b);
  assert.equal(r.parts.length, 2);
  for (const p of r.parts) assert.match(p.action, /^(created|updated)$/, `${p.type}: ${p.action}`);
  assert.equal(r.partsWarning, undefined, 'conditions cache regenerated');

  // the page renders with header ABOVE body ABOVE footer — on the BLOCK theme (twentytwentyfive)
  const { status, html } = await renderedPage('exjsx-tb-page');
  assert.equal(status, 200);
  // match RENDERED elements (the body text also appears early in the auto meta description)
  const iH = html.search(/<h4[^>]*>[^<]*EXJSX-TB-HEADER/), iB = html.search(/<h1[^>]*>[^<]*Body between parts/), iF = html.search(/<h4[^>]*>[^<]*EXJSX-TB-FOOTER/);
  assert.ok(iH > -1, 'header rendered');
  assert.ok(iF > -1, 'footer rendered');
  assert.ok(iB > -1, 'body rendered');
  assert.ok(iH < iB && iB < iF, `order header(${iH}) < body(${iB}) < footer(${iF})`);
  assert.match(html, /data-elementor-type="header"/, 'Pro theme-builder header wrapper');
  assert.match(html, /class="[^"]*tb-bar[^"]*"/, 'parts use the SHARED class registry');

  // idempotent: re-deploy updates the same templates
  const r2 = await deployBundle(b);
  assert.deepEqual(r2.parts.map((p) => p.action), ['updated', 'updated']);
  assert.deepEqual(r2.parts.map((p) => p.id), r.parts.map((p) => p.id), 'template ids stable');

  // canvas pages stay part-free (canvas suppresses theme parts — verified fact)
  const { html: kitchenHtml } = await renderedPage('exjsx-pro-nav');
  assert.ok(!kitchenHtml.includes('EXJSX-TB-HEADER'), 'canvas template unaffected by parts');
});

test('dynamic tags + single template: a real post renders CMS-driven title/image/excerpt/date', skip, async () => {
  const { dyn } = kit;
  // a blog post with a featured image + excerpt
  const postId = wp('post', 'create', '--post_type=post', '--post_status=publish', '--post_title=Dyn E2E Post', '--post_excerpt=Excerpt via dynamic tag.', '--porcelain').trim();
  wp('post', 'meta', 'update', postId, '_thumbnail_id', '1583');

  const site = defineSite({
    name: 'exjsx-cms',
    pages: [{ title: 'CMS Home', slug: 'exjsx-cms-home', node: h('section', { pad: [40, 24] }, h('h1', { dyn: dyn.siteTitle(), size: 40 }), h('text', { dyn: dyn.siteTagline() })) }],
    parts: {
      single: { node: h('box', { tag: 'article', cls: 'cms-article', pad: [50, 24], gap: 14, maxw: 800, center: true },
        h('h1', { dyn: dyn.postTitle(), size: 42, cls: 'cms-title' }),
        h('img', { src: dyn.featuredImage(), w: '100%' }),
        h('text', { dyn: dyn.postExcerpt(), size: 16 }),
        h('text', { dyn: dyn.postDate(), size: 13, color: '#777777' }),
        h('text', { href: dyn.siteUrl(), color: '#7C3AED', weight: 600 }, 'Back to site')) },
    },
  });
  const b = compileSite(site);
  const r = await deployBundle(b);
  assert.equal(r.parts[0].type, 'single-post');
  assert.match(r.parts[0].action, /^(created|updated)$/);
  assert.equal(r.partsWarning, undefined);

  // the POST renders through our single template with every dynamic binding resolved
  const postHtml = await (await fetch(`${WP_URL}/?p=${postId}`)).text();
  assert.match(postHtml, /<h1[^>]*>[\s\S]{0,40}?Dyn E2E Post/, 'dynamic post-title in OUR h1');
  assert.match(postHtml, /class="[^"]*cms-article/, 'our template applied (shared class label)');
  assert.match(postHtml, /Excerpt via dynamic tag\./, 'dynamic excerpt');
  assert.match(postHtml, /<img[^>]*wp-content\/uploads/, 'dynamic featured image resolved from _thumbnail_id');
  assert.match(postHtml, /July \d+, \d{4}|20\d\d/, 'dynamic post-date formatted');
  assert.match(postHtml, /href="http:\/\/localhost:8915[^"]*"[^>]*>[\s\S]{0,20}?Back to site/, 'dynamic site-url link resolved');

  // the PAGE with site-level tags renders too
  const { html } = await renderedPage('exjsx-cms-home');
  assert.match(html, /<h1[^>]*>[\s\S]{0,40}?WPOS Stack/, 'dynamic site-title on a page');
});

test('collection loop: a blog-index page repeats the item template per post (experiment auto-enabled)', skip, async () => {
  const { dyn, loopGrid, S } = kit;
  for (const i of [1, 2, 3]) {
    wp('post', 'create', '--post_type=post', '--post_status=publish', `--post_title=Loop E2E ${i}`, `--post_excerpt=Loop excerpt ${i}`, '--porcelain');
  }
  const site = defineSite({
    name: 'exjsx-loop',
    pages: [{ title: 'Blog Index', slug: 'exjsx-loop-index', node: h('section', { pad: [50, 24] },
      h('h1', { size: 36 }, 'Latest posts'),
      loopGrid({ source: 'post', perPage: 3, layout: { display: S('grid'), 'grid-template-columns': S('repeat(3, 1fr)'), gap: kit.SZ(20) } }, [
        kit.heading('h3', dyn.postTitle()),
        kit.para(dyn.postExcerpt()),
      ])) }],
  });
  const r = await deployBundle(compileSite(site));
  assert.equal(r.loopExperiment, 'enabled', 'deploy auto-enabled the hidden experiment BEFORE saving');
  assert.match(r.pages[0].action, /^(created|updated)$/, 'loop page past the validator');
  const { status, html, cssFlat } = await renderedPage('exjsx-loop-index');
  assert.equal(status, 200);
  const titles = [...html.matchAll(/<h3[^>]*>([^<]*Loop E2E \d)/g)].map((m) => m[1].trim());
  assert.equal(titles.length, 3, `item template repeated per post (got ${titles.length})`);
  assert.deepEqual([...new Set(titles)].length, 3, 'each iteration resolved ITS OWN post title');
  assert.match(html, /Loop excerpt \d/, 'per-post excerpts resolved');
  assert.ok(cssFlat.includes('grid-template-columns:repeat(3,1fr)'), 'layout grid CSS emitted');
});

test('popup: parts.popup deploys with page_load trigger and OPENS as a visible dialog in a real browser', skip, async (t) => {
  let chromium;
  try { ({ chromium } = await import(PW)); } catch { return t.skip(`playwright not found at ${PW}`); }
  const site = defineSite({
    name: 'exjsx-pp',
    pages: [{ title: 'PP Page', slug: 'exjsx-pp-page', template: 'elementor_header_footer', node: h('section', { pad: [50, 24] }, h('h1', { size: 36 }, 'Page under popup')) }],
    parts: {
      popup: {
        node: h('box', { pad: 30, gap: 10, bg: '#ffffff', radius: 14 },
          h('h3', { size: 22 }, 'EXJSX-POPUP-OFFER'),
          h('text', { size: 14 }, 'Popup body copy.')),
        display: { pageLoad: 0 },
      },
    },
  });
  const b = compileSite(site);
  const popupPart = b.parts.find((p) => p.type === 'popup');
  assert.deepEqual(popupPart.display.triggers.page_load, { 0: 'yes', delay: 0 });
  const r = await deployBundle(b);
  assert.match(r.parts.find((p) => p.type === 'popup').action, /^(created|updated)$/, 'popup template deployed');

  const { html } = await renderedPage('exjsx-pp-page');
  assert.match(html, /EXJSX-POPUP-OFFER/, 'popup markup printed in the footer location');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${WP_URL}/exjsx-pp-page/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const el = [...document.querySelectorAll('h3')].find((x) => x.textContent === 'EXJSX-POPUP-OFFER');
      const modal = el && el.closest('.dialog-widget');
      return !!modal && getComputedStyle(modal).display !== 'none' && modal.offsetHeight > 0;
    }, null, { timeout: 15000 });
    const visible = await page.evaluate(() => {
      const el = [...document.querySelectorAll('h3')].find((x) => x.textContent === 'EXJSX-POPUP-OFFER');
      const modal = el.closest('.dialog-widget');
      return { display: getComputedStyle(modal).display, cls: modal.className.slice(0, 40) };
    });
    assert.equal(visible.display, 'flex', 'popup dialog OPEN on page load');
  } finally { await browser.close(); }
});

test('parity pipeline unchanged under Pro: labels + live var binding still emit', skip, async () => {
  const { defineTheme } = await import('../../src/theme.mjs');
  const theme = defineTheme({ name: 'exjsx-prochk', color: { main: '#0B6E4F' } });
  const node = h('section', { pad: [40, 20] }, h('h2', { cls: 'prochk-title', color: theme.color.main, size: 28 }, 'Pro parity check'));
  const b = compileSite(defineSite({ name: 'exjsx-prochk', theme, pages: [{ title: 'Pro Chk', slug: 'exjsx-pro-chk', node }] }));
  const r = await deployBundle(b);
  assert.match(r.pages[0].action, /^(created|updated)$/);
  const { html, cssFlat } = await renderedPage('exjsx-pro-chk');
  assert.match(html, /class="[^"]*prochk-title[^"]*"/, 'label class in markup — unchanged under Pro');
  assert.ok(cssFlat.includes('var(--exjsx-prochk-main'), 'live variable binding — unchanged under Pro');
  assert.ok(cssFlat.includes('--exjsx-prochk-main:#0B6E4F'), 'variable definition — unchanged under Pro');
});
