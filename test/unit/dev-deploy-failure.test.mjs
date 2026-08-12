/**
 * `exjsx dev` and deploy FAILURES (field report 1.9.1 #2).
 *
 * The dev loop called `await deployBundle(...)` and dropped the report on the floor. deployBundle
 * records a rejected tree save as `action: 'ERR save 422: …'` on the page entry — one bad page must
 * not abort the others — so nothing threw, and the loop printed "deployed" while the page never
 * changed. It happened twice in a row with the validator's message nowhere on screen.
 *
 * Contract now: a failed save reads exactly like a failed BUILD — the error event (red dot +
 * overlay), a FAILING gates pill, the full validator text in the dev log, and `prev` NOT advanced
 * so the next save retries instead of diffing against a state that never landed.
 *
 * Driven against a stub WordPress on an ephemeral port; the dev server itself binds an ephemeral
 * port too, so this test can never collide with a running dev loop.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dev } from '../../src/dev.mjs';

const CAPS = {
  elementor_version: '4.2.1', pro_active: false,
  registered_types: { elements: ['e-div-block', 'e-flexbox', 'e-grid'], widgets: ['e-button', 'e-heading', 'e-image', 'e-paragraph'] },
};

/** stub WP whose /save verdict is flippable mid-test. */
async function stubWp() {
  const state = { saveStatus: 200 };
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (path === '/wp-json/elementor-ultra/v1/site/capabilities') return json(200, { success: true, data: CAPS });
    if (path === '/wp-json/wp/v2/pages') return json(200, [{ id: 51 }]);
    if (/\/documents\/\d+\/save$/.test(path)) {
      return state.saveStatus === 200
        ? json(200, { data: { base_hash: 'h1' } })
        : json(state.saveStatus, { code: 'invalid_value', message: 'settings.title: invalid_value' });
    }
    return json(200, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const HOME = (copy) => `export default () => <box pad={0}><h1>Dev</h1><text>${copy}</text></box>;\n`;
function project(copy = 'one') {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-devtest-'));
  mkdirSync(join(dir, 'pages'));
  writeFileSync(join(dir, 'pages', 'home.page.jsx'), HOME(copy));
  return dir;
}

/** collect SSE frames from the dev preview server until `until` matches or the deadline passes. */
async function sse(port, until, ms = 20000) {
  const res = await fetch(`http://127.0.0.1:${port}/events`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const frames = [];
  const deadline = Date.now() + ms;
  let buf = '';
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const line of buf.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      frames.push(JSON.parse(line.slice(6)));
    }
    buf = '';
    if (frames.some(until)) break;
  }
  reader.cancel().catch(() => {});
  return frames;
}

test('dev: a deploy that 422s on the FIRST cycle refuses to start (1.9.1 started, saying "deployed")', async () => {
  const wp = await stubWp();
  wp.state.saveStatus = 422;
  const prevUrl = process.env.WP_URL;
  process.env.WP_URL = wp.url;
  const errs = [];
  const realErr = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    await assert.rejects(() => dev(project(), { port: 0 }), /initial build\/deploy failed/);
    const line = errs.find((e) => e.includes('[dev] ✖'));
    assert.ok(line, 'the dev log carries the failure');
    assert.match(line, /deploy FAILED \(1\)/);
    assert.match(line, /ERR save 422/);
    assert.match(line, /settings\.title: invalid_value/, "the validator's own message is on screen");
    assert.equal(errs.some((e) => /deployed/.test(e)), false);
  } finally {
    console.error = realErr;
    if (prevUrl === undefined) delete process.env.WP_URL; else process.env.WP_URL = prevUrl;
    await wp.close();
  }
});

test('dev: a 422 on a LATER save sends error + a FAILING gates pill, never a reload', async () => {
  const wp = await stubWp();
  const dir = project('one');
  const prevUrl = process.env.WP_URL;
  process.env.WP_URL = wp.url;
  const logs = [];
  const realLog = console.log; const realErr = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  let server;
  try {
    server = await dev(dir, { port: 0 });                     // first cycle succeeds
    const port = server.address().port;
    assert.ok(logs.some((l) => /\[dev\] full deploy/.test(l)), 'the good cycle reported a deploy');

    wp.state.saveStatus = 422;                                // now break the target
    const frames = sse(port, (f) => f.type === 'error');
    setTimeout(() => writeFileSync(join(dir, 'pages', 'home.page.jsx'), HOME('two')), 400);
    const got = await frames;

    const err = got.find((f) => f.type === 'error');
    assert.ok(err, `expected an error frame, got ${JSON.stringify(got.map((f) => f.type))}`);
    assert.equal(err.title, 'deploy failed', 'the overlay must not read "build failed" — the build was fine');
    assert.match(err.message, /deploy FAILED \(1\)/);
    assert.match(err.message, /settings\.title: invalid_value/);
    const gate = got.find((f) => f.type === 'gate');
    assert.ok(gate && gate.state === 'fail', 'the gates pill goes red on a failed deploy');
    assert.match(gate.detail, /deploy 1 error\(s\)/);
    assert.equal(got.some((f) => f.type === 'reload'), false, 'nothing reloads — the page never changed');
    assert.ok(logs.some((l) => /\[dev\] ✖ deploy FAILED/.test(l)), 'and it lands in the dev log too');
  } finally {
    console.log = realLog; console.error = realErr;
    server?.close();
    if (prevUrl === undefined) delete process.env.WP_URL; else process.env.WP_URL = prevUrl;
    await wp.close();
  }
});

test('dev: the preview shell renders the error title it is sent (deploy failed ≠ build failed)', () => {
  const shell = readFileSync(new URL('../../src/dev.mjs', import.meta.url), 'utf8');
  assert.match(shell, /status\.textContent=m\.title\|\|'build failed'/);
});
