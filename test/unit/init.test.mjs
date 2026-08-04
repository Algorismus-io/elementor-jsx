/** exjsx init — scaffolds a buildable fs-project and refuses to clobber. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../../src/cli.mjs', import.meta.url).pathname;

test('init: scaffold builds to a valid bundle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-init-'));
  execFileSync('node', [CLI, 'init', join(dir, 'demo')], { encoding: 'utf8' });
  for (const f of ['theme.mjs', 'site.config.mjs', 'pages/home.page.jsx']) {
    assert.ok(existsSync(join(dir, 'demo', f)), `${f} scaffolded`);
  }
  execFileSync('node', [CLI, 'build', join(dir, 'demo')], { encoding: 'utf8' });
  const bundle = JSON.parse(readFileSync(join(dir, 'demo', 'demo.bundle.json'), 'utf8'));
  assert.equal(bundle.pages.length, 1);
  assert.equal(bundle.pages[0].slug, 'home');
});

test('init: refuses to overwrite an existing project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exjsx-init-'));
  execFileSync('node', [CLI, 'init', join(dir, 'demo')], { encoding: 'utf8' });
  assert.throws(() => execFileSync('node', [CLI, 'init', join(dir, 'demo')], { encoding: 'utf8', stdio: 'pipe' }));
});
