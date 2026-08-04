/**
 * lint.mjs — the CONVENTIONS enforcer. Pure, offline: lintBundle(bundle) → findings.
 *
 * Every rule encodes a convention that was VIOLATED in a real build and cost a debug cycle
 * (see CONVENTIONS.md for the doctrine; each rule cites its incident). Severities:
 *   error — will bite in production (build should fail: `exjsx lint --strict` / CI);
 *   warn  — degrades quality/portability/a11y; fix before shipping;
 *   info  — style guidance; judgment call.
 *
 * Operates on the COMPILED bundle (post-dedup or --inline), so it also lints decompiled
 * and hand-crafted bundles — not just our own compiler output.
 */

const F = (rule, severity, where, message, fix) => ({ rule, severity, where, message, fix });

/* ── tree walking ───────────────────────────────────────── */
function* walk(elements, path = [], depth = 0) {
  for (const n of elements || []) {
    yield { n, path, depth };
    yield* walk(n.elements, [...path, n.id], depth + 1);
  }
}
const b64 = (raw) => { try { return Buffer.from(raw, 'base64').toString('utf8'); } catch { return ''; } };

/** every custom_css blob in the bundle, decoded: classes registry + residual local styles. */
function* allCustomCss(bundle) {
  for (const cls of Object.values(bundle.classes?.items || {})) {
    for (const v of cls.variants || []) if (v.custom_css?.raw) yield { owner: `class ${cls.label}`, css: b64(v.custom_css.raw) };
  }
  for (const page of pagesAndParts(bundle)) {
    for (const { n } of walk(page.elements)) {
      for (const st of Object.values(n.styles || {})) {
        for (const v of st.variants || []) if (v.custom_css?.raw) yield { owner: `${page.slug ?? page.type}#${n.id}`, css: b64(v.custom_css.raw) };
      }
    }
  }
}
function pagesAndParts(bundle) {
  return [...(bundle.pages || []), ...(bundle.parts || [])];
}
/** all style prop maps in the bundle (registry variants + local variants). */
function* allStyleProps(bundle) {
  for (const cls of Object.values(bundle.classes?.items || {})) {
    for (const v of cls.variants || []) yield { owner: `class ${cls.label}`, props: v.props || {} };
  }
  for (const page of pagesAndParts(bundle)) {
    for (const { n } of walk(page.elements)) {
      for (const st of Object.values(n.styles || {})) for (const v of st.variants || []) yield { owner: `${page.slug ?? page.type}#${n.id}`, props: v.props || {} };
    }
  }
}

/* ── the rules ──────────────────────────────────────────── */
/* Declarations in raw CSS that atomic props already cover — raw is the Pro-dependent escape
 * hatch (custom_css only renders via global classes, or the --inline <style> workaround), so
 * anything expressible atomically SHOULD be atomic. Incident: free-Elementor localized pages
 * silently dropped raw backgrounds/gradients until --inline existed. */
const ATOMIC_DECLS = new Set([
  'padding', 'margin', 'color', 'background', 'background-color', 'font-size', 'font-weight',
  'font-family', 'line-height', 'letter-spacing', 'text-align', 'width', 'height', 'max-width',
  'min-height', 'gap', 'display', 'border-radius', 'flex-direction', 'align-items',
  'justify-content', 'flex-wrap', 'object-fit', 'box-shadow',
]);
const GENERIC_FONT = /-apple-system|system-ui|BlinkMacSystemFont|sans-serif|serif|monospace|ui-sans|ui-serif|ui-mono/i;

const RULES = [
  {
    id: 'duplicate-page-slug', severity: 'error',
    run(bundle) {
      const seen = new Map();
      const out = [];
      for (const p of bundle.pages || []) {
        if (seen.has(p.slug)) out.push(F(this.id, this.severity, `page /${p.slug}/`, `two pages share slug "${p.slug}" ("${seen.get(p.slug)}" and "${p.title}") — the second deploy overwrites the first`, 'give every page a unique slug'));
        else seen.set(p.slug, p.title);
      }
      return out;
    },
  },
  {
    // Incident: attachment-id images silently lose alt on Elementor 4.1.4; URL-src images support
    // inline alt — so an EMPTY alt on a URL image is always an authoring omission.
    id: 'img-alt', severity: 'warn',
    run(bundle) {
      const out = [];
      for (const page of pagesAndParts(bundle)) {
        for (const { n } of walk(page.elements)) {
          if (n.widgetType !== 'e-image') continue;
          const j = JSON.stringify(n.settings?.image ?? {});
          const isUrlSrc = j.includes('"url"') && !/"id":\{/.test(j);
          if (isUrlSrc && !/"alt":\{?"?\$?\$?[^}]*"value":"[^"]/.test(j) && !/"alt":"[^"]/.test(j)) {
            out.push(F(this.id, this.severity, `${page.slug ?? page.type}#${n.id}`, 'URL-src image has no alt text', 'pass alt="…" on <img> (URL sources carry inline alt)'));
          }
        }
      }
      return out;
    },
  },
  {
    id: 'page-seo', severity: 'warn',
    run(bundle) {
      return (bundle.pages || [])
        .filter((p) => !p.seo?.title || !p.seo?.description)
        .map((p) => F(this.id, this.severity, `page /${p.slug}/`, `page "${p.title}" is missing seo ${!p.seo?.title ? 'title' : 'description'}`, 'add seo: { title, description } to the page def'));
    },
  },
  {
    // a11y + SEO: exactly one h1 per page; no level jumps (h2 → h4). Incident-free so far
    // BECAUSE hand-reviewed every time — this makes the review mechanical.
    id: 'heading-structure', severity: 'warn',
    run(bundle) {
      const out = [];
      for (const p of bundle.pages || []) {
        const levels = [];
        for (const { n } of walk(p.elements)) {
          if (n.widgetType === 'e-heading') levels.push(Number(n.settings?.tag?.value?.replace?.('h', '') || 2));
        }
        const h1s = levels.filter((l) => l === 1).length;
        if (h1s === 0) out.push(F(this.id, this.severity, `page /${p.slug}/`, 'no <h1> on the page', 'promote the primary headline to <h1>'));
        if (h1s > 1) out.push(F(this.id, this.severity, `page /${p.slug}/`, `${h1s} <h1> elements on one page`, 'keep exactly one <h1>; use h2/h3 for sections'));
        for (let i = 1; i < levels.length; i++) {
          if (levels[i] - levels[i - 1] > 1) { out.push(F(this.id, this.severity, `page /${p.slug}/`, `heading level jump h${levels[i - 1]} → h${levels[i]}`, 'step heading levels one at a time')); break; }
        }
      }
      return out;
    },
  },
  {
    // Incident: fresh-agent + Apple build — a font-family used in styles but never loaded falls
    // back silently and every size/wrap measurement is wrong.
    id: 'font-not-loaded', severity: 'warn',
    run(bundle) {
      const loaded = new Set((bundle.fonts || []).map((f) => f.toLowerCase()));
      for (const page of pagesAndParts(bundle)) {
        for (const { n } of walk(page.elements)) {
          const html = n.widgetType === 'html' ? String(n.settings?.html || '') : '';
          for (const m of html.matchAll(/fonts\.googleapis\.com\/css2\?family=([^:&"']+)/g)) loaded.add(decodeURIComponent(m[1]).replace(/\+/g, ' ').toLowerCase());
        }
      }
      const used = new Map();
      for (const { owner, props } of allStyleProps(bundle)) {
        const ff = props['font-family'];
        if (!ff || ff.$$type !== 'string') continue;   // variable refs resolve via the theme — fine
        const fam = String(ff.value);
        if (GENERIC_FONT.test(fam)) continue;          // system stacks need no loading
        const first = fam.split(',')[0].trim().replace(/^["']|["']$/g, '');
        if (!loaded.has(first.toLowerCase()) && !used.has(first)) used.set(first, owner);
      }
      return [...used].map(([fam, owner]) => F(this.id, this.severity, owner, `font-family "${fam}" is used but never loaded (no fontLoader, not in bundle.fonts, not a system stack)`, `add fontLoader('${fam}', [weights]) first in the tree, or use a theme font`));
    },
  },
  {
    // Incident: cold-start portability round — dev-host URLs baked into bundles break the moment
    // the bundle deploys anywhere else.
    id: 'env-baked-url', severity: 'warn',
    run(bundle) {
      const hits = new Map();
      for (const page of pagesAndParts(bundle)) {
        for (const { n } of walk(page.elements)) {
          const m = JSON.stringify(n.settings || {}).match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?[^"\\]*/);
          if (m && !hits.has(page.slug ?? page.type)) hits.set(page.slug ?? page.type, m[0]);
        }
      }
      return [...hits].map(([slug, url]) => F(this.id, this.severity, `page /${slug}/`, `localhost URL baked into content: ${url.slice(0, 60)}…`, 'sideload media to the target site (media manifest) or key URLs off WP_URL at build time'));
    },
  },
  {
    id: 'raw-atomic-overlap', severity: 'warn',
    run(bundle) {
      const out = [];
      for (const { owner, css } of allCustomCss(bundle)) {
        if (css.includes('&') || css.includes('@')) continue;   // nested/pseudo/media rules are exactly what raw is FOR
        const overlap = [...css.matchAll(/(?:^|;|\s)([a-z-]+)\s*:/g)].map((m) => m[1]).filter((d) => ATOMIC_DECLS.has(d));
        if (overlap.length) out.push(F(this.id, this.severity, owner, `raw CSS sets [${[...new Set(overlap)].join(', ')}] which atomic props cover — raw only renders via global classes (or --inline)`, 'move these to tw/sx props; keep raw for nested selectors, pseudo-classes and non-atomic CSS'));
      }
      return out;
    },
  },
  {
    id: 'oversized-raw', severity: 'info',
    run(bundle) {
      const out = [];
      for (const { owner, css } of allCustomCss(bundle)) {
        const decls = (css.match(/[a-z-]+\s*:/g) || []).length;
        if (decls > 8) out.push(F(this.id, this.severity, owner, `${decls} declarations in one raw block`, 'large raw blocks resist dedup and review — split into atomic props + a minimal raw remainder'));
      }
      return out;
    },
  },
  {
    // Post-dedup classes named by content hash and reused widely deserve a semantic name —
    // the Class Manager shows these labels to the client.
    id: 'unnamed-shared-class', severity: 'info',
    run(bundle) {
      const refs = new Map();
      for (const page of pagesAndParts(bundle)) {
        for (const { n } of walk(page.elements)) {
          for (const c of n.settings?.classes?.value || []) refs.set(c, (refs.get(c) || 0) + 1);
        }
      }
      const out = [];
      for (const cls of Object.values(bundle.classes?.items || {})) {
        if (/^c-[0-9a-z]{4,8}$/.test(cls.label) && (refs.get(cls.id) || 0) >= 3) {
          out.push(F(this.id, this.severity, `class ${cls.label}`, `hash-named class reused by ${refs.get(cls.id)} elements`, 'add cls="…" on the component so the shared class gets a semantic Class-Manager name'));
        }
      }
      return out;
    },
  },
  {
    id: 'placeholder-link', severity: 'info',
    run(bundle) {
      let count = 0; let where = '';
      for (const page of pagesAndParts(bundle)) {
        for (const { n } of walk(page.elements)) {
          const dest = n.settings?.link?.value?.destination?.value;
          if (dest === '#') { count++; if (!where) where = `${page.slug ?? page.type}#${n.id}`; }
        }
      }
      return count ? [F(this.id, this.severity, where + (count > 1 ? ` (+${count - 1} more)` : ''), `${count} link(s) point at bare "#"`, 'wire real destinations before shipping (or use "#section" anchors)')] : [];
    },
  },
  {
    // Every container carries layout defaults (display/padding), so "unstyled" means: none of the
    // props that give an empty box a PURPOSE (size, background, border, shadow) — resolved through
    // the class registry and local styles.
    id: 'empty-container', severity: 'info',
    run(bundle) {
      const PURPOSE = ['min-height', 'height', 'background', 'border-radius', 'border-width', 'box-shadow'];
      const items = bundle.classes?.items || {};
      const hasPurpose = (n) => {
        const variantSets = [
          ...(n.settings?.classes?.value || []).map((c) => items[c]?.variants || []),
          ...Object.values(n.styles || {}).map((st) => st.variants || []),
        ];
        return variantSets.flat().some((v) => PURPOSE.some((p) => v.props?.[p]));
      };
      const out = [];
      for (const page of pagesAndParts(bundle)) {
        for (const { n } of walk(page.elements)) {
          if ((n.elType === 'e-flexbox' || n.elType === 'e-div-block') && !(n.elements || []).length && !hasPurpose(n)) {
            out.push(F(this.id, this.severity, `${page.slug ?? page.type}#${n.id}`, 'empty container with no size/background purpose', 'remove it, or give it a job (bg / min-height / spacer style)'));
          }
        }
      }
      return out;
    },
  },
  {
    id: 'deep-nesting', severity: 'info',
    run(bundle) {
      const out = [];
      for (const page of pagesAndParts(bundle)) {
        let worst = 0;
        for (const { depth } of walk(page.elements)) worst = Math.max(worst, depth);
        if (worst > 10) out.push(F(this.id, this.severity, `page /${page.slug ?? page.type}/`, `container nesting reaches depth ${worst}`, 'flatten with grid spans / partial-side spacing — deep trees are slow to edit and render'));
      }
      return out;
    },
  },
];

/** Run every rule. Returns { findings, counts: {error,warn,info} }. */
export function lintBundle(bundle) {
  if (!bundle || !Array.isArray(bundle.pages)) throw new Error('lintBundle: not a compiled bundle (expected { pages: [...] }) — build first, or pass a bundle.json');
  const findings = RULES.flatMap((r) => r.run(bundle));
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return { findings, counts };
}

/** CLI formatter: grouped by severity, stable order, one line per finding. */
export function formatLint({ findings, counts }) {
  const order = { error: 0, warn: 1, info: 2 };
  const lines = findings
    .sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule))
    .map((f) => `${f.severity.toUpperCase().padEnd(5)} ${f.rule} [${f.where}]: ${f.message}\n      fix: ${f.fix}`);
  const head = `lint: ${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} info`;
  return [head, ...lines].join('\n');
}
