/**
 * deployBundle against a STUB WordPress (a real http server on an ephemeral port) — the two
 * behaviours from field report 1.9.1 that only a round-trip can prove:
 *
 *   #1a the capability gate runs BEFORE anything is written: an unregistered element type throws
 *       with ZERO POSTs — no document created, no kit touched. (1.9.1 created the post first.)
 *   #1b create + tree-save is ONE logical operation: a save that 422s rolls the just-created post
 *       back with DELETE …?force=true, so a retry finds a clean slate instead of an orphan. An
 *       EXISTING page is never deleted — it keeps its previous, good tree.
 *
 * wp-cli is deliberately pointed at a missing binary so every sh() lands in its graceful catch and
 * the run is pure REST (which is also the shape of a Playground / remote-host deploy).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { deployBundle } from '../../src/deploy.mjs';

const FREE_CAPS = {
  elementor_version: '4.2.1',
  pro_active: false,
  registered_types: {
    elements: ['e-div-block', 'e-flexbox', 'e-form', 'e-grid'],
    widgets: ['e-button', 'e-heading', 'e-image', 'e-paragraph'],
  },
};

/** a stub WP: records every request, answers the handful of routes a deploy touches. */
async function stubWp({ caps = FREE_CAPS, saveStatus = 200, existingPageId = null, deleteOk = true } = {}) {
  const log = [];
  const server = createServer((req, res) => {
    const [path, query = ''] = req.url.split('?');
    log.push(`${req.method} ${path}${query.includes('force=true') ? '?force=true' : ''}`);
    const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (path === '/wp-json/elementor-ultra/v1/site/capabilities') return json(200, { success: true, data: caps });
    if (path === '/wp-json/wp/v2/pages') return json(200, existingPageId ? [{ id: existingPageId }] : []);
    if (path === '/wp-json/elementor-ultra/v1/documents' && req.method === 'POST') return json(200, { data: { id: 4242 } });
    if (/\/documents\/\d+\/save$/.test(path)) {
      return saveStatus === 200
        ? json(200, { data: { base_hash: 'h1' } })
        : json(saveStatus, { code: 'unknown_element_type', message: 'Unknown type e-form-input is not registered on this site' });
    }
    if (/\/documents\/\d+\/prime-css$/.test(path)) return json(200, { ok: true });
    if (/^\/wp-json\/wp\/v2\/pages\/\d+$/.test(path) && req.method === 'DELETE') return json(deleteOk ? 200 : 500, { deleted: deleteOk });
    return json(200, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, log, close: () => new Promise((r) => server.close(r)) };
}

const tree = (widgetType) => [{ id: 'e0', elType: 'e-flexbox', settings: {}, styles: {}, elements: [{ id: 'e1', elType: 'widget', widgetType, settings: {}, styles: {}, elements: [] }] }];
const bundle = (widgetType = 'e-heading') => ({
  name: 'atom-t',
  pages: [{ title: 'Contact', slug: 'contact', elements: tree(widgetType) }],
  classes: { items: {}, order: [] },
  variables: { data: {}, watermark: 0, version: 1 },
});
const cfg = (url) => ({ wpUrl: url, wpcli: '__exjsx-test-no-wpcli__', fast: true });

test('deploy: the capability gate throws BEFORE any post is created (no orphan can exist)', async () => {
  const wp = await stubWp();
  try {
    await assert.rejects(() => deployBundle(bundle('e-form-input'), cfg(wp.url)), (e) => {
      assert.match(e.message, /deploy ABORTED before any page was created/);
      assert.match(e.message, /e-form-input × 1/);
      assert.match(e.message, /Elementor Pro/);
      return true;
    });
    assert.deepEqual(wp.log.filter((l) => l.startsWith('POST')), [], 'ZERO writes — the gate is the first thing that runs');
    assert.equal(wp.log.some((l) => l.includes('/documents')), false);
  } finally { await wp.close(); }
});

test('deploy: --allow-unregistered bypasses the gate (the escape hatch still deploys)', async () => {
  const wp = await stubWp();
  try {
    const r = await deployBundle(bundle('e-form-input'), { ...cfg(wp.url), allowUnregistered: true });
    assert.equal(r.capabilityCheck, 'skipped — --allow-unregistered');
    assert.equal(r.pages[0].action, 'created');
  } finally { await wp.close(); }
});

test('deploy: a registered bundle passes the gate and reports what was verified', async () => {
  const wp = await stubWp();
  try {
    const r = await deployBundle(bundle('e-heading'), cfg(wp.url));
    assert.match(r.capabilityCheck, /^2 element type\(s\) registered on the target$/);
    assert.equal(r.pages[0].action, 'created');
    assert.equal(r.elementorVersion, '4.2.1', 'the SAME probe still supplies the version adapters');
  } finally { await wp.close(); }
});

test('deploy: a site that cannot report registered_types SKIPS the gate rather than blocking', async () => {
  const wp = await stubWp({ caps: { elementor_version: '4.1.4' } });
  try {
    const r = await deployBundle(bundle('e-form-input'), cfg(wp.url));
    assert.match(r.capabilityCheck, /skipped — the site did not report registered_types/);
    assert.match(r.capabilityCheck, /upgrade the elementor-ultra-mcp companion plugin/);
    assert.equal(r.pages[0].action, 'created');
  } finally { await wp.close(); }
});

/* ── atomicity: create + save is ONE operation ── */

test('deploy: a 422 tree save DELETES the just-created post — no orphan for the retry to trip on', async () => {
  const wp = await stubWp({ saveStatus: 422 });
  try {
    const r = await deployBundle(bundle('e-heading'), cfg(wp.url));
    assert.equal(wp.log.filter((l) => l === 'DELETE /wp-json/wp/v2/pages/4242?force=true').length, 1, 'force=true skips the trash so the slug is free');
    assert.deepEqual(r.orphansRolledBack, [{ slug: 'contact', id: '4242', deleted: true }]);
    const page = r.pages[0];
    assert.equal(page.id, null, 'nothing survives on the target, so the report must not hand back an id');
    assert.match(page.action, /^ERR save 422: /);
    assert.match(page.action, /Unknown type e-form-input is not registered on this site/, "the validator's message reaches the author");
    assert.match(page.action, /the just-created page was DELETED \(no orphan left behind\)/);
  } finally { await wp.close(); }
});

test('deploy: a failed rollback says so, with the page id to clean up by hand', async () => {
  const wp = await stubWp({ saveStatus: 422, deleteOk: false });
  try {
    const r = await deployBundle(bundle('e-heading'), cfg(wp.url));
    assert.deepEqual(r.orphansRolledBack, [{ slug: 'contact', id: '4242', deleted: false }]);
    assert.match(r.pages[0].action, /could not roll back the just-created page 4242; delete it manually/);
  } finally { await wp.close(); }
});

test('deploy: an EXISTING page is never deleted by a failed save — it keeps its previous tree', async () => {
  const wp = await stubWp({ saveStatus: 422, existingPageId: 77 });
  try {
    const r = await deployBundle(bundle('e-heading'), cfg(wp.url));
    assert.equal(wp.log.some((l) => l.startsWith('DELETE')), false);
    assert.equal(r.orphansRolledBack, undefined);
    assert.equal(r.pages[0].id, '77', 'the id stays — the page is still there, with its old tree');
    assert.match(r.pages[0].action, /^ERR save 422: /);
  } finally { await wp.close(); }
});
