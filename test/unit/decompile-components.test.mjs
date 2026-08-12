/**
 * SPEC 2.0 phase 3 — the DECOMPILE round-trip for native components.
 *
 * An `e-component` instance carries nothing but a component id + overrides, so inverting it needs a
 * second source: the component document's tree + its overridable-props registry, fetched through an
 * INJECTABLE fetcher (no live site in these tests). Covered here:
 *   - instance → `<PriceCard plan={"Pro"}/>` (plain override envelopes)
 *   - label → JS identifier derivation (collisions, unicode, reserved words, digits)
 *   - the overridable(override) CHAIN → prop forwarding from the enclosing component's parameter
 *   - missing/failed registry → the pre-phase-3 `<Raw>` passthrough + a warning, never a crash
 *   - THE ACCEPTANCE BAR: defineComponent source → compile → (deploy id rewrite) → decompile →
 *     recompile → identical bundle (same component uids, same instance overrides, same trees).
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decompile, resolveComponents, siteComponentFetcher, analyzeComponents, componentIdsIn, identFromLabel, componentIdent, valueLiteral } from '../../src/decompile.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h } from '../../src/runtime.mjs';
import { defineComponent, rewriteComponentIds } from '../../src/component.mjs';
import { resetIds, allNodes, textOf } from '../helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixDir = join(root, 'test', 'fixtures');
const madeFiles = [];
after(() => { for (const f of madeFiles) { try { rmSync(f); } catch {} } });
beforeEach(() => resetIds());

const page = (slug, node) => ({ title: slug, slug, node });
const site = (...pages) => defineSite({ name: 't', pages });

/** compile + simulate the deploy id assignment → { bundle, docs } (docs = what the fetcher returns). */
function deployed(s, firstId = 500) {
  const b = compileSite(s);
  const uidToId = {}; const docs = {};
  b.components.forEach((c, i) => { uidToId[c.uid] = firstId + i * 3; });
  for (const c of b.components) rewriteComponentIds(c.elements, uidToId);
  for (const p of b.pages) rewriteComponentIds(p.elements, uidToId);
  for (const c of b.components) {
    docs[uidToId[c.uid]] = { id: uidToId[c.uid], title: c.title, uid: c.uid, elements: c.elements, overridable_props: c.settings.overridable_props };
  }
  return { bundle: b, docs, uidToId };
}

/** write the decompiled source next to the src-relative fixtures and cli-build it. */
function rebuild(src, name) {
  const file = join(fixDir, `.rtc-${name}.jsx`);
  writeFileSync(file, src);
  madeFiles.push(file);
  const out = join(mkdtempSync(join(tmpdir(), 'exjsx-rtc-')), 'b.json');
  execFileSync('node', [join(root, 'src', 'cli.mjs'), 'build', file, out], { encoding: 'utf8' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

/* the fixture pair: a 2-prop card, plus a wrapper that FORWARDS its own prop into a nested card */
const makeSite = () => {
  const Card = defineComponent(
    ({ plan = 'Basic', cta = 'Start free' }) => h('box', { pad: 24, gap: 12, bg: '#ffffff', w: 320 },
      h('h3', { size: 28, weight: 700, color: '#0f172a' }, plan),
      h('text', { size: 15, color: '#5b6b72' }, cta)),
    { title: 'RT Price Card', props: { plan: { label: 'Plan name', group: 'Content' }, cta: { label: 'Button label', group: 'Actions' } } },
  );
  const Featured = defineComponent(
    ({ tier = 'Gold' }) => h('box', { pad: 16, gap: 8, bg: '#f4f6f8' },
      h('text', { size: 13, color: '#b31e2c' }, 'Most popular'),
      h(Card, { plan: tier })),
    { title: 'RT Featured Card', props: { tier: { label: 'Tier name', group: 'Content' } } },
  );
  return site(page('rt', h('section', { pad: [64, 24], gap: 24, dir: 'row', bg: '#eef2f5' },
    h(Card, { plan: 'Pro' }), h(Card, { plan: 'Team', cta: 'Talk to us' }), h(Featured, { tier: 'Enterprise' }))));
};

/* ── 1. instance → JSX ── */

test('instance inversion: each e-component becomes <Name prop={…}/>; unpassed props stay defaults', () => {
  const { bundle, docs } = deployed(makeSite());
  const src = decompile(bundle.pages[0].elements, { name: 'RT', slug: 'rt', components: docs });
  assert.match(src, /<RTPriceCard plan=\{"Pro"\} \/>/, 'first instance');
  assert.match(src, /<RTPriceCard plan=\{"Team"\} cta=\{"Talk to us"\} \/>/, 'second instance, both props');
  assert.match(src, /<RTFeaturedCard tier=\{"Enterprise"\} \/>/, 'the wrapper instance');
  assert.ok(!/widget:e-component/.test(src), 'no verbatim instance node leaked into <Raw>');
});

test('definition inversion: the component document becomes an exported defineComponent with labels/groups/defaults', () => {
  const { bundle, docs } = deployed(makeSite());
  const src = decompile(bundle.pages[0].elements, { name: 'RT', slug: 'rt', components: docs });
  assert.match(src, /export const RTPriceCard = defineComponent\(/);
  assert.match(src, /\(\{ plan = "Basic", cta = "Start free" \}\) =>/, 'params carry the registry origin values');
  assert.match(src, /title: "RT Price Card"/);
  assert.match(src, /plan: \{ label: "Plan name", group: "Content" \}/);
  assert.match(src, /cta: \{ label: "Button label", group: "Actions" \}/);
  // the overridable landings became the PARAMETERS, not their baseline literals
  assert.match(src, /<heading[^>]*>\{plan\}<\/heading>/);
  assert.match(src, /<text[^>]*>\{cta\}<\/text>/);
  assert.ok(!src.includes('"$$type":"overridable"'), 'overridable envelopes were unwrapped, not dumped');
});

test('instance inversion: an instance carrying its own styles has no JSX spelling → <Raw> + warning', () => {
  const { bundle, docs } = deployed(makeSite());
  const els = JSON.parse(JSON.stringify(bundle.pages[0].elements));
  const inst = allNodes(els).find((n) => n.widgetType === 'e-component');
  inst.styles = { 'e-x-s': { id: 'e-x-s', type: 'class', variants: [] } };
  const warnings = [];
  const src = decompile(els, { name: 'RT', slug: 'rt', components: docs, warnings });
  assert.match(src, /<Raw>\{.*widget:e-component/, 'the styled instance stays verbatim');
  assert.ok(warnings.some((w) => /local styles/.test(w)), `warned: ${warnings}`);
});

/* ── 2. label → identifier ── */

test('label→identifier: camelCase, unicode folding, digits, reserved words and collisions', () => {
  assert.equal(identFromLabel('Plan name'), 'planName');
  assert.equal(identFromLabel('CTA label'), 'ctaLabel');
  assert.equal(identFromLabel('Prix Élevé'), 'prixEleve', 'diacritics fold to ASCII');
  assert.equal(identFromLabel('Заголовок'), 'prop', 'non-latin scripts fall back to the safe name');
  assert.equal(identFromLabel('2 columns'), '_2Columns', 'a leading digit is not a valid identifier');
  assert.equal(identFromLabel('class'), 'classProp', 'reserved word');
  assert.equal(identFromLabel('children'), 'childrenProp', 'defineComponent refuses children per instance');
  assert.equal(identFromLabel('  '), 'prop', 'empty label');
  const taken = new Set();
  assert.equal(identFromLabel('Plan name', taken), 'planName');
  assert.equal(identFromLabel('plan  NAME', taken), 'planNAME', 'case-distinct names do not collide');
  assert.equal(identFromLabel('Plan name', taken), 'planName2', 'a real collision gets a numeric suffix');
  assert.equal(identFromLabel('PLAN NAME', taken), 'planNAME2');
  assert.equal(componentIdent('P3 Price Card'), 'P3PriceCard');
  assert.equal(componentIdent('404 block'), 'C404Block');
  const ct = new Set();
  assert.equal(componentIdent('Card', ct), 'Card');
  assert.equal(componentIdent('card', ct), 'Card2');
});

test('label→identifier: a foreign registry with non-identifier override keys keeps the WIRE key via props.key', () => {
  // an editor-authored registry: override keys are opaque, only the labels are human
  const docs = {
    7: {
      id: 7, title: 'Foreign Card',
      elements: [{ id: 'f0', elType: 'widget', widgetType: 'e-heading', styles: {}, elements: [],
        settings: { tag: { $$type: 'string', value: 'h2' }, classes: { $$type: 'classes', value: [] },
          title: { $$type: 'overridable', value: { override_key: 'ovr-9f2a:1', origin_value: { $$type: 'html-v3', value: { content: { $$type: 'string', value: 'Hi' }, children: [] } } } } } }],
      overridable_props: {
        props: { 'ovr-9f2a:1': { overrideKey: 'ovr-9f2a:1', label: 'Plan name', elementId: 'f0', propKey: 'title', elType: 'widget', widgetType: 'e-heading', originValue: { $$type: 'html-v3', value: { content: { $$type: 'string', value: 'Hi' }, children: [] } }, groupId: 'content' } },
        groups: { items: { content: { id: 'content', label: 'Content', props: ['ovr-9f2a:1'] } }, order: ['content'] },
      },
    },
  };
  const tree = [{ id: 'p0', elType: 'widget', widgetType: 'e-component', styles: {}, elements: [],
    settings: { component_instance: { $$type: 'component-instance', value: { component_id: { $$type: 'number', value: 7 },
      overrides: { $$type: 'overrides', value: [{ $$type: 'override', value: { override_key: 'ovr-9f2a:1', override_value: { $$type: 'html-v3', value: { content: { $$type: 'string', value: 'Pro' }, children: [] } }, schema_source: { type: 'component', id: 7 } } }] } } } } }];
  const src = decompile(tree, { name: 'F', slug: 'f', components: docs });
  assert.match(src, /\(\{ planName = "Hi" \}\)/, 'the parameter is label-derived');
  assert.match(src, /planName: \{ label: "Plan name", group: "Content", key: "ovr-9f2a:1" \}/, 'the wire key is preserved');
  assert.match(src, /<ForeignCard planName=\{"Pro"\} \/>/);
  // and the wire key survives a rebuild: the recompiled registry + envelopes use it, not the param name
  const b = rebuild(src, 'Foreign');
  const c = b.components[0];
  assert.deepEqual(Object.keys(c.settings.overridable_props.props), ['ovr-9f2a:1']);
  const head = allNodes(c.elements).find((n) => n.widgetType === 'e-heading');
  assert.equal(head.settings.title.value.override_key, 'ovr-9f2a:1');
  const inst = allNodes(b.pages[0].elements).find((n) => n.widgetType === 'e-component');
  assert.equal(inst.settings.component_instance.value.overrides.value[0].value.override_key, 'ovr-9f2a:1');
});

/* ── 3. the chain ── */

test('chain inversion: a nested instance inside a component forwards the ENCLOSING parameter', () => {
  const { bundle, docs } = deployed(makeSite());
  const src = decompile(bundle.pages[0].elements, { name: 'RT', slug: 'rt', components: docs });
  assert.match(src, /<RTPriceCard plan=\{tier\} \/>/, 'the wrapper forwards its own param — no quotes');
  // the child definition must be emitted BEFORE the parent that composes it
  assert.ok(src.indexOf('export const RTPriceCard') < src.indexOf('export const RTFeaturedCard'), 'dependency order');
});

/* ── 4. fallbacks (never crash) ── */

test('missing registry: a component fetched WITHOUT overridable_props keeps the <Raw> instance + warns', () => {
  const { bundle, docs } = deployed(makeSite());
  for (const d of Object.values(docs)) d.overridable_props = null;
  const warnings = [];
  const src = decompile(bundle.pages[0].elements, { name: 'RT', slug: 'rt', components: docs, warnings });
  assert.ok(!/defineComponent/.test(src), 'no definition is invented from a missing registry');
  assert.equal((src.match(/widget:e-component/g) || []).length, 3, 'all three instances stay verbatim');
  assert.ok(warnings.some((w) => /no overridable-props registry/.test(w)), `warned: ${warnings}`);
});

test('missing component: an unresolved component id decompiles to <Raw> (byte-faithful) and rebuilds', () => {
  const { bundle } = deployed(makeSite());
  const src = decompile(bundle.pages[0].elements, { name: 'RTNC', slug: 'rtnc', components: {} });
  const b = rebuild(src, 'NoComp');
  const insts = allNodes(b.pages[0].elements).filter((n) => n.widgetType === 'e-component');
  assert.equal(insts.length, 3, 'instances survive verbatim');
  assert.deepEqual(insts[1].settings, allNodes(bundle.pages[0].elements).filter((n) => n.widgetType === 'e-component')[1].settings,
    'the instance envelope is byte-identical');
});

test('resolveComponents: transitive, and a THROWING fetcher warns instead of crashing', async () => {
  const { bundle, docs, uidToId } = deployed(makeSite());
  const ids = Object.keys(docs).map(Number);
  const warnings = [];
  const ok = await resolveComponents(bundle.pages[0].elements, async (id) => docs[id], { warn: (m) => warnings.push(m) });
  assert.deepEqual(Object.keys(ok).map(Number).sort(), ids.sort(), 'both components resolved');
  assert.deepEqual(warnings, []);
  // the page only references the card + the wrapper; the wrapper's NESTED card id is reached transitively
  assert.equal(componentIdsIn(bundle.pages[0].elements).length, 2);
  const boom = [];
  const partial = await resolveComponents(bundle.pages[0].elements,
    async (id) => { if (id === uidToId[bundle.components[0].uid]) throw new Error('403 no route'); return docs[id]; },
    { warn: (m) => boom.push(m) });
  assert.equal(Object.keys(partial).length, 1, 'the reachable component still resolves');
  assert.ok(boom.some((w) => /fetch failed \(403 no route\)/.test(w)), `warned: ${boom}`);
  const none = await resolveComponents(bundle.pages[0].elements, async () => null, { warn: (m) => boom.push(m) });
  assert.deepEqual(none, {}, 'a fetcher that answers nothing yields nothing — no throw');
});

test('non-invertible landing: an override on a prop with no JSX spelling stays <Raw> + warns', () => {
  const docs = {
    9: {
      id: 9, title: 'Imgy',
      elements: [{ id: 'i0', elType: 'widget', widgetType: 'e-image', styles: {}, elements: [],
        settings: { classes: { $$type: 'classes', value: [] },
          image: { $$type: 'overridable', value: { override_key: 'pic', origin_value: { $$type: 'image', value: { src: { $$type: 'image-src', value: { id: { $$type: 'image-attachment-id', value: 7 }, url: null } } } } } } } }],
      overridable_props: { props: { pic: { overrideKey: 'pic', label: 'Picture', elementId: 'i0', propKey: 'image', elType: 'widget', widgetType: 'e-image', originValue: null, groupId: 'content' } }, groups: { items: {}, order: [] } },
    },
  };
  const tree = [{ id: 'p0', elType: 'widget', widgetType: 'e-component', styles: {}, elements: [],
    settings: { component_instance: { $$type: 'component-instance', value: { component_id: { $$type: 'number', value: 9 }, overrides: { $$type: 'overrides', value: [] } } } } }];
  const warnings = [];
  const src = decompile(tree, { name: 'I', slug: 'i', components: docs, warnings });
  assert.match(src, /<Raw>\{.*widget:e-component/);
  assert.ok(warnings.some((w) => /no JSX spelling/.test(w)), `warned: ${warnings}`);
});

test('value inversion: html-v3/string/number/boolean/url/link invert; unknown envelopes do not', () => {
  assert.equal(valueLiteral({ $$type: 'html-v3', value: { content: { $$type: 'string', value: 'Hi <em>there</em>' }, children: [] } }), '"Hi <em>there</em>"');
  assert.equal(valueLiteral({ $$type: 'string', value: 'x' }), '"x"');
  assert.equal(valueLiteral({ $$type: 'number', value: 3 }), '3');
  assert.equal(valueLiteral({ $$type: 'boolean', value: false }), 'false');
  assert.equal(valueLiteral({ $$type: 'url', value: '/go/' }), '"/go/"');
  assert.equal(valueLiteral({ $$type: 'link', value: { destination: { $$type: 'url', value: '/x/' } } }), '"/x/"');
  assert.equal(valueLiteral(null), 'null', 'an explicit clear');
  assert.equal(valueLiteral({ $$type: 'image', value: {} }), null);
});

test('analyzeComponents: invertible docs come back analyzed, the rest are dropped with a reason', () => {
  const { docs } = deployed(makeSite());
  const warns = [];
  const ok = analyzeComponents(docs, (m) => warns.push(m));
  assert.deepEqual(Object.keys(ok).map(Number).sort(), Object.keys(docs).map(Number).sort());
  const card = Object.values(ok).find((c) => c.title === 'RT Price Card');
  assert.equal(card.name, 'RTPriceCard');
  assert.deepEqual(card.params, { plan: 'plan', cta: 'cta' });
  assert.deepEqual(warns, []);
  // a doc whose registry points at a prop that is not in the tree is skipped, never guessed
  const broken = JSON.parse(JSON.stringify(docs));
  const first = Object.keys(broken)[0];
  broken[first].overridable_props.props.ghost = { overrideKey: 'ghost', label: 'Ghost', elementId: 'nope', propKey: 'title', elType: 'widget', widgetType: 'e-heading', originValue: null, groupId: 'content' };
  const w2 = [];
  const out = analyzeComponents(broken, (m) => w2.push(m));
  assert.equal(Object.keys(out).length, 1, 'only the healthy component survives');
  assert.ok(w2.some((w) => /does not appear in the component tree/.test(w)), `warned: ${w2}`);
});

test('siteComponentFetcher: native list + overridable-props + the ultra document route (injected fetch)', async () => {
  const seen = [];
  const R = (body) => ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) });
  const F = async (u) => {
    seen.push(u);
    if (u.includes('/elementor/v1/components?') || u.endsWith('/elementor/v1/components')) return R({ data: [{ id: 12, name: 'Live Card', uid: 'x-abc' }] });
    if (u.includes('overridable-props')) return R({ data: { 12: { props: {}, groups: { items: {}, order: [] } } } });
    if (u.includes('/documents/12')) return R({ success: true, data: { id: 12, elements: [{ id: 'a', elType: 'e-flexbox', settings: {}, styles: {}, elements: [] }] } });
    return { ok: false, status: 404, json: async () => null, text: async () => 'nope' };
  };
  const doc = await (siteComponentFetcher({ url: 'http://site.test/', auth: 'Basic x', fetch: F }))(12);
  assert.equal(doc.title, 'Live Card');
  assert.equal(doc.uid, 'x-abc');
  assert.equal(doc.elements.length, 1);
  assert.deepEqual(doc.overridable_props.groups.order, []);
  assert.ok(seen.some((u) => u === 'http://site.test/wp-json/elementor/v1/components'), 'native list first');
  assert.ok(seen.some((u) => u.includes('/wp-json/elementor-ultra/v1/documents/12')), 'ultra document route for the tree');

  // no tree route (plugin absent) → a warning and null, never a throw
  const warns = [];
  const noTree = await (siteComponentFetcher({ url: 'http://site.test', fetch: async (u) => (u.includes('/documents/') ? { ok: false, status: 404, text: async () => '' } : F(u)), warn: (m) => warns.push(m) }))(12);
  assert.equal(noTree, null);
  assert.ok(warns.some((w) => /no native component-tree route/.test(w)), `warned: ${warns}`);
});

/* ── 5. THE ACCEPTANCE BAR ── */

test('ROUND TRIP: defineComponent → compile → deploy-rewrite → decompile → recompile = the same bundle', () => {
  const { bundle, docs, uidToId } = deployed(makeSite());
  const warnings = [];
  const src = decompile(bundle.pages[0].elements, { name: 'RT', slug: 'rt', components: docs, warnings });
  assert.deepEqual(warnings, [], 'nothing was lost on the way out');
  const b2 = rebuild(src, 'RoundTrip');

  // 1. the same components, with the SAME uids (uid = djb2(normalized tree + title) — a byte of
  //    drift in the tree or the title would change it)
  assert.equal(b2.components.length, bundle.components.length);
  for (const c of bundle.components) {
    const r = b2.components.find((x) => x.title === c.title);
    assert.ok(r, `"${c.title}" survives the round trip`);
    assert.equal(r.uid, c.uid, `"${c.title}" uid stable`);
    assert.equal(r.treeHash, c.treeHash, `"${c.title}" tree hash stable`);
    assert.deepEqual(r.settings.overridable_props, c.settings.overridable_props, `"${c.title}" registry identical`);
  }
  // 2. the component trees are identical once the recompiled placeholders take the deployed ids
  for (const c of b2.components) rewriteComponentIds(c.elements, uidToId);
  for (const c of bundle.components) {
    const r = b2.components.find((x) => x.title === c.title);
    assert.deepEqual(r.elements, c.elements, `"${c.title}" tree identical`);
  }
  // 3. the page: the same instance nodes, byte for byte (ids, component ids, override envelopes)
  for (const p of b2.pages) rewriteComponentIds(p.elements, uidToId);
  const insts = (els) => allNodes(els).filter((n) => n.widgetType === 'e-component');
  assert.deepEqual(insts(b2.pages[0].elements), insts(bundle.pages[0].elements), 'instances + overrides identical');
  // 4. same page structure. The section's own class ref set is the ONE documented asymmetry and it
  //    predates phase 3: a deduped page stores only `g-…` REFERENCES, whose definitions live in the
  //    site's class registry — the decompiler cannot see them, so the rebuilt container re-mints a
  //    class for the intrinsic's baked defaults and keeps the original ref alongside it.
  const shape = (els) => allNodes(els).map((n) => `${n.elType}/${n.widgetType ?? ''}`);
  assert.deepEqual(shape(b2.pages[0].elements), shape(bundle.pages[0].elements), 'page structure identical');
  assert.ok(b2.pages[0].elements[0].settings.classes.value.includes(bundle.pages[0].elements[0].settings.classes.value[0]),
    'the original global-class ref is preserved');
});

test('ROUND TRIP: the rebuilt page still renders the same text through inline expansion', async () => {
  const { expandInstances } = await import('../../src/component.mjs');
  const { bundle, docs } = deployed(makeSite());
  const src = decompile(bundle.pages[0].elements, { name: 'RT2', slug: 'rt2', components: docs });
  const b2 = rebuild(src, 'RoundTrip2');
  const texts = (b) => allNodes(expandInstances(JSON.parse(JSON.stringify(b.pages[0].elements)),
    Object.fromEntries(b.components.map((c) => [c.uid, c])))).map(textOf).filter(Boolean);
  assert.deepEqual(texts(b2), texts(bundle));
});
