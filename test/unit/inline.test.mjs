/**
 * inline.mjs — --inline mode: self-contained pages (multi-tenancy). Classes re-inlined
 * as SALTED local styles, registry emptied, raw CSS re-emitted as a real <style> block
 * (the free-Elementor custom_css no-op workaround).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compileSite, normalizeIds } from '../../src/compile.mjs';
import { inlineLocal, reinlineTree } from '../../src/inline.mjs';
import { shouldWriteVariables, deployBundle } from '../../src/deploy.mjs';
import { defineSite } from '../../src/site.mjs';
import { defineTheme } from '../../src/theme.mjs';
import { h } from '../../src/runtime.mjs';
import { defineComponent, expandInstances } from '../../src/component.mjs';
import { resetIds, allNodes, classRefs, findNode } from '../helpers.mjs';

beforeEach(() => resetIds());

const page = (slug, node) => ({ title: slug, slug, node });
const buildBundle = (name, node) => compileSite(defineSite({ name, pages: [page('p', node)] }));

test('inline: registry emptied, refs become salted LOCAL styles, deploy would skip the PUT', () => {
  const b = buildBundle('site-a', h('box', { pad: 24 }, h('text', { size: 14 }, 'x')));
  const stats = inlineLocal(b);
  assert.deepEqual(b.classes, { items: {}, order: [] });
  assert.equal(stats.inlined, 2);
  assert.equal(stats.dropped, 2);
  for (const n of allNodes(b.pages[0].elements)) {
    for (const ref of classRefs(n)) {
      assert.ok(n.styles[ref], `ref ${ref} resolves to a local style on the node`);
      assert.ok(/^e-[0-9a-z]{1,8}-/.test(ref), 'salted id form');
    }
  }
});

test('inline: salt differs per bundle NAME (coexisting pages cannot bleed)', () => {
  const mk = (name) => { resetIds(); const b = buildBundle(name, h('text', { size: 14 }, 'x')); inlineLocal(b); return b; };
  const a = mk('site-a'), c = mk('site-b');
  const sidsA = allNodes(a.pages[0].elements).flatMap((n) => Object.keys(n.styles || {}));
  const sidsB = allNodes(c.pages[0].elements).flatMap((n) => Object.keys(n.styles || {}));
  assert.ok(sidsA.length && sidsB.length);
  for (const s of sidsA) assert.ok(!sidsB.includes(s), `sid ${s} must not collide across bundles`);
});

test('inline: variants are preserved exactly through the re-inline (no style loss)', () => {
  const b = buildBundle('s', h('text', { size: 14, mobile: { size: 12 } }, 'x'));
  const before = JSON.stringify(Object.values(b.classes.items)[0].variants);
  inlineLocal(b);
  const n = findNode(b.pages[0].elements, (x) => x.widgetType === 'e-paragraph');
  const st = n.styles[Object.keys(n.styles)[0]];
  assert.equal(JSON.stringify(st.variants), before);
});

test('inline: raw CSS becomes a real <style> block injected FIRST (free-Elementor fix)', () => {
  const b = buildBundle('s', h('box', { pad: 0, raw: 'clip-path:polygon(0 0,100% 0,100% 80%,0 100%);' }));
  const stats = inlineLocal(b);
  assert.equal(stats.rawRules, 1);
  const first = b.pages[0].elements[0];
  assert.equal(first.widgetType, 'html');
  assert.match(first.settings.html, /^<style id="exjsx-raw-/);
  assert.match(first.settings.html, /clip-path:polygon/);
  // doubled-class specificity so the rule beats the atomic one
  assert.match(first.settings.html, /\.elementor \.(e-[0-9a-z-]+)\.\1\{/);
});

test('inline: responsive raw CSS is @media-wrapped per breakpoint', () => {
  // author a tablet-scoped custom_css by hand on a compiled class
  const b = buildBundle('s', h('box', { pad: 0 }));
  const cls = Object.values(b.classes.items)[0];
  cls.variants.push({ meta: { breakpoint: 'mobile', state: null }, props: {}, custom_css: { raw: Buffer.from('display:none;').toString('base64') } });
  inlineLocal(b);
  const style = b.pages[0].elements[0].settings.html;
  assert.match(style, /@media\(max-width:767px\)\{[^}]*display:none/);
});

test('inline: no raw CSS → no style widget injected', () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  inlineLocal(b);
  assert.notEqual(b.pages[0].elements[0]?.widgetType, 'html');
});

test('inline: EXTERNAL refs (gcls to kit classes) are left as refs, not inlined', () => {
  const b = buildBundle('s', h('text', { size: 14, gcls: 'g-kxbody' }, 'x'));
  inlineLocal(b);
  const n = findNode(b.pages[0].elements, (x) => x.widgetType === 'e-paragraph');
  const refs = classRefs(n);
  assert.ok(refs.includes('g-kxbody'), 'external class ref preserved');
  assert.equal(refs.filter((r) => r !== 'g-kxbody').length, 1, 'own style inlined next to it');
});

test('inline: stats.sharedClasses reset to 0 (deploy display honesty)', () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  inlineLocal(b);
  assert.equal(b.stats.sharedClasses, 0);
});

const buildThemed = (name, node) => {
  const theme = defineTheme({ name: 'x', color: { a: '#111' } });
  return compileSite(defineSite({ name, theme, pages: [page('p', node)] }));
};

test('inline: bundle carries a JSON-serializable inline marker (survives bundle.json round-trip)', () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  inlineLocal(b);
  assert.equal(b.inline, true);
  assert.equal(shouldWriteVariables(JSON.parse(JSON.stringify(b))), false);
});

test('deploy plan: variables write decision matrix (inline skips, watermark fallback kept)', () => {
  const inlineThemed = buildThemed('s', h('text', { size: 14 }, 'x'));
  inlineLocal(inlineThemed);
  // populated data proves the FLAG, not empty variables.data, drives the skip
  assert.ok(Object.keys(inlineThemed.variables.data).length > 0);
  resetIds();
  const themeless = buildBundle('s', h('text', { size: 14 }, 'x'));
  // the PHP-warning regression envelope: theme-less fallback MUST still be written
  assert.deepEqual(themeless.variables, { data: {}, watermark: 0, version: 1 });
  resetIds();
  const themed = buildThemed('s', h('text', { size: 14 }, 'x'));
  const cases = [
    ['inline themed bundle skips (flag wins over populated data)', inlineThemed, false],
    ['non-inline theme-less writes the watermark fallback', themeless, true],
    ['non-inline themed writes', themed, true],
    ['pre-fix inline bundle.json (stats.inlined, no flag) skips', { stats: { inlined: 0 } }, false],
    ['bare bundle writes (safe default)', {}, true],
  ];
  for (const [name, bundle, want] of cases) assert.equal(shouldWriteVariables(bundle), want, name);
});

test('deployBundle dry: inline bundle reports variablesSkipped=inline and never attempts the kit write', async () => {
  const b = buildBundle('s', h('text', { size: 14 }, 'x'));
  inlineLocal(b);
  b.pages = [];                                  // fully offline — no fetch
  // wpcli 'false' exits 1: IF the write path ran it would take the wp-cli-unavailable catch instead
  const r = await deployBundle(b, { dry: true, wpcli: 'false' });
  assert.equal(r.variables, 0);
  assert.match(r.variablesSkipped, /inline/);
  assert.doesNotMatch(r.variablesSkipped, /wp-cli unavailable/);
});

/* ── the deploy-time RENUMBERING contract ──
 * The <style> carrier selects by style id and style ids embed element ids. deploy's component
 * inline-expansion fallback splices subtrees in and re-runs normalizeIds, which shifts every id —
 * so the carrier has to be re-emitted or its rules land on the WRONG elements. Field symptom: a
 * hero's `text-[20vw]` applied to the 12px eyebrow one node above it (288px at 1440). */

/** Exactly what deploy.mjs does on the no-Pro / no-ultra-route path, for one page. */
const expandLikeDeploy = (b, opts = {}) => {
  const byUid = Object.fromEntries(b.components.map((c) => [c.uid, c]));
  const p = b.pages[0];
  p.elements = normalizeIds(expandInstances(p.elements, byUid));
  reinlineTree(b, p, 0, opts);
  return p;
};
const carrierOf = (p) => allNodes(p.elements).find((n) => n.widgetType === 'html' && /^<style id="exjsx-raw-/.test(n.settings?.html || ''))?.settings.html;
/** the ONE declaration block the carrier emits for a given style id */
const ruleFor = (css, sid) => (css.match(new RegExp(`\\.elementor \\.${sid}\\.${sid}\\{([^}]*)`)) || [])[1];

test('inline + component expansion: raw CSS follows the RENUMBERED ids (no style/element mis-assignment)', () => {
  // minimal fixture: a component instance (forces the deploy-time expand+renumber) followed by two
  // ADJACENT siblings — a small eyebrow and a heading carrying a distinctive tw size.
  const Card = defineComponent(() => h('box', { pad: 24 }, h('text', {}, 'card')), { title: 'Card' });
  const b = buildBundle('site', h('box', {},
    h(Card, {}),
    h('text', { size: 12, tw: 'text-[12px]' }, 'Paid acquisition'),
    h('h1', { tw: 'text-[20vw] uppercase' }, 'HERO'),
  ));
  inlineLocal(b);
  const p = expandLikeDeploy(b);

  const eyebrow = findNode(p.elements, (n) => n.widgetType === 'e-paragraph' && /Paid acquisition/.test(JSON.stringify(n.settings)));
  const hero = findNode(p.elements, (n) => n.widgetType === 'e-heading');
  const [eSid] = classRefs(eyebrow), [hSid] = classRefs(hero);
  assert.notEqual(eSid, hSid);

  const css = carrierOf(p);
  assert.match(ruleFor(css, hSid) || '', /20vw/, 'the heading\'s own style id carries its 20vw rule');
  assert.doesNotMatch(ruleFor(css, eSid) || '', /20vw/, 'the eyebrow NEVER receives the heading\'s size');
  // and no rule may address a style id that is not on the tree at all (a stale rule is a live
  // land-mine: the next renumbering hands that id to some other element).
  const live = new Set(allNodes(p.elements).flatMap((n) => Object.keys(n.styles || {})));
  for (const sid of css.match(/\.elementor \.(e-[0-9a-z-]+?)\./g).map((m) => m.slice(12, -1))) {
    assert.ok(live.has(sid), `carrier rule targets ${sid}, which no element carries`);
  }
});

test('inline + component expansion: the carrier collapses ITS OWN live wrapper id (no 20px page shift)', () => {
  const Card = defineComponent(() => h('box', { pad: 8 }), { title: 'Carrier Card' });
  const b = buildBundle('site', h('box', {}, h(Card, {}), h('box', { pad: 0, raw: 'opacity:.5;' })));
  inlineLocal(b);
  const p = expandLikeDeploy(b);
  const carrier = p.elements.find((n) => n.widgetType === 'html');
  assert.match(carrierOf(p), new RegExp(`\\.elementor-element-${carrier.id}\\{margin:0`), 'margin-collapse rule names the widget\'s CURRENT id');
});

test('inline + component expansion: expanded subtree styles join the SALTED namespace', () => {
  const Card = defineComponent(() => h('box', { pad: 24, raw: 'backdrop-filter:blur(4px);' }, h('text', {}, 'c')), { title: 'Salt Card' });
  const b = buildBundle('site', h('box', {}, h(Card, {}), h('box', { pad: 0, raw: 'opacity:.5;' })));
  inlineLocal(b);
  const p = expandLikeDeploy(b);
  for (const n of allNodes(p.elements)) {
    for (const sid of Object.keys(n.styles || {})) {
      assert.match(sid, /^e-[0-9a-z]{1,8}-e[0-9a-z]+-s\d*$/, `expanded style id ${sid} is salted`);
      assert.equal(n.styles[sid].id, sid, 'the style record agrees with its key');
    }
    for (const ref of classRefs(n)) assert.ok(n.styles[ref], 'class refs follow the rename');
  }
});

test('inline: expanded-subtree custom_css stays OFF by default and is recoverable with componentRawCss', () => {
  const mk = () => {
    resetIds();
    const Card = defineComponent(() => h('box', { pad: 24, raw: 'backdrop-filter:blur(4px);' }, h('text', {}, 'c')), { title: 'Opt Card' });
    const b = buildBundle('site', h('box', {}, h(Card, {}), h('box', { pad: 0, raw: 'opacity:.5;' })));
    inlineLocal(b);
    return b;
  };
  // DEFAULT: byte-parity with what an inline page has always rendered — a component tree's
  // custom_css no-ops on free Elementor, so newly emitting it would CHANGE live pages.
  const off = carrierOf(expandLikeDeploy(mk()));
  assert.match(off, /opacity:\.5/, 'the page\'s own raw CSS is still there');
  assert.doesNotMatch(off, /backdrop-filter/, 'the component subtree\'s is not, by default');
  const on = carrierOf(expandLikeDeploy(mk(), { componentRawCss: true }));
  assert.match(on, /backdrop-filter:blur\(4px\)/, 'opt-in recovers it');
});

test('inline: re-emitting is IDEMPOTENT (no duplicate carriers, byte-identical CSS)', () => {
  const b = buildBundle('site', h('box', { pad: 0, raw: 'opacity:.5;' }, h('text', { size: 14, raw: 'color:red;' }, 'x')));
  inlineLocal(b);
  const before = carrierOf(b.pages[0]);
  reinlineTree(b, b.pages[0], 0);
  reinlineTree(b, b.pages[0], 0);
  assert.equal(b.pages[0].elements.filter((n) => n.widgetType === 'html').length, 1);
  assert.equal(carrierOf(b.pages[0]), before);
});

test('normalizeIds: style-id rekey is anchored to the id segment (a salt containing the id cannot steal it)', () => {
  // hand-built: element e00007 whose salt literally contains its own id string
  const els = [{ id: 'e00007', elType: 'widget', widgetType: 'e-heading', elements: [],
    settings: { classes: { $$type: 'classes', value: ['e-1e00007-e00007-s'] } },
    styles: { 'e-1e00007-e00007-s': { id: 'e-1e00007-e00007-s', type: 'class', variants: [] } } }];
  normalizeIds(els);
  assert.equal(els[0].id, 'e00000');
  assert.deepEqual(Object.keys(els[0].styles), ['e-1e00007-e00000-s'], 'the SALT is left intact; only the id segment moves');
  assert.deepEqual(els[0].settings.classes.value, ['e-1e00007-e00000-s']);
});

test('inline: per-state custom_css keeps its state selector (hover gets the :hover,:focus-visible comma pair) — 1.7.x', () => {
  const b = buildBundle('site-st', h('box', { pad: 0, hover: { raw: 'outline: 2px solid red;' }, active: { raw: 'letter-spacing: 2px;' } }, h('text', { size: 14 }, 'x')));
  inlineLocal(b);
  const styleW = allNodes(b.pages[0].elements).find((n) => n.widgetType === 'html' && /outline: 2px solid red/.test(n.settings.html || ''));
  assert.ok(styleW, 'state raw reaches the inline <style> block');
  const html = styleW.settings.html;
  assert.match(html, /\.elementor \.(e-[^.]+)\.\1:hover,\.elementor \.(e-[^.]+)\.\2:focus-visible\{outline: 2px solid red;\}/, 'hover rule carries the native comma pair, not a bare always-on selector');
  assert.match(html, /:active\{letter-spacing: 2px;\}/, 'other pseudo states render as :state');
});
