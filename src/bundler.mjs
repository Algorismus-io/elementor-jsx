/**
 * bundler.mjs — the ONE place esbuild is configured (cli build/watch + tests share it).
 *
 * Two authoring affordances live here:
 *   1. AUTO-USING: prelude.mjs is injected alongside the jsx shim, so entries use the curated
 *      authoring surface as free variables with no imports (see prelude.mjs).
 *   2. SHORTHAND IMPORTS: bare `elementor-jsx` / `elementor-jsx/<sub>` specifiers resolve to
 *      this package's sources WITHOUT node_modules — entries build from anywhere on disk. The
 *      resolver reads package.json `exports` so cli resolution can never drift from npm
 *      resolution (single source of truth).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORTS = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).exports;

/** Resolve 'elementor-jsx[/<sub>]' (or the scoped '@algorismus/elementor-jsx[/<sub>]') via the
 * package.json exports map. Both specifiers work so a project can import by the bare convention
 * or by the published package name. Throws naming valid subpaths. */
export function resolveSpecifier(spec) {
  const m = spec.match(/^(?:@algorismus\/)?elementor-jsx(\/.*)?$/);
  if (!m) return null;
  const key = '.' + (m[1] ?? '');
  const target = EXPORTS[key];
  if (!target) throw new Error(`elementor-jsx: unknown subpath "${spec}" — valid: ${Object.keys(EXPORTS).map((k) => 'elementor-jsx' + k.slice(1)).join(', ')}`);
  return join(PKG_ROOT, target);
}

const exjsxResolver = {
  name: 'exjsx-resolver',
  setup(b) {
    b.onResolve({ filter: /^elementor-jsx(\/|$)/ }, (args) => ({ path: resolveSpecifier(args.path) }));
  },
};

/** Canonical esbuild options for an exjsx entry. */
export function buildOptions(entryPath) {
  const src = join(PKG_ROOT, 'src');
  return {
    entryPoints: [entryPath], bundle: true, write: false, format: 'esm', platform: 'node',
    jsx: 'transform', jsxFactory: '_jsx', jsxFragment: '_Fragment',
    inject: [join(src, 'jsx-shim.mjs'), join(src, 'prelude.mjs')],
    plugins: [exjsxResolver],
    packages: 'external', logLevel: 'silent',
  };
}
