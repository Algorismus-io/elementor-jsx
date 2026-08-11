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

/* Envelope validity: a $$type envelope whose value can't be what the schema demands ships a
 * silent 400 (or renders nothing). Incident: grad="linear-gradient(…)" string-spread into
 * GRAD('l','i','n') — angle 'l' sailed through to the server and died there; bg:"linear-gradient"
 * shipped a gradient string inside a color envelope and rendered nothing. Post-compile lint is
 * the last line for hand-built/decompiled bundles too. */
const SIZE_UNITS = new Set(['px', '%', 'em', 'rem', 'vw', 'vh', 'ch', 'vmin', 'vmax', 'deg', 'rad', 's', 'ms', 'auto', 'custom', 'fr']);
/* Alignment enums from Elementor's style-schema.php — lint them here for hand-built/decompiled
 * bundles (the compiler already throws; a bundle from elsewhere deserves the same catch).
 * Incident: justify="between"/align="start" passed a 0-error lint, then the deploy 400d. */
const FLEX_ENUMS = {
  'justify-content': new Set(['center', 'start', 'end', 'flex-start', 'flex-end', 'left', 'right', 'normal', 'space-between', 'space-around', 'space-evenly', 'stretch']),
  'align-items': new Set(['normal', 'stretch', 'center', 'start', 'end', 'flex-start', 'flex-end', 'self-start', 'self-end', 'anchor-center']),
  'align-content': new Set(['center', 'start', 'end', 'space-between', 'space-around', 'space-evenly']),
  'flex-wrap': new Set(['wrap', 'nowrap', 'wrap-reverse']),
  'flex-direction': new Set(['row', 'column', 'row-reverse', 'column-reverse']),
};
const COLORISH = /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|color-mix\(|var\(|currentcolor$|transparent$|[a-zA-Z]{3,25}$)/;
function* walkEnvelopes(v, path = '') {
  if (!v || typeof v !== 'object') return;
  if (typeof v.$$type === 'string') yield { env: v, path };
  const inner = v.value !== undefined ? v.value : v;
  if (Array.isArray(inner)) { for (let i = 0; i < inner.length; i++) yield* walkEnvelopes(inner[i], `${path}[${i}]`); }
  else if (inner && typeof inner === 'object') { for (const [k, sub] of Object.entries(inner)) yield* walkEnvelopes(sub, path ? `${path}.${k}` : k); }
}

const RULES = [
  {
    id: 'invalid-envelope', severity: 'error',
    run(bundle) {
      const out = [];
      for (const { owner, props } of allStyleProps(bundle)) {
        for (const [prop, root] of Object.entries(props)) {
          for (const { env, path } of walkEnvelopes(root, prop)) {
            const at = `${owner} ${path}`;
            if (env.$$type === 'number' && !Number.isFinite(Number(env.value))) {
              out.push(F(this.id, this.severity, at, `number envelope holds '${env.value}' — the server 400s on this`, 'pass a real number (a string here usually means a spread/typo upstream)'));
            } else if (env.$$type === 'size') {
              const { unit, size } = env.value || {};
              if (unit !== 'auto' && unit !== 'custom' && !Number.isFinite(Number(size))) out.push(F(this.id, this.severity, at, `size envelope holds size '${size}'`, 'sizes need a numeric size (calc()/clamp() belong in raw CSS)'));
              if (unit != null && !SIZE_UNITS.has(unit)) out.push(F(this.id, this.severity, at, `size envelope has unknown unit '${unit}'`, `use one of ${['px', '%', 'em', 'rem', 'vw', 'vh', 'ch'].join('/')}`));
            } else if (env.$$type === 'grid-track-size') {
              // e-grid tracks: fr = repeat-count (positive int via Grid_Track_Renderer), custom = verbatim CSS track list
              const { unit, size } = env.value || {};
              if (unit === 'fr' && (!Number.isInteger(Number(size)) || Number(size) < 1)) out.push(F(this.id, this.severity, at, `grid-track-size fr envelope holds count '${size}' — repeat() needs a positive integer`, 'use TRACKS(n) for n equal columns, or TRACKS("240px 1fr") for custom lists'));
              else if (unit === 'custom' && (typeof size !== 'string' || !size.trim())) out.push(F(this.id, this.severity, at, 'grid-track-size custom envelope holds an empty/non-string track list', 'pass a CSS track list string: TRACKS("240px 1fr 1fr")'));
              else if (unit !== 'fr' && unit !== 'custom') out.push(F(this.id, this.severity, at, `grid-track-size envelope has unknown unit '${unit}'`, 'the schema allows fr (equal-track count) or custom (verbatim list) only'));
            } else if (env.$$type === 'span' && typeof env.value !== 'number' && typeof env.value !== 'string') {
              out.push(F(this.id, this.severity, at, `span envelope holds ${JSON.stringify(env.value)}`, 'grid-column/grid-row spans take a number (authored form; deploy adapts per Elementor version) or a CSS placement string'));
            } else if (env.$$type === 'string' && FLEX_ENUMS[prop] && !FLEX_ENUMS[prop].has(env.value)) {
              out.push(F(this.id, this.severity, at, `'${env.value}' isn't in Elementor's ${prop} enum — the server 400s on this`, `use one of: ${[...FLEX_ENUMS[prop]].join(' | ')}`));
            } else if (env.$$type === 'color' && typeof env.value === 'string') {
              if (env.value.includes('gradient(')) out.push(F(this.id, this.severity, at, 'a CSS gradient string inside a color envelope renders nothing', 'use grad:[angle,from,to] or raw="background-image:…" for gradients'));
              else if (!COLORISH.test(env.value.trim())) out.push(F(this.id, this.severity, at, `color envelope holds '${env.value.slice(0, 40)}' which isn't a color`, 'use #hex/rgb()/hsl()/var()/named colors'));
            }
          }
        }
      }
      return out;
    },
  },
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
    // back silently and every size/wrap measurement is wrong. UPDATE (2026-08-09, measured on a
    // live V4 stack with obscure catalog fonts + a fake-family negative control): Elementor
    // NATIVELY enqueues Google Fonts for every family that appears in atomic style props — the
    // frontend emits `elementor-gf-<family>-css` <link>s and the woff2s load, no carrier needed.
    // What Elementor does NOT scan is raw= custom CSS and html-widget markup: a family referenced
    // ONLY there still silently falls back. That residue is what this rule now guards.
    id: 'font-not-loaded', severity: 'warn',
    run(bundle) {
      const loaded = new Set((bundle.fonts || []).map((f) => f.toLowerCase()));
      const htmlBlobs = [];
      for (const page of pagesAndParts(bundle)) {
        for (const { n } of walk(page.elements)) {
          if (n.widgetType !== 'html') continue;
          const html = String(n.settings?.html || '');
          htmlBlobs.push({ owner: `${page.slug ?? page.type}#${n.id}`, html });
          for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^:&"']+)/g)) loaded.add(decodeURIComponent(m[1]).replace(/\+/g, ' ').toLowerCase());
        }
      }
      // families set via style props ride Elementor's native google-fonts enqueue — count as loaded
      for (const { props } of allStyleProps(bundle)) {
        const ff = props['font-family'];
        if (!ff || (ff.$$type !== 'string' && ff.$$type !== 'font-family')) continue;   // variable refs resolve via the theme — fine
        loaded.add(String(ff.value).split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase());
      }
      // remaining risk: a family referenced ONLY in raw CSS / html-widget markup with no loader
      const used = new Map();
      const consider = (fam, owner) => {
        fam = String(fam).trim();
        if (!fam || GENERIC_FONT.test(fam)) return;    // system stacks need no loading
        const first = fam.split(',')[0].trim().replace(/^["']|["']$/g, '');
        if (!first || /^(inherit|initial|unset|revert|var\()/i.test(first)) return;
        if (!loaded.has(first.toLowerCase()) && !used.has(first)) used.set(first, owner);
      };
      for (const { owner, css } of allCustomCss(bundle)) {
        for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) consider(m[1], owner);
      }
      for (const { owner, html } of htmlBlobs) {
        for (const m of html.matchAll(/font-family\s*:\s*([^;}"']+)/gi)) consider(m[1], owner);
      }
      return [...used].map(([fam, owner]) => F(this.id, this.severity, owner, `font-family "${fam}" appears only in raw/html content — Elementor's native Google Fonts enqueue never sees it, so it silently falls back`, `set the family on any element via a style prop (font='${fam}') so Elementor enqueues it, or add fontLoader('${fam}', [weights])`));
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
    // custom_css survives a WordPress save only if it's sanitize-safe: Elementor decodes →
    // sanitize_textarea_field → re-encodes, and ANY '<' is stripped/escaped there ('<…>' dies as
    // a tag, a bare '<' becomes &lt;) — the CSS reaches the renderer mangled with zero errors.
    // And the renderer appends a literal \n two-char sequence, so a final declaration missing its
    // ';'/'}' silently dies in the browser parser. css() guards kit-authored CSS at build; this
    // rule re-guards FOREIGN blobs (decompiled/imported/hand-built bundles).
    id: 'custom-css-sanitize', severity: 'error',
    run(bundle) {
      const out = [];
      for (const { owner, css } of allCustomCss(bundle)) {
        const t = css.trimEnd();
        const lt = t.indexOf('<');
        if (lt !== -1) out.push(F(this.id, this.severity, owner, `custom_css contains '<' (…${t.slice(Math.max(0, lt - 12), lt + 12)}…) — sanitize_textarea_field strips/escapes tag-like sequences on save, so this CSS arrives mangled`, 'use the CSS escape \\3C (content:"\\3C") or restructure the rule'));
        if (t && !t.endsWith(';') && !t.endsWith('}')) out.push(F(this.id, this.severity, owner, `custom_css ends without ';' or '}' ("…${t.slice(-24)}") — the renderer appends a literal \\n two-char sequence, so the last declaration dies in the browser parser`, "terminate the final declaration with ';' (css() auto-guards kit CSS; re-guard foreign/imported blobs)"));
      }
      return out;
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
          if ((n.elType === 'e-flexbox' || n.elType === 'e-div-block' || n.elType === 'e-grid') && !(n.elements || []).length && !hasPurpose(n)) {
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
  // positive-assertion summary for the clean rules (what silence actually proved)
  const dirty = new Set(findings.map((f) => f.rule));
  const verified = [];
  if (!dirty.has('invalid-envelope')) {
    let envs = 0;
    for (const { props } of allStyleProps(bundle)) for (const root of Object.values(props)) for (const _ of walkEnvelopes(root)) envs++;
    verified.push(`${envs} style envelopes valid (numbers/colors/units/flex-enums)`);
  }
  if (!dirty.has('font-not-loaded')) {
    const fams = new Set();
    for (const { props } of allStyleProps(bundle)) {
      const ff = props['font-family'];
      if (ff && (ff.$$type === 'string' || ff.$$type === 'font-family')) fams.add(String(ff.value).split(',')[0].trim().replace(/^["']|["']$/g, ''));
    }
    if (fams.size) verified.push(`${fams.size} font famil${fams.size === 1 ? 'y' : 'ies'} covered (native enqueue or loader): ${[...fams].slice(0, 6).join(', ')}`);
  }
  if (!dirty.has('custom-css-sanitize')) {
    let blobs = 0;
    for (const _ of allCustomCss(bundle)) blobs++;
    if (blobs) verified.push(`${blobs} custom_css blob(s) sanitize-safe (no '<' mangle, terminated declarations)`);
  }
  if (!dirty.has('duplicate-page-slug')) verified.push(`${(bundle.pages || []).length} page slug(s) unique`);
  return { findings, counts, verified };
}

/** CLI formatter: grouped by severity, stable order, one line per finding. */
export function formatLint({ findings, counts, verified }) {
  const order = { error: 0, warn: 1, info: 2 };
  const lines = findings
    .sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule))
    .map((f) => `${f.severity.toUpperCase().padEnd(5)} ${f.rule} [${f.where}]: ${f.message}\n      fix: ${f.fix}`);
  const head = `lint: ${counts.error} error(s), ${counts.warn} warning(s), ${counts.info} info`;
  // Positive assertions: say what a clean rule actually PROVED, so agents don't re-verify it by
  // hand (field pattern: font lint was silent and the agent still built a paint-probe to check
  // fonts — silence isn't trusted; a stated verification is).
  const tail = verified?.length ? [`verified: ${verified.join(' · ')}`] : [];
  return [head, ...lines, ...tail].join('\n');
}
