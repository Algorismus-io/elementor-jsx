/**
 * classes.mjs — style dedup → the shared global-class registry. The scale feature:
 * identical styles collapse to ONE class; labels are stable; refs rewritten correctly.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractClasses, mergeClasses } from '../../src/classes.mjs';
import { h, render } from '../../src/runtime.mjs';
import { resetIds, allNodes, classRefs } from '../helpers.mjs';

beforeEach(() => resetIds());

const build = (vnode) => { const out = render(vnode); return Array.isArray(out) ? out : [out]; };

test('dedup: two elements with IDENTICAL styles share one class', () => {
  const els = build(h('box', {}, h('text', { color: '#111', size: 14 }, 'a'), h('text', { color: '#111', size: 14 }, 'b')));
  const reg = extractClasses(els);
  assert.equal(reg.order.length, 2, 'box style + one shared text style');
  const [a, b] = els[0].elements;
  assert.deepEqual(classRefs(a), classRefs(b), 'both reference the SAME class id');
});

test('dedup: different styles stay separate', () => {
  const els = build(h('box', {}, h('text', { size: 14 }, 'a'), h('text', { size: 15 }, 'b')));
  const reg = extractClasses(els);
  const [a, b] = els[0].elements;
  assert.notDeepEqual(classRefs(a), classRefs(b));
  assert.equal(reg.order.length, 3);
});

test('dedup: local styles are STRIPPED after extraction (small trees)', () => {
  const els = build(h('box', {}, h('text', { size: 14 }, 'a')));
  extractClasses(els);
  for (const n of allNodes(els)) assert.deepEqual(n.styles, {});
});

test('dedup: responsive variants participate in identity (same desktop, different mobile ≠ same class)', () => {
  const els = build(h('box', {},
    h('text', { size: 14, mobile: { size: 12 } }, 'a'),
    h('text', { size: 14, mobile: { size: 11 } }, 'b'),
    h('text', { size: 14, mobile: { size: 12 } }, 'c')));
  extractClasses(els);
  const [a, b, c] = els[0].elements;
  assert.deepEqual(classRefs(a), classRefs(c));
  assert.notDeepEqual(classRefs(a), classRefs(b));
});

test('dedup: hash is key-order independent (structurally equal → equal class)', () => {
  // two styles authored with prop keys in different orders must still merge
  const els = build(h('box', {}, h('text', { color: '#222', size: 14 }, 'a'), h('text', { size: 14, color: '#222' }, 'b')));
  extractClasses(els);
  const [a, b] = els[0].elements;
  assert.deepEqual(classRefs(a), classRefs(b));
});

test('labels: cls hint names the class semantically; content-hash fallback otherwise', () => {
  const els = build(h('box', {}, h('text', { size: 14, cls: 'body-copy' }, 'a'), h('text', { size: 15 }, 'b')));
  const reg = extractClasses(els);
  const labels = reg.order.map((id) => reg.items[id].label);
  assert.ok(labels.includes('body-copy'));
  assert.ok(labels.some((l) => /^c-[0-9a-z]{1,6}$/.test(l)), 'hash-named fallback present');
  assert.ok(reg.order.includes('g-body-copy'), 'id = g-<label>');
});

test('labels: same cls hint + DIFFERENT styles → auto-suffixed (card, card-2)', () => {
  const els = build(h('box', {}, h('text', { size: 14, cls: 'card' }, 'a'), h('text', { size: 16, cls: 'card' }, 'b')));
  const reg = extractClasses(els);
  const labels = reg.order.map((id) => reg.items[id].label).filter((l) => l.startsWith('card'));
  assert.deepEqual(labels.sort(), ['card', 'card-2']);
});

test('labels: same cls hint + SAME style → one class, no suffix', () => {
  const els = build(h('box', {}, h('text', { size: 14, cls: 'card' }, 'a'), h('text', { size: 14, cls: 'card' }, 'b')));
  const reg = extractClasses(els);
  assert.deepEqual(reg.order.filter((id) => id.includes('card')), ['g-card']);
});

test('refs: external gcls refs are PRESERVED alongside the assigned shared class', () => {
  const els = build(h('box', {}, h('text', { size: 14, gcls: 'g-kxbody' }, 'a')));
  extractClasses(els);
  const refs = classRefs(els[0].elements[0]);
  assert.ok(refs.includes('g-kxbody'));
  assert.equal(refs.length, 2);
});

test('registry shape: items keyed by id, {id,label,type:class,variants}', () => {
  const els = build(h('text', { size: 14, cls: 'x' }, 'a'));
  const reg = extractClasses(els);
  const item = reg.items['g-x'];
  assert.equal(item.type, 'class');
  assert.equal(item.variants.length, 1);
  assert.deepEqual(Object.keys(item).sort(), ['id', 'label', 'type', 'variants']);
});

test('styleless nodes pass through untouched (no phantom classes)', () => {
  const els = build(h('box', {}, h('text', {}, 'plain')));
  const reg = extractClasses(els);
  assert.equal(reg.order.length, 1, 'only the box style');
  assert.deepEqual(classRefs(els[0].elements[0]), []);
});

test('mergeClasses: cross-page dedup keeps first occurrence, preserves order', () => {
  const a = { items: { 'g-x': { id: 'g-x', v: 1 }, 'g-y': { id: 'g-y' } }, order: ['g-x', 'g-y'] };
  const b = { items: { 'g-x': { id: 'g-x', v: 2 }, 'g-z': { id: 'g-z' } }, order: ['g-x', 'g-z'] };
  const m = mergeClasses([a, b]);
  assert.deepEqual(m.order, ['g-x', 'g-y', 'g-z']);
  assert.equal(m.items['g-x'].v, 1, 'first page wins');
});

test('scale: 100 identical cards → exactly ONE card class (the 482→33 mechanism)', () => {
  const cards = Array.from({ length: 100 }, (_, i) =>
    h('box', { pad: 24, radius: 20, gap: 10, cls: 'card' }, h('h3', { size: 18 }, `Card ${i}`), h('text', { size: 14 }, 'desc')));
  const els = build(h('box', {}, cards));
  const reg = extractClasses(els);
  // outer box + card + h3 + text = 4 shared classes for 301 styled nodes
  assert.equal(reg.order.length, 4);
  assert.equal(reg.order.filter((id) => id.includes('card')).length, 1);
});
