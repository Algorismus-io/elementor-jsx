/** deploy.mjs — push a compiled bundle with MINIMAL round-trips:
 *  1) ONE kit write for ALL theme variables (+classes) via wp-cli eval (base64 payload, no quoting hell).
 *  2) one page build per page via the elementor-ultra cli.mjs (REST).
 * Connection from env: EXJSX_WPCLI (e.g. "docker exec wpos-stack-cli wp"), WP_URL/WP_USER/WP_APP_PASSWORD,
 * EXJSX_CLI (path to elementor-ultra cli.mjs). */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/* 4.1↔4.2 FORWARD-COMPAT (found by the upgrade rehearsal): Span_Prop_Type changed base class —
 * 4.1.4 validates a NUMBER value ({$$type:'span',value:6}), 4.2.0 a STRING ("span 6"); neither
 * form passes the other's validator. Authors keep writing numbers (span: 6); deploy detects the
 * target's Elementor version and adapts every grid-column/grid-row span in place. */
function adaptSpansForVersion(bundle, version) {
  const major = parseFloat(version) || 0;
  const toTarget = (v) => {
    if (!v || v.$$type !== 'span') return v;
    if (major >= 4.2 && typeof v.value === 'number') return { ...v, value: `span ${v.value}` };
    if (major < 4.2 && typeof v.value === 'string') { const m = /span\s+(\d+)/.exec(v.value); if (m) return { ...v, value: Number(m[1]) }; }
    return v;
  };
  const walkProps = (props) => { for (const k of ['grid-column', 'grid-row']) if (props?.[k]) props[k] = toTarget(props[k]); };
  const walkStyles = (styles) => { for (const st of Object.values(styles || {})) for (const va of st.variants || []) walkProps(va.props); };
  const walkEls = (ns) => { for (const n of ns || []) { walkStyles(n.styles); walkEls(n.elements); } };
  for (const item of Object.values(bundle.classes?.items || {})) for (const va of item.variants || []) walkProps(va.props);
  for (const p of bundle.pages || []) walkEls(p.elements);
  for (const p of bundle.parts || []) walkEls(p.elements);
  return major >= 4.2 ? 'string (4.2+)' : 'number (4.1)';
}

export async function deployBundle(bundle, cfg = {}) {
  const wpcli = (cfg.wpcli || process.env.EXJSX_WPCLI || 'wp').split(' ');
  const cli = cfg.cli || process.env.EXJSX_CLI;
  const wpUrl = cfg.wpUrl || process.env.WP_URL;
  const auth = 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
  const report = { variables: 0, classes: 0, pages: [] };

  // 0) version-adaptive span form (wp-cli; REST-only targets keep the authored form)
  try {
    const ver = sh(wpcli[0], [...wpcli.slice(1), 'plugin', 'get', 'elementor', '--field=version']).trim();
    report.elementorVersion = ver;
    report.spanForm = adaptSpansForVersion(bundle, ver);
  } catch { /* no wp-cli — leave spans as authored */ }

  // 1) ONE-SHOT kit write: all variables in a single update_post_meta (no per-token round-trips).
  // Requires wp-cli (EXJSX_WPCLI). GRACEFUL: if wp-cli isn't available (e.g. a REST-only tester setup),
  // skip variables — pages still render via the theme's literal fallback (only LIVE var-binding is lost).
  const b64 = Buffer.from(JSON.stringify(bundle.variables)).toString('base64');
  const php = `$k=\\Elementor\\Plugin::$instance->kits_manager->get_active_id(); update_post_meta($k,'_elementor_global_variables', wp_slash(base64_decode('${b64}'))); echo 'vars='.count(json_decode(base64_decode('${b64}'),true)['data']);`;
  try {
    const out = sh(wpcli[0], [...wpcli.slice(1), 'eval', php]);
    report.variables = parseInt((out.match(/vars=(\d+)/) || [])[1] || '0', 10);
  } catch {
    report.variables = 0;
    report.variablesSkipped = 'wp-cli unavailable — theme variables not written (pages use literal fallback; set EXJSX_WPCLI for live Class-Manager binding)';
  }

  // 1b) ONE-SHOT class registry write: the WHOLE {items, order} in a single canonical PUT (the endpoint
  // the Class Manager uses — it writes the meta + CPT posts internally). Before pages so class CSS primes.
  if (bundle.classes?.order?.length && wpUrl) {
    // Own the namespace: delete classes currently in the kit that this build doesn't declare (orphan
    // cleanup). Single-site-per-kit assumption — for a shared kit, scope by a class-name prefix instead.
    let deleted = [];
    try {
      const cur = await (await fetch(`${wpUrl}/wp-json/elementor/v1/global-classes`, { headers: { Authorization: auth } })).json();
      // response-shape drift (caught by the test suite): current Elementor returns {data:[{id,label}…]}
      // — an ARRAY under data. The old {data:{items:{…}}} read made `list` [] and orphan cleanup a
      // silent no-op (the registry only ever GREW). Handle every observed shape.
      const list = Array.isArray(cur) ? cur : Array.isArray(cur?.data) ? cur.data : Object.values((cur?.data || cur)?.items || {});
      const newIds = new Set(bundle.classes.order);
      deleted = list.map((c) => c.id).filter((id) => id && !newIds.has(id));
    } catch { /* first deploy — nothing to clean */ }
    const res = await fetch(`${wpUrl}/wp-json/elementor/v1/global-classes`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ items: bundle.classes.items, order: bundle.classes.order, changes: { added: bundle.classes.order, deleted, modified: [] } }),
    });
    report.classes = res.ok ? bundle.classes.order.length : `ERR ${res.status}: ${(await res.text()).slice(0, 120)}`;
    report.orphansDeleted = deleted.length;
  }

  // 1c) collection loops need the hidden dev experiment `e_pro_collection_loop` — enable it BEFORE
  //     any page save (the validator rejects unregistered element types). wp-cli; no-op without it.
  const usesLoop = (JSON.stringify(bundle.pages) + JSON.stringify(bundle.parts || [])).includes('"e-collection-loop"');
  if (usesLoop && !cfg.dry) {
    try {
      sh(wpcli[0], [...wpcli.slice(1), 'option', 'update', 'elementor_experiment-e_pro_collection_loop', 'active']);
      report.loopExperiment = 'enabled';
    } catch { report.loopExperiment = 'wp-cli unavailable — enable elementor_experiment-e_pro_collection_loop manually or loops will 422'; }
  }

  // 1d) SEO runtime — pages carrying `seo` need the tiny mu-plugin that renders _exjsx_seo meta
  //     (WP core emits NO meta description/og tags without an SEO plugin). Idempotent, version-tagged.
  if (bundle.pages?.some((p) => p.seo) && !cfg.dry) {
    const MU = `<?php
/* exjsx-seo v1 — per-page SEO meta from the _exjsx_seo post meta. Managed by exjsx deploy. */
add_filter( 'pre_get_document_title', function ( $t ) {
  if ( ! is_singular() ) { return $t; }
  $seo = get_post_meta( get_queried_object_id(), '_exjsx_seo', true );
  return ( is_array( $seo ) && ! empty( $seo['title'] ) ) ? $seo['title'] : $t;
}, 20 );
add_action( 'wp_head', function () {
  if ( ! is_singular() ) { return; }
  $seo = get_post_meta( get_queried_object_id(), '_exjsx_seo', true );
  if ( ! is_array( $seo ) ) { return; }
  if ( ! empty( $seo['description'] ) ) { echo '<meta name="description" content="' . esc_attr( $seo['description'] ) . '">' . "\\n"; }
  if ( ! empty( $seo['noindex'] ) ) { echo '<meta name="robots" content="noindex,follow">' . "\\n"; }
  if ( ! empty( $seo['canonical'] ) ) { echo '<link rel="canonical" href="' . esc_url( $seo['canonical'] ) . '">' . "\\n"; }
  $title = ! empty( $seo['title'] ) ? $seo['title'] : get_the_title();
  echo '<meta property="og:title" content="' . esc_attr( $title ) . '">' . "\\n";
  if ( ! empty( $seo['description'] ) ) { echo '<meta property="og:description" content="' . esc_attr( $seo['description'] ) . '">' . "\\n"; }
  if ( ! empty( $seo['ogImage'] ) ) { echo '<meta property="og:image" content="' . esc_url( $seo['ogImage'] ) . '">' . "\\n"; }
}, 5 );
`;
    try {
      const muB64 = Buffer.from(MU).toString('base64');
      // VERIFY the write — file_put_contents fails silently on root-owned mu-plugins dirs
      // (field-found: the dir needs to be writable by the PHP user; chown it once per stack).
      const out = sh(wpcli[0], [...wpcli.slice(1), 'eval',
        `$d = defined('WPMU_PLUGIN_DIR') ? WPMU_PLUGIN_DIR : WP_CONTENT_DIR . '/mu-plugins';`
        + `if ( ! is_dir($d) ) { wp_mkdir_p($d); }`
        + `$ok = @file_put_contents($d . '/exjsx-seo.php', base64_decode('${muB64}'));`
        + `echo $ok ? 'seo-runtime=ok' : 'seo-runtime=UNWRITABLE:' . $d;`]);
      report.seoRuntime = out.includes('seo-runtime=ok') ? 'installed'
        : `mu-plugins dir not writable by PHP (${(out.match(/UNWRITABLE:(\S+)/) || [])[1] || '?'}) — chown it to the web user, or install exjsx-seo.php manually`;
    } catch { report.seoRuntime = 'wp-cli unavailable — SEO meta will not render (install exjsx-seo.php manually)'; }
  }

  // 2) pages — IDEMPOTENT upsert by slug (update in place if the slug exists, else create). Deterministic
  //    ids (normalizeIds) mean a re-deploy of unchanged source is a clean no-op update, not a new page.
  const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // REST page lookup by slug (no wp-cli) — works against any WordPress with the app password.
  const findPage = async (slug) => {
    try {
      const r = await fetch(`${wpUrl}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&status=publish,draft,private&per_page=1&_fields=id`, { headers: { Authorization: auth } });
      const arr = await r.json();
      return Array.isArray(arr) && arr[0]?.id ? String(arr[0].id) : '';
    } catch { return ''; }
  };
  const jhead = { 'Content-Type': 'application/json', Authorization: auth };
  const eu = (path) => `${wpUrl}/wp-json/elementor-ultra/v1${path}`;
  for (const p of bundle.pages) {
    const slug = p.slug || slugify(p.title);
    let id = await findPage(slug);
    if (cfg.dry) { report.pages.push({ title: p.title, slug, id: id || null, action: id ? 'update' : 'create' }); continue; }
    let action = id ? 'updated' : 'created';
    // create the page (companion) if it doesn't exist — pure REST, no toolset server / wp-cli.
    if (!id) {
      const cr = await fetch(eu('/documents'), { method: 'POST', headers: jhead, body: JSON.stringify({ title: p.title, status: 'publish', template: p.template || 'elementor_canvas' }) });
      const cj = await cr.json().catch(() => ({}));
      const dd = cj.data || cj;
      id = String(dd.id || dd.post_id || dd.ID || '');
      if (!id) { report.pages.push({ title: p.title, slug, id: null, action: `ERR create: ${JSON.stringify(dd).slice(0, 120)}` }); continue; }
    }
    // write the atomic tree via /save (validates + saves + returns a fresh base_hash) — works for BOTH a
    // freshly-created doc (which has no base_hash yet, so replace-tree can't do the first write) AND an
    // existing one, in a single call. No optimistic-concurrency dance needed for a deploy.
    const rt = await fetch(eu(`/documents/${id}/save`), { method: 'POST', headers: jhead, body: JSON.stringify({ elements: p.elements }) });
    if (!rt.ok) { report.pages.push({ title: p.title, id, slug, action: `ERR save ${rt.status}: ${(await rt.text()).slice(0, 100)}` }); continue; }
    await fetch(eu(`/documents/${id}/prime-css`), { method: 'POST', headers: jhead, body: '{}' }).catch(() => {});
    // ensure canvas template + stable slug via WP REST.
    try { await fetch(`${wpUrl}/wp-json/wp/v2/pages/${id}`, { method: 'POST', headers: jhead, body: JSON.stringify({ slug, template: p.template === 'elementor_canvas' ? 'elementor_canvas' : undefined }) }); } catch {}
    // per-page SEO meta (mu-plugin renders it; wp-cli write — REST has no arbitrary-meta route)
    if (p.seo) {
      try {
        const seoB64 = Buffer.from(JSON.stringify(p.seo)).toString('base64');
        sh(wpcli[0], [...wpcli.slice(1), 'eval', `update_post_meta(${id}, '_exjsx_seo', json_decode(base64_decode('${seoB64}'), true)); echo 'seo=ok';`]);
      } catch { /* reported via seoRuntime */ }
    }
    report.pages.push({ title: p.title, id, slug, action });
  }
  // 3) THEME PARTS (header/footer) — Elementor Pro theme-builder templates, deployed via wp-cli
  //    (elementor_library has no REST surface). Recipe (live-verified 4.1.4 + Pro 4.1.0, works on
  //    block AND classic themes): elementor_library post + _elementor_edit_mode=builder +
  //    _elementor_template_type + elementor_library_type taxonomy + _elementor_conditions meta +
  //    atomic _elementor_data — then the conditions cache MUST be regenerate()d (deleting the
  //    option is NOT enough; without it the part never renders).
  if (bundle.parts?.length) {
    report.parts = [];
    for (const part of bundle.parts) {
      const slug = `exjsx-part-${part.type}-${slugify(bundle.name)}`;
      try {
        let id = sh(wpcli[0], [...wpcli.slice(1), 'post', 'list', '--post_type=elementor_library', `--name=${slug}`, '--post_status=any', '--format=ids']).trim();
        const action = id ? 'updated' : 'created';
        if (cfg.dry) { report.parts.push({ type: part.type, slug, id: id || null, action: id ? 'update' : 'create' }); continue; }
        if (!id) {
          id = sh(wpcli[0], [...wpcli.slice(1), 'post', 'create', '--post_type=elementor_library', '--post_status=publish', `--post_title=${part.title}`, `--post_name=${slug}`, '--porcelain']).trim();
        }
        const dataB64 = Buffer.from(JSON.stringify(part.elements)).toString('base64');
        const condB64 = Buffer.from(JSON.stringify(part.conditions)).toString('base64');
        // popup display settings ({triggers, timing}) ride as their own meta
        const dispB64 = part.display ? Buffer.from(JSON.stringify(part.display)).toString('base64') : null;
        const php = `update_post_meta(${id}, '_elementor_edit_mode', 'builder');`
          + `update_post_meta(${id}, '_elementor_template_type', '${part.type}');`
          + `wp_set_object_terms(${id}, '${part.type}', 'elementor_library_type');`
          + `update_post_meta(${id}, '_elementor_conditions', json_decode(base64_decode('${condB64}'), true));`
          + (dispB64 ? `update_post_meta(${id}, '_elementor_popup_display_settings', json_decode(base64_decode('${dispB64}'), true));` : '')
          + `update_post_meta(${id}, '_elementor_data', wp_slash(base64_decode('${dataB64}')));`
          + `delete_post_meta(${id}, '_elementor_css'); echo 'part=ok';`;
        const out = sh(wpcli[0], [...wpcli.slice(1), 'eval', php]);
        report.parts.push({ type: part.type, slug, id, action: out.includes('part=ok') ? action : `ERR: ${out.slice(0, 120)}` });
      } catch (e) {
        report.parts.push({ type: part.type, slug, id: null, action: `ERR: ${String(e.message || e).slice(0, 120)}` });
      }
    }
    // one regenerate for all parts — the step that actually makes conditions match
    if (!cfg.dry) {
      try {
        sh(wpcli[0], [...wpcli.slice(1), 'eval',
          '$m=\\ElementorPro\\Plugin::instance()->modules_manager->get_modules("theme-builder");'
          + 'if($m){$m->get_conditions_manager()->get_cache()->regenerate(); echo "conditions=regenerated";}'
          + 'else{echo "conditions=NO-PRO";}']);
      } catch (e) { report.partsWarning = 'conditions cache not regenerated (is Elementor Pro active?) — parts will not render'; }
    }
  }

  // Regenerate CSS so UPDATED pages pick up new global-class rules (cli.mjs primes per-page on build/replace;
  // this wp-cli flush is a belt-and-suspenders that no-ops without wp-cli).
  try { sh(wpcli[0], [...wpcli.slice(1), 'elementor', 'flush-css']); } catch {}
  return report;
}
