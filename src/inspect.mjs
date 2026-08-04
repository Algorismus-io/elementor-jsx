/**
 * inspect.mjs — read-only bundle formatter for `exjsx inspect`. Pure: no network, no wp-cli, no env;
 * never mutates the bundle (the --el styles dump decodes on a deep CLONE). Exists because custom_css
 * ships base64-encoded, which makes bundle.json grep-invisible — every raw here is DECODED to plain
 * CSS and the base64 form never appears in the output.
 */

const USAGE_HINT = 'exjsx build <entry.jsx>';

/* snippet keys are the verified html-v3 text props: title (e-heading), paragraph (e-paragraph),
 * text (e-button/submit); settings.html is a plain string (html widget). Other widgets (e-image,
 * e-svg, forms) have no canonical text key — they render without a snippet, never a guess. */
const TEXT_KEYS = ['title', 'paragraph', 'text'];

const cleanText = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const truncate = (s) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

function snippetOf(settings = {}) {
  for (const k of TEXT_KEYS) {
    const v = settings[k];
    if (!v || typeof v !== 'object') continue;
    if (v.$$type === 'dynamic') return `[dyn:${v.value?.name}]`;
    if (v.$$type === 'html-v3') {
      const t = cleanText(v.value?.content?.value ?? '');
      if (t) return truncate(t);
    }
  }
  if (typeof settings.html === 'string') {
    const t = cleanText(settings.html);
    if (t) return truncate(t);
  }
  return null;
}

const typeLabel = (n) => `${n.elType}${n.widgetType ? `:${n.widgetType}` : ''}`;

function treeLines(nodes, depth, out) {
  for (const n of nodes || []) {
    const snip = snippetOf(n.settings);
    const refs = n.settings?.classes?.value;
    out.push(
      '  '.repeat(depth) + `${typeLabel(n)} #${n.id}`
      + (snip ? ` "${snip}"` : '')
      + (Array.isArray(refs) && refs.length ? ` [${refs.join(' ')}]` : ''),
    );
    treeLines(n.elements, depth + 1, out);
  }
}

/* Both variant.custom_css.raw (compiler, kit.mjs) and variant.props.custom_css.raw
 * (converter-shaped bundles, decompile.mjs) are checked — miss one and those bundles
 * stay grep-invisible, the exact failure this verb exists to fix. */
function decodedCssOf(variant) {
  const b64 = variant?.custom_css?.raw ?? variant?.props?.custom_css?.raw;
  if (typeof b64 !== 'string' || !b64) return null;
  const css = Buffer.from(b64, 'base64').toString('utf8');
  return css.trim() ? css : null;
}

const bpLabel = (variant) => `@${variant.meta?.breakpoint || 'desktop'}${variant.meta?.state ? `:${variant.meta.state}` : ''}`;

const indentCss = (css) => css.split('\n').map((l) => `    ${l}`);

function allNodes(elements, out = []) {
  for (const n of elements || []) { out.push(n); allNodes(n.elements, out); }
  return out;
}

/** Format an exjsx bundle as deterministic plain text: summary, element tree (or one --el dump),
 * and every custom_css DECODED from base64. Read-only — the input bundle is never mutated. */
export function inspectBundle(bundle, opts = {}) {
  if (!Array.isArray(bundle?.pages)) {
    throw new Error(`inspect: not an exjsx bundle (missing pages[]) — build one with: ${USAGE_HINT}`);
  }
  const parts = bundle.parts || [];
  const classes = bundle.classes?.order?.length ?? 0;
  const variables = bundle.variableList?.length ?? Object.keys(bundle.variables?.data || {}).length;
  const fonts = bundle.fonts || [];
  // stats.inlined is set by inlineLocal (inline.mjs) — presence marks an --inline bundle,
  // including pre-flag bundle.json files that only carry the stats field.
  const summary = `bundle ${bundle.name} — ${bundle.pages.length} page(s), ${parts.length} part(s), `
    + `${classes} classes, ${variables} variables, ${fonts.length} fonts`
    + (fonts.length ? ` (${fonts.join(', ')})` : '')
    + (bundle.stats?.inlined !== undefined ? ' · inline' : '');

  if (opts.el) return summary + '\n\n' + elementDump(bundle, parts, opts.el);

  let pages = bundle.pages;
  let shownParts = parts;
  if (opts.page) {
    const hit = bundle.pages.find((p) => p.slug === opts.page);
    if (!hit) {
      throw new Error(`inspect: no page with slug "${opts.page}" — available: ${bundle.pages.map((p) => p.slug).join(', ')}`);
    }
    pages = [hit];
    shownParts = [];
  }

  const lines = [summary];
  for (const p of pages) {
    lines.push('', `page "${p.title}" (/${p.slug}/) template=${p.template}`);
    treeLines(p.elements, 0, lines);
  }
  for (const part of shownParts) {
    lines.push('', `part ${part.type} "${part.title}"`);
    treeLines(part.elements, 0, lines);
  }

  // custom css section: shared classes first (registry order), then element-local styles
  // (--inline bundles) across every rendered page and part. Base64 never appears here.
  const cssLines = [];
  const items = bundle.classes?.items || {};
  for (const id of bundle.classes?.order?.length ? bundle.classes.order : Object.keys(items)) {
    for (const v of items[id]?.variants || []) {
      const css = decodedCssOf(v);
      if (css) cssLines.push(`  class ${id} ${bpLabel(v)}:`, ...indentCss(css));
    }
  }
  for (const container of [...pages, ...shownParts]) {
    for (const n of allNodes(container.elements)) {
      for (const st of Object.values(n.styles || {})) {
        for (const v of st.variants || []) {
          const css = decodedCssOf(v);
          if (css) cssLines.push(`  element #${n.id} ${bpLabel(v)}:`, ...indentCss(css));
        }
      }
    }
  }
  if (cssLines.length) lines.push('', 'custom css:', ...cssLines);
  return lines.join('\n');
}

function elementDump(bundle, parts, id) {
  let node = null, where = null;
  for (const p of bundle.pages) {
    node = allNodes(p.elements).find((n) => n.id === id);
    if (node) { where = `page /${p.slug}/`; break; }
  }
  if (!node) {
    for (const part of parts) {
      node = allNodes(part.elements).find((n) => n.id === id);
      if (node) { where = `part ${part.type}`; break; }
    }
  }
  if (!node) {
    throw new Error(`inspect: no element "${id}" in bundle — run \`exjsx inspect <file>\` without --el to see the tree`);
  }
  // decode on a deep CLONE so the dump is greppable while the input bundle stays untouched
  const styles = JSON.parse(JSON.stringify(node.styles || {}));
  (function decode(o) {
    if (!o || typeof o !== 'object') return;
    if (o.custom_css && typeof o.custom_css === 'object' && typeof o.custom_css.raw === 'string') {
      o.custom_css = Buffer.from(o.custom_css.raw, 'base64').toString('utf8');
    }
    for (const v of Array.isArray(o) ? o : Object.values(o)) decode(v);
  })(styles);
  const kids = node.elements || [];
  return [
    `element #${node.id} ${typeLabel(node)} (${where})`,
    `settings: ${JSON.stringify(node.settings ?? {}, null, 2)}`,
    `styles: ${JSON.stringify(styles, null, 2)}`,
    kids.length ? `children: [${kids.map((c) => `${c.id} (${typeLabel(c)})`).join(', ')}]` : 'children: none',
  ].join('\n');
}
