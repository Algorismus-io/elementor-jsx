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
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileSite } from './compile.mjs';
import { deployBundle, shouldWriteVariables } from './deploy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const [cmd, arg, arg2] = process.argv.slice(2);

async function build(entry) {
  // fs-project mode: a DIRECTORY entry is discovered (pages/, parts/, theme.mjs — see
  // src/project.mjs + CONVENTIONS.md §1) and a defineSite entry is synthesized into tmp.
  let entryPath = resolve(entry);
  const { statSync } = await import('node:fs');
  const isProject = statSync(entryPath).isDirectory();
  const outDir = isProject ? entryPath : dirname(entryPath);
  if (isProject) {
    const { discoverProject, synthesizeEntry } = await import('./project.mjs');
    const manifest = discoverProject(entryPath);
    const src = synthesizeEntry(manifest);
    entryPath = join(mkdtempSync(join(tmpdir(), 'exjsx-p-')), 'site.entry.mjs');
    writeFileSync(entryPath, src);
    console.log(`project ${manifest.name}: ${manifest.pages.length} page file(s)${manifest.parts.length ? `, parts: ${manifest.parts.map((p) => p.type).join('+')}` : ''}${manifest.themeFile ? ', theme' : ''}`);
  }
  const { buildOptions } = await import('./bundler.mjs');
  const res = await esbuild.build(buildOptions(entryPath));
  const tmp = join(mkdtempSync(join(tmpdir(), 'exjsx-b-')), 'entry.mjs');
  writeFileSync(tmp, res.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href);
  const site = mod.default;
  const bundle = compileSite(site);
  // --inline: make the page self-contained (no shared global-class registry) so many different designs
  // coexist on ONE WordPress + raw CSS renders on free Elementor via a <style> block. See inline.mjs.
  let inlineStats;
  if (process.argv.includes('--inline')) { const { inlineLocal } = await import('./inline.mjs'); inlineStats = inlineLocal(bundle); }
  const out = (arg2 && !arg2.startsWith('--')) ? arg2 : resolve(outDir, `${bundle.name}.bundle.json`);
  writeFileSync(out, JSON.stringify(bundle, null, 2));
  console.log(`built ${bundle.name}: ${bundle.pages.length} page(s), ${bundle.variableList.length} variables, ${bundle.fonts.length} fonts`);
  if (inlineStats) console.log(`  inline: ${inlineStats.inlined} styles inlined, ${inlineStats.rawRules} raw rules → <style>, registry emptied (${inlineStats.dropped} classes dropped)`);
  else console.log(`  dedup: ${bundle.stats.localStylesBefore} local styles → ${bundle.stats.sharedClasses} shared classes`);
  console.log(`  bundle → ${out}`);
  return out;
}

(async () => {
  if (cmd === 'build') { await build(arg); }
  else if (cmd === 'dev') {
    if (!arg) { console.error('usage: exjsx dev <project-dir> [--port 4477] [--gates]  (WP_URL/WP_USER/WP_APP_PASSWORD env; --gates runs the eu-studio check on changed pages after each save)'); process.exit(2); }
    const pi = process.argv.indexOf('--port');
    const { dev } = await import('./dev.mjs');
    await dev(arg, { port: pi !== -1 ? Number(process.argv[pi + 1]) : 4477, gates: process.argv.includes('--gates') });
    await new Promise(() => {}); // hold the process for the watcher
  }
  else if (cmd === 'deploy') {
    const dry = process.argv.includes('--dry');
    const force = process.argv.includes('--force');
    const fast = process.argv.includes('--fast');
    const ownClasses = process.argv.includes('--own-classes');
    // --only=a,b OR --only a,b (value = next token, must exist and not be a flag)
    let only;
    const onlyEq = process.argv.find((a) => a.startsWith('--only='));
    if (onlyEq) only = onlyEq.slice('--only='.length).split(',');
    else {
      const oi = process.argv.indexOf('--only');
      if (oi !== -1) {
        const v = process.argv[oi + 1];
        if (!v || v.startsWith('--')) throw new Error('--only requires a value: exjsx deploy <bundle> --only <slug[,slug]>');
        only = v.split(',');
      }
    }
    const bundle = JSON.parse(readFileSync(resolve(arg), 'utf8'));
    const r = await deployBundle(bundle, { dry, force, only, fast, ownClasses });
    // --only warnings (class-registry lag) surface in BOTH dry and real mode, on stderr
    for (const w of r.warnings || []) console.error(`WARN: ${w}`);
    if (dry) {
      // summary-line precedence: --only kit-skip > inline variables rewrite > default
      if (only) console.log(`dry-run (--only) — kit writes skipped, would deploy ${r.pages.length} page(s):`);
      else {
        // a themed --inline bundle still carries populated variables.data — report the actual skip
        const varMsg = shouldWriteVariables(bundle)
          ? `${Object.keys(bundle.variables.data).length} variables`
          : '0 variables (inline — kit untouched)';
        console.log(`dry-run — would write ${varMsg} + ${bundle.classes.order.length} classes, and:`);
      }
      r.pages.forEach((p) => console.log(`  ${p.action.toUpperCase().padEnd(6)} "${p.title}" (/${p.slug}/)${p.id ? ` → existing id ${p.id}` : ''}`));
    } else {
      if (r.kitSkipped) console.log(`deployed (--only): kit skipped, ${r.pages.length} page(s)`);
      else console.log(`deployed: ${r.variables} variables + ${r.classes} classes (2 kit writes), ${r.pages.length} page(s)`);
      if (r.classesMerged) console.error(`WARN: ${r.classesMerged}`);
      r.pages.forEach((p) => console.log(`  ${p.action} "${p.title}" → id ${p.id} (/${p.slug}/)`));
      const drifted = r.pages.filter((p) => p.action === 'skipped-drifted');
      if (drifted.length) console.error(`⚠ ${drifted.length} page(s) SKIPPED (drifted — hand-edited outside exjsx): ${drifted.map((p) => `/${p.slug}/`).join(', ')}. Re-run with --force to overwrite.`);
    }
  } else if (cmd === 'watch') {
    // exjsx watch <entry.jsx> [--deploy] — rebuild on change; optional auto-deploy of the bundle.
    if (!arg) { console.error('usage: exjsx watch <entry.jsx> [--deploy]'); process.exit(2); }
    const { watch, statSync: _st } = await import('node:fs');
    const dir = _st(resolve(arg)).isDirectory() ? resolve(arg) : dirname(resolve(arg));
    const doDeploy = process.argv.includes('--deploy');
    let running = false, queued = false;
    const rebuild = async () => {
      if (running) { queued = true; return; }
      running = true;
      const t0 = Date.now();
      try {
        const out = await build(arg);
        if (doDeploy) {
          const r = await deployBundle(JSON.parse(readFileSync(out, 'utf8')));
          console.log(`  deployed ${r.pages.length} page(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        }
      } catch (e) { console.error(`  ✗ ${String(e.message).split('\n')[0]}`); }
      running = false;
      if (queued) { queued = false; rebuild(); }
    };
    await rebuild();
    console.log(`watching ${dir} …`);
    let t = null;
    watch(dir, { recursive: true }, (_ev, f) => {
      if (!/\.(jsx|mjs|json)$/.test(f || '') || String(f).includes('.bundle.json')) return;
      clearTimeout(t); t = setTimeout(rebuild, 150);   // debounce editor bursts
    });
    await new Promise(() => {});                       // stay alive
  } else if (cmd === 'media') {
    // exjsx media <manifest.mjs> [map.json] — hash-cached asset sideloading. Fail with usage,
    // not a raw ERR_MODULE_NOT_FOUND, when the manifest is missing.
    const manifest = arg || 'data/images.manifest.mjs';
    if (!_ex(resolve(manifest))) {
      console.error(`usage: exjsx media <manifest.mjs> [map.json]\n  manifest not found: ${resolve(manifest)}`);
      process.exit(2);
    }
    const { sideloadManifest } = await import('./media.mjs');
    await sideloadManifest(manifest, (arg2 && !arg2.startsWith('--')) ? arg2 : 'data/media-map.json');
  } else if (cmd === 'decompile') {
    // exjsx decompile <tree.json> [out.jsx] — invert any Elementor V4 _elementor_data → editable JSX
    const { decompile } = await import('./decompile.mjs');
    const tree = JSON.parse(readFileSync(resolve(arg), 'utf8'));
    const base = basename(arg).replace(/\.json$/, '') || 'page';
    const name = base.replace(/[^a-z0-9]+/gi, ' ').replace(/(^|\s)\w/g, (m) => m.trim().toUpperCase()).replace(/\s/g, '') || 'Page';
    const src = decompile(Array.isArray(tree) ? tree : (tree.content || tree.elements || []), { name, slug: base });
    const out = (arg2 && !arg2.startsWith('--')) ? arg2 : resolve(dirname(resolve(arg)), `${base}.jsx`);
    writeFileSync(out, src);
    console.log(`decompiled ${base}: ${tree.length ?? '?'} top-level elements → ${src.split('\n').length} lines`);
    console.log(`  ${out}`);
  } else if (cmd === 'inspect') {
    // exjsx inspect <bundle.json> [--page <slug>] [--el <id>] — read-only, offline (no WP creds needed)
    const usage = () => { console.error('usage: exjsx inspect <bundle.json> [--page <slug>] [--el <id>]'); process.exit(2); };
    if (!arg || arg.startsWith('--')) usage();
    const opts = {};
    for (const flag of ['--page', '--el']) {
      const i = process.argv.indexOf(flag);
      if (i === -1) continue;
      const v = process.argv[i + 1];
      if (!v || v.startsWith('--')) usage();
      opts[flag.slice(2)] = v;
    }
    const { inspectBundle } = await import('./inspect.mjs');
    const bundle = JSON.parse(readFileSync(resolve(arg), 'utf8'));
    console.log(inspectBundle(bundle, opts));
  } else if (cmd === 'lint') {
    // exjsx lint <entry.jsx|bundle.json> [--strict] — conventions check (see CONVENTIONS.md).
    // errors always fail; --strict also fails on warnings (CI gate).
    if (!arg || arg.startsWith('--')) { console.error('usage: exjsx lint <entry.jsx|bundle.json> [--strict]'); process.exit(2); }
    const { lintBundle, formatLint } = await import('./lint.mjs');
    const bundle = arg.endsWith('.json')
      ? JSON.parse(readFileSync(resolve(arg), 'utf8'))
      : JSON.parse(readFileSync(await build(arg), 'utf8'));
    const r = lintBundle(bundle);
    console.log(formatLint(r));
    const strict = process.argv.includes('--strict');
    if (r.counts.error || (strict && r.counts.warn)) process.exit(1);
  } else if (cmd === 'init') {
    // exjsx init [dir] — scaffold a minimal fs-project (theme + config + one page + one part).
    const { mkdirSync, existsSync } = await import('node:fs');
    const dir = resolve(arg || 'site');
    if (existsSync(join(dir, 'theme.mjs'))) { console.error(`exjsx init: ${dir}/theme.mjs already exists — refusing to overwrite`); process.exit(2); }
    mkdirSync(join(dir, 'pages'), { recursive: true });
    mkdirSync(join(dir, 'parts'), { recursive: true });
    // basename is cross-platform (handles \\ on Windows); sanitize so the value is safe to embed
    // in the generated theme/config string literals (a raw Windows path like D:\\new project would
    // otherwise inject \\n/\\t escapes).
    const name = (basename(dir) || 'my-site').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-site';
    writeFileSync(join(dir, 'site.config.mjs'), `export default { name: '${name}' };\n`);
    writeFileSync(join(dir, 'theme.mjs'), `/** Design tokens — every page receives these as \`theme\`. */
export default defineTheme({
  name: '${name}',
  color: {
    ink: '#1A1A2E',      // display text
    primary: '#2563EB',  // links, buttons
    accent: '#F59E0B',   // highlights
    paper: '#FAFAF7',    // page background
    muted: '#5B616E',    // body copy
    white: '#FFFFFF',
  },
  font: { head: 'Fraunces', body: 'Inter' },

  // 'literal' emits colors/fonts as hex/name directly — renders on every Elementor version.
  // Switch to 'var' for LIVE binding (edits in Elementor's Class Manager propagate), but note
  // var-mode text needs Elementor to resolve the variables — on 4.1.x that path can silently
  // drop text color/font, leaving pages unstyled. Start literal; opt into var when you need it.
  mode: 'literal',
});
`);
    writeFileSync(join(dir, 'pages', 'home.page.jsx'), `/** Homepage — slug comes from the filename. */
export const meta = {
  title: 'Home',
  seo: { title: '${name}', description: 'Built with elementor-jsx.' },
};

export default ({ theme: t }) => (
  <box tw="flex flex-col w-full items-center" pad={0} bg={t.color.paper}>
    <section tw="flex flex-col items-center gap-6 w-full max-w-[960px] px-6 py-28 text-center">
      {/* Google fonts named via font= props load natively (Elementor enqueues them) — no fontLoader() needed */}
      <heading tag="h1" w="100%" size={64} weight={600} font={t.font.head} color={t.color.ink} mobile={{ size: 40 }}>
        Hello, Elementor.
      </heading>
      <text size={17} font={t.font.body} color={t.color.muted} lh={1.65} maxw={520}>
        This page is compiled from pages/home.page.jsx. Edit it, run the build, deploy, repeat.
      </text>
    </section>
  </box>
);
`);
    console.log(`scaffolded ${dir}/\n  theme.mjs · site.config.mjs · pages/home.page.jsx\n\nnext:\n  exjsx build ${arg || 'site'}\n  WP_URL=… WP_USER=… WP_APP_PASSWORD=… exjsx deploy ${arg || 'site'}/${name}.bundle.json`);
  } else if (cmd === 'api') {
    // the one-page API card — agents read THIS instead of grepping the source (field reality:
    // every fresh agent spent ~4-5 min source-diving for signatures before this existed)
    const { readFileSync: rf } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    console.log(rf(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'API-CARD.md'), 'utf8'));
  } else console.log('usage: exjsx init [dir] | api | build <entry.jsx|project-dir> [out.json] [--inline] | deploy <bundle.json> [--dry] [--only <slug[,slug]>] [--force] | lint <entry.jsx|bundle.json> [--strict] | media <manifest.mjs> [map.json] | decompile <tree.json> [out.jsx] | inspect <bundle.json> [--page <slug>] [--el <id>]');
})().catch((e) => { console.error(e.message); process.exit(1); });
