/**
 * deployBundle against a STUB WordPress whose class store sits at Elementor's cap. Field report
 * 2.2.1: on a multi-project site the merge (2.2.0) preserved every resident, so the tenth landing
 * page's PUT was refused with global_classes_limit_exceeded and the page landed unstyled; agents
 * then "fixed" it with --inline for every later page. Contract under test:
 *   - when the merged order would exceed the cap, residents that the usage scan reports as used by
 *     NO document are pruned before the PUT; used residents and our own ids are never touched;
 *   - --prune-unused does the same below the cap;
 *   - a failing usage read prunes nothing (the PUT then reports the real error).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { deployBundle, GLOBAL_CLASS_CAP } from '../../src/deploy.mjs';

/** a resident the PUBLISHED-only usage scan reports as dead, but a DRAFT page still references */
const DRAFT_REF = 'g-r1';

const CAPS = { elementor_version: '4.2.4', pro_active: false, registered_types: { elements: ['e-flexbox'], widgets: ['e-heading'] } };
const variants = (color) => [{ meta: { breakpoint: 'desktop', state: null }, props: { color: { $$type: 'color', value: color } } }];

/** a store of `n` residents, every third one used by a live document */
function resident(n) {
  const items = {}; const usage = {};
  for (let i = 0; i < n; i++) {
    const id = `g-r${i}`;
    items[id] = { id, label: `r${i}`, type: 'class', variants: variants('#111111') };
    usage[id] = i % 3 === 0 ? { total: 1, pages: [{ post_id: 7, count: 1 }] } : { total: 0, pages: [] };
  }
  return { items, order: Object.keys(items), usage };
}

async function stubWp({ store, usageStatus = 200 }) {
  const log = []; let put = null;
  const server = createServer((req, res) => {
    const [path] = req.url.split('?');
    log.push(`${req.method} ${path}`);
    const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (path === '/wp-json/elementor-ultra/v1/site/capabilities') return json(200, { success: true, data: CAPS });
    if (path === '/wp-json/wp/v2/pages') return json(200, []);
    if (path === '/wp-json/elementor/v1/global-classes' && req.method === 'GET') return json(200, { data: store.order.map((id) => ({ id, label: store.items[id].label })) });
    if (path === '/wp-json/elementor/v1/global-classes' && req.method === 'PUT') {
      let body = ''; req.on('data', (c) => { body += c; });
      return req.on('end', () => {
        put = JSON.parse(body);
        // Elementor's route is a DIFF-PUT: it applies changes.{added,deleted,modified}, so an id that
        // merely vanished from `order` is kept. Mirror that so a prune that forgets changes.deleted fails here.
        const kept = new Set(store.order.filter((id) => !put.changes.deleted.includes(id)));
        put.effective = put.order.filter((id) => kept.has(id) || put.changes.added.includes(id)).length + [...kept].filter((id) => !put.order.includes(id)).length;
        json(put.effective > GLOBAL_CLASS_CAP ? 400 : 200, { ok: put.effective <= GLOBAL_CLASS_CAP });
      });
    }
    if (path === '/wp-json/elementor-ultra/v1/design/classes') return json(200, { data: { items: store.order.map((id) => store.items[id]), next_cursor: '' } });
    if (path === '/wp-json/elementor-ultra/v1/documents' && req.method === 'GET') return json(200, { data: { items: [{ id: 7, status: 'publish' }, { id: 8, status: 'draft' }], next_cursor: null } });
    if (path === '/wp-json/elementor-ultra/v1/documents/8') return json(200, { data: { elements: [{ id: 'x', settings: { classes: { $$type: 'classes', value: [DRAFT_REF] } }, elements: [] }] } });
    if (path === '/wp-json/elementor-ultra/v1/design/classes/usage') return json(usageStatus, usageStatus === 200 ? { data: { usage: store.usage } } : { code: 'nope' });
    if (path === '/wp-json/elementor-ultra/v1/documents' && req.method === 'POST') return json(200, { data: { id: 4242 } });
    if (/\/documents\/\d+\/save$/.test(path)) return json(200, { data: { base_hash: 'h1' } });
    if (/\/documents\/\d+\/prime-css$/.test(path)) return json(200, { ok: true });
    return json(200, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, log, put: () => put, close: () => new Promise((r) => server.close(r)) };
}

const bundle = (n = 3) => {
  const items = {}; for (let i = 0; i < n; i++) items[`g-mine-${i}`] = { id: `g-mine-${i}`, label: `mine-${i}`, type: 'class', variants: variants('#222222') };
  return {
    name: 'cap-t',
    pages: [{ title: 'Home', slug: 'home', elements: [{ id: 'e0', elType: 'e-flexbox', settings: { classes: { $$type: 'classes', value: Object.keys(items) } }, styles: {}, elements: [] }] }],
    classes: { items, order: Object.keys(items) },
    variables: { data: {}, watermark: 0, version: 1 },
  };
};
const cfg = (url, extra = {}) => ({ wpUrl: url, wpcli: '__exjsx-test-no-wpcli__', fast: true, ...extra });

test('deploy: at the cap, unused residents are pruned so the PUT fits; used residents and our ids survive', async () => {
  const store = resident(GLOBAL_CLASS_CAP - 1);        // 999 residents + 3 of ours = 1002 > cap
  const wp = await stubWp({ store });
  try {
    const r = await deployBundle(bundle(3), cfg(wp.url));
    const put = wp.put();
    assert.ok(put, 'a PUT was made');
    assert.ok(put.effective <= GLOBAL_CLASS_CAP, `effective store ${put.effective} fits the cap`);
    assert.equal(put.changes.deleted.length, store.order.filter((id) => store.usage[id].total === 0).length - 1, 'every dead resident (bar the draft ref) is named in changes.deleted');
    const used = store.order.filter((id) => store.usage[id].total > 0);
    for (const id of used) assert.ok(put.order.includes(id), `used resident ${id} kept`);
    for (const id of bundle(3).classes.order) assert.ok(put.order.includes(id), `own id ${id} kept`);
    assert.ok(put.order.includes(DRAFT_REF), 'a resident referenced only by a DRAFT page survives the prune');
    assert.equal(put.order.length, used.length + 1 + 3, 'exactly the used residents + the draft ref + ours remain');
    assert.match(r.classesPruned, /unused resident class\(es\) pruned/);
    assert.equal(r.classes, 3);
  } finally { await wp.close(); }
});

test('deploy: below the cap nothing is pruned unless --prune-unused asks for it', async () => {
  const store = resident(30);
  const wp = await stubWp({ store });
  try {
    const r1 = await deployBundle(bundle(3), cfg(wp.url));
    assert.equal(wp.put().order.length, 33, 'merge keeps every resident');
    assert.equal(r1.classesPruned, undefined);
    const r2 = await deployBundle(bundle(3), cfg(wp.url, { pruneUnused: true }));
    const used = store.order.filter((id) => store.usage[id].total > 0).length;
    assert.equal(wp.put().order.length, used + 1 + 3, '--prune-unused drops the dead residents (draft ref kept)');
    assert.match(r2.classesPruned, /pruned/);
  } finally { await wp.close(); }
});

test('deploy: a failing usage read prunes NOTHING — the store is never guessed at', async () => {
  const store = resident(GLOBAL_CLASS_CAP - 1);
  const wp = await stubWp({ store, usageStatus: 500 });
  try {
    const r = await deployBundle(bundle(3), cfg(wp.url));
    assert.equal(wp.put().order.length, GLOBAL_CLASS_CAP + 2, 'every resident still in the PUT');
    assert.equal(r.classesPruned, undefined);
    assert.match(String(r.classes), /^ERR 400/, 'the real error surfaces');
  } finally { await wp.close(); }
});
