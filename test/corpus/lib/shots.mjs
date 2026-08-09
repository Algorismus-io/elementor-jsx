/**
 * shots.mjs — playwright plumbing for the corpus harness.
 *
 *   refShot():  minimal local page (cached Tailwind Play CDN JS inlined) around the component
 *               markup → screenshot of the component region + DOM-JSON of the markup (the SAME
 *               parsed tree the converter consumes — one parse, zero drift between what the
 *               reference shows and what gets converted).
 *   liveShot(): deployed exjsx page on the bench WP → screenshot of the same region.
 *
 * Region = union of the #corpus-root subtree's client rects at scroll 0 (an element screenshot
 * would collapse to 0×0 for components whose root only holds fixed/absolute children, e.g. a
 * fixed header). Both sides use the identical clip logic; heights may differ (reported).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function resolvePlaywright() {
  const p = process.env.EXJSX_IT_PLAYWRIGHT;
  if (!p) throw new Error('set EXJSX_IT_PLAYWRIGHT to a playwright index.mjs (see test/corpus/run.mjs header)');
  return p;
}

export async function launch() {
  const { chromium } = await import('file://' + resolvePlaywright().replace(/^file:\/\//, ''));
  return chromium.launch();
}

/** Tailwind Play CDN JS, cached to disk on first fetch (offline-tolerant afterwards). */
export async function tailwindCdn(cachePath) {
  if (existsSync(cachePath)) return readFileSync(cachePath, 'utf8');
  const r = await fetch('https://cdn.tailwindcss.com', { headers: { 'User-Agent': 'Mozilla/5.0 (corpus-harness)' } });
  if (!r.ok) throw new Error(`tailwind CDN fetch failed (${r.status}) and no cache at ${cachePath} — run once online`);
  const js = await r.text();
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, js);
  return js;
}

const SETTLE = `
  const st = document.createElement('style');
  st.textContent = '*{animation:none!important;transition:none!important} html{scroll-behavior:auto!important}';
  document.head.appendChild(st);
`;

/** serializer + clip computation, evaluated in the page */
const SERIALIZE = `(() => {
  const root = document.querySelector('#corpus-root');
  if (!root) return null;
  const ser = (n) => {
    if (n.nodeType === 3) return /\\S/.test(n.textContent) || n.textContent.includes(' ') ? { text: n.textContent } : null;
    if (n.nodeType !== 1) return null;
    const tag = n.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') return null;
    const attrs = {};
    for (const a of n.attributes) attrs[a.name] = a.value;
    if (tag === 'svg') return { tag, attrs, outer: n.outerHTML, children: [] };
    return { tag, attrs, children: [...n.childNodes].map(ser).filter(Boolean) };
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
  }
  if (!isFinite(y1)) { x0 = 0; y0 = 0; x1 = innerWidth; y1 = 32; }
  return { dom: ser(root), clip: { x: 0, y: Math.max(0, Math.floor(y0)), w: innerWidth, h: Math.min(5000, Math.ceil(y1) - Math.max(0, Math.floor(y0))) } };
})()`;

async function settleAndShoot(page, out) {
  await page.evaluate(SETTLE);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
    document.getAnimations().forEach((a) => { try { a.finish(); } catch {} });
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 250));
  });
  const res = await page.evaluate(SERIALIZE);
  if (!res) throw new Error('#corpus-root not found');
  const clip = { x: res.clip.x, y: res.clip.y, width: Math.max(2, res.clip.w), height: Math.max(2, res.clip.h) };
  await page.screenshot({ path: out, clip });
  return { dom: res.dom, clip };
}

export async function refShot(browser, { html, cdnJs, out, width = 1280 }) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><script>${cdnJs}</script></head>` +
      `<body style="margin:0"><div id="corpus-root" class="font-sans antialiased">\n${html}\n</div></body></html>`;
    await page.setContent(doc, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.tailwind && [...document.querySelectorAll('style')].some((s) => s.textContent.length > 1000), { timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    return await settleAndShoot(page, out);
  } finally { await page.close(); }
}

export async function liveShot(browser, { url, out, width = 1280 }) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    return await settleAndShoot(page, out);
  } finally { await page.close(); }
}
