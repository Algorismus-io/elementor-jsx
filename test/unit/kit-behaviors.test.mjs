/**
 * kit.mjs behaviors — css() merge semantics, hover(), clone(), id minting, primitive helpers,
 * hero()/abs()/arch composition, FA icon normalization, button href guard. Each encodes a
 * field-found production bug; the tests keep them fixed.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshId, node, css, clone, hover, assertTree,
  S, C, SZ, P0, HUG, IMG_URL,
  fx, col, row, grid, hugRow, hugCol, bar, sect, hero, abs, archConvex, archConcave,
  heading, para, button, image, imageUrl, textLink, fontLoader, faIcon, normalizeFaValue, svgIcon, iconChip,
} from '../../src/kit/kit.mjs';
import { resetIds, styleOf, deskProps, customCssOf, classRefs, allNodes } from '../helpers.mjs';

beforeEach(() => resetIds());

/* ── id minting ── */
test('freshId: unique across 10k mints, resetIds restarts', () => {
  const ids = new Set(Array.from({ length: 10000 }, freshId));
  assert.equal(ids.size, 10000);
  resetIds();
  assert.equal(freshId(), 'u00000');
});

/* ── css() ── */
test('css: two calls on the same node MERGE (the gradient-then-anchor clobber bug)', () => {
  const n = col({ padding: P0 }, []);
  css(n, 'background:linear-gradient(#000,#fff);');
  css(n, 'position:absolute; inset:0;');
  const out = customCssOf(n);
  assert.ok(out.includes('linear-gradient'), 'first call survived');
  assert.ok(out.includes('inset:0'), 'second call appended');
});

test('css: breakpoint-scoped declarations go to their own variant', () => {
  const n = col({ padding: P0 }, []);
  css(n, 'display:none;', { breakpoint: 'mobile' });
  assert.equal(customCssOf(n, 'mobile'), 'display:none;');
  assert.equal(customCssOf(n, 'desktop'), '');
});

test('css: bootstraps a style on a styleless node and links it (R4)', () => {
  const n = { id: 'x9', elType: 'widget', widgetType: 'e-heading', settings: { classes: { $$type: 'classes', value: [] } }, styles: {}, elements: [] };
  css(n, 'color:red;');
  assert.equal(customCssOf(n), 'color:red;');
  assert.ok(classRefs(n).includes(Object.keys(n.styles)[0]));
});

/* ── hover() ── */
test('hover: pushes a desktop hover-state variant with the given props', () => {
  const n = col({ padding: P0 }, []);
  hover(n, { 'box-shadow': { $$type: 'box-shadow', value: [] } });
  const st = styleOf(n);
  const hv = st.variants.find((v) => v.meta.state === 'hover');
  assert.ok(hv, 'hover variant exists');
  assert.equal(hv.meta.breakpoint, 'desktop');
  assert.ok(hv.props['box-shadow']);
});

test('hover: bootstraps styleless nodes; hover trees pass assertTree', () => {
  const n = heading('h2', 'Hi');
  hover(n, { color: C('#f00') });
  assert.doesNotThrow(() => assertTree([n]));
});

/* ── clone() ── */
test('clone: fresh ids at EVERY depth, style ids re-embed, refs rewritten, original untouched', () => {
  const inner = col({ padding: P0, gap: SZ(4) }, [heading('h3', 'T'), para('D')]);
  const outer = col({ padding: P0 }, [inner]);
  const snap = JSON.stringify(outer);
  const c = clone(outer);
  assert.equal(JSON.stringify(outer), snap, 'original untouched');
  const oIds = allNodes([outer]).map((n) => n.id);
  const cIds = allNodes([c]).map((n) => n.id);
  assert.equal(cIds.length, oIds.length);
  for (const id of cIds) assert.ok(!oIds.includes(id), `cloned id ${id} is fresh`);
  for (const n of allNodes([c])) {
    for (const sid of Object.keys(n.styles || {})) {
      assert.ok(sid.includes(n.id), 'style id embeds the NEW element id');
      assert.ok(classRefs(n).includes(sid), 'ref follows');
    }
  }
  assert.doesNotThrow(() => assertTree([outer, c]));
});

/* ── primitives ── */
test('col/row/grid/sect: correct direction/display and padding:0 baked', () => {
  assert.deepEqual(deskProps(col({}, []))['flex-direction'], S('column'));
  resetIds();
  assert.deepEqual(deskProps(row({}, []))['flex-direction'], S('row'));
  resetIds();
  const g = grid('repeat(4, 1fr)', 16, {}, []);
  const gp = deskProps(g);
  assert.deepEqual(gp.display, S('grid'));
  assert.deepEqual(gp['grid-template-columns'], S('repeat(4, 1fr)'));
  assert.deepEqual(gp.gap, SZ(16));
  assert.deepEqual(gp.width, SZ(100, '%'));
  resetIds();
  const s = sect('footer', {}, []);
  assert.deepEqual(s.settings.tag, S('footer'));
  for (const n of [col({}, []), row({}, []), sect('header', {}, [])]) {
    assert.deepEqual(deskProps(n).padding, P0, 'padding baked');
  }
});

test('hugRow/hugCol/bar: hug widths and space-between bar', () => {
  assert.deepEqual(deskProps(hugRow({}, [])).width, HUG);
  assert.deepEqual(deskProps(hugCol({}, [])).width, HUG);
  const b = bar({}, []);
  const bp = deskProps(b);
  assert.deepEqual(bp['justify-content'], S('space-between'));
  assert.deepEqual(bp.width, SZ(100, '%'));
});

/* ── button / textLink / image ── */
test('button: throws without a real href (the dead-# guard)', () => {
  assert.throws(() => button('Go', '#'), /real href is required/);
  assert.throws(() => button('Go', ''), /real href is required/);
  const b = button('Go', '/contact/');
  assert.equal(b.widgetType, 'e-button');
  assert.deepEqual(b.settings.tag, S('a'));
  assert.equal(b.settings.link.value.destination.value, '/contact/');
});

test('textLink: resets the blue-pill defaults (transparent bg via rgba, not keyword)', () => {
  const t = textLink('About', '/about/');
  const p = deskProps(t);
  assert.equal(p.background.value.color.value, 'rgba(0,0,0,0)', 'rgba(0,0,0,0), never the unverified "transparent" keyword');
});

test('image: e-image with IMG_ID; heading/para produce html-v3 content', () => {
  assert.equal(image(9).settings.image.value.src.value.id.value, 9);
  assert.equal(heading('h4', 'X').settings.tag.value, 'h4');
  assert.equal(para('Y').settings.paragraph.value.content.value, 'Y');
});

test('IMG_URL/imageUrl: url-src envelope with inline alt; relative URL throws (live-probed rule)', () => {
  const env = IMG_URL('https://x.test/a.png', 'the alt');
  assert.equal(env.value.src.value.id, null);
  assert.deepEqual(env.value.src.value.url, { $$type: 'url', value: 'https://x.test/a.png' });
  assert.deepEqual(env.value.src.value.alt, S('the alt'));
  assert.equal(IMG_URL('http://x.test/b.png').value.src.value.alt, undefined, 'no alt key when empty');
  assert.throws(() => IMG_URL('/relative/x.png'), /ABSOLUTE http\(s\) URL/);
  const w = imageUrl('https://x.test/a.png', 'a', { width: SZ(64) });
  assert.equal(w.widgetType, 'e-image');
  assert.equal(w.settings.image.value.src.value.url.value, 'https://x.test/a.png');
});

test('fx: the base flex primitive — display:flex + padding:0 baked, col/row are wrappers over it', () => {
  const f = fx({ gap: SZ(4) }, []);
  const p = deskProps(f);
  assert.equal(f.elType, 'e-flexbox');
  assert.deepEqual(p.display, S('flex'));
  assert.deepEqual(p.padding, P0);
  assert.equal(p['flex-direction'], undefined, 'direction is the caller\'s (col/row add it)');
});

/* ── FA icons ── */
test('normalizeFaValue: bare / fa-prefixed / full forms + library styles (the str_replace(null) warning fix)', () => {
  assert.equal(normalizeFaValue('bolt'), 'fas fa-bolt');
  assert.equal(normalizeFaValue('fa-bolt'), 'fas fa-bolt');
  assert.equal(normalizeFaValue('fas fa-bolt'), 'fas fa-bolt');
  assert.equal(normalizeFaValue('linkedin', 'fa-brands'), 'fab fa-linkedin');
  assert.equal(normalizeFaValue('fa-clock', 'fa-regular'), 'far fa-clock');
  assert.equal(normalizeFaValue('far fa-clock', 'fa-brands'), 'far fa-clock', 'existing prefix wins');
});

test('faIcon: classic FLAT settings (no atomic envelopes) — the classic-in-v4 contract', () => {
  const i = faIcon('rocket', { color: '#111', size: 20 });
  assert.equal(i.widgetType, 'icon');
  assert.deepEqual(i.settings.selected_icon, { value: 'fas fa-rocket', library: 'fa-solid' });
  assert.equal(i.settings.primary_color, '#111');
  assert.deepEqual(i.settings.size, { unit: 'px', size: 20 });
  assert.equal(i.settings.selected_icon.value.$$type, undefined, 'flat, not enveloped');
});

test('svgIcon + iconChip: valid composition', () => {
  assert.equal(svgIcon(3).widgetType, 'e-svg');
  const chip = iconChip('bolt', { box: 44 });
  assert.equal(chip.elType, 'e-flexbox');
  assert.equal(allNodes([chip]).find((n) => n.widgetType === 'icon').settings.selected_icon.value, 'fas fa-bolt');
  assert.doesNotThrow(() => assertTree([chip]));
});

/* ── layout helpers ── */
test('abs: positional spread with only the given insets', () => {
  const p = abs({ top: 64, left: 713, width: 608 });
  assert.deepEqual(p.position, S('absolute'));
  assert.deepEqual(p['inset-block-start'], SZ(64));
  assert.deepEqual(p['inset-inline-start'], SZ(713));
  assert.deepEqual(p.width, SZ(608));
  assert.equal(p['inset-block-end'], undefined);
  assert.equal(p['inset-inline-end'], undefined);
});

test('hero: image-under, content-tint-above — NO empty absolute overlay (editor-safe), assertTree-clean', () => {
  const hr = hero(1583, 'rgba(0,0,0,0.45)', { gap: SZ(12) }, [heading('h1', 'Hero')]);
  assert.equal(hr.settings.tag.value, 'section');
  const img = hr.elements[0];
  assert.equal(img.widgetType, 'e-image');
  assert.deepEqual(deskProps(img).position, S('absolute'));
  const content = hr.elements[1];
  assert.deepEqual(deskProps(content).position, S('relative'));
  assert.equal(deskProps(content).background.value.color.value, 'rgba(0,0,0,0.45)', 'tint on the CONTENT container');
  assert.doesNotThrow(() => assertTree([hr]));
});

test('arch helpers: convex/concave emit a ::before band via custom_css', () => {
  const a = sect('section', { position: S('relative') }, []);
  archConvex(a, { color: '#fff', depth: 84 });
  assert.match(customCssOf(a), /overflow:visible.*::before.*top:-84px.*height:168px/s);
  resetIds();
  const b = sect('section', { position: S('relative') }, []);
  archConcave(b, { color: '#eee', depth: 50 });
  assert.match(customCssOf(b), /overflow:hidden.*top:-150px.*height:200px/s);
});

test('fontLoader: preconnect + css2 link, weights sorted, spaces encoded', () => {
  const f = fontLoader('Sora Display', [700, 400]);
  assert.equal(f.widgetType, 'html');
  assert.match(f.settings.html, /family=Sora\+Display:wght@400;700&display=swap/);
  assert.match(f.settings.html, /preconnect.*fonts\.gstatic\.com/);
});

test('css(): chunk without trailing semicolon gets one (last-declaration-drop guard)', () => {
  const n = sect('section', {}, []);
  css(n, 'position:relative;overflow:hidden;background:#000');
  assert.match(customCssOf(n), /background:#000;$/, 'terminator appended');
  css(n, '& em { color: red; }');
  assert.match(customCssOf(n), /\}$/, 'brace-terminated chunk left alone');
  css(n, 'color:blue');
  assert.match(customCssOf(n), /color:blue;$/, 'merged chunk also terminated');
});
