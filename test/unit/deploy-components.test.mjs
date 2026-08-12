/**
 * SPEC 2.0 phase 2 — deploy route ladder for components: native route first, on 403/404 the
 * ultra-mcp controller (`elementor-ultra/v1/components`), inline expansion only as the LAST resort;
 * plus the new UPDATE path (`PUT /components/{id}/elements`) for title-match-with-changed-uid
 * redeploys. All offline: global fetch is a URL-routing mock; wp-cli is absent (every sh() call
 * lands in its graceful catch). planComponents' `updatable` option is covered pure.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { deployBundle, planComponents } from '../../src/deploy.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h } from '../../src/runtime.mjs';
import { defineComponent } from '../../src/component.mjs';
import { resetIds, allNodes, byWidget, textOf } from '../helpers.mjs';

const WP = 'http://mock.test';
const realFetch = global.fetch;
let calls;   // [{method, url, body}] — the wire log every test asserts against

beforeEach(() => { resetIds(); calls = []; process.env.WP_USER = 'admin'; process.env.WP_APP_PASSWORD = 'pw'; });
afterEach(() => { global.fetch = realFetch; });

const res = (status, json) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => json,
  text: async () => JSON.stringify(json),
});

/** Install a routing mock: handlers = [[method, urlSubstring, responderFn(body)]...] first-match wins. */
function mockFetch(handlers) {
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, url: String(url), body });
    for (const [m, sub, fn] of handlers) {
      if (m === method && String(url).includes(sub)) return fn(body, url);
    }
    // benign defaults for the non-component machinery (capabilities probe, page routes)
    if (String(url).includes('/site/capabilities')) return res(200, { success: true, data: { elementor_version: '4.2.1' } });
    return res(404, { code: 'not_found' });
  };
}

/** A bundle with ONE registered component + one page carrying an instance. */
function makeBundle(headline = 'Grow faster') {
  const Card = defineComponent(
    ({ h1 = headline }) => h('box', { pad: 24 }, h('h2', {}, h1)),
    { title: 'Ladder Card', props: { h1: { label: 'Headline' } } },
  );
  return compileSite(defineSite({ name: 't', pages: [{ title: 'a', slug: 'a', node: h(Card, {}) }] }));
}

const NATIVE = '/wp-json/elementor/v1/components';
const ULTRA = '/wp-json/elementor-ultra/v1/components';
const componentCalls = () => calls.filter((c) => c.url.includes('/components'));

/* ── planComponents `updatable` (pure) ── */

test('planComponents: updatable routes title-match-with-changed-uid to `update` with NO stale warning', () => {
  const locals = [{ uid: 'x-new', title: 'Card', elements: [], settings: {}, treeHash: 'h2' }];
  const remote = [{ id: 22, uid: 'x-old', name: 'Card' }];
  const p = planComponents(locals, remote, { updatable: true });
  assert.deepEqual(p.update.map((u) => [u.uid, u.id, u.deployedUid]), [['x-new', 22, 'x-old']]);
  assert.equal(p.update[0].local, locals[0], 'the local component rides along for the PUT body');
  assert.deepEqual(p.reuse, []);
  assert.deepEqual(p.warnings, [], 'no stale warning — the update route handles it');
  // default (native-only) keeps the v1 semantics exactly
  const v1 = planComponents(locals, remote);
  assert.equal(v1.reuse[0].action, 'reused-stale');
  assert.equal(v1.update.length, 0);
  assert.match(v1.warnings[0], /instances keep rendering the DEPLOYED tree/);
});

/* ── the free-tier ladder ── */

test('deploy: native POST 403 → ultra route creates; instances rewritten with the ultra-minted id', async () => {
  const bundle = makeBundle();
  const uid = bundle.components[0].uid;
  let ultraStore = [];
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: ultraStore })],                     // native LIST is edit_posts — works on free
    ['POST', NATIVE, () => res(403, { code: 'insufficient_permissions', message: 'no' })],
    ['GET', ULTRA, () => res(200, { success: true, data: ultraStore })],
    ['POST', ULTRA, (body) => {
      ultraStore = body.items.map((it, i) => ({ id: 900 + i, name: it.title, title: it.title, uid: it.uid, isArchived: false }));
      return res(201, { success: true, data: Object.fromEntries(body.items.map((it, i) => [it.uid, 900 + i])) });
    }],
  ]);
  const report = await deployBundle({ ...bundle, pages: [] }, { wpUrl: WP });
  assert.match(String(report.componentsRoute), /^ultra \(native POST 403 insufficient_permissions/);
  assert.deepEqual(report.components, [{ uid, title: 'Ladder Card', id: 900, action: 'created' }]);
  assert.equal(report.componentWarnings, undefined, 'the designed path is not a warning');
  // wire order: native list → native POST (403) → ultra probe list → ultra POST → ultra re-list
  const seq = componentCalls().map((c) => `${c.method} ${c.url.includes('elementor-ultra') ? 'ultra' : 'native'}`);
  assert.deepEqual(seq, ['GET native', 'POST native', 'GET ultra', 'POST ultra', 'GET ultra']);
});

test('deploy: instances in pages are rewritten with the created id (free-tier path)', async () => {
  const bundle = makeBundle();
  let ultraStore = [];
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: ultraStore })],
    ['POST', NATIVE, () => res(403, { code: 'insufficient_permissions' })],
    ['GET', ULTRA, () => res(200, { success: true, data: ultraStore })],
    ['POST', ULTRA, (body) => {
      ultraStore = body.items.map((it, i) => ({ id: 900 + i, title: it.title, uid: it.uid }));
      return res(201, { success: true, data: {} });
    }],
    // page machinery: no existing page → create → save → prime → slug
    ['GET', '/wp/v2/pages', () => res(200, [])],
    ['POST', '/documents/77/save', () => res(200, { success: true, data: { base_hash: 'x' } })],
    ['POST', '/documents/77/prime-css', () => res(200, { success: true, data: {} })],
    ['POST', '/documents', () => res(200, { success: true, data: { id: 77 } })],
    ['POST', '/wp/v2/pages/77', () => res(200, {})],
  ]);
  const report = await deployBundle(bundle, { wpUrl: WP, fast: true });
  assert.equal(report.pages[0].action, 'created');
  const saved = calls.find((c) => c.url.includes('/documents/77/save'));
  const inst = allNodes(saved.body.elements).find((n) => n.widgetType === 'e-component');
  assert.equal(inst.settings.component_instance.value.component_id.value, 900, 'page instance carries the ultra-minted id');
  assert.equal(report.componentsExpanded, undefined, 'NOT inline-expanded');
});

test('deploy: no ultra route (404) → inline expansion stays the last resort', async () => {
  const bundle = makeBundle();
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: [] })],
    ['POST', NATIVE, () => res(403, { code: 'insufficient_permissions', message: 'insufficient_permissions' })],
    ['GET', ULTRA, () => res(404, { code: 'rest_no_route' })],
    ['GET', '/wp/v2/pages', () => res(200, [])],
    ['POST', '/documents/77/save', () => res(200, { success: true, data: {} })],
    ['POST', '/documents/77/prime-css', () => res(200, { success: true, data: {} })],
    ['POST', '/documents', () => res(200, { success: true, data: { id: 77 } })],
    ['POST', '/wp/v2/pages/77', () => res(200, {})],
  ]);
  const report = await deployBundle(bundle, { wpUrl: WP, fast: true });
  assert.equal(report.componentsExpanded, 1);
  assert.match(report.componentWarnings[0], /INLINE EXPANSION/);
  const saved = calls.find((c) => c.url.includes('/documents/77/save'));
  assert.equal(allNodes(saved.body.elements).some((n) => n.widgetType === 'e-component'), false, 'expanded');
  assert.equal(textOf(allNodes(saved.body.elements).find(byWidget('e-heading'))), 'Grow faster');
});

test('deploy: ultra route answers 501 EXPERIMENT_INACTIVE → inline expansion + the experiments named', async () => {
  const bundle = makeBundle();
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: [] })],
    ['POST', NATIVE, () => res(403, { code: 'insufficient_permissions', message: 'insufficient_permissions' })],
    ['GET', ULTRA, () => res(501, { code: 'EXPERIMENT_INACTIVE', message: 'activate e_components + e_atomic_elements' })],
  ]);
  const report = await deployBundle({ ...bundle, pages: [] }, { wpUrl: WP });
  assert.equal(report.componentsExpanded, 1);
  assert.match(report.componentWarnings[0], /create → 403 insufficient_permissions/);
});

test('deploy: native LIST unavailable but ultra advertises → whole phase runs through ultra', async () => {
  const bundle = makeBundle();
  let ultraStore = [];
  mockFetch([
    ['GET', NATIVE, () => res(404, { code: 'rest_no_route' })],
    ['GET', ULTRA, () => res(200, { success: true, data: ultraStore })],
    ['POST', ULTRA, (body) => {
      ultraStore = body.items.map((it, i) => ({ id: 300 + i, title: it.title, uid: it.uid }));
      return res(201, { success: true, data: {} });
    }],
  ]);
  const report = await deployBundle({ ...bundle, pages: [] }, { wpUrl: WP });
  assert.equal(report.componentsRoute, 'ultra');
  assert.equal(report.components[0].action, 'created');
  assert.equal(report.components[0].id, 300);
  assert.equal(componentCalls().some((c) => c.method === 'POST' && !c.url.includes('elementor-ultra')), false, 'no native POST attempted');
});

/* ── the update path ── */

test('deploy: stale component + ultra available → PUT /components/{id}/elements with elements + settings', async () => {
  const bundle = makeBundle('CHANGED HEADLINE');
  const local = bundle.components[0];
  // remote: same title, different uid (the deployed tree is older), native-writable site (Pro)
  const remote = [{ id: 55, uid: 'x-deployed-old', name: 'Ladder Card', isArchived: false }];
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: remote })],
    ['GET', ULTRA, () => res(200, { success: true, data: remote })],
    ['PUT', `${ULTRA}/55/elements`, () => res(200, { success: true, data: { id: 55, uid: local.uid, saved: true } })],
  ]);
  const report = await deployBundle({ ...bundle, pages: [] }, { wpUrl: WP });
  assert.deepEqual(report.components, [{ uid: local.uid, title: 'Ladder Card', id: 55, action: 'updated' }]);
  assert.equal(report.componentWarnings, undefined, 'no stale warning — the tree was actually updated');
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put.url.endsWith(`${ULTRA}/55/elements`));
  assert.ok(Array.isArray(put.body.elements) && put.body.elements.length, 'full tree in the body');
  assert.ok(put.body.settings.overridable_props.props.h1, 'registry rides along');
  assert.equal(put.body.uid, local.uid, 'the NEW uid re-stamps the deployed fingerprint (else every redeploy re-PUTs)');
  // the PUT tree still carries the overridable envelope (definition shape, not a page tree)
  const head = allNodes(put.body.elements).find(byWidget('e-heading'));
  assert.equal(head.settings.title.$$type, 'overridable');
  assert.equal(head.settings.title.value.origin_value.value.content.value, 'CHANGED HEADLINE');
});

test('deploy: stale component + NO ultra route → v1 warn-and-reuse semantics (WARN kept)', async () => {
  const bundle = makeBundle('CHANGED');
  const local = bundle.components[0];
  const remote = [{ id: 55, uid: 'x-deployed-old', name: 'Ladder Card' }];
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: remote })],
    ['GET', ULTRA, () => res(404, { code: 'rest_no_route' })],
  ]);
  const report = await deployBundle({ ...bundle, pages: [] }, { wpUrl: WP });
  assert.deepEqual(report.components, [{ uid: local.uid, title: 'Ladder Card', id: 55, action: 'reused-stale' }]);
  assert.match(report.componentWarnings[0], /local tree CHANGED since last deploy/);
  assert.match(report.componentWarnings[0], /install\/upgrade the elementor-ultra-mcp plugin/);
  assert.equal(calls.some((c) => c.method === 'PUT'), false, 'no PUT attempted');
});

test('deploy: update 422 aborts verbatim (dangling trees are worse than a failed deploy)', async () => {
  const bundle = makeBundle('CHANGED');
  const remote = [{ id: 55, uid: 'x-deployed-old', name: 'Ladder Card' }];
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: remote })],
    ['GET', ULTRA, () => res(200, { success: true, data: remote })],
    ['PUT', `${ULTRA}/55/elements`, () => res(422, { code: 'non_atomic_element_in_component', message: 'Components require atomic elements only.' })],
  ]);
  await assert.rejects(
    deployBundle({ ...bundle, pages: [] }, { wpUrl: WP }),
    /update of "Ladder Card" rejected \(422 non_atomic_element_in_component\)/,
  );
});

test('deploy: update non-422 failure degrades to reused-stale for THAT component only', async () => {
  const bundle = makeBundle('CHANGED');
  const remote = [{ id: 55, uid: 'x-deployed-old', name: 'Ladder Card' }];
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: remote })],
    ['GET', ULTRA, () => res(200, { success: true, data: remote })],
    ['PUT', `${ULTRA}/55/elements`, () => res(500, { code: 'INTERNAL_ERROR', message: 'boom' })],
  ]);
  const report = await deployBundle({ ...bundle, pages: [] }, { wpUrl: WP });
  assert.equal(report.components[0].action, 'reused-stale');
  assert.match(report.componentWarnings[0], /update of "Ladder Card" .*failed \(500/);
});

test('deploy: --dry reports creates/updates/reuses without a single write', async () => {
  const bundle = makeBundle('CHANGED');
  const remote = [{ id: 55, uid: 'x-deployed-old', name: 'Ladder Card' }];
  mockFetch([
    ['GET', NATIVE, () => res(200, { data: remote })],
  ]);
  const report = await deployBundle({ ...bundle, pages: [] }, { wpUrl: WP, dry: true });
  assert.equal(report.componentsDry, 'would create 0 component(s), update 1 (ultra route), reuse 0');
  assert.deepEqual(report.components[0], { uid: bundle.components[0].uid, title: 'Ladder Card', id: 55, action: 'update' });
  assert.equal(calls.some((c) => c.method !== 'GET'), false, 'reads only');
});
