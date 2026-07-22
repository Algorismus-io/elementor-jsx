/**
 * assertTree — the shift-left structural gate. Every guard must FIRE on its footgun
 * and STAY QUIET on correct trees. These rules encode field-found production bugs;
 * a silently-disabled guard means the bug ships again.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assertTree, node, clone, S, N, SZ, P0, col, row, heading } from '../../../.claude/skills/elementor-ultra/lib/kit.mjs';
import { resetIds } from '../helpers.mjs';
import { h, render, renderPage } from '../../src/runtime.mjs';

beforeEach(() => resetIds());

const bare = (over = {}) => ({ id: over.id ?? 'n1', elType: 'e-flexbox', settings: { classes: { $$type: 'classes', value: [] }, ...(over.settings || {}) }, styles: {}, elements: [], ...over });
const padded = (id) => node('e-flexbox', { props: { padding: P0 } , children: [] });

test('guard: duplicate element id (node reuse without clone)', () => {
  const a = padded();
  assert.throws(() => assertTree([a, a]), /duplicate element id/);
});

test('guard: duplicate local-style id (R4)', () => {
  const a = padded(), b = padded();
  b.styles = a.styles; b.settings.classes = a.settings.classes; b.id = a.id + 'x';
  assert.throws(() => assertTree([a, b]), /duplicate local-style id/);
});

test('clone() is the sanctioned reuse path — clears both duplicate guards', () => {
  const a = padded();
  assert.doesNotThrow(() => assertTree([a, clone(a)]));
});

test('guard: style not referenced in settings.classes (R4 linkage)', () => {
  const a = padded();
  a.settings.classes = { $$type: 'classes', value: [] }; // unlink
  assert.throws(() => assertTree([a]), /not referenced in settings\.classes/);
});

test('guard: null variant breakpoint', () => {
  const a = padded();
  const sid = Object.keys(a.styles)[0];
  a.styles[sid].variants[0].meta.breakpoint = null;
  assert.throws(() => assertTree([a]), /breakpoint is null/);
});

test('guard: non-schema prop keys (background-color, flex-grow, row-gap, overflow-x…)', () => {
  for (const key of ['background-color', 'flex-grow', 'flex-shrink', 'flex-basis', 'row-gap', 'column-gap', 'overflow-x', 'overflow-y']) {
    resetIds();
    const a = node('e-flexbox', { props: { padding: P0, [key]: S('x') }, children: [] });
    assert.throws(() => assertTree([a]), new RegExp(`"${key}" is not a schema key`), key);
  }
});

test('guard: text-align left/right rejected (validator enum is start|end)', () => {
  const a = node('e-flexbox', { props: { padding: P0, 'text-align': S('left') }, children: [] });
  assert.throws(() => assertTree([a]), /text-align "left" rejected/);
});

test('guard: z-index must be a number envelope', () => {
  const a = node('e-flexbox', { props: { padding: P0, 'z-index': S('5') }, children: [] });
  assert.throws(() => assertTree([a]), /z-index must be a number envelope/);
  resetIds();
  const ok = node('e-flexbox', { props: { padding: P0, 'z-index': N(5) }, children: [] });
  assert.doesNotThrow(() => assertTree([ok]));
});

test('guard: container without explicit padding (intrinsic-10px leak)', () => {
  const a = node('e-flexbox', { props: { display: S('flex') }, children: [] });
  assert.throws(() => assertTree([a]), /without explicit padding/);
});

test('guard: multi-child flexbox without explicit flex-direction (BASE default is ROW)', () => {
  const kids = () => [node('widget', { widgetType: 'e-heading', settings: { tag: S('h2') } }), node('widget', { widgetType: 'e-heading', settings: { tag: S('h2') } })];
  const a = node('e-flexbox', { props: { padding: P0 }, children: kids() });
  assert.throws(() => assertTree([a]), /no explicit flex-direction/);
  resetIds();
  const grid = node('e-flexbox', { props: { padding: P0, display: S('grid') }, children: kids() });
  assert.doesNotThrow(() => assertTree([grid]), 'grid display exempts the rule');
});

test('guard: flex-row container child with no width/flex (the row-wrap bug)', () => {
  const child = col({}, []);
  const r = row({ padding: P0 }, [child, node('widget', { widgetType: 'e-heading', settings: { tag: S('h2') } })]);
  assert.throws(() => assertTree([r]), /no width\/flex/);
});

test('guard: empty absolute container (editor-blocking overlay)', () => {
  const a = node('e-flexbox', { props: { padding: P0, position: S('absolute') }, children: [] });
  assert.throws(() => assertTree([a]), /empty absolute container/);
});

test('guard: widget without widgetType (renders a 500)', () => {
  assert.throws(() => assertTree([bare({ elType: 'widget' })]), /widget without widgetType/);
});

test('guard: multiple violations are ALL reported at once (one pass, full list)', () => {
  const a = node('e-flexbox', { props: {} , children: [] }); // no padding
  const b = a; // duplicate id too
  try {
    assertTree([a, b]);
    assert.fail('should throw');
  } catch (e) {
    assert.match(e.message, /\d+ structural error\(s\)/);
    assert.ok(e.message.includes('padding') && e.message.includes('duplicate'), 'both violations listed');
  }
});

test('positive: every runtime intrinsic composes into an assertTree-clean page', () => {
  const pageEls = renderPage(h('section', { pad: [96, 24] },
    h('box', { maxw: 1200, center: true, gap: 40, pad: 0 },
      h('h1', { size: 56 }, 'Hero'),
      h('text', { size: 16 }, 'Body'),
      h('row', { gap: 20, pad: 0 },
        h('col', { pad: 24 }, h('h3', {}, 'A')),
        h('col', { pad: 24 }, h('h3', {}, 'B'))),
      h('img', { src: 1, w: '100%' }),
      h('html', { raw: '<b>ok</b>' }))));
  assert.doesNotThrow(() => assertTree(pageEls));
});

test('node(): positional-children misuse throws loudly (the silent-empty-box footgun)', () => {
  assert.throws(() => node('e-flexbox', {}, []), /children go INSIDE the options object/);
});
