/** deploy.mjs — push a compiled bundle with MINIMAL round-trips:
 *  1) ONE kit write for ALL theme variables (+classes) via wp-cli eval (base64 payload, no quoting hell).
 *  2) one page build per page via the elementor-ultra cli.mjs (REST).
 * Connection from env: EXJSX_WPCLI (e.g. "docker exec wpos-stack-cli wp"), WP_URL/WP_USER/WP_APP_PASSWORD,
 * EXJSX_CLI (path to elementor-ultra cli.mjs). */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalHash, decideDrift, shortHash } from './drift.mjs';

// opts spread lets drift reads raise maxBuffer (execFileSync defaults to 1 MiB — too small for _elementor_data)
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

/* 4.1↔4.2 FORWARD-COMPAT (found by the upgrade rehearsal + the :8919 fresh-env build): two prop
 * types changed shape across the boundary — neither form passes the other's validator:
 *   - Span_Prop_Type: 4.1.4 validates a NUMBER ({$$type:'span',value:6}), 4.2.0 a STRING ("span 6").
 *   - Font_Family_Prop_Type (NEW in 4.2, key 'font-family'): 4.1.4 takes {$$type:'string'},
 *     4.2.0 REQUIRES {$$type:'font-family'} — every string-typed font-family 422s as invalid_value.
 * Authors keep writing the sx forms; deploy detects the target's Elementor version and adapts
 * every affected prop in place. */
/* numeric [major,minor,patch] compare — parseFloat can't tell 4.2.0 from 4.2.1, and 4.2.1
 * renamed the border-radius prop type (field-found on the :8920 clean stack). */
const verAtLeast = (version, [a, b, c]) => {
  const [x = 0, y = 0, z = 0] = String(version).split('.').map((n) => parseInt(n, 10) || 0);
  return x !== a ? x > a : y !== b ? y > b : z >= c;
};

export function adaptSpansForVersion(bundle, version) {
  const major = parseFloat(version) || 0;
  const radiusV2 = verAtLeast(version, [4, 2, 1]);
  const toTarget = (v) => {
    if (!v || v.$$type !== 'span') return v;
    if (major >= 4.2 && typeof v.value === 'number') return { ...v, value: `span ${v.value}` };
    if (major < 4.2 && typeof v.value === 'string') { const m = /span\s+(\d+)/.exec(v.value); if (m) return { ...v, value: Number(m[1]) }; }
    return v;
  };
  const fontToTarget = (v) => {
    if (!v || typeof v.value !== 'string') return v;
    if (major >= 4.2 && v.$$type === 'string') return { ...v, $$type: 'font-family' };
    if (major < 4.2 && v.$$type === 'font-family') return { ...v, $$type: 'string' };
    return v;
  };
  // 4.2.1 renamed Border_Radius_Prop_Type's key: $$type 'border-radius' → 'border-radius-v2'
  // (value shape unchanged). Adapt both directions so authored bundles deploy to any target.
  const radiusToTarget = (v) => {
    if (!v) return v;
    if (radiusV2 && v.$$type === 'border-radius') return { ...v, $$type: 'border-radius-v2' };
    if (!radiusV2 && v.$$type === 'border-radius-v2') return { ...v, $$type: 'border-radius' };
    return v;
  };
  const walkProps = (props) => {
    for (const k of ['grid-column', 'grid-row']) if (props?.[k]) props[k] = toTarget(props[k]);
    if (props?.['font-family']) props['font-family'] = fontToTarget(props['font-family']);
    if (props?.['border-radius']) props['border-radius'] = radiusToTarget(props['border-radius']);
  };
  // 4.2.x Pro-form email action: $$type 'email' → 'emails', and `to` becomes a string-array of
  // string envelopes (live-probed on 4.2.1 + Pro 4.1.0: 'email'/plain-string 422s invalid_value;
  // found by a field agent). Adapt both directions on the ELEMENT SETTINGS (not styles).
  const S = (v) => ({ $$type: 'string', value: v });
  const emailToTarget = (v) => {
    if (!v || (v.$$type !== 'email' && v.$$type !== 'emails')) return v;
    if (major >= 4.2 && v.$$type === 'email') {
      const to = v.value?.to;
      const toArr = to?.$$type === 'string' ? { $$type: 'string-array', value: [to] } : to;
      return { ...v, $$type: 'emails', value: { ...v.value, ...(toArr ? { to: toArr } : {}) } };
    }
    if (major < 4.2 && v.$$type === 'emails') {
      const to = v.value?.to;
      const toStr = to?.$$type === 'string-array' ? (to.value?.[0]?.$$type === 'string' ? to.value[0] : S(to.value?.[0])) : to;
      return { ...v, $$type: 'email', value: { ...v.value, ...(toStr ? { to: toStr } : {}) } };
    }
    return v;
  };
  const walkSettings = (settings) => { if (settings?.email) settings.email = emailToTarget(settings.email); };
  const walkStyles = (styles) => { for (const st of Object.values(styles || {})) for (const va of st.variants || []) walkProps(va.props); };
  const walkEls = (ns) => { for (const n of ns || []) { walkSettings(n.settings); walkStyles(n.styles); walkEls(n.elements); } };
  for (const item of Object.values(bundle.classes?.items || {})) for (const va of item.variants || []) walkProps(va.props);
  for (const p of bundle.pages || []) walkEls(p.elements);
  for (const p of bundle.parts || []) walkEls(p.elements);
  return major >= 4.2 ? 'string (4.2+)' : 'number (4.1)';
}

/* An --inline bundle must NOT touch the target kit's _elementor_global_variables — the kit belongs
 * to the resident site, and overwriting it clobbers live token bindings. Inline is detected by the
 * `inline: true` flag (inline.mjs) or, for inline bundle.json files built before the flag existed,
 * by the numeric stats.inlined that only inline.mjs writes (a hand-crafted bundle carrying
 * stats.inlined is therefore treated as inline too). Everything else writes — INCLUDING a theme-less
 * bundle whose variables are the {data:{},watermark:0,version:1} fallback: that write is the
 * regression guard against the sitewide "Undefined array key watermark" PHP spray, so the decision
 * must never key off variables.data being empty. */
export function shouldWriteVariables(bundle) {
  return !(bundle.inline === true || typeof bundle.stats?.inlined === 'number');
}

// ONE slug derivation for the whole module: planOnly's matching and the page-loop upsert MUST agree,
// or --only would filter against a different slug than the deploy writes.
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* --only planning — PURE (no I/O, never mutates the bundle). Validates the requested slugs against
 * the bundle BEFORE deployBundle touches wp-cli or REST, so a typo costs zero side effects.
 * Matching is EXACT against the derived slug (p.slug || slugify(p.title)) — no slugify of the
 * user's token, no globbing — determinism over convenience. */
export function planOnly(bundle, only) {
  if (!only || only.length === 0) return { pages: bundle.pages, skipKit: false, warnings: [] };
  const wanted = [...new Set(only.map((s) => {
    const t = String(s).trim();
    if (!t) throw new Error('--only: empty slug entry — usage: exjsx deploy <bundle> --only <slug[,slug]>');
    return t;
  }))];
  const allSlugs = (bundle.pages || []).map((p) => p.slug || slugify(p.title));
  const misses = wanted.filter((s) => !allSlugs.includes(s));
  if (misses.length) throw new Error('--only: unknown slug(s) ' + misses.join(', ') + ' — bundle "' + bundle.name + '" has: ' + allSlugs.join(', '));
  const set = new Set(wanted);
  // BUNDLE order, not --only order — deploys stay deterministic regardless of how the flag was typed
  const pages = (bundle.pages || []).filter((_, i) => set.has(allSlugs[i]));
  // same emptiness condition that gates the class PUT below: inline bundles (order:[]) and
  // class-free bundles have no registry to lag, so no warning
  const warnings = bundle.classes?.order?.length
    ? ['--only: shared class registry (' + bundle.classes.order.length + ' classes) NOT updated — styles may lag; run a full deploy without --only to sync']
    : [];
  return { pages, skipKit: true, warnings };
}

export async function deployBundle(bundle, cfg = {}) {
  // --only validation FIRST — an unknown slug must throw before any wp-cli call or fetch
  const plan = planOnly(bundle, cfg.only);
  let wpcli = (cfg.wpcli || process.env.EXJSX_WPCLI || 'wp').split(' ');
  const cli = cfg.cli || process.env.EXJSX_CLI;
  const wpUrl = cfg.wpUrl || process.env.WP_URL;
  const auth = 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
  const report = { variables: 0, classes: 0, pages: [] };
  if (plan.warnings.length) report.warnings = plan.warnings;

  // wp-cli TARGET GUARD: a stray EXJSX_WPCLI (a repo .env pointing at some other stack's docker cli)
  // must never speak for THIS deploy's target — it answers with the WRONG site's Elementor version
  // (skewing the 4.1/4.2 envelope adapters into guaranteed 422s) and would write kit meta into the
  // wrong site. Trust wp-cli only when its siteurl matches WP_URL (host:port; localhost ≡ 127.0.0.1).
  if (wpUrl) {
    try {
      const cliSite = sh(wpcli[0], [...wpcli.slice(1), 'option', 'get', 'siteurl']).trim();
      const norm = (u) => { try { const p = new URL(u); return `${p.hostname.replace(/^localhost$/, '127.0.0.1')}:${p.port || (p.protocol === 'https:' ? 443 : 80)}`; } catch { return u; } };
      if (norm(cliSite) !== norm(wpUrl)) {
        report.wpcliSkipped = `EXJSX_WPCLI targets ${cliSite} but WP_URL is ${wpUrl} — wp-cli ignored for this deploy (REST-only)`;
        wpcli = ['__exjsx-wpcli-disabled__']; // every sh() call lands in its existing graceful catch
      }
    } catch { /* wp-cli absent/unreachable — existing per-call catches handle it */ }
  }

  // 0) version-adaptive prop forms (font-family, spans, border-radius-v2). Detect the target's
  // Elementor version via wp-cli when available, else over REST from the companion plugin's
  // capabilities endpoint — so no-Docker / REST-only targets (WordPress Playground, remote hosts)
  // still adapt to 4.2+ instead of shipping the 4.1 forms that 422 there.
  let ver = '';
  try {
    ver = sh(wpcli[0], [...wpcli.slice(1), 'plugin', 'get', 'elementor', '--field=version']).trim();
  } catch { /* no wp-cli — fall back to REST below */ }
  if (!ver && wpUrl) {
    try {
      const r = await fetch(`${wpUrl}/wp-json/elementor-ultra/v1/site/capabilities`, { headers: { Authorization: auth } });
      if (r.ok) { const j = await r.json(); ver = (j?.data ?? j)?.elementor_version || ''; }
    } catch { /* leave spans as authored if the version can't be determined */ }
  }
  if (ver) {
    report.elementorVersion = ver;
    report.spanForm = adaptSpansForVersion(bundle, ver);
  }

  // 1) ONE-SHOT kit write: all variables in a single update_post_meta (no per-token round-trips).
  // Requires wp-cli (EXJSX_WPCLI). GRACEFUL: if wp-cli isn't available (e.g. a REST-only tester setup),
  // skip variables — pages still render via the theme's literal fallback (only LIVE var-binding is lost).
  // Inline bundles skip this entirely (zero kit writes) — see shouldWriteVariables above.
  // --only skips ALL kit writes (variables + classes + parts); pages still deploy below. An inline
  // bundle under --only legitimately reports BOTH kitSkipped and variablesSkipped — additive, not
  // suppressed. --dry skips all kit writes too and reports variablesDry/classesDry instead.
  if (plan.skipKit) {
    report.kitSkipped = '--only: kit writes skipped (variables + classes + parts untouched)';
  }
  if (cfg.dry && !plan.skipKit) {
    // --dry is a READ-ONLY pre-check across the board: page saves are dry-run'd below, and the kit
    // must be untouched too (this step used to write variables + rewrite the whole class registry
    // with orphan deletion on a "dry" run — a state-mutating preflight).
    if (shouldWriteVariables(bundle)) report.variablesDry = `would write ${Object.keys(bundle.variables?.data || {}).length} variable(s)`;
    if (bundle.classes?.order?.length) report.classesDry = `would PUT ${bundle.classes.order.length} class(es) + orphan cleanup`;
  }
  if (!cfg.dry && !plan.skipKit && shouldWriteVariables(bundle)) {
    const b64 = Buffer.from(JSON.stringify(bundle.variables)).toString('base64');
    const php = `$k=\\Elementor\\Plugin::$instance->kits_manager->get_active_id(); update_post_meta($k,'_elementor_global_variables', wp_slash(base64_decode('${b64}'))); echo 'vars='.count(json_decode(base64_decode('${b64}'),true)['data']);`;
    try {
      const out = sh(wpcli[0], [...wpcli.slice(1), 'eval', php]);
      report.variables = parseInt((out.match(/vars=(\d+)/) || [])[1] || '0', 10);
    } catch {
      report.variables = 0;
      report.variablesSkipped = 'wp-cli unavailable — theme variables not written (pages use literal fallback; set EXJSX_WPCLI for live Class-Manager binding)';
    }
  } else if (!shouldWriteVariables(bundle)) {
    report.variables = 0;
    report.variablesSkipped = 'inline bundle — kit _elementor_global_variables untouched (resident site token bindings preserved)';
  }

  // 1b) ONE-SHOT class registry write: the WHOLE {items, order} in a single canonical PUT (the endpoint
  // the Class Manager uses — it writes the meta + CPT posts internally). Before pages so class CSS primes.
  if (!cfg.dry && !plan.skipKit && bundle.classes?.order?.length && wpUrl) {
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
    // FOREIGN-STORE guard: orphan cleanup assumes the site was built from THIS project. Deploying a
    // small side bundle (a probe page, a one-off) to an occupied site made "orphan cleanup" delete
    // the resident site's entire registry — 123 classes replaced by 4, every page unstyled (real
    // incident, 2026-08-09, and deploy's own Allow-Mass-Delete header waved it past the plugin
    // guard built for exactly this). If we'd delete more than we declare, the store isn't ours:
    // MERGE (keep the residents, add/update ours) unless --own-classes forces old semantics.
    let items = bundle.classes.items, order = bundle.classes.order, merged = 0;
    if (!cfg.ownClasses && deleted.length >= 5 && deleted.length > bundle.classes.order.length) {
      const foreign = {};
      try {
        let cursor = '';
        do {
          const pg = await (await fetch(`${wpUrl}/wp-json/elementor-ultra/v1/design/classes?per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: { Authorization: auth } })).json();
          const d = pg?.data || pg;
          for (const it of d?.items || []) if (it?.id && it.variants) foreign[it.id] = it;
          cursor = d?.next_cursor || '';
        } while (cursor);
      } catch { /* no plugin route — fall through to the throw below */ }
      const gotAll = deleted.every((id) => foreign[id]);
      if (!gotAll) {
        throw new Error(`deploy: this site's class store holds ${deleted.length} classes this bundle doesn't declare — it looks like another project lives here, and the full store couldn't be read for a safe merge. Deploy to a fresh site, or pass --own-classes to intentionally replace the store.`);
      }
      items = { ...Object.fromEntries(deleted.map((id) => [id, foreign[id]])), ...bundle.classes.items };
      order = [...deleted, ...bundle.classes.order.filter((id) => !foreign[id])];
      merged = deleted.length;
      deleted = [];
    }
    const res = await fetch(`${wpUrl}/wp-json/elementor/v1/global-classes`, {
      // X-EMCP-Allow-Mass-Delete: deploy OWNS the class namespace (orphan cleanup can legitimately
      // delete most of a stale registry); the plugin's mass-deletion guard exists to stop the
      // EDITOR's accidental store-wipe, not intentional registry replacement.
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: auth, 'X-EMCP-Allow-Mass-Delete': '1', 'X-EMCP-Skip-Reprime': '1' },
      body: JSON.stringify({ items, order, changes: { added: bundle.classes.order, deleted, modified: [] } }),
    });
    report.classes = res.ok ? bundle.classes.order.length : `ERR ${res.status}: ${(await res.text()).slice(0, 120)}`;
    report.orphansDeleted = deleted.length;
    if (merged) report.classesMerged = `${merged} resident class(es) preserved (foreign store — use --own-classes to replace)`;
  }

  // 1c) collection loops need the hidden dev experiment `e_pro_collection_loop` — enable it BEFORE
  //     any page save (the validator rejects unregistered element types). wp-cli; no-op without it.
  // filtered pages only; parts JSON excluded under --only (parts are not deployed then)
  const usesLoop = (JSON.stringify(plan.pages) + (plan.skipKit ? '' : JSON.stringify(bundle.parts || []))).includes('"e-collection-loop"');
  if (usesLoop && !cfg.dry) {
    try {
      sh(wpcli[0], [...wpcli.slice(1), 'option', 'update', 'elementor_experiment-e_pro_collection_loop', 'active']);
      report.loopExperiment = 'enabled';
    } catch { report.loopExperiment = 'wp-cli unavailable — enable elementor_experiment-e_pro_collection_loop manually or loops will 422'; }
  }

  // 1d) SEO runtime — pages carrying `seo` need the tiny mu-plugin that renders _exjsx_seo meta
  //     (WP core emits NO meta description/og tags without an SEO plugin). Idempotent, version-tagged.
  if (plan.pages?.some((p) => p.seo) && !cfg.dry) {
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
  // DRIFT DETECTION (pages only) — requires wp-cli: REST has no arbitrary-meta route (same constraint
  // as the SEO meta write below). One failed wp-cli call disables the feature for the WHOLE run and
  // every page then deploys exactly as before the feature existed.
  let driftEnabled = true;
  const driftEval = (php) => {
    if (!driftEnabled) return null;
    // _elementor_data (base64 through docker stdout) exceeds execFileSync's 1 MiB default maxBuffer
    try { return sh(wpcli[0], [...wpcli.slice(1), 'eval', php], { maxBuffer: 64 * 1024 * 1024 }); }
    catch {
      driftEnabled = false;
      report.driftCheck = 'wp-cli unavailable — drift detection skipped (hand-edit protection off; set EXJSX_WPCLI)';
      return null;
    }
  };
  for (const p of plan.pages) {
    const slug = p.slug || slugify(p.title);
    let id = await findPage(slug);
    // pre-check (existing pages only): stamp + live tree in ONE eval; unreadable live data IS drift.
    let stamped = null, current = null;
    if (id) {
      const out = driftEval(`$h=get_post_meta(${id},'_exjsx_hash',true); $d=get_post_meta(${id},'_elementor_data',true); echo 'h='.$h.';d='.base64_encode($d);`);
      const m = out === null ? null : /h=([^;]*);d=([A-Za-z0-9+/=]*)/.exec(out);
      if (m) {
        stamped = m[1] || null;
        try { current = canonicalHash(Buffer.from(m[2], 'base64').toString('utf8')); } catch { current = null; }
      }
    }
    const drift = driftEnabled && id
      ? decideDrift({ stamped, current, force: cfg.force })
      : { proceed: true, drifted: false, reason: 'first-stamp' };
    if (cfg.dry) {
      // read-only pre-check in dry mode: NO stamping, NO meta writes of any kind
      const action = !id ? 'create' : drift.reason === 'drifted-skip' ? 'update (DRIFTED — would skip; use --force)' : 'update';
      report.pages.push({ title: p.title, slug, id: id || null, action });
      continue;
    }
    if (!drift.proceed) {
      // loud stderr from deployBundle itself so `watch --deploy` surfaces it too
      console.error(`⚠ DRIFT: "${p.title}" (/${slug}/, id ${id}) edited outside exjsx — stamped ${shortHash(stamped)} ≠ live ${shortHash(current)}. SKIPPED. Re-run with --force to overwrite, or exjsx decompile the live tree to recover the edits.`);
      report.pages.push({ title: p.title, id, slug, action: 'skipped-drifted', stamped: shortHash(stamped), current: shortHash(current) });
      continue;
    }
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
    // SELF-PRIMING with retry: on PHP-WASM the first prime after a save races the CSS flush and
    // 500s CSS_PRIME_FAILED (retryable) — a settle + retry converts nearly all of those into
    // successes. Field agents were healing this by hand after every deploy; now the deploy owns it.
    let primed = cfg.fast === true; // --fast: skip self-prime — the post-deploy check's settle-visits
                                    // regenerate each page's css (invalidated by the save) anyway;
                                    // saves ~30-45s/page of WASM prime time in the deploy
    for (let attempt = 0; attempt < 3 && !primed; attempt++) {
      if (attempt) {
        // a real frontend render writes the global-<id> stylesheets that the programmatic dispatch
        // can miss (observed mode: page enqueues them, generator believes them valid, files absent —
        // only a page visit regenerates them). Visit, settle, retry.
        await fetch(`${wpUrl}/?page_id=${id}`, { signal: AbortSignal.timeout(20000) }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2500));
      }
      const pr = await fetch(eu(`/documents/${id}/prime-css`), { method: 'POST', headers: jhead, body: '{}' }).catch(() => null);
      primed = !!pr?.ok;
    }
    if (!primed) report.cssPrimeWarnings = [...(report.cssPrimeWarnings || []), `page ${id}: prime-css failed after 3 attempts — run \`eu-studio doctor --page ${id}\` or visit the page`];
    // ensure canvas template + stable slug via WP REST.
    try { await fetch(`${wpUrl}/wp-json/wp/v2/pages/${id}`, { method: 'POST', headers: jhead, body: JSON.stringify({ slug, template: p.template === 'elementor_canvas' ? 'elementor_canvas' : undefined }) }); } catch {}
    // per-page SEO meta (mu-plugin renders it; wp-cli write — REST has no arbitrary-meta route)
    if (p.seo) {
      try {
        const seoB64 = Buffer.from(JSON.stringify(p.seo)).toString('base64');
        sh(wpcli[0], [...wpcli.slice(1), 'eval', `update_post_meta(${id}, '_exjsx_seo', json_decode(base64_decode('${seoB64}'), true)); echo 'seo=ok';`]);
      } catch { /* reported via seoRuntime */ }
    }
    // POST-SAVE STAMP from READ-BACK, not from the sent p.elements — /save may normalize the tree
    // (defaults, id sanitization, span forms per adaptSpansForVersion); read-back stamping makes the
    // next deploy's clean-compare correct by construction.
    let stampSource;
    if (driftEnabled) {
      let stamp = null;
      const rb = driftEval(`echo base64_encode(get_post_meta(${id},'_elementor_data',true));`);
      if (rb !== null) { try { stamp = canonicalHash(Buffer.from(rb.trim(), 'base64').toString('utf8')); } catch { /* fall through to sent */ } }
      if (!stamp && driftEnabled) { stamp = canonicalHash(p.elements); stampSource = 'sent'; }
      if (stamp) driftEval(`update_post_meta(${id},'_exjsx_hash','${stamp}'); echo 'stamp=ok';`);
    }
    // clean/first-stamp entries keep EXACTLY {title,id,slug,action} — live suites deep-inspect this shape
    const entry = { title: p.title, id, slug, action };
    if (drift.drifted) entry.drifted = true;   // forced overwrite — visible, not silent
    if (stampSource) entry.stampSource = stampSource;
    report.pages.push(entry);
  }
  // 2b) COLLATERAL RE-PRIME (field root-cause 2026-08-08): the class-registry PUT above makes
  // Elementor DELETE the global css of EVERY page using a touched class — including pages this run
  // did not save (--only-filtered, drift-skipped). Those pages then serve 404/500 stylesheets until
  // someone visits them ("the css keeps fucking up"). Prime every bundle page that was NOT saved.
  if (!cfg.dry && !cfg.fast && !plan.skipKit && bundle.classes?.order?.length && wpUrl) {
    const savedIds = new Set(report.pages.filter((p) => p.id && /^(updated|created)/.test(p.action || '')).map((p) => p.id));
    const unsaved = (bundle.pages || []).filter((p) => !plan.pages.includes(p) || report.pages.some((r) => r.slug === (p.slug || slugify(p.title)) && !savedIds.has(r.id)));
    for (const p of unsaved) {
      const slug = p.slug || slugify(p.title);
      try {
        const q = await (await fetch(`${wpUrl}/wp-json/wp/v2/pages?slug=${slug}&status=publish,draft&_fields=id`, { headers: jhead })).json();
        const id = Array.isArray(q) && q[0]?.id;
        if (id && !savedIds.has(id)) {
          const pr = await fetch(eu(`/documents/${id}/prime-css`), { method: 'POST', headers: jhead, body: '{}' }).catch(() => null);
          report.collateralPrimed = [...(report.collateralPrimed || []), `${slug}#${id}${pr?.ok ? '' : ' (prime failed — visit the page or run doctor)'}`];
        }
      } catch { /* best-effort — doctor covers stragglers */ }
    }
  }

  // 3) THEME PARTS (header/footer) — Elementor Pro theme-builder templates, deployed via wp-cli
  //    (elementor_library has no REST surface). Recipe (live-verified 4.1.4 + Pro 4.1.0, works on
  //    block AND classic themes): elementor_library post + _elementor_edit_mode=builder +
  //    _elementor_template_type + elementor_library_type taxonomy + _elementor_conditions meta +
  //    atomic _elementor_data — then the conditions cache MUST be regenerate()d (deleting the
  //    option is NOT enough; without it the part never renders).
  //    DRIFT DETECTION IS PAGES-ONLY: theme parts keep their unconditional overwrite (no _exjsx_hash
  //    stamp, no pre-check) — hand edits to elementor_library posts are NOT protected here.
  if (!plan.skipKit && bundle.parts?.length) {
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
