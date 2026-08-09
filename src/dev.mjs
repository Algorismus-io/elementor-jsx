/**
 * dev.mjs — `exjsx dev <project>`: the live loop. Watch the fs-project, rebuild on save
 * (milliseconds), deploy ONLY what the bundle diff says changed, and reload a local preview
 * iframe over SSE. The pixels are always Elementor's own server render — this is a preview of
 * the REAL page, not a simulation.
 *
 * The one correctness subtlety is the deploy strategy. `--only <slug>` skips kit writes, so a
 * shared-class/variable change deployed page-only silently never lands (field incident: a fix
 * agent's width classes vanished until a full deploy). The bundle diff decides:
 *   pages-only change  → deployBundle({only: changedSlugs})   (~2-5s to pixels)
 *   kit change         → full deployBundle({fast})            (~8-15s, classes + collateral prime)
 *
 * Build errors (the sx/enum/unit throws) surface in the overlay INSTEAD of a failed deploy —
 * the whole point of throwing at build time.
 */
import { createServer } from 'node:http';
import { watch, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { compileSite } from './compile.mjs';
import { deployBundle } from './deploy.mjs';

async function buildProject(projectDir) {
  const { discoverProject, synthesizeEntry } = await import('./project.mjs');
  const manifest = discoverProject(projectDir);
  const entryPath = join(mkdtempSync(join(tmpdir(), 'exjsx-dev-')), 'site.entry.mjs');
  writeFileSync(entryPath, synthesizeEntry(manifest));
  const { buildOptions } = await import('./bundler.mjs');
  const res = await esbuild.build(buildOptions(entryPath));
  const tmp = join(mkdtempSync(join(tmpdir(), 'exjsx-dev-b-')), `entry-${Date.now()}.mjs`);
  writeFileSync(tmp, res.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  return compileSite(mod.default);
}

/** Diff SIGNATURES, captured from a fresh build BEFORE deploy — deployBundle mutates the bundle
 * in place (version adapters rewrite spans/emails/classes for the target Elementor), so keeping
 * the deployed object as `prev` makes every save look like a kit change (found on first run:
 * three pure copy edits, three full deploys). */
const signature = (b) => ({
  kit: JSON.stringify([b.classes, b.variables, b.fonts]),
  pages: new Map(b.pages.map((p) => [p.slug, JSON.stringify(p)])),
});
function diffSig(prev, next) {
  if (!prev) return { kitChanged: true, changedSlugs: [...next.pages.keys()] };
  const kitChanged = prev.kit !== next.kit;
  const changedSlugs = [...next.pages.keys()].filter((slug) => prev.pages.get(slug) !== next.pages.get(slug));
  // a REMOVED page leaves orphan classes — let the kit pass reconcile
  const removed = [...prev.pages.keys()].some((slug) => !next.pages.has(slug));
  return { kitChanged: kitChanged || removed, changedSlugs };
}

const SHELL = (wpUrl, pages, port) => `<!doctype html><html><head><meta charset="utf-8"><title>exjsx dev</title>
<style>
  *{margin:0;box-sizing:border-box} body{font:13px -apple-system,sans-serif;background:#0d0d12;color:#e8e8ee;height:100vh;display:flex;flex-direction:column}
  .bar{display:flex;align-items:center;gap:14px;padding:8px 14px;background:#131318;border-bottom:1px solid #ffffff14;flex:none}
  .dot{width:9px;height:9px;border-radius:50%;background:#4ade80;flex:none}
  .dot.busy{background:#fbbf24;animation:pulse .8s infinite alternate} .dot.err{background:#f87171}
  @keyframes pulse{to{opacity:.4}}
  .name{font-weight:600} .status{color:#86868b;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  select{background:#1c1c22;color:#e8e8ee;border:1px solid #ffffff22;border-radius:6px;padding:4px 8px;font:inherit}
  iframe{flex:1;border:0;width:100%;background:#fff}
  .overlay{display:none;position:fixed;left:16px;right:16px;bottom:16px;background:#2a1215;border:1px solid #f8717155;border-radius:10px;padding:14px 18px;font-family:ui-monospace,monospace;font-size:12.5px;color:#fecaca;white-space:pre-wrap;max-height:40vh;overflow:auto}
  .overlay.on{display:block}
</style></head><body>
<div class="bar"><span class="dot" id="dot"></span><span class="name">exjsx dev</span>
<select id="page">${pages.map((slug) => `<option value="/${slug === 'home' ? '' : slug + '/'}">${slug}</option>`).join('')}</select>
<span class="status" id="status">watching…</span></div>
<iframe id="frame" src="${wpUrl}/"></iframe>
<div class="overlay" id="overlay"></div>
<script>
const frame=document.getElementById('frame'),dot=document.getElementById('dot'),status=document.getElementById('status'),overlay=document.getElementById('overlay'),pageSel=document.getElementById('page');
pageSel.onchange=()=>{frame.src=${JSON.stringify(wpUrl)}+pageSel.value};
const es=new EventSource('/events');
es.onmessage=(e)=>{
  const m=JSON.parse(e.data);
  if(m.type==='building'){dot.className='dot busy';status.textContent='building…';}
  if(m.type==='reload'){dot.className='dot';overlay.className='overlay';status.textContent=m.note;try{frame.contentWindow.location.reload()}catch{frame.src=frame.src}}
  if(m.type==='error'){dot.className='dot err';status.textContent='build failed';overlay.textContent=m.message;overlay.className='overlay on';}
};
</script></body></html>`;

export async function dev(projectDir, { port = 4477 } = {}) {
  const dir = resolve(projectDir);
  const wpUrl = (process.env.WP_URL || '').replace(/\/$/, '');
  if (!wpUrl) throw new Error('exjsx dev: set WP_URL (and WP_USER/WP_APP_PASSWORD) — the preview shows the real deployed page');

  const clients = new Set();
  const send = (msg) => { const line = `data: ${JSON.stringify(msg)}\n\n`; for (const res of clients) res.write(line); };

  let prev = null;
  let busy = false;
  let queued = false;

  async function cycle(reason) {
    if (busy) { queued = true; return; }
    busy = true;
    send({ type: 'building' });
    const t0 = Date.now();
    try {
      const bundle = await buildProject(dir);
      const sig = signature(bundle); // BEFORE deploy — see the mutation note above
      const { kitChanged, changedSlugs } = diffSig(prev, sig);
      let note;
      if (!kitChanged && changedSlugs.length === 0) {
        note = `no effective change (${Date.now() - t0}ms)`;
      } else if (kitChanged) {
        await deployBundle(bundle, { fast: true });
        note = `full deploy (kit changed) · ${bundle.pages.length} page(s) · ${Date.now() - t0}ms`;
      } else {
        await deployBundle(bundle, { fast: true, only: changedSlugs });
        note = `deployed ${changedSlugs.join(', ')} · ${Date.now() - t0}ms`;
      }
      prev = sig;
      send({ type: 'reload', note: `${note} · ${reason}` });
      console.log(`[dev] ${note}`);
    } catch (e) {
      send({ type: 'error', message: String(e.message || e) });
      console.error(`[dev] build failed: ${e.message}`);
    }
    busy = false;
    if (queued) { queued = false; cycle('queued change'); }
  }

  // initial build + full deploy so the preview starts truthful
  await cycle('startup');
  if (!prev) throw new Error('exjsx dev: initial build failed — fix the error above and rerun');

  const server = createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(SHELL(wpUrl, [...prev.pages.keys()], port));
  });
  server.listen(port);
  console.log(`[dev] preview → http://127.0.0.1:${port}  (site ${wpUrl})`);

  // debounce: editors fire several events per save; bundle artifacts must not self-trigger
  let timer = null;
  watch(dir, { recursive: true }, (_event, file) => {
    if (!file || !/\.(mjs|jsx|js|json)$/.test(file)) return;
    if (/bundle\.json$|media-map\.json$|node_modules/.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(() => cycle(file), 150);
  });
  return server;
}
