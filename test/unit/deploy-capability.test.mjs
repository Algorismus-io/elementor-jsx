/**
 * The DEPLOY CAPABILITY GATE + deploy atomicity (field report 1.9.1, the orphan-page incident).
 *
 * What happened: a project using form()/field()/formSubmit() emits e-form-input / e-form-label /
 * e-form-textarea / e-form-submit-button / e-form-success-message / e-form-error-message. Free
 * Elementor registers NONE of them. `exjsx lint` passed clean (it is offline — it cannot know the
 * target), the deploy CREATED the post, then 422'd the tree save with 11 "Unknown type … is not
 * registered on this site" errors — and left the empty post behind, so the retry made a second one.
 *
 * The gate below is PURE, so the whole decision is table-testable offline; the live half (a real
 * free-Elementor 4.2.1 site refusing a form bundle and creating ZERO pages) is proven in the
 * integration suite. `deployFailures` is the shared reader that stops `exjsx dev` and the CLI from
 * printing "deployed" over a rejected save.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleElementTypes, unregisteredTypes, capabilityError, deployFailures, summarizeSaveError } from '../../src/deploy.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { h } from '../../src/runtime.mjs';
import { form, field, formSubmit } from '../../src/kit/kit.mjs';
import { resetIds } from '../helpers.mjs';

/** the free-Elementor 4.2.1 registry, verbatim from a live /site/capabilities probe (:8951) */
const FREE_421 = {
  elements: ['column', 'container', 'e-collection-loop', 'e-div-block', 'e-flexbox', 'e-form', 'e-grid', 'section'],
  widgets: ['e-button', 'e-component', 'e-divider', 'e-heading', 'e-image', 'e-paragraph', 'e-svg', 'e-youtube', 'html', 'nav-menu'],
};
const WITH_PRO = {
  elements: [...FREE_421.elements, 'e-form-success-message', 'e-form-error-message'],
  widgets: [...FREE_421.widgets, 'e-form-input', 'e-form-textarea', 'e-form-label', 'e-form-submit-button'],
};

const contactSite = () => {
  resetIds();
  return compileSite(defineSite({
    name: 'cap-t',
    pages: [{ title: 'Contact', slug: 'contact', node: h('box', { pad: 0 },
      h('h1', {}, 'Contact'),
      form({ name: 'c' }, [field('email', 'Email'), formSubmit('Send')])) }],
  }));
};
const plainSite = () => {
  resetIds();
  return compileSite(defineSite({
    name: 'cap-t',
    pages: [{ title: 'Home', slug: 'home', node: h('box', { pad: 0 }, h('h1', {}, 'Hi'), h('text', {}, 'copy')) }],
  }));
};

/* ── the usage scan ── */

test('bundleElementTypes: counts every type a bundle would ship, keyed by widgetType ?? elType', () => {
  const types = bundleElementTypes(plainSite());
  assert.ok(types.has('e-flexbox'));
  assert.ok(types.has('e-heading'));
  assert.ok(types.has('e-paragraph'));
  assert.equal(types.get('e-heading').count, 1);
  assert.match(types.get('e-heading').where, /^page \/home\/$/);
  assert.equal(types.has('widget'), false, "'widget' is the wrapper elType, never an identity");
});

test('bundleElementTypes: e-component is EXEMPT — instances have their own inline-expansion ladder', () => {
  const bundle = { pages: [{ slug: 'a', elements: [{ elType: 'widget', widgetType: 'e-component', elements: [] }] }] };
  assert.equal(bundleElementTypes(bundle).has('e-component'), false);
});

test('bundleElementTypes: scans parts and COMPONENT trees too (both deploy as element trees)', () => {
  const bundle = {
    pages: [],
    parts: [{ type: 'header', elements: [{ elType: 'e-flexbox', elements: [] }] }],
    components: [{ title: 'Card', elements: [{ elType: 'widget', widgetType: 'e-heading', elements: [] }] }],
  };
  const types = bundleElementTypes(bundle);
  assert.equal(types.get('e-flexbox').where, 'part header');
  assert.equal(types.get('e-heading').where, 'component "Card"');
});

/* ── the gate decision ── */

test('unregisteredTypes: a form bundle against FREE Elementor names every missing e-form-* type', () => {
  const missing = unregisteredTypes(contactSite(), FREE_421);
  const types = missing.map((m) => m.type).sort();
  assert.deepEqual(types, ['e-form-error-message', 'e-form-input', 'e-form-label', 'e-form-submit-button', 'e-form-success-message']);
  assert.ok(missing.every((m) => /Elementor Pro/.test(m.needs)), 'each carries its Pro requirement');
  assert.ok(missing.every((m) => m.count >= 1 && /^page \/contact\/$/.test(m.where)));
  // the e-form CONTAINER is free-core registered — the gate must not flag it
  assert.equal(missing.some((m) => m.type === 'e-form'), false);
});

test('unregisteredTypes: the SAME bundle passes clean against a Pro registry', () => {
  assert.deepEqual(unregisteredTypes(contactSite(), WITH_PRO), []);
});

test('unregisteredTypes: a plain atomic page passes clean against free Elementor', () => {
  assert.deepEqual(unregisteredTypes(plainSite(), FREE_421), []);
});

test('unregisteredTypes: an unprobeable site returns null (the caller SKIPS, never blocks a deploy)', () => {
  assert.equal(unregisteredTypes(contactSite(), undefined), null);
  assert.equal(unregisteredTypes(contactSite(), {}), null);
  assert.equal(unregisteredTypes(contactSite(), { elements: ['e-flexbox'] }), null, 'half a payload is not a registry');
});

test('unregisteredTypes: honors the --only page filter (unshipped pages cannot block the deploy)', () => {
  resetIds();
  const b = compileSite(defineSite({ name: 'cap-t', pages: [
    { title: 'Home', slug: 'home', node: h('box', { pad: 0 }, h('h1', {}, 'Hi')) },
    { title: 'Contact', slug: 'contact', node: h('box', { pad: 0 }, form({ name: 'c' }, [formSubmit('Send')])) },
  ] }));
  assert.ok(unregisteredTypes(b, FREE_421).length, 'the whole bundle is blocked');
  assert.deepEqual(unregisteredTypes(b, FREE_421, { pages: [b.pages[0]], parts: [] }), [], '--only home is not');
});

/* ── the message: it has to be actionable enough to end the debugging session ── */

test('capabilityError: names the types, the counts, where, the Pro requirement and the escape hatch', () => {
  const e = capabilityError(unregisteredTypes(contactSite(), FREE_421), 'http://127.0.0.1:8951', false);
  assert.match(e.message, /deploy ABORTED before any page was created/);
  assert.match(e.message, /5 element type\(s\) in this bundle are NOT REGISTERED on http:\/\/127\.0\.0\.1:8951/);
  assert.match(e.message, /• e-form-input × 1 \(first seen: page \/contact\/\) — needs Elementor Pro/);
  assert.match(e.message, /Elementor Pro NOT ACTIVE/);
  assert.match(e.message, /e_pro_atomic_form experiment/);
  assert.match(e.message, /free core registers only the e-form container/);
  assert.match(e.message, /Nothing was written/, 'the reader must know no cleanup is needed');
  assert.match(e.message, /--allow-unregistered/);
});

test('capabilityError: an ACTIVE-Pro target gets the experiment hint, not the "install Pro" hint', () => {
  const e = capabilityError(unregisteredTypes(contactSite(), FREE_421), 'http://x', true);
  assert.match(e.message, /Elementor Pro ACTIVE but without the atomic-forms experiment/);
});

test('capabilityError: non-Pro missing types get the generic remedy (no Pro claim invented)', () => {
  const e = capabilityError([{ type: 'e-widgetron', count: 2, where: 'page /a/', needs: null }], 'http://x', false);
  assert.match(e.message, /• e-widgetron × 2 \(first seen: page \/a\/\)$/m);
  assert.match(e.message, /Install\/activate whatever provides these types/);
  assert.doesNotMatch(e.message, /Elementor Pro/);
});

/* ── deployFailures: the reader that made "deployed" stop lying (field report #2) ── */

test('deployFailures: surfaces per-page ERR actions with the validator text intact', () => {
  const failed = deployFailures({ pages: [
    { title: 'Home', slug: 'home', id: '12', action: 'updated' },
    { title: 'Contact', slug: 'contact', id: null, action: "ERR save 422: Unknown type e-form-input is not registered on this site — the just-created page was DELETED (no orphan left behind)" },
  ] });
  assert.equal(failed.length, 1);
  assert.match(failed[0], /^page "Contact" \(\/contact\/\): ERR save 422/);
  assert.match(failed[0], /Unknown type e-form-input/, "the validator's own message survives to the caller");
});

test('deployFailures: catches part errors and a rejected class-registry PUT; clean reports are empty', () => {
  assert.deepEqual(deployFailures({ pages: [{ title: 'A', slug: 'a', action: 'created' }], classes: 4 }), []);
  assert.deepEqual(deployFailures({}), []);
  assert.equal(deployFailures({ parts: [{ type: 'header', action: 'ERR: wp-cli unavailable' }] }).length, 1);
  assert.equal(deployFailures({ classes: 'ERR 403: forbidden' }).length, 1);
  assert.equal(deployFailures({ pages: [{ title: 'A', slug: 'a', action: 'skipped-drifted' }] }).length, 0,
    'a drift skip is a deliberate outcome, not a failure');
});

/* ── summarizeSaveError: the report used to carry a 100-char slice of the raw JSON body, which cut
   off `data.errors[]` — exactly the part that names the failing element and settings key. ── */
test('summarizeSaveError: lifts the per-element codes out of data.errors[]', () => {
  const body = JSON.stringify({
    code: 'ATOMIC_SETTINGS_INVALID',
    message: 'Element-tree validation failed (2 errors); nothing was written.',
    data: { status: 422, errors: [
      { code: 'ATOMIC_SETTINGS_INVALID', element_id: 'a1', message: 'Atomic settings validation failed on element "a1". tag: invalid_value' },
      { code: 'UNKNOWN_WIDGET_TYPE', element_id: 'b2', message: 'Unknown type e-form-input is not registered on this site' },
    ] },
  });
  const s = summarizeSaveError(body);
  assert.match(s, /^ATOMIC_SETTINGS_INVALID — Element-tree validation failed \(2 errors\)/);
  assert.match(s, /\[a1\] .*tag: invalid_value/);
  assert.match(s, /\[b2\] Unknown type e-form-input/);
});

test('summarizeSaveError: degrades gracefully on flat and non-JSON bodies', () => {
  assert.equal(summarizeSaveError(JSON.stringify({ code: 'rest_forbidden', message: 'Sorry' })), 'rest_forbidden — Sorry');
  assert.equal(summarizeSaveError('<html>502 Bad Gateway</html>'), '<html>502 Bad Gateway</html>');
  assert.equal(summarizeSaveError(''), '');
});
