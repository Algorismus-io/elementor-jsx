/**
 * useTheme() across module copies. esbuild bundles a SECOND runtime into every entry: pages call
 * the bundled useTheme while compileSite renders with the disk copy. Module-level CTX split
 * across the copies made useTheme() null in every fs-project page (while working perfectly in
 * single-module unit tests) — CTX now lives on globalThis under Symbol.for('exjsx.CTX').
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h, render, useTheme } from '../../src/runtime.mjs';
import { defineTheme } from '../../src/theme.mjs';
import { pathToFileURL } from 'node:url';

const t = defineTheme({ mode: 'literal', colors: { ink: '#123456' }, fonts: { head: 'Inter' } });

test('useTheme reads the theme inside components without prop-drilling', () => {
  let seen = null;
  const Chip = () => { seen = useTheme(); return h('text', { color: useTheme().spec.colors.ink }, 'x'); };
  const Page = () => h('section', {}, h(Chip, {}));
  render(h(Page, { theme: t }));
  assert.equal(seen.spec.colors.ink, '#123456');
});

test('useTheme restores the outer theme after a themed subtree', () => {
  const inner = defineTheme({ mode: 'literal', colors: { ink: '#ff0000' }, fonts: { head: 'Inter' } });
  const seen = [];
  const Probe = ({ tag }) => { seen.push([tag, useTheme()?.spec.colors.ink]); return h('text', {}, tag); };
  const Page = () => h('section', {}, [h(Probe, { tag: 'a' }), h(Probe, { theme: inner, tag: 'b' }), h(Probe, { tag: 'c' })]);
  render(h(Page, { theme: t }));
  assert.deepEqual(seen, [['a', '#123456'], ['b', '#ff0000'], ['c', '#123456']]);
});

test('CTX is shared across separate runtime module instances (the bundled-copy hazard)', async () => {
  // a second, independent instance of the module — same trap as the esbuild-bundled copy
  const url = pathToFileURL(new URL('../../src/runtime.mjs', import.meta.url).pathname).href + '?copy=2';
  const copy = await import(url);
  let seenByCopy = null;
  const C = () => { seenByCopy = copy.useTheme(); return h('text', {}, 'x'); };
  render(h(C, { theme: t }));                       // rendered by the DISK copy
  assert.equal(seenByCopy?.spec.colors.ink, '#123456'); // read by the SECOND copy
});
