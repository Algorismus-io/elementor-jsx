/**
 * SPEC 2.0 phase 1 — defineComponent: registration seam (single render per definition), instance
 * envelope exactness (the schema_source.id invariant), sentinel-diff prop mapping incl. failure
 * modes (style-prop, multi-target, structure-change), build-time mirrors of the server 422s
 * (atomic-only, cycles, ≤100, unique titles), uid stability, and the deploy-side pure machinery
 * (planComponents, rewriteComponentIds, expandInstances).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compileSite, normalizeIds } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h, renderPage } from '../../src/runtime.mjs';
import { defineComponent, rewriteComponentIds, expandInstances } from '../../src/component.mjs';
import { planComponents } from '../../src/deploy.mjs';
import { button, node, image, IMG_ID } from '../../src/kit/kit.mjs';
import { stable, djb2 } from '../../src/classes.mjs';
import { resetIds, allNodes, findNode, byWidget, textOf, collectIds } from '../helpers.mjs';

beforeEach(() => resetIds());

const page = (slug, node) => ({ title: slug, slug, node });
const site = (...pages) => defineSite({ name: 't', pages });

/** the canonical fixture: heading text + button label, grouped */
const makeCard = () => defineComponent(
  ({ headline = 'Grow faster', cta = 'Get started' }) => h('box', { pad: 24, gap: 12 },
    h('h2', { size: 28 }, headline),
    button(cta, 'https://example.com/signup'),
  ),
  { title: 'Price Card', props: { headline: { label: 'Headline', group: 'Content' }, cta: { label: 'Button label', group: 'Actions' } } },
);

const instancesOf = (els) => allNodes(els).filter((n) => n.widgetType === 'e-component');
const overridesOf = (n) => n.settings.component_instance.value.overrides.value;

/* ── registration seam ── */

test('components: definition renders ONCE; each invocation is an e-component instance node', () => {
  const Card = makeCard();
  const b = compileSite(site(page('a', h('box', { pad: 0 },
    h(Card, { headline: 'One' }), h(Card, { headline: 'Two' }), h(Card, {})))));
  assert.equal(b.components.length, 1, 'one registered component');
  assert.equal(b.stats.components, 1);
  const inst = instancesOf(b.pages[0].elements);
  assert.equal(inst.length, 3, 'three instances');
  // the page tree contains NO expanded copy of the component internals
  assert.equal(allNodes(b.pages[0].elements).filter((n) => n.widgetType === 'e-heading').length, 0);
  // the component tree DOES contain them (with local styles kept — components skip class dedup)
  const chead = findNode(b.components[0].elements, byWidget('e-heading'));
  assert.ok(chead, 'heading lives in the component tree');
});

test('components: same definition reused across PAGES registers once, instances everywhere', () => {
  const Card = makeCard();
  const b = compileSite(site(page('a', h(Card, {})), page('b', h(Card, { cta: 'Buy' }))));
  assert.equal(b.components.length, 1);
  assert.equal(instancesOf(b.pages[0].elements).length, 1);
  assert.equal(instancesOf(b.pages[1].elements).length, 1);
});

test('components: OUTSIDE compileSite a marked component inline-expands (zero breakage)', () => {
  const Card = makeCard();
  const els = renderPage(h(Card, { headline: 'Plain' }));
  assert.equal(instancesOf(els).length, 0, 'no instance node outside the collector');
  assert.equal(textOf(findNode(els, byWidget('e-heading'))), 'Plain');
});

/* ── instance envelope exactness ── */

test('components: instance envelope — exact wire shape + schema_source.id === component_id (spec §3)', () => {
  const Card = makeCard();
  const b = compileSite(site(page('a', h(Card, { headline: 'Hello', cta: 'Go' }))));
  const inst = instancesOf(b.pages[0].elements)[0];
  assert.equal(inst.elType, 'widget');
  assert.equal(inst.widgetType, 'e-component');
  assert.deepEqual(inst.elements, []);
  assert.deepEqual(inst.styles, {});
  assert.equal(inst.editor_settings.component_uid, b.components[0].uid, 'instance is uid-keyed to its component');
  const ci = inst.settings.component_instance;
  assert.equal(ci.$$type, 'component-instance');
  assert.deepEqual(ci.value.component_id, { $$type: 'number', value: 0 }, 'per-site id is a deploy concern — 0 placeholder');
  assert.equal(ci.value.overrides.$$type, 'overrides');
  const ovs = ci.value.overrides.value;
  assert.equal(ovs.length, 2);
  for (const o of ovs) {
    assert.equal(o.$$type, 'override');
    assert.deepEqual(o.value.schema_source, { type: 'component', id: ci.value.component_id.value }, 'the invariant');
  }
  const head = ovs.find((o) => o.value.override_key === 'headline');
  assert.equal(head.value.override_value.$$type, 'html-v3');
  assert.equal(head.value.override_value.value.content.value, 'Hello', 'override_value is the exact envelope the render would produce');
});

test('components: only PASSED props ride as overrides (defaults stay definition-side)', () => {
  const Card = makeCard();
  const b = compileSite(site(page('a', h(Card, { cta: 'Only this' }))));
  const ovs = overridesOf(instancesOf(b.pages[0].elements)[0]);
  assert.deepEqual(ovs.map((o) => o.value.override_key), ['cta']);
});

/* ── sentinel-diff mapping + registry ── */

test('components: registry meta — spec-exact overridable_props shape (props + groups with props array + order)', () => {
  const Card = makeCard();
  const b = compileSite(site(page('a', h(Card, {}))));
  const op = b.components[0].settings.overridable_props;
  const hp = op.props.headline;
  assert.equal(hp.overrideKey, 'headline');
  assert.equal(hp.label, 'Headline');
  assert.equal(hp.propKey, 'title');
  assert.equal(hp.elType, 'widget');
  assert.equal(hp.widgetType, 'e-heading');
  assert.equal(hp.groupId, 'content');
  assert.equal(hp.originValue.value.content.value, 'Grow faster', 'JS param default becomes the origin value');
  assert.equal(op.props.cta.propKey, 'text');
  assert.equal(op.props.cta.widgetType, 'e-button');
  assert.deepEqual(op.groups.order, ['content', 'actions'], 'declaration-order groups');
  assert.deepEqual(op.groups.items.content, { id: 'content', label: 'Content', props: ['headline'] });
  assert.deepEqual(op.groups.items.actions, { id: 'actions', label: 'Actions', props: ['cta'] });
  // the mapped element carries the overridable envelope wrapping the origin value
  const el = allNodes(b.components[0].elements).find((n) => n.id === hp.elementId);
  assert.equal(el.settings.title.$$type, 'overridable');
  assert.equal(el.settings.title.value.override_key, 'headline');
  assert.equal(el.settings.title.value.origin_value.value.content.value, 'Grow faster');
});

test('components: props meta `default` beats the JS param default as baseline', () => {
  const C = defineComponent(({ t = 'js-default' }) => h('h2', {}, t),
    { title: 'Meta Default', props: { t: { label: 'T', default: 'meta-default' } } });
  const b = compileSite(site(page('a', h(C, {}))));
  assert.equal(b.components[0].settings.overridable_props.props.t.originValue.value.content.value, 'meta-default');
});

test('components: a link-feeding prop maps to the whole link settings prop', () => {
  const C = defineComponent(({ url = 'https://a.example' }) => h('text', { href: url }, 'Visit'),
    { title: 'Link Card', props: { url: { label: 'URL' } } });
  const b = compileSite(site(page('a', h(C, { url: 'https://b.example' }))));
  const op = b.components[0].settings.overridable_props;
  assert.equal(op.props.url.propKey, 'link');
  const ov = overridesOf(instancesOf(b.pages[0].elements)[0])[0];
  assert.equal(stable(ov.value.override_value).includes('b.example'), true);
});

/* ── failure modes (build errors, spec'd) ── */

test('components: STYLE-landing prop is a build error recommending the variants idiom', () => {
  const C = defineComponent(({ tint = '#112233' }) => h('box', { pad: 24, bg: tint }, h('h2', {}, 'x')),
    { title: 'Tinted', props: { tint: { label: 'Tint' } } });
  assert.throws(() => compileSite(site(page('a', h(C, {})))), (e) => {
    assert.match(e.message, /prop "tint" lands in STYLES/);
    assert.match(e.message, /CANNOT override styles/);
    assert.match(e.message, /variant/i);
    return true;
  });
});

test('components: gcls (settings.classes) landing prop is a build error — classes are excluded', () => {
  const C = defineComponent(({ k = 'a' }) => h('box', { pad: 24, gcls: k }, h('h2', {}, 'x')),
    { title: 'Classy', props: { k: { label: 'K' } } });
  assert.throws(() => compileSite(site(page('a', h(C, {})))), /classes/);
});

test('components: MULTI-target prop is a build error (v1)', () => {
  const C = defineComponent(({ t = 'x' }) => h('box', { pad: 24 }, h('h2', {}, t), h('p', {}, t)),
    { title: 'Twice', props: { t: { label: 'T' } } });
  assert.throws(() => compileSite(site(page('a', h(C, {})))), /MULTIPLE settings.*e-heading.*e-paragraph|MULTIPLE settings/);
});

test('components: structure-changing prop (conditional render) is a build error', () => {
  const C = defineComponent(({ show = '' }) => h('box', { pad: 24 }, h('h2', {}, 'x'), show ? h('p', {}, show) : null),
    { title: 'Conditional', props: { show: { label: 'Show' } } });
  assert.throws(() => compileSite(site(page('a', h(C, {})))), /CHANGES THE TREE STRUCTURE/);
});

test('components: unused declared prop is a build error', () => {
  const C = defineComponent(() => h('h2', {}, 'static'), { title: 'Unused', props: { ghost: { label: 'G' } } });
  assert.throws(() => compileSite(site(page('a', h(C, {})))), /does not affect the rendered tree/);
});

test('components: unknown invocation prop / children / theme are loud errors', () => {
  const Card = makeCard();
  assert.throws(() => compileSite(site(page('a', h(Card, { nope: 'x' })))), /unknown prop\(s\) nope.*declared overridable props: headline, cta/s);
  const Card2 = makeCard();
  assert.throws(() => compileSite(site(page('a', h(Card2, {}, h('p', {}, 'child'))))), /children passed to a registered component/);
});

/* ── build-time mirrors of the server 422s ── */

test('components: classic html widget inside a component is a build error naming the offender', () => {
  const C = defineComponent(() => h('box', { pad: 0 }, h('html', { raw: '<b>x</b>' })),
    { title: 'Navish', props: {} });
  assert.throws(() => compileSite(site(page('a', h(C, {})))), (e) => {
    assert.match(e.message, /component "Navish"/);
    assert.match(e.message, /non-atomic element "html"/);
    assert.match(e.message, /CLASSIC widget/);
    assert.match(e.message, /non_atomic_element_in_component/);
    return true;
  });
});

/* 1.9.2 field report #5: the v1 check only looked at elType === 'widget', so a NON-widget
 * non-atomic node (a V3 container, an <details>-carrying raw element) reached POST /components
 * and 422'd there. Non_Atomic_Widget_Validator keys off (widgetType ?? elType), and this mirrors it. */
test('components: a non-atomic ELEMENT type (V3 container) is a build error, not a server 422', () => {
  const C = defineComponent(() => h('box', { pad: 0 }, node('container', { children: [] })),
    { title: 'LegacyBox', props: {} });
  assert.throws(() => compileSite(site(page('a', h(C, {})))), (e) => {
    assert.match(e.message, /component "LegacyBox"/);
    assert.match(e.message, /non-atomic element "container"/);
    assert.match(e.message, /V3\/legacy container/);
    assert.match(e.message, /non_atomic_element_in_component/);
    return true;
  });
});

test('components: <details> markup rides the classic html widget — the error names it and says why', () => {
  const C = defineComponent(() => h('box', { pad: 0 },
    h('html', { raw: '<details><summary>Q</summary><p>A</p></details>' })), { title: 'FaqDrop', props: {} });
  assert.throws(() => compileSite(site(page('a', h(C, {})))), /<details>\/<summary>/);
});

/* 1.9.2 field report #3: an image/attachment prop cannot be a per-instance override. Two landings,
 * one honest message: IMG_URL VALIDATES its argument (the sentinel render died inside the builder
 * with a URL riddle), IMG_ID does NOT (the sentinel landed inside the image envelope and mapped). */
test('components: an image-URL prop fails the BUILD with the media rule, not IMG_URL\'s riddle', () => {
  const C = defineComponent(({ src }) => h('box', { pad: 0 }, h('img', { src, alt: 'x' })),
    { title: 'PicCard', props: { src: { label: 'Image', default: 'https://example.com/a.png' } } });
  assert.throws(() => compileSite(site(page('a', h(C, { src: 'https://example.com/b.png' })))), (e) => {
    assert.match(e.message, /component "PicCard": prop "src" feeds an IMAGE\/media value/);
    assert.match(e.message, /IMG_URL/);                       // the builder is named, as a breadcrumb
    assert.match(e.message, /one registered component per image/);
    assert.doesNotMatch(e.message, /ABSOLUTE http/);          // NOT the raw builder error
    return true;
  });
});

test('components: an attachment-id image prop is caught on the ENVELOPE (IMG_ID never validates)', () => {
  const C = defineComponent(({ pic }) => h('box', { pad: 0 }, image(IMG_ID(pic))),
    { title: 'IdPicCard', props: { pic: { label: 'Picture', default: 7 } } });
  assert.throws(() => compileSite(site(page('a', h(C, { pic: 9 })))), (e) => {
    assert.match(e.message, /component "IdPicCard": prop "pic" feeds an IMAGE\/media value/);
    assert.match(e.message, /<e-image>\.image is a image envelope/);
    return true;
  });
});

test('components: a TEXT prop next to a fixed image still maps cleanly (the blessed workaround)', () => {
  const C = defineComponent(({ caption = 'Alt copy' }) => h('box', { pad: 0 },
    h('img', { src: 'https://example.com/fixed.png', alt: 'fixed' }),
    h('text', {}, caption)), { title: 'FixedPic', props: { caption: { label: 'Caption' } } });
  const b = compileSite(site(page('a', h(C, { caption: 'Hello' }))));
  assert.equal(Object.keys(b.components[0].settings.overridable_props.props).length, 1);
  assert.equal(b.components[0].settings.overridable_props.props.caption.propKey, 'paragraph');
});

test('components: circular composition is a build error naming the cycle', () => {
  let A;
  const B = defineComponent(() => h('box', { pad: 0 }, h(A, {})), { title: 'CycB', props: {} });
  A = defineComponent(() => h('box', { pad: 0 }, h(B, {})), { title: 'CycA', props: {} });
  assert.throws(() => compileSite(site(page('a', h(A, {})))), /circular composition CycA → CycB → CycA/);
});

test('components: duplicate titles across definitions is a build error', () => {
  const A = defineComponent(() => h('h2', {}, 'a'), { title: 'Same Name', props: {} });
  const B = defineComponent(() => h('h3', {}, 'b'), { title: 'Same Name', props: {} });
  assert.throws(() => compileSite(site(page('a', h('box', { pad: 0 }, h(A, {}), h(B, {}))))), /duplicate title "Same Name"/);
});

test('components: title is validated at define time (≥2 chars, required)', () => {
  assert.throws(() => defineComponent(() => null, { title: 'x' }), /2\.\.200/);
  assert.throws(() => defineComponent(() => null, {}), /title is required|2\.\.200/);
});

test('components: >100 registered components is a build error (server hard limit)', () => {
  const defs = Array.from({ length: 101 }, (_, i) => defineComponent(() => h('h2', {}, `c${i}`), { title: `Comp ${i}`, props: {} }));
  assert.throws(() => compileSite(site(page('a', h('box', { pad: 0 }, defs.map((D) => h(D, {})))))), /101 registered components.*limit is 100/);
});

/* ── uid stability ── */

test('components: uid is STABLE across builds (id-counter state cannot leak into the hash)', () => {
  const b1 = compileSite(site(page('a', h(makeCard(), {}))));
  // deliberately NO resetIds: the global freshId counter is far along now — normalization must erase it
  const b2 = compileSite(site(page('x', h('box', { pad: 0 }, h('p', {}, 'noise'), h(makeCard(), { headline: 'Different per-instance props' })))));
  assert.equal(b1.components[0].uid, b2.components[0].uid, 'same source ⇒ same uid, regardless of counter state, page, or instance props');
  assert.equal(b1.components[0].treeHash, b2.components[0].treeHash);
});

test('components: uid CHANGES when the tree or the title changes', () => {
  const base = compileSite(site(page('a', h(makeCard(), {})))).components[0];
  const T = defineComponent(({ headline = 'Grow faster', cta = 'Get started' }) => h('box', { pad: 24, gap: 12 },
    h('h2', { size: 28 }, headline), button(cta, 'https://example.com/signup')),
    { title: 'Other Title', props: { headline: { label: 'Headline' }, cta: { label: 'Button label' } } });
  const retitled = compileSite(site(page('a', h(T, {})))).components[0];
  assert.notEqual(base.uid, retitled.uid, 'title participates in the uid');
  // phase 2: element ids are SALTED by the title (cross-component local-style class collisions —
  // see normalizeComponentIds), so the shipped tree of a retitled component differs and treeHash
  // (a display-only drift fingerprint in warnings) legitimately changes with it.
  assert.notEqual(base.treeHash, retitled.treeHash, 'treeHash covers the SHIPPED tree, whose ids embed the title salt');
  const G = defineComponent(({ headline = 'Grow faster', cta = 'Get started' }) => h('box', { pad: 32, gap: 12 },   // pad 24 → 32
    h('h2', { size: 28 }, headline), button(cta, 'https://example.com/signup')),
    { title: 'Price Card', props: { headline: { label: 'Headline' }, cta: { label: 'Button label' } } });
  const restyled = compileSite(site(page('a', h(G, {})))).components[0];
  assert.notEqual(base.uid, restyled.uid, 'tree change changes the uid');
  assert.notEqual(base.treeHash, restyled.treeHash);
});

/* ── deploy-side pure machinery ── */

test('planComponents: uid match reuses; title match with new uid reuses + WARNS; else creates', () => {
  const locals = [
    { uid: 'x-aaa', title: 'Hero', elements: [], settings: {}, treeHash: 'h1' },
    { uid: 'x-bbb', title: 'Card', elements: [], settings: {}, treeHash: 'h2' },
    { uid: 'x-ccc', title: 'Fresh', elements: [], settings: {}, treeHash: 'h3' },
    { uid: 'x-ddd', title: 'Shelved', elements: [], settings: {}, treeHash: 'h4' },
  ];
  const remote = [
    { id: 11, uid: 'x-aaa', name: 'Hero' },                      // list uses `name` (live 4.2.1)
    { id: 22, uid: 'x-OLD', name: 'Card' },
    { id: 33, uid: 'x-ddd', name: 'Shelved', isArchived: true },
  ];
  const p = planComponents(locals, remote);
  assert.deepEqual(p.reuse.map((r) => [r.uid, r.id, r.action]),
    [['x-aaa', 11, 'reused'], ['x-bbb', 22, 'reused-stale'], ['x-ddd', 33, 'reused-archived']]);
  assert.deepEqual(p.create.map((c) => c.uid), ['x-ccc']);
  assert.equal(p.warnings.length, 2);
  assert.match(p.warnings[0], /component "Card": local tree CHANGED since last deploy/);
  assert.match(p.warnings[0], /x-bbb.*tree h2.*x-OLD/);
  assert.match(p.warnings[0], /DEPLOYED tree/);
  assert.match(p.warnings[1], /"Shelved".*ARCHIVED.*unarchive/);
});

test('rewriteComponentIds: component_id AND every schema_source.id rewritten together (the invariant)', () => {
  const Card = makeCard();
  const b = compileSite(site(page('a', h('box', { pad: 0 }, h(Card, { headline: 'A' }), h(Card, { cta: 'B' })))));
  rewriteComponentIds(b.pages[0].elements, { [b.components[0].uid]: 4242 });
  for (const inst of instancesOf(b.pages[0].elements)) {
    const ci = inst.settings.component_instance.value;
    assert.equal(ci.component_id.value, 4242);
    for (const o of ci.overrides.value) assert.deepEqual(o.value.schema_source, { type: 'component', id: 4242 });
  }
  assert.throws(() => rewriteComponentIds(b.pages[0].elements, {}), /references uid .* not deployed/);
});

test('expandInstances: the 403 fallback — overrides applied, defaults kept, null clears, ids re-unique', () => {
  const Card = makeCard();
  const b = compileSite(site(page('a', h('box', { pad: 0 }, h(Card, { headline: 'Custom head' }), h(Card, {})))));
  // hand-add an explicit-clear override to the second instance
  const [, second] = instancesOf(b.pages[0].elements);
  overridesOf(second).push({ $$type: 'override', value: { override_key: 'cta', override_value: null, schema_source: { type: 'component', id: 0 } } });
  const byUid = Object.fromEntries(b.components.map((c) => [c.uid, c]));
  const expanded = normalizeIds(expandInstances(b.pages[0].elements, byUid));
  assert.equal(instancesOf(expanded).length, 0, 'no instance nodes remain');
  const heads = allNodes(expanded).filter(byWidget('e-heading')).map(textOf);
  assert.deepEqual(heads, ['Custom head', 'Grow faster'], 'override applied; default kept');
  const buttons = allNodes(expanded).filter(byWidget('e-button'));
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].settings.text.value.content.value, 'Get started', 'origin value unwrapped');
  assert.equal('text' in buttons[1].settings, false, 'override_value:null = explicit clear');
  const { el } = collectIds(expanded);
  assert.equal(new Set(el).size, el.length, 'ids re-minted unique across the two copies');
  assert.equal(allNodes(expanded).some((n) => stable(n.settings).includes('overridable')), false, 'no overridable envelopes leak');
});

test('components: local-style ids NEVER collide across components (title-salted ids — the CSS-steal regression)', () => {
  // live-found (phase-2 E2E): unsalted normalization gave every component c00000… ids, so two
  // components on one page shipped IDENTICAL .e-c00000-s selectors in their per-component css
  // files — the last-enqueued file won and one component stole the other's box styles.
  const A = defineComponent(() => h('box', { pad: 24, bg: '#fee2e2' }, h('h2', {}, 'a')), { title: 'Salt A', props: {} });
  const B = defineComponent(() => h('box', { pad: 16, bg: '#dcfce7' }, h('h3', {}, 'b')), { title: 'Salt B', props: {} });
  const b = compileSite(site(page('a', h('box', { pad: 0 }, h(A, {}), h(B, {})))));
  const styleIds = (c) => allNodes(c.elements).flatMap((n) => Object.keys(n.styles || {}));
  const [sa, sb] = b.components.map(styleIds);
  assert.ok(sa.length && sb.length, 'both components carry local styles');
  assert.deepEqual(sa.filter((id) => sb.includes(id)), [], 'no shared style id ⇒ no shared css selector');
  const elIds = (c) => allNodes(c.elements).map((n) => n.id);
  assert.deepEqual(elIds(b.components[0]).filter((id) => elIds(b.components[1]).includes(id)), [], 'element ids disjoint too');
});

test('djb2: stable known fingerprint (uid/treeHash primitive)', () => {
  assert.equal(djb2('elementor-jsx'), djb2('elementor-jsx'));
  assert.notEqual(djb2('a'), djb2('b'));
});
