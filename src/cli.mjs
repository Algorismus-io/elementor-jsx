#!/usr/bin/env node
/** exjsx CLI — `build <entry.jsx> [out.bundle.json]` (offline) · `deploy <bundle.json>`. */
import { readFileSync as _rf, existsSync as _ex } from 'node:fs';
// auto-load .env (KEY=VALUE lines) from cwd or the project root, so build/deploy get WP creds + EXJSX_CLI
// without a manual `export`. Existing env vars win.
for (const _d of [process.cwd(), new URL('../', import.meta.url).pathname]) {
  try {
    if (_ex(_d + '/.env')) {
      for (const _l of _rf(_d + '/.env', 'utf8').split('\n')) {
        const _m = _l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (_m && !process.env[_m[1]]) process.env[_m[1]] = _m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  } catch { /* ignore */ }
}
import esbuild from 'esbuild';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileSite } from './compile.mjs';
import { deployBundle } from './deploy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const [cmd, arg, arg2] = process.argv.slice(2);

async function build(entry) {
  const res = await esbuild.build({
    entryPoints: [resolve(entry)], bundle: true, write: false, format: 'esm', platform: 'node',
    jsx: 'transform', jsxFactory: '_jsx', jsxFragment: '_Fragment', inject: [join(__dir, 'jsx-shim.mjs')],
    packages: 'external', logLevel: 'silent',
  });
  const tmp = join(mkdtempSync(join(tmpdir(), 'exjsx-b-')), 'entry.mjs');
  writeFileSync(tmp, res.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href);
  const site = mod.default;
  const bundle = compileSite(site);
  // --inline: make the page self-contained (no shared global-class registry) so many different designs
  // coexist on ONE WordPress + raw CSS renders on free Elementor via a <style> block. See inline.mjs.
  let inlineStats;
  if (process.argv.includes('--inline')) { const { inlineLocal } = await import('./inline.mjs'); inlineStats = inlineLocal(bundle); }
  const out = (arg2 && !arg2.startsWith('--')) ? arg2 : resolve(dirname(resolve(entry)), `${bundle.name}.bundle.json`);
  writeFileSync(out, JSON.stringify(bundle, null, 2));
  console.log(`built ${bundle.name}: ${bundle.pages.length} page(s), ${bundle.variableList.length} variables, ${bundle.fonts.length} fonts`);
  if (inlineStats) console.log(`  inline: ${inlineStats.inlined} styles inlined, ${inlineStats.rawRules} raw rules → <style>, registry emptied (${inlineStats.dropped} classes dropped)`);
  else console.log(`  dedup: ${bundle.stats.localStylesBefore} local styles → ${bundle.stats.sharedClasses} shared classes`);
  console.log(`  bundle → ${out}`);
  return out;
}

(async () => {
  if (cmd === 'build') { await build(arg); }
  else if (cmd === 'deploy') {
    const dry = process.argv.includes('--dry');
    const bundle = JSON.parse(readFileSync(resolve(arg), 'utf8'));
    const r = await deployBundle(bundle, { dry });
    if (dry) {
      console.log(`dry-run — would write ${Object.keys(bundle.variables.data).length} variables + ${bundle.classes.order.length} classes, and:`);
      r.pages.forEach((p) => console.log(`  ${p.action.toUpperCase().padEnd(6)} "${p.title}" (/${p.slug}/)${p.id ? ` → existing id ${p.id}` : ''}`));
    } else {
      console.log(`deployed: ${r.variables} variables + ${r.classes} classes (2 kit writes), ${r.pages.length} page(s)`);
      r.pages.forEach((p) => console.log(`  ${p.action} "${p.title}" → id ${p.id} (/${p.slug}/)`));
    }
  } else if (cmd === 'media') {
    const { sideloadManifest } = await import('./media.mjs');
    await sideloadManifest(arg || 'data/images.manifest.mjs', (arg2 && !arg2.startsWith('--')) ? arg2 : 'data/media-map.json');
  } else if (cmd === 'decompile') {
    // exjsx decompile <tree.json> [out.jsx] — invert any Elementor V4 _elementor_data → editable JSX
    const { decompile } = await import('./decompile.mjs');
    const tree = JSON.parse(readFileSync(resolve(arg), 'utf8'));
    const base = (arg.split('/').pop() || 'page').replace(/\.json$/, '');
    const name = base.replace(/[^a-z0-9]+/gi, ' ').replace(/(^|\s)\w/g, (m) => m.trim().toUpperCase()).replace(/\s/g, '') || 'Page';
    const src = decompile(Array.isArray(tree) ? tree : (tree.content || tree.elements || []), { name, slug: base });
    const out = (arg2 && !arg2.startsWith('--')) ? arg2 : resolve(dirname(resolve(arg)), `${base}.jsx`);
    writeFileSync(out, src);
    console.log(`decompiled ${base}: ${tree.length ?? '?'} top-level elements → ${src.split('\n').length} lines`);
    console.log(`  ${out}`);
  } else console.log('usage: exjsx build <entry.jsx> [out.json] [--inline] | deploy <bundle.json> [--dry] | media <manifest.mjs> [map.json] | decompile <tree.json> [out.jsx]');
})().catch((e) => { console.error(e.message); process.exit(1); });
