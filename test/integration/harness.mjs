/**
 * Integration harness for the LIVE parity checks against the wpos-stack (:8915 by default).
 *
 * Isolation: a FULL DB snapshot before the run, restored after — the global-class registry
 * is CPT-backed (e_global_class posts + kit metas) and the REST GET returns labels only,
 * so a REST-level restore cannot carry variants. DB restore is total-fidelity: registry,
 * variables, pages, everything comes back exactly as it was (the resident farmans site
 * on :8915 survives the deploy's registry-pruning untouched).
 *
 * Gate: set EXJSX_IT=1 (npm run test:it). Without it the suite skips.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* .env autoload (same rules as cli.mjs — existing env wins) */
for (const l of (existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

export const WP_URL = process.env.WP_URL || 'http://localhost:8915';
export const AUTH = 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
export const enabled = process.env.EXJSX_IT === '1';

/* stack-specific plumbing, overridable via env for other stacks */
const DB_EXEC = process.env.EXJSX_IT_DB_EXEC || 'docker exec wpos-stack-db sh -c';
const DB_AUTH = process.env.EXJSX_IT_DB_AUTH || '-uroot -prootpass';
const DB_NAME = process.env.EXJSX_IT_DB_NAME || 'wp_wpos';
const SNAP = '/tmp/exjsx-it-snapshot.sql';
const wpcli = (process.env.EXJSX_WPCLI || 'wp').split(' ');

export const wp = (...args) => execFileSync(wpcli[0], [...wpcli.slice(1), ...args], { encoding: 'utf8' });
const dbsh = (cmd) => execSync(`${DB_EXEC} '${cmd}'`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/* Snapshot/restore is WHOLE-DATABASE (--databases --add-drop-database): a plain per-table import
 * does NOT drop tables created DURING the test window (e.g. Pro's wp_e_submissions* made on first
 * submission) — the strays then clash with rolled-back version options and spray migration errors
 * on the next run (field-found). Drop-and-recreate restores the exact snapshot state. */
export function dbSnapshot() { dbsh(`mysqldump ${DB_AUTH} --databases ${DB_NAME} --add-drop-database > ${SNAP}`); }
export function dbRestore() {
  dbsh(`mysql ${DB_AUTH} < ${SNAP} && rm -f ${SNAP}`);
  try { wp('cache', 'flush'); } catch {}
  try { wp('elementor', 'flush-css'); } catch {}
}

/* ── REST helpers ── */
export async function rest(path, opts = {}) {
  const r = await fetch(`${WP_URL}${path}`, { ...opts, headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; } catch { return { status: r.status, text }; }
}

export const getRegistry = async () => {
  const { json } = await rest('/wp-json/elementor/v1/global-classes');
  return Array.isArray(json?.data) ? json.data : Object.values(json?.data?.items || json?.items || {});
};

export const pageIdBySlug = async (slug) => {
  const { json } = await rest(`/wp-json/wp/v2/pages?slug=${slug}&status=publish,draft,private&per_page=1&_fields=id`);
  return Array.isArray(json) && json[0]?.id ? json[0].id : null;
};

/** Parse wp post meta get --format=json output — meta stored as a JSON STRING arrives double-encoded. */
const metaJson = (raw) => { const v = JSON.parse(raw); return typeof v === 'string' ? JSON.parse(v) : v; };

/** Read a page's saved atomic tree straight from the DB (the ground truth the editor loads). */
export function elementorData(pageId) {
  return metaJson(wp('post', 'meta', 'get', String(pageId), '_elementor_data', '--format=json'));
}

/** Read the active kit's global-variables meta (double-encode aware). */
export function kitVariables() {
  const kit = wp('eval', 'echo \\Elementor\\Plugin::$instance->kits_manager->get_active_id();').trim();
  return metaJson(wp('post', 'meta', 'get', kit, '_elementor_global_variables', '--format=json'));
}

/** Fetch a rendered page: html + ALL its same-origin stylesheets + inline styles, whitespace-normalized css. */
export async function renderedPage(slug) {
  const r = await fetch(`${WP_URL}/${slug}/`, { redirect: 'follow' });
  const html = await r.text();
  const hrefs = [...html.matchAll(/<link[^>]+rel=['"]stylesheet['"][^>]*href=['"]([^'"]+)['"]/g)].map((m) => m[1])
    .concat([...html.matchAll(/href=['"]([^'"]+\.css[^'"]*)['"][^>]*rel=['"]stylesheet['"]/g)].map((m) => m[1]));
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  for (const href of new Set(hrefs)) {
    const abs = href.startsWith('http') ? href : WP_URL + href;
    if (!abs.startsWith(WP_URL)) continue;
    try { css += '\n' + (await (await fetch(abs)).text()); } catch {}
  }
  return { status: r.status, html, css, cssFlat: css.replace(/\s+/g, '') };
}

/** flat tree walk */
export function flat(elements) {
  const out = [];
  (function w(ns) { for (const n of ns || []) { out.push(n); w(n.elements); } })(elements);
  return out;
}
