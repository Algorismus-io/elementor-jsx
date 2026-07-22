/**
 * theme.mjs — design tokens → Elementor global variables. The deploy-critical part is
 * variablesMeta(): its shape must match Variables_Collection::hydrate EXACTLY
 * (missing watermark = live fatal, field-found).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineTheme } from '../../src/theme.mjs';

const spec = {
  name: 'brand',
  color: { primary: '#E01118', ink: '#0A2230', surface: '#F6F7F9' },
  font: { head: 'Sora', body: 'Inter' },
  radius: { card: 24, pill: 999 },
  space: [0, 4, 8, 12, 16, 24, 32, 48, 64, 96],
  shadow: { card: 'x' },
  tints: [{ bg: '#FDECEC', dark: false }, { bg: '#0A2230', dark: true }],
};

test('theme: every color and font becomes a registered variable with sequential order', () => {
  const t = defineTheme(spec);
  assert.equal(t._vars.length, 5);
  assert.deepEqual(t._vars.map((v) => v.order), [1, 2, 3, 4, 5]);
  const types = t._vars.map((v) => v.type);
  assert.deepEqual(types, ['global-color-variable', 'global-color-variable', 'global-color-variable', 'global-font-variable', 'global-font-variable']);
});

test('theme: variable ids are DETERMINISTIC across builds (idempotent re-deploys)', () => {
  const a = defineTheme(spec);
  const b = defineTheme(spec);
  assert.deepEqual(a._vars.map((v) => v.id), b._vars.map((v) => v.id));
  assert.ok(a._vars.every((v) => /^e-gv-[0-9a-f]{1,7}$/.test(v.id)));
});

test('theme: different labels → different ids (no hash collisions across tokens)', () => {
  const t = defineTheme(spec);
  const ids = new Set(t._vars.map((v) => v.id));
  assert.equal(ids.size, t._vars.length);
});

test('theme: var mode color token → ref envelope carrying __lit fallback', () => {
  const t = defineTheme(spec);
  const c = t.color.primary;
  assert.equal(c.$$type, 'global-color-variable');
  assert.equal(c.value, t.colorRef.primary.id);
  assert.equal(c.__lit, '#E01118');
});

test('theme: literal mode → raw hex strings', () => {
  const t = defineTheme({ ...spec, mode: 'literal' });
  assert.equal(t.color.primary, '#E01118');
  assert.equal(t.font.head, 'Sora');
});

test('theme: unknown color key passes through untouched (inline values allowed)', () => {
  const t = defineTheme(spec);
  assert.equal(t.color.doesNotExist, 'doesNotExist');
  assert.equal(t.font.doesNotExist, 'doesNotExist');
});

test('theme: t.lit always returns the literal hex (raw-CSS widget escape hatch)', () => {
  const t = defineTheme(spec);
  assert.equal(t.lit.primary, '#E01118');
  assert.equal(t.lit.missing, undefined);
});

test('theme: litFont literal accessor with passthrough', () => {
  const t = defineTheme(spec);
  assert.equal(t.litFont('head'), 'Sora');
  assert.equal(t.litFont('monospace'), 'monospace');
});

test('theme: font token → global-font-variable ref (no __lit — fonts resolve live)', () => {
  const t = defineTheme(spec);
  const f = t.font.head;
  assert.deepEqual(f, { $$type: 'global-font-variable', value: t.fontRef.head.id });
});

test('theme: radius/space/shadow accessors with fallbacks', () => {
  const t = defineTheme(spec);
  assert.equal(t.radius('card'), 24);
  assert.equal(t.radius(10), 10);      // numeric passthrough
  assert.equal(t.radius('nope'), 24);  // default
  assert.equal(t.space(3), 12);        // scale index
  assert.equal(t.space(200), 200);     // out-of-range passthrough
  assert.equal(t.shadow('card'), 'x');
});

test('theme: tint cycles by index and wraps', () => {
  const t = defineTheme(spec);
  assert.equal(t.tint(0).bg, '#FDECEC');
  assert.equal(t.tint(1).dark, true);
  assert.deepEqual(t.tint(2), t.tint(0));
});

test('theme: tint falls back to surface (or white) with no tints', () => {
  const t = defineTheme({ name: 'x', color: { surface: '#EEE' } });
  assert.deepEqual(t.tint(0), { bg: '#EEE', dark: false });
  const bare = defineTheme({ name: 'y' });
  assert.deepEqual(bare.tint(5), { bg: '#fff', dark: false });
});

test('variablesMeta: EXACT hydrate shape — data keyed by id, INT watermark, version 1', () => {
  const t = defineTheme(spec);
  const meta = t.variablesMeta();
  assert.equal(meta.version, 1);
  assert.equal(meta.watermark, 5, 'watermark REQUIRED = var count (null → PHP fatal)');
  assert.equal(typeof meta.watermark, 'number');
  assert.equal(Object.keys(meta.data).length, 5);
  const first = meta.data[t._vars[0].id];
  assert.deepEqual(Object.keys(first).sort(), ['created_at', 'label', 'order', 'type', 'updated_at', 'value']);
  assert.deepEqual(first.value, { $$type: 'color', value: '#E01118' });
  assert.equal(first.label, 'brand-primary');
});

test('variablesMeta: empty theme → watermark 0, still valid shape', () => {
  const meta = defineTheme({ name: 'empty' }).variablesMeta();
  assert.deepEqual(meta, { data: {}, watermark: 0, version: 1 });
});

test('variablesMeta: timestamps are FIXED strings (no Date.now — deterministic builds)', () => {
  const t = defineTheme(spec);
  const a = JSON.stringify(t.variablesMeta());
  const b = JSON.stringify(defineTheme(spec).variablesMeta());
  assert.equal(a, b);
});
