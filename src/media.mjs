/**
 * media.mjs — asset ingestion (run explicitly: `node framework/cli.mjs media data/images.manifest.mjs`).
 * Sideloads manifest entries into the WP media library (idempotent by slug `exjsx-<slot>`) and writes
 * data/media-map.json, which theme + pages read at build time. Entries:
 *   { slot, src: 'https://…' }                       — remote image → WP media
 *   { slot, file: 'assets/x.jpg' }                    — local image  → WP media
 *   { slot, type: 'font', file, family, role, weight } — local font  → base64 data-URI in the map
 *     (WP blocks woff2 uploads by default; a data-URI @font-face needs no server config)
 * Rights note: this command FETCHES third-party URLs verbatim — run it only for assets you own or license.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 16);

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff' };

export async function sideloadManifest(manifestPath, mapPath = 'data/media-map.json') {
  const wpUrl = process.env.WP_URL;
  const auth = 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
  if (!wpUrl || !process.env.WP_APP_PASSWORD) throw new Error('media: WP_URL / WP_USER / WP_APP_PASSWORD missing (.env)');
  const { default: manifest } = await import(new URL('file://' + resolve(manifestPath)).href);
  const map = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {};

  for (const e of manifest) {
    if (!e || !e.slot) continue;
    if (e.skip || (!e.src && !e.file)) { console.log(`  SKIP  ${e.slot} (no src/file yet)`); continue; }

    if (e.type === 'font') {
      const p = resolve(e.file);
      if (!existsSync(p)) { console.log(`  SKIP  ${e.slot} — drop your licensed file at ${e.file} first`); continue; }
      const b64 = readFileSync(p).toString('base64');
      map[e.slot] = { type: 'font', family: e.family, role: e.role || 'head', weight: e.weight || 400, url: `data:${MIME[extname(p)] || 'font/woff2'};base64,${b64}` };
      console.log(`  FONT  ${e.slot} → ${e.family} (${Math.round(b64.length * 0.75 / 1024)} KB, embedded)`);
      continue;
    }

    // hash-cache: a local file whose bytes match the map entry needs ZERO network calls
    if (e.file && map[e.slot]?.hash) {
      const p0 = resolve(e.file);
      if (existsSync(p0) && sha1(readFileSync(p0)) === map[e.slot].hash) {
        console.log(`  SAME  ${e.slot} → id ${map[e.slot].id} (hash match, skipped)`);
        continue;
      }
    }
    // idempotency: an attachment slugged exjsx-<slot> already in the library wins — but only for
    // src-entries (no local bytes to compare). A local FILE that got past the hash-cache above has
    // new/unknown bytes: keeping the slug hit would silently serve stale content (real incident:
    // recolored logos never reached the site). Replace the stale attachment and fall through to upload.
    const slug = `exjsx-${e.slot}`;
    const found = await (await fetch(`${wpUrl}/wp-json/wp/v2/media?search=${slug}&per_page=10`, { headers: { Authorization: auth } })).json();
    const hit = Array.isArray(found) && found.find((m) => (m.slug || '').startsWith(slug));
    if (hit && !e.file) { map[e.slot] = { type: 'image', id: hit.id, url: hit.source_url, alt: e.alt || '' }; console.log(`  KEEP  ${e.slot} → id ${hit.id}`); continue; }
    if (hit && e.file) {
      const del = await fetch(`${wpUrl}/wp-json/wp/v2/media/${hit.id}?force=true`, { method: 'DELETE', headers: { Authorization: auth } });
      console.log(`  REUP  ${e.slot} — bytes changed; replacing stale id ${hit.id}${del.ok ? '' : ` (delete HTTP ${del.status} — uploading anyway)`}`);
    }

    let bytes, ext;
    if (e.file) { const p = resolve(e.file); bytes = readFileSync(p); ext = extname(p) || '.jpg'; }
    else {
      const r = await fetch(e.src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log(`  FAIL  ${e.slot} — HTTP ${r.status} fetching src`); continue; }
      bytes = Buffer.from(await r.arrayBuffer());
      const ct = r.headers.get('content-type') || 'image/jpeg';
      ext = '.' + (ct.split('/')[1] || 'jpg').split(';')[0].replace('jpeg', 'jpg');
    }
    const up = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': MIME[ext] || 'image/jpeg', 'Content-Disposition': `attachment; filename="${slug}${ext}"` },
      body: bytes,
    });
    if (!up.ok) { console.log(`  FAIL  ${e.slot} — upload HTTP ${up.status}: ${(await up.text()).slice(0, 120)}`); continue; }
    const att = await up.json();
    if (e.alt) await fetch(`${wpUrl}/wp-json/wp/v2/media/${att.id}`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ alt_text: e.alt }) });
    map[e.slot] = { type: 'image', id: att.id, url: att.source_url, alt: e.alt || '', ...(e.file ? { hash: sha1(bytes) } : {}) };
    console.log(`  UP    ${e.slot} → id ${att.id} (${Math.round(bytes.length / 1024)} KB)`);
  }

  writeFileSync(mapPath, JSON.stringify(map, null, 2));
  console.log(`media-map → ${mapPath} (${Object.keys(map).length} slots). Rebuild + redeploy to use it.`);
  return map;
}
