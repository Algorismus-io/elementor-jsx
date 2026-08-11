/**
 * 1.7.x — custom_css close-out, attributes, style states. Contracts under test:
 *   A. css() {state} targeting (create-or-merge the {breakpoint,state} variant), the
 *      sanitize-mangle build lint ('<' dies in sanitize_textarea_field) and the trailing-;
 *      guard on state-scoped chunks.
 *   B. ATTRS() envelope exactness (the verified 4.2.1 shape), attribute-name grammar, the
 *      class/id/style/on* hard blacklist, node({attrs}) + the JSX attrs={} prop.
 *   C. stateVariant() (generalized hover()) meta emission for every valid state, the sx-level
 *      state objects on box()/styled()/intrinsics (native variants + per-state custom_css,
 *      breakpoint nesting), and the tw split-by-expressibility emitter end-to-end.
 * DOM-emission reality for attributes is version-gated (stored & editor-validated on 4.2.1;
 * the DOM transformer is stubbed there) — the certification probe lives in
 * test/integration/hardening.test.mjs, not here.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  node, css, hover, stateVariant, STYLE_STATES, ATTRS, KV, S, C, SZ, P0, col,
} from '../../src/kit/kit.mjs';
import { box, styled, sx, splitStates, applyStates } from '../../src/kit/kit-components.mjs';
import { h, renderPage } from '../../src/runtime.mjs';
import { resetIds, styleOf, variantProps, classRefs, allNodes } from '../helpers.mjs';

beforeEach(() => resetIds());

const stateCssOf = (n, state, breakpoint = 'desktop') => {
  const st = styleOf(n);
  const v = (st.variants || []).find((x) => x.meta?.breakpoint === breakpoint && (x.meta?.state ?? null) === state);
  return v?.custom_css?.raw ? Buffer.from(v.custom_css.raw, 'base64').toString('utf8') : '';
};

/* ── A. css() state targeting ── */
test('css: {state} creates the {breakpoint,state} variant (per-state custom_css)', () => {
  const n = col({ padding: P0 }, []);
  css(n, 'outline: 2px solid red;', { state: 'hover' });
  assert.equal(stateCssOf(n, 'hover'), 'outline: 2px solid red;');
  assert.equal(stateCssOf(n, null), '', 'base variant untouched');
});

test('css: {state} MERGES into an existing state variant instead of clobbering (§css-overwrites-not-merges)', () => {
  const n = col({ padding: P0 }, []);
  stateVariant(n, 'hover', { color: C('#f00') });
  css(n, 'letter-spacing: 1px;', { state: 'hover' });
  css(n, 'text-decoration: underline;', { state: 'hover' });
  const v = styleOf(n).variants.find((x) => x.meta.state === 'hover');
  assert.ok(v.props.color, 'native props kept');
  assert.equal(stateCssOf(n, 'hover'), 'letter-spacing: 1px;\ntext-decoration: underline;');
  assert.equal(styleOf(n).variants.filter((x) => x.meta.state === 'hover').length, 1, 'ONE hover variant');
});

test('css: {breakpoint, state} combine (tablet-hover custom_css)', () => {
  const n = col({ padding: P0 }, []);
  css(n, 'transform: none;', { breakpoint: 'tablet', state: 'hover' });
  assert.equal(stateCssOf(n, 'hover', 'tablet'), 'transform: none;');
  assert.equal(stateCssOf(n, 'hover', 'desktop'), '', 'desktop-hover untouched');
});

test('css: state-scoped chunks get the trailing-; guard too', () => {
  const n = col({ padding: P0 }, []);
  css(n, 'color: red', { state: 'focus' });
  assert.equal(stateCssOf(n, 'focus'), 'color: red;');
});

test('css: unknown state throws naming the Style_States enum', () => {
  const n = col({ padding: P0 }, []);
  assert.throws(() => css(n, 'color: red;', { state: 'focus-within' }), /unknown state "focus-within".*hover \| active \| focus \| focus-visible \| checked \| e--selected \| e--disabled/);
});

/* ── A. sanitize-mangle build lint ── */
test('css: tag-like sequences throw (sanitize_textarea_field would strip them on save)', () => {
  const n = col({ padding: P0 }, []);
  assert.throws(() => css(n, 'content: "<";'), /sanitize_textarea_field.*\\3C/s);
  assert.throws(() => css(n, '&::before { content: "<b>hi</b>"; }'), /contain '<'/);
});

test('css: ">" alone is sanitize-safe (child combinators keep working)', () => {
  const n = col({ padding: P0 }, []);
  css(n, '& > * + * { margin-top: 8px; }');
  assert.match(stateCssOf(n, null), /> \* \+ \*/);
});

/* ── B. ATTRS envelope + validation ── */
test('ATTRS: exact verified envelope shape (attributes → key-value list)', () => {
  assert.deepEqual(ATTRS({ 'data-x': 'y' }), {
    $$type: 'attributes',
    value: [{ $$type: 'key-value', value: { key: { $$type: 'string', value: 'data-x' }, value: { $$type: 'string', value: 'y' } } }],
  });
  // values are coerced to strings (numbers are a natural authoring input)
  assert.deepEqual(ATTRS({ tabindex: 0 }).value[0], KV('tabindex', '0'));
});

test('ATTRS: blacklist — class/id/style/on* throw with the working recipe', () => {
  assert.throws(() => ATTRS({ class: 'x' }), /cls=\/gcls=/);
  assert.throws(() => ATTRS({ id: 'x' }), /id prop/);
  assert.throws(() => ATTRS({ style: 'color:red' }), /sx\/tw props/);
  assert.throws(() => ATTRS({ onclick: 'alert(1)' }), /on\* event-handler/);
  assert.throws(() => ATTRS({ onClick: 'alert(1)' }), /on\* event-handler/, 'case-insensitive');
  assert.throws(() => ATTRS({ ID: 'x' }), /id prop/, 'blacklist is case-insensitive');
});

test('ATTRS: attribute-name grammar — must start with a letter, then letters/digits/:._-', () => {
  assert.throws(() => ATTRS({ 'data x': 'y' }), /not a valid attribute name/);
  assert.throws(() => ATTRS({ '2fast': 'y' }), /not a valid attribute name/);
  assert.throws(() => ATTRS({ 'data"><script': 'y' }), /not a valid attribute name/);
  // legal: data-*, aria-*, namespaced, dotted
  const ok = ATTRS({ 'data-track': 'cta', 'aria-label': 'Close', 'xml:lang': 'en', 'x.y': 'z' });
  assert.equal(ok.value.length, 4);
});

test('node({attrs}) and the JSX attrs={} prop land the settings.attributes envelope', () => {
  const kn = node('e-div-block', { attrs: { 'data-kit': '1' } });
  assert.equal(kn.settings.attributes.$$type, 'attributes');
  const [el] = renderPage(h('box', { pad: 0, attrs: { 'data-jsx': 'yes', rel: 'noopener' } }, []));
  assert.deepEqual(el.settings.attributes, ATTRS({ 'data-jsx': 'yes', rel: 'noopener' }));
  // every intrinsic family takes attrs (text widgets + grid + img)
  const els = renderPage(h('box', { pad: 0 }, [
    h('h2', { attrs: { 'data-h': 'x' } }, 'T'),
    h('text', { attrs: { 'data-p': 'x' } }, 'B'),
    h('grid', { cols: 2, attrs: { 'data-g': 'x' } }),
    h('img', { src: 'https://ex.com/a.jpg', alt: 'a', attrs: { 'data-i': 'x' } }),
  ]));
  const withAttrs = allNodes(els).filter((n) => n.settings.attributes);
  assert.equal(withAttrs.length, 4);
});

test('attrs on <html> throws (classic widget has no attributes setting)', () => {
  assert.throws(() => renderPage(h('html', { raw: '<b>x</b>', attrs: { 'data-x': 'y' } })), /classic html widget has no attributes setting/);
});

/* ── C. stateVariant / hover ── */
test('stateVariant: every valid state emits its exact meta.state (incl. the kit-only e-- class states)', () => {
  for (const state of STYLE_STATES) {
    resetIds();
    const n = col({ padding: P0 }, []);
    stateVariant(n, state, { color: C('#fff') });
    const v = styleOf(n).variants.find((x) => x.meta.state === state);
    assert.ok(v, `${state} variant exists`);
    assert.equal(v.meta.breakpoint, 'desktop');
  }
});

test('stateVariant: create-or-merge on the {breakpoint,state} variant; invalid/missing state throws', () => {
  const n = col({ padding: P0 }, []);
  stateVariant(n, 'active', { color: C('#f00') });
  stateVariant(n, 'active', { 'font-weight': S('700') });
  const actives = styleOf(n).variants.filter((x) => x.meta.state === 'active');
  assert.equal(actives.length, 1, 'merged, not duplicated');
  assert.ok(actives[0].props.color && actives[0].props['font-weight']);
  assert.throws(() => stateVariant(n, 'group-hover', {}), /unknown state/);
  assert.throws(() => stateVariant(n, null, {}), /state is required/);
});

test('hover() stays a thin stateVariant wrapper (compat) and bootstraps styleless nodes', () => {
  const n = { id: 'hx', elType: 'widget', widgetType: 'e-heading', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] };
  hover(n, { color: C('#f00') }, { breakpoint: 'tablet' });
  const v = styleOf(n).variants.find((x) => x.meta.state === 'hover');
  assert.equal(v.meta.breakpoint, 'tablet');
  assert.ok(classRefs(n).includes(Object.keys(n.styles)[0]), 'R4 link');
});

/* ── C. sx-level state objects (box/styled/JSX) ── */
test('box: hover={{…sx}} emits a NATIVE hover variant (schema envelopes, not raw)', () => {
  const n = box({ pad: 0, hover: { bg: '#0f172a', color: '#ffffff' } }, []);
  const hv = variantProps(n, 'desktop', 'hover');
  assert.equal(hv.background.value.color.value, '#0f172a');
  assert.equal(hv.color.value, '#ffffff');
  assert.equal(stateCssOf(n, 'hover'), '', 'no raw fallback for sx-mappable keys');
});

test('box: state raw + nested tablet/mobile → per-state custom_css and breakpoint-scoped state variants', () => {
  const n = box({ pad: 0, hover: { bg: '#111111', raw: 'outline: none;', tablet: { bg: '#222222', raw: 'transform: none;' }, mobile: { color: '#333333' } } }, []);
  assert.equal(variantProps(n, 'desktop', 'hover').background.value.color.value, '#111111');
  assert.equal(variantProps(n, 'tablet', 'hover').background.value.color.value, '#222222');
  assert.equal(variantProps(n, 'mobile', 'hover').color.value, '#333333');
  assert.equal(stateCssOf(n, 'hover'), 'outline: none;');
  assert.equal(stateCssOf(n, 'hover', 'tablet'), 'transform: none;');
});

test('styled: state objects apply to existing nodes (focusVisible camelCase normalizes to focus-visible)', () => {
  const n = col({ padding: P0 }, []);
  styled(n, { checked: { bg: '#059669' }, focusVisible: { color: '#3b82f6' } });
  assert.ok(variantProps(n, 'desktop', 'checked').background);
  assert.ok(variantProps(n, 'desktop', 'focus-visible').color, 'authored focus-visible keeps its OWN meta.state (the :hover, :focus-visible comma pair is Elementor-side rendering of the hover state)');
});

test('sx: a bare state key throws loudly (no node to land on)', () => {
  assert.throws(() => sx({ hover: { bg: '#fff' } }), /state object 'hover' has no target node/);
});

test('splitStates/applyStates: extraction is non-destructive and normalized', () => {
  const o = { pad: 0, hover: { bg: '#fff' }, 'focus-visible': { color: '#000' } };
  const { rest, states } = splitStates(o);
  assert.deepEqual(Object.keys(rest), ['pad']);
  assert.deepEqual(Object.keys(states).sort(), ['focus-visible', 'hover']);
  assert.ok(o.hover, 'input object not mutated');
  const n = col({ padding: P0 }, []);
  applyStates(n, states);
  assert.ok(variantProps(n, 'desktop', 'hover').background);
});

/* ── C. tw split-by-expressibility, end-to-end through the runtime ── */
test('tw e2e: fully schema-mappable state bucket → NATIVE state variant on the built node', () => {
  const [el] = renderPage(h('box', { pad: 0, tw: 'hover:bg-slate-900' }, []));
  const hv = variantProps(el, 'desktop', 'hover');
  assert.equal(hv.background.value.color.value, '#0f172a');
  assert.equal(stateCssOf(el, 'hover'), '', 'native, not raw');
});

test('tw e2e: raw-only utility in the bucket → whole bucket lands as base &:state custom_css', () => {
  const [el] = renderPage(h('box', { pad: 0, tw: 'hover:underline hover:bg-slate-900' }, []));
  assert.equal(variantProps(el, 'desktop', 'hover'), undefined, 'no native hover variant');
  assert.match(stateCssOf(el, null), /&:hover \{ text-decoration: underline; background: #0f172a; \}/);
});

test('tw e2e: explicit state prop WINS over tw state on conflict (mergeTw contract)', () => {
  const [el] = renderPage(h('box', { pad: 0, tw: 'active:bg-slate-800', active: { bg: '#000000' } }, []));
  assert.equal(variantProps(el, 'desktop', 'active').background.value.color.value, '#000000');
});

test('tw e2e: new prefixes active:/focus-visible:/checked: each emit their own meta.state', () => {
  const [el] = renderPage(h('box', { pad: 0, tw: 'active:bg-slate-800 focus-visible:bg-blue-500 checked:bg-emerald-600' }, []));
  assert.ok(variantProps(el, 'desktop', 'active'));
  assert.ok(variantProps(el, 'desktop', 'focus-visible'));
  assert.ok(variantProps(el, 'desktop', 'checked'));
});
