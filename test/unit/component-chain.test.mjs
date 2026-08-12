/**
 * SPEC 2.0 phase 2 — the overridable(override) CHAIN envelope (prop forwarding into nested
 * component instances). Reference semantics: editor createOverrideValue / resolve-overrides-chain
 * (verified 4.2.1) — a wrapping component that forwards its own prop into a nested instance stores
 * that instance override as `overridable{override_key: OUTER, origin_value: override{override_key:
 * INNER, override_value: baseline, schema_source:{type:'component', id: CHILD}}}`, and its registry
 * entry carries `originPropFields` pointing at the true landing element inside the child. Covers:
 * chain emission (registry + tree), instance extraction, rewriteComponentIds on chain items, the
 * inline-expansion fallback through the chain, deep (3-level) chains, and the failure modes.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { compileSite, normalizeIds } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h } from '../../src/runtime.mjs';
import { defineComponent, rewriteComponentIds, expandInstances } from '../../src/component.mjs';
import { resetIds, allNodes, findNode, byWidget, textOf } from '../helpers.mjs';

beforeEach(() => resetIds());

const page = (slug, node) => ({ title: slug, slug, node });
const site = (...pages) => defineSite({ name: 't', pages });

const instancesOf = (els) => allNodes(els).filter((n) => n.widgetType === 'e-component');
const overridesOf = (n) => n.settings.component_instance.value.overrides.value;

/** child: a plain registered card; parent: wraps it and FORWARDS `plan` → child's `headline`. */
const makePair = () => {
  const Child = defineComponent(
    ({ headline = 'Base child headline' }) => h('box', { pad: 16 }, h('h3', {}, headline)),
    { title: 'Chain Child', props: { headline: { label: 'Headline', group: 'Content' } } },
  );
  const Parent = defineComponent(
    ({ plan = 'Starter' }) => h('box', { pad: 32 }, h('p', {}, 'above'), h(Child, { headline: plan })),
    { title: 'Chain Parent', props: { plan: { label: 'Plan name', group: 'Content' } } },
  );
  return { Child, Parent };
};

/* ── chain emission: registry + definition tree ── */

test('chain: forwarded prop wraps the nested override in the overridable(override) envelope', () => {
  const { Parent } = makePair();
  const b = compileSite(site(page('a', h(Parent, {}))));
  assert.equal(b.components.length, 2, 'child + parent both registered');
  const child = b.components.find((c) => c.title === 'Chain Child');
  const parent = b.components.find((c) => c.title === 'Chain Parent');
  const inst = instancesOf(parent.elements)[0];
  assert.equal(inst.editor_settings.component_uid, child.uid, 'nested instance is uid-keyed to the child');
  const [item] = overridesOf(inst);
  assert.equal(item.$$type, 'overridable', 'the chain envelope');
  assert.equal(item.value.override_key, 'plan', 'OUTER key = the parent prop');
  const inner = item.value.origin_value;
  assert.equal(inner.$$type, 'override', 'wrapping an override');
  assert.equal(inner.value.override_key, 'headline', 'INNER key = the child prop');
  assert.equal(inner.value.override_value.value.content.value, 'Starter', 'baseline = the parent default');
  assert.deepEqual(inner.value.schema_source, { type: 'component', id: 0 }, 'child id placeholder — deploy rewrites');
});

test('chain: parent registry entry — e-component landing + originPropFields at the true inner element', () => {
  const { Parent } = makePair();
  const b = compileSite(site(page('a', h(Parent, {}))));
  const child = b.components.find((c) => c.title === 'Chain Child');
  const parent = b.components.find((c) => c.title === 'Chain Parent');
  const entry = parent.settings.overridable_props.props.plan;
  assert.equal(entry.overrideKey, 'plan');
  assert.equal(entry.elType, 'widget');
  assert.equal(entry.widgetType, 'e-component', 'the landing ELEMENT is the nested instance');
  assert.equal(entry.propKey, 'component_instance');
  const inst = instancesOf(parent.elements)[0];
  assert.equal(entry.elementId, inst.id, 'elementId = the instance node (resolve-overrides-chain walks from it)');
  assert.equal(entry.originValue.value.content.value, 'Starter', 'originValue is the UNWRAPPED baseline (editor parity)');
  // originPropFields = the child's own registry landing (the stop condition of the chain walk)
  const childEntry = child.settings.overridable_props.props.headline;
  assert.deepEqual(entry.originPropFields, {
    elType: childEntry.elType, widgetType: childEntry.widgetType,
    propKey: childEntry.propKey, elementId: childEntry.elementId,
  });
  assert.equal(entry.originPropFields.widgetType, 'e-heading');
  assert.equal(entry.originPropFields.propKey, 'title');
  // the child's own entry is a DIRECT landing — no originPropFields
  assert.equal('originPropFields' in childEntry, false);
});

test('chain: 3-level forwarding carries originPropFields through (grandparent sees the leaf landing)', () => {
  const { Parent } = makePair();
  const Grand = defineComponent(
    ({ tier = 'Gold' }) => h('box', { pad: 8 }, h(Parent, { plan: tier })),
    { title: 'Chain Grand', props: { tier: { label: 'Tier' } } },
  );
  const b = compileSite(site(page('a', h(Grand, {}))));
  const grand = b.components.find((c) => c.title === 'Chain Grand');
  const entry = grand.settings.overridable_props.props.tier;
  assert.equal(entry.widgetType, 'e-component');
  assert.equal(entry.originPropFields.widgetType, 'e-heading', 'leaf landing, not the intermediate instance');
  assert.equal(entry.originPropFields.propKey, 'title');
  // the grandparent's tree wraps the PARENT-instance override (outer key tier, inner key plan)
  const inst = instancesOf(grand.elements)[0];
  const [item] = overridesOf(inst);
  assert.equal(item.$$type, 'overridable');
  assert.equal(item.value.override_key, 'tier');
  assert.equal(item.value.origin_value.value.override_key, 'plan');
});

/* ── instance emission ── */

test('chain: a page instance overriding the forwarded prop emits a PLAIN override with the extracted envelope', () => {
  const { Parent } = makePair();
  const b = compileSite(site(page('a', h(Parent, { plan: 'Enterprise' }))));
  const inst = instancesOf(b.pages[0].elements)[0];
  const [ov] = overridesOf(inst);
  assert.equal(ov.$$type, 'override', 'page-level overrides are plain — the chain lives in the component tree');
  assert.equal(ov.value.override_key, 'plan');
  assert.equal(ov.value.override_value.$$type, 'html-v3');
  assert.equal(ov.value.override_value.value.content.value, 'Enterprise', 'the exact envelope the child would produce');
});

/* ── deploy-side machinery on chain items ── */

test('chain: rewriteComponentIds rewrites the WRAPPED override schema_source (and the instance component_id) together', () => {
  const { Parent } = makePair();
  const b = compileSite(site(page('a', h(Parent, { plan: 'X' }))));
  const child = b.components.find((c) => c.title === 'Chain Child');
  const parent = b.components.find((c) => c.title === 'Chain Parent');
  const ids = { [child.uid]: 101, [parent.uid]: 202 };
  rewriteComponentIds(parent.elements, ids);
  const inst = instancesOf(parent.elements)[0];
  assert.equal(inst.settings.component_instance.value.component_id.value, 101);
  const [item] = overridesOf(inst);
  assert.equal(item.$$type, 'overridable', 'the chain envelope survives the rewrite');
  assert.deepEqual(item.value.origin_value.value.schema_source, { type: 'component', id: 101 },
    'the invariant: the wrapped override schema_source.id === the instance component_id');
  // page instance targets the PARENT
  rewriteComponentIds(b.pages[0].elements, ids);
  const pinst = instancesOf(b.pages[0].elements)[0];
  assert.equal(pinst.settings.component_instance.value.component_id.value, 202);
  assert.deepEqual(overridesOf(pinst)[0].value.schema_source, { type: 'component', id: 202 });
});

test('chain: expandInstances resolves the chain — override rides through, baseline stays, null clears', () => {
  const { Parent } = makePair();
  const b = compileSite(site(page('a', h('box', { pad: 0 },
    h(Parent, { plan: 'Overridden plan' }), h(Parent, {}), h(Parent, {})))));
  const byUid = Object.fromEntries(b.components.map((c) => [c.uid, c]));
  const els = b.pages[0].elements;
  const [, , third] = instancesOf(els);
  // hand-add an explicit clear on the third instance
  overridesOf(third).push({ $$type: 'override', value: { override_key: 'plan', override_value: null, schema_source: { type: 'component', id: 0 } } });
  const expanded = normalizeIds(expandInstances(els, byUid));
  assert.equal(instancesOf(expanded).length, 0, 'no instance nodes remain (both levels expanded)');
  const heads = allNodes(expanded).filter(byWidget('e-heading')).map(textOf);
  // the parent ALWAYS feeds the child's headline (that is what forwarding means), so the bare
  // instance resolves to the PARENT baseline 'Starter' — never the child's own shadowed default.
  assert.deepEqual(heads, ['Overridden plan', 'Starter', null],
    'page override rides the chain to the leaf; bare instance keeps the parent baseline; null clears');
  const cleared = allNodes(expanded).filter((n) => n.widgetType === 'e-heading' && !('title' in (n.settings || {})));
  assert.equal(cleared.length, 1, 'override_value:null = explicit clear through the chain');
});

/* ── failure modes ── */

test('chain: forwarding without a baseline default is a build error naming the fix', () => {
  const Child = defineComponent(
    ({ headline = 'Base' }) => h('h3', {}, headline),
    { title: 'NBChild', props: { headline: { label: 'H' } } },
  );
  const Parent = defineComponent(
    ({ plan }) => h('box', { pad: 8 }, h(Child, { headline: plan })),   // NO default → no baseline override in tree A
    { title: 'NBParent', props: { plan: { label: 'Plan' } } },
  );
  assert.throws(() => compileSite(site(page('a', h(Parent, {})))), /give "plan" a default/);
});

test('chain: one prop feeding TWO child props is a build error', () => {
  const Child = defineComponent(
    ({ a = 'x', b = 'y' }) => h('box', { pad: 4 }, h('h3', {}, a), h('p', {}, b)),
    { title: 'TwoChild', props: { a: { label: 'A' }, b: { label: 'B' } } },
  );
  const Parent = defineComponent(
    ({ t = 'z' }) => h('box', { pad: 8 }, h(Child, { a: t, b: t })),
    { title: 'TwoParent', props: { t: { label: 'T' } } },
  );
  assert.throws(() => compileSite(site(page('a', h(Parent, {})))), /changes 2 override\(s\) on a nested component/);
});

test('chain: two parent props forwarding into the SAME child prop is a collision error', () => {
  const Child = defineComponent(
    ({ headline = 'Base' }) => h('h3', {}, headline),
    { title: 'ColChild', props: { headline: { label: 'H' } } },
  );
  const Parent = defineComponent(
    ({ a = 'one two', b = 'one two' }) => h('box', { pad: 8 }, h(Child, { headline: `${a} ${b}` })),
    { title: 'ColParent', props: { a: { label: 'A' }, b: { label: 'B' } } },
  );
  // both props land in the same nested override → the same (element, component_instance, headline) target
  assert.throws(() => compileSite(site(page('a', h(Parent, {})))), /both land in/);
});
