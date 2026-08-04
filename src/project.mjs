/**
 * project.mjs — file-system project layout: discovery + entry synthesis (the pre-framework
 * "file router"). Separation of concerns is the contract:
 *
 *   mysite/
 *     site.config.mjs        (optional) { name?, template? } — project-level config ONLY
 *     theme.mjs              (optional) default-exports a Theme (defineTheme) — tokens ONLY
 *     pages/
 *       home.page.jsx        default-exports a component; `export const meta = {…}` per-page config
 *       pricing.page.jsx     slug = filename; nested dirs join with '-'; meta.slug overrides
 *       locations/[city].page.jsx  dynamic: `export const data = () => [{slug,title,seo?,props?}]`
 *     parts/
 *       header.part.jsx      chrome ONLY — one of: header|footer|single|archive|error404|popup
 *     components/ data/ …    free-form, imported by pages — discovery ignores them
 *
 * Page files hold CONTENT, parts hold CHROME, theme holds TOKENS, data() holds DATA — a file that
 * mixes concerns still compiles, but the layout makes the seams reviewable and lintable.
 *
 * Robustness rules: discovery validates EVERYTHING up front and throws ONE error listing every
 * problem with its fix (not first-failure whack-a-mole). Synthesis emits a plain entry module that
 * assembles defineSite — the compiler pipeline downstream is unchanged, so every existing gate
 * (assertTree, dedup, lint) applies to fs-projects for free.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_SRC = dirname(fileURLToPath(import.meta.url));
const PART_TYPES = ['header', 'footer', 'single', 'archive', 'error404', 'popup'];
const DYNAMIC = /^\[([a-z0-9-]+)\]$/;

const kebab = (s) => s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/^-+|-+$/g, '');

/** Scan a project directory → manifest. Throws ONE aggregated error listing every violation. */
export function discoverProject(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`discoverProject: ${dir} is not a directory`);
  const problems = [];
  const manifest = { dir, name: kebab(dir.split(sep).filter(Boolean).pop() || 'site'), themeFile: null, configFile: null, pages: [], parts: [] };

  if (existsSync(join(dir, 'theme.mjs'))) manifest.themeFile = join(dir, 'theme.mjs');
  if (existsSync(join(dir, 'site.config.mjs'))) manifest.configFile = join(dir, 'site.config.mjs');

  // ── pages/: ONLY *.page.jsx|tsx belong here — content files, one page per file ──
  const pagesDir = join(dir, 'pages');
  if (existsSync(pagesDir)) {
    const slugOwners = new Map();
    for (const file of walkFiles(pagesDir)) {
      const rel = relative(pagesDir, file);
      const base = rel.split(sep).pop();
      if (!/\.page\.(jsx|tsx)$/.test(base)) {
        if (/\.(jsx|tsx|mjs)$/.test(base)) problems.push(`pages/${rel}: not a *.page.jsx file — pages/ holds pages only; move shared code to components/ (or rename to ${base.replace(/\.(jsx|tsx)$/, '.page.$1')})`);
        continue;
      }
      const stem = base.replace(/\.page\.(jsx|tsx)$/, '');
      const dirs = rel.split(sep).slice(0, -1).map(kebab);
      const dyn = stem.match(DYNAMIC);
      const page = { file, rel: `pages/${rel}`, dynamic: !!dyn, param: dyn?.[1] ?? null, slug: dyn ? null : [...dirs, kebab(stem)].filter(Boolean).join('-') };
      if (!dyn) {
        if (!page.slug) problems.push(`pages/${rel}: filename produces an empty slug — rename it`);
        else if (slugOwners.has(page.slug)) problems.push(`pages/${rel}: slug "${page.slug}" collides with ${slugOwners.get(page.slug)} — rename one (or set meta.slug)`);
        else slugOwners.set(page.slug, `pages/${rel}`);
      }
      manifest.pages.push(page);
    }
    if (!manifest.pages.length) problems.push('pages/: no *.page.jsx files found — a project needs at least one page');
  } else {
    problems.push(`${dir}: no pages/ directory — fs-projects require pages/ with at least one *.page.jsx`);
  }

  // ── parts/: chrome only, filenames are the closed part-type set ──
  const partsDir = join(dir, 'parts');
  if (existsSync(partsDir)) {
    for (const file of walkFiles(partsDir)) {
      const base = relative(partsDir, file);
      const m = base.match(/^([a-z0-9-]+)\.part\.(jsx|tsx)$/);
      if (!m) { problems.push(`parts/${base}: parts are <type>.part.jsx where type ∈ {${PART_TYPES.join('|')}}`); continue; }
      if (!PART_TYPES.includes(m[1])) { problems.push(`parts/${base}: unknown part type "${m[1]}" — valid: ${PART_TYPES.join(', ')}`); continue; }
      if (manifest.parts.some((p) => p.type === m[1])) { problems.push(`parts/${base}: duplicate part type "${m[1]}"`); continue; }
      manifest.parts.push({ file, type: m[1] });
    }
  }

  if (problems.length) {
    throw new Error(`exjsx project: ${problems.length} layout problem(s) in ${dir}:\n  - ${problems.join('\n  - ')}`);
  }
  return manifest;
}

function walkFiles(root) {
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = join(root, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out.sort();
}

/**
 * Synthesize the entry module (plain JS source) that assembles defineSite from a manifest.
 * Deliberately boring output: absolute imports, explicit wiring, runtime validation of the
 * per-file contracts (default export present, dynamic data() shape) with errors that name the
 * offending FILE — the synthesized entry is where fs-contract violations surface.
 */
export function synthesizeEntry(manifest) {
  const imp = [];
  const body = [];
  imp.push(`import { defineSite } from ${JSON.stringify(join(PKG_SRC, 'site.mjs'))};`);
  imp.push(`import { h } from ${JSON.stringify(join(PKG_SRC, 'runtime.mjs'))};`);
  if (manifest.themeFile) imp.push(`import __themeMod from ${JSON.stringify(manifest.themeFile)};`);
  if (manifest.configFile) imp.push(`import __configMod from ${JSON.stringify(manifest.configFile)};`);
  body.push(`const __theme = ${manifest.themeFile ? '__themeMod' : 'undefined'};`);
  body.push(`const __config = ${manifest.configFile ? '(__configMod ?? {})' : '({})'};`);
  if (manifest.themeFile) body.push(`if (__theme && !__theme.variablesMeta) throw new Error('theme.mjs: default export must be defineTheme(...) (got ' + typeof __theme + ') — tokens only, no pages here');`);
  // chrome present → pages default to the header/footer template (meta.template still wins)
  const hasChrome = manifest.parts.some((p) => p.type === 'header' || p.type === 'footer');
  body.push(`const __defaultTemplate = __config.template ?? ${hasChrome ? "'elementor_header_footer'" : 'undefined'};`);
  body.push('const __pages = [];');

  manifest.pages.forEach((p, i) => {
    imp.push(`import __P${i}, * as __M${i} from ${JSON.stringify(p.file)};`);
    body.push(`{
  const C = __P${i}, meta = __M${i}.meta ?? {};
  if (typeof C !== 'function') throw new Error(${JSON.stringify(p.rel)} + ': default export must be a component function (content concern) — got ' + typeof C);`);
    if (p.dynamic) {
      body.push(`  const dataFn = __M${i}.data;
  if (typeof dataFn !== 'function') throw new Error(${JSON.stringify(p.rel)} + ': dynamic [${p.param}] page requires \`export const data = () => [{ slug, title, ... }]\` (data concern lives WITH the page)');
  const items = await dataFn();
  if (!Array.isArray(items) || !items.length) throw new Error(${JSON.stringify(p.rel)} + ': data() must return a non-empty array');
  items.forEach((it, n) => {
    if (!it || !it.slug || !it.title) throw new Error(${JSON.stringify(p.rel)} + ': data()[' + n + '] needs { slug, title } (got ' + JSON.stringify(it).slice(0, 60) + ')');
    __pages.push({ title: it.title, slug: it.slug, seo: it.seo ?? meta.seo, template: meta.template ?? __defaultTemplate, node: h(C, { theme: __theme, ${p.param}: it, ...(it.props ?? {}) }) });
  });`);
    } else {
      body.push(`  __pages.push({ title: meta.title ?? ${JSON.stringify(titleFromSlug(p.slug))}, slug: meta.slug ?? ${JSON.stringify(p.slug)}, seo: meta.seo, template: meta.template ?? __defaultTemplate, node: h(C, { theme: __theme }) });`);
    }
    body.push('}');
  });

  if (manifest.parts.length) {
    body.push('const __parts = {};');
    manifest.parts.forEach((p, i) => {
      imp.push(`import __PT${i}, * as __PM${i} from ${JSON.stringify(p.file)};`);
      body.push(`{
  const C = __PT${i}, meta = __PM${i}.meta ?? {};
  if (typeof C !== 'function') throw new Error('parts/${p.type}.part.jsx: default export must be a component function (chrome concern)');
  __parts[${JSON.stringify(p.type)}] = { node: h(C, { theme: __theme }), ...(meta.title ? { title: meta.title } : {}), ...(meta.conditions ? { conditions: meta.conditions } : {}), ...(meta.display ? { display: meta.display } : {}) };
}`);
    });
  }

  body.push(`export default defineSite({ name: __config.name ?? ${JSON.stringify(manifest.name)}, theme: __theme, pages: __pages${manifest.parts.length ? ', parts: __parts' : ''} });`);
  return [...imp, '', ...body].join('\n');
}

const titleFromSlug = (slug) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
