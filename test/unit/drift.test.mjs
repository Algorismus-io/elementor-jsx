/**
 * drift.mjs — the pure hand-edit drift detection core (canonicalHash / decideDrift / shortHash),
 * plus source-level plumbing meta-assertions on the deploy/cli integration (the wp-cli paths the
 * unit suite cannot execute live — same technique as coverage-audit.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash, decideDrift, shortHash } from '../../src/drift.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('canonicalHash: stable under key reorder at every depth', () => {
  const pairs = [
    [{ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }],
    [
      { id: 'x1', elType: 'widget', widgetType: 'e-heading', settings: { title: 'Hi', classes: ['g-a'] }, styles: { s1: { variants: [] } } },
      { styles: { s1: { variants: [] } }, settings: { classes: ['g-a'], title: 'Hi' }, widgetType: 'e-heading', elType: 'widget', id: 'x1' },
    ],
    [
      { variants: [{ meta: { breakpoint: 'desktop', state: null }, props: { color: '#fff' } }] },
      { variants: [{ props: { color: '#fff' }, meta: { state: null, breakpoint: 'desktop' } }] },
    ],
  ];
  for (const [a, b] of pairs) assert.equal(canonicalHash(a), canonicalHash(b));
});

test('canonicalHash: array (sibling) order is significant', () => {
  assert.notEqual(canonicalHash([{ id: 'x' }, { id: 'y' }]), canonicalHash([{ id: 'y' }, { id: 'x' }]));
  assert.notEqual(canonicalHash({ a: 1 }), canonicalHash({ a: 2 }));
});

test('canonicalHash: WP round-trip forms hash equal (string, double-encoded, unicode escapes)', () => {
  const T = [{ id: 'a', settings: { title: 'café' } }];
  const h = canonicalHash(T);
  assert.equal(canonicalHash(JSON.stringify(T)), h);
  assert.equal(canonicalHash(JSON.stringify(JSON.stringify(T))), h);
  assert.equal(canonicalHash('[{"id":"a","settings":{"title":"caf\\u00e9"}}]'), h);
});

test('canonicalHash: empty data → null; garbage throws naming _elementor_data', () => {
  assert.equal(canonicalHash(''), null);
  assert.equal(canonicalHash(null), null);
  assert.equal(canonicalHash(undefined), null);
  assert.throws(() => canonicalHash('{nope'), /_elementor_data/);
});

test('canonicalHash: emits 64-char lowercase hex, regression vector pinned', () => {
  const h = canonicalHash({ b: 1, a: [2] });
  assert.match(h, /^[0-9a-f]{64}$/);
  // pinned at implementation time — a change means the canonical serialization changed (all stamps invalidate)
  assert.equal(h, '63c9663de90ee828bbda6cd9acf02d0c653986c1ec25aa239920641edc9a1de5');
});

test('decideDrift: full decision matrix', () => {
  const rows = [
    { in: { stamped: null, current: 'x', force: false }, out: { proceed: true, drifted: false, reason: 'first-stamp' } },
    { in: { stamped: 'x', current: 'x', force: false }, out: { proceed: true, drifted: false, reason: 'clean' } },
    { in: { stamped: 'x', current: 'y', force: false }, out: { proceed: false, drifted: true, reason: 'drifted-skip' } },
    { in: { stamped: 'x', current: null, force: false }, out: { proceed: false, drifted: true, reason: 'drifted-skip' } },
    { in: { stamped: 'x', current: 'y', force: true }, out: { proceed: true, drifted: true, reason: 'drifted-forced' } },
    { in: { stamped: null, current: null, force: true }, out: { proceed: true, drifted: false, reason: 'first-stamp' } },
  ];
  for (const row of rows) assert.deepEqual(decideDrift(row.in), row.out);
});

test('shortHash: 10-char prefix, null-safe', () => {
  assert.equal(shortHash('ab'.repeat(32)), 'ababababab');
  assert.equal(shortHash(null), '(none)');
  assert.equal(shortHash(undefined), '(none)');
});

test('plumbing: cli deploy verb passes --force and deploy skips BEFORE the save call', () => {
  const cli = readFileSync(join(root, 'src', 'cli.mjs'), 'utf8');
  const deployBranch = cli.slice(cli.indexOf("cmd === 'deploy'"), cli.indexOf("cmd === 'watch'"));
  assert.match(deployBranch, /--force/, 'deploy verb parses --force');
  const usage = cli.split('\n').find((l) => l.includes('| deploy <bundle.json>'));
  assert.match(usage, /\[--force\]/, 'usage string documents --force');

  const dep = readFileSync(join(root, 'src', 'deploy.mjs'), 'utf8');
  const skipAt = dep.indexOf("'skipped-drifted'");
  assert.ok(skipAt > -1, 'skipped-drifted report entry exists');
  const continueAt = dep.indexOf('continue', skipAt);
  const saveAt = dep.indexOf('/save');
  assert.ok(continueAt > -1 && saveAt > -1 && continueAt < saveAt, 'drifted skip continues BEFORE the /save fetch');
  assert.match(dep, /maxBuffer/, 'drift meta read raises maxBuffer above the 1 MiB execFileSync default');
  assert.match(dep, /get_post_meta\([^)]*'_exjsx_hash'/, 'stamp read eval');
  assert.match(dep, /update_post_meta\([^)]*'_exjsx_hash'/, 'stamp write eval');
});
