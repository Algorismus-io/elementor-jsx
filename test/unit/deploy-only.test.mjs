/**
 * --only single-page patch mode — planOnly is PURE (filter + validate + warn, zero I/O), so the
 * whole contract is table-testable offline; CLI-level tests cover flag parsing and dry composition.
 * CLI tests must NOT assert create-vs-update verbs: cli.mjs auto-loads .env and may GET a live WP,
 * so the verb is environment-dependent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planOnly } from '../../src/deploy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (args) => execFileSync('node', [join(root, 'src', 'cli.mjs'), ...args], { encoding: 'utf8' });

const mk = (over = {}) => ({
  name: 'only-t',
  pages: [
    { title: 'Alpha', slug: 'alpha', elements: [] },
    { title: 'Beta', slug: 'beta', elements: [] },
    { title: 'About Us', elements: [] },
  ],
  classes: { items: { 'g-x': {} }, order: ['g-x', 'g-y'] },
  variables: { data: {}, watermark: 0, version: 1 },
  ...over,
});

test('planOnly: no filter → all pages, no skip, no warnings', () => {
  const b = mk();
  assert.deepEqual(planOnly(b, undefined), { pages: b.pages, skipKit: false, warnings: [] });
  assert.deepEqual(planOnly(b, []), { pages: b.pages, skipKit: false, warnings: [] });
});

test('planOnly: single slug → that page only, kit skipped, exact lag warning', () => {
  const b = mk();
  assert.deepEqual(planOnly(b, ['beta']), {
    pages: [b.pages[1]],
    skipKit: true,
    warnings: ['--only: shared class registry (2 classes) NOT updated — styles may lag; run a full deploy without --only to sync'],
  });
});

test('planOnly: multi-slug preserves BUNDLE order, not --only order', () => {
  const b = mk();
  assert.deepEqual(planOnly(b, ['beta', 'alpha']).pages, [b.pages[0], b.pages[1]]);
});

test('planOnly: page without explicit slug matches via slugify(title)', () => {
  const b = mk();
  assert.deepEqual(planOnly(b, ['about-us']).pages, [b.pages[2]]);
});

test('planOnly: duplicate entries dedupe', () => {
  const b = mk();
  const pages = planOnly(b, ['alpha', 'alpha']).pages;
  assert.equal(pages.length, 1);
  assert.deepEqual(pages, [b.pages[0]]);
});

test('planOnly: unknown slug fails loudly naming it and listing available slugs', () => {
  const b = mk();
  assert.throws(() => planOnly(b, ['bogus']), /unknown slug\(s\) bogus.*alpha, beta, about-us/);
});

test('planOnly: empty entry fails with usage fix', () => {
  const b = mk();
  assert.throws(() => planOnly(b, ['alpha', '']), /--only: empty slug entry.*exjsx deploy/);
});

test('planOnly: inline bundle (empty registry) skips kit with NO warning (skip logic shared with --inline)', () => {
  const b = mk({ classes: { items: {}, order: [] } });
  assert.deepEqual(planOnly(b, ['alpha']), { pages: [b.pages[0]], skipKit: true, warnings: [] });
});

test('planOnly: pure — bundle object untouched', () => {
  const b = mk();
  const before = JSON.stringify(b);
  planOnly(b, ['alpha']);
  assert.equal(JSON.stringify(b), before);
});

// ---- CLI level ----------------------------------------------------------------------------------

const bfile = join(mkdtempSync(join(tmpdir(), 'exjsx-only-')), 'b.json');
writeFileSync(bfile, JSON.stringify(mk()));

test('cli deploy --only with no value exits nonzero with usage fix', () => {
  assert.throws(() => run(['deploy', bfile, '--only']), /--only requires a value/);
});

test('cli deploy --only unknown-slug fails before any deploy work', () => {
  assert.throws(() => run(['deploy', bfile, '--only', 'bogus']), /unknown slug\(s\) bogus/);
});

test('cli deploy --dry --only lists exactly the named page and reports kit skip', () => {
  const out = run(['deploy', bfile, '--dry', '--only', 'alpha']);
  assert.match(out, /kit writes skipped/);
  assert.match(out, /alpha/);
  assert.doesNotMatch(out, /beta/);
});
