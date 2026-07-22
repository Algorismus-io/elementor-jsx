/**
 * COVERAGE AUDIT (meta-test) — keeps feature-parity coverage at 100% BY CONSTRUCTION:
 *   1. every public export of the kit + src modules must be referenced somewhere in the suite
 *   2. every sx() shorthand key must appear in the sx matrix test
 * Add an export or an sx key without touching the tests → this fails with its name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULES = [
  join(root, '..', '.claude', 'skills', 'elementor-ultra', 'lib', 'kit.mjs'),
  join(root, '..', '.claude', 'skills', 'elementor-ultra', 'lib', 'kit-components.mjs'),
  ...readdirSync(join(root, 'src')).filter((f) => f.endsWith('.mjs')).map((f) => join(root, 'src', f)),
  join(root, 'src', 'components', 'index.jsx'),
];

const corpus = (() => {
  let s = '';
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!['corpus', 'baselines'].includes(e.name)) walk(join(d, e.name)); }
      else if (/\.(mjs|jsx)$/.test(e.name)) s += readFileSync(join(d, e.name), 'utf8');
    }
  };
  walk(join(root, 'test'));
  return s;
})();

const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:const|function|async function)\s+([A-Za-z0-9_]+)|export\s*\{([^}]+)\}/g)) {
    if (m[1]) names.add(m[1]);
    else for (let part of m[2].split(',')) {
      part = part.trim();
      if (part.includes(' as ')) part = part.split(' as ')[1].trim();
      if (part) names.add(part);
    }
  }
  return names;
};

test('every public export is exercised by the suite (add a test when you add an export)', () => {
  const missing = [];
  for (const path of MODULES) {
    let src; try { src = readFileSync(path, 'utf8'); } catch { continue; }
    for (const name of exportsOf(src)) {
      if (!new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(corpus)) {
        missing.push(`${path.split('/').pop()} → ${name}`);
      }
    }
  }
  assert.deepEqual(missing, [], `untested exports:\n  ${missing.join('\n  ')}`);
});

test('every sx() shorthand key appears in the sx matrix test (parity language fully covered)', () => {
  const kc = readFileSync(join(root, '..', '.claude', 'skills', 'elementor-ultra', 'lib', 'kit-components.mjs'), 'utf8');
  const body = kc.slice(kc.indexOf('export function sx'), kc.indexOf('/* Ensure a flex-ROW'));
  const keys = [...new Set([...body.matchAll(/\bo\.([a-zA-Z]+)\b/g)].map((m) => m[1]))];
  const sxTest = readFileSync(join(root, 'test', 'unit', 'sx.test.mjs'), 'utf8');
  const missing = keys.filter((k) => !new RegExp(`[{,\\s'"]${k}\\s*[:}]`).test(sxTest));
  assert.ok(keys.length >= 33, `sx surface sanity (${keys.length} keys)`);
  assert.deepEqual(missing, [], `sx keys missing from the matrix: ${missing.join(', ')}`);
});

test('every runtime intrinsic special prop is exercised (tag/dir/raw/href/id/alt/cls/gcls)', () => {
  const rt = readFileSync(join(root, 'src', 'runtime.mjs'), 'utf8');
  const destructure = rt.match(/const \{ ([^}]+) \} = props;/);
  assert.ok(destructure, 'intrinsic prop destructure found');
  const props = destructure[1].split(',').map((s) => s.trim().split(':')[0].trim()).filter((s) => s && !s.startsWith('...'));
  const missing = props.filter((p) => !new RegExp(`[{,\\s'"]${p}\\s*[:}]`).test(corpus));
  assert.deepEqual(missing, [], `intrinsic props never exercised: ${missing.join(', ')}`);
});
