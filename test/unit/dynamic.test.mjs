/**
 * Dynamic tags — CMS-driven content. Placement rules are LIVE-PROBED facts (4.1.4 + Pro 4.1.0):
 * text props take the {$$type:'dynamic'} envelope DIRECTLY; image nests it at image.value.src;
 * link nests it at link.value.destination — any other placement 422s. Free core registers ZERO
 * tags (all Pro). The `single` theme part maps to Pro's single-post document.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DYN, dyn, isDyn, IMG_DYN, heading, para, button, image, LINK, S,
  loopGrid, assertTree,
} from '../../src/kit/kit.mjs';
import { h, render } from '../../src/runtime.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { resetIds, textOf } from '../helpers.mjs';

beforeEach(() => resetIds());

test('DYN: envelope shape {name, group, settings}', () => {
  assert.deepEqual(DYN('post-title', 'post'), { $$type: 'dynamic', value: { name: 'post-title', group: 'post', settings: {} } });
  assert.deepEqual(DYN('post-date', 'post', { format: 'Y' }).value.settings, { format: 'Y' });
  assert.ok(isDyn(DYN('x', 'y')));
  assert.ok(!isDyn({ $$type: 'string', value: 'x' }));
});

test('dyn catalog: names + groups match the live registry enumeration', () => {
  const expect = {
    postTitle: ['post-title', 'post'], postExcerpt: ['post-excerpt', 'post'], postDate: ['post-date', 'post'],
    postUrl: ['post-url', 'post'], featuredImage: ['post-featured-image', 'post'], postTerms: ['post-terms', 'post'],
    pageTitle: ['page-title', 'site'], siteTitle: ['site-title', 'site'], siteTagline: ['site-tagline', 'site'],
    siteUrl: ['site-url', 'site'], siteLogo: ['site-logo', 'site'], authorName: ['author-name', 'author'],
    archiveTitle: ['archive-title', 'archive'],
  };
  for (const [k, [name, group]] of Object.entries(expect)) {
    const env = dyn[k]();
    assert.equal(env.value.name, name, k);
    assert.equal(env.value.group, group, `${k} group`);
  }
});

/* placement rules — the verified matrix */
test('placement: TEXT props take the envelope DIRECTLY (heading/para/button text)', () => {
  const hn = heading('h1', dyn.postTitle());
  assert.deepEqual(hn.settings.title, dyn.postTitle(), 'heading title = raw dynamic envelope');
  const pn = para(dyn.postExcerpt());
  assert.deepEqual(pn.settings.paragraph, dyn.postExcerpt());
  const bn = button(dyn.postTitle(), '/x/');
  assert.deepEqual(bn.settings.text, dyn.postTitle());
  // plain text still wraps html-v3
  assert.equal(heading('h2', 'Plain').settings.title.$$type, 'html-v3');
});

test('placement: IMAGE nests at image.value.src (IMG_DYN); image() routes dynamic sources', () => {
  assert.deepEqual(IMG_DYN(dyn.featuredImage(), 'large'), {
    $$type: 'image', value: { src: dyn.featuredImage(), size: S('large') },
  });
  const im = image(dyn.featuredImage());
  assert.equal(im.settings.image.$$type, 'image', 'top-level stays an image envelope (raw dynamic 422s)');
  assert.deepEqual(im.settings.image.value.src, dyn.featuredImage());
  assert.equal(image(42).settings.image.value.src.value.id.value, 42, 'attachment path unchanged');
});

test('placement: LINK nests at link.value.destination', () => {
  const l = LINK(dyn.postUrl());
  assert.equal(l.$$type, 'link');
  assert.deepEqual(l.value.destination, dyn.postUrl(), 'dynamic destination');
  assert.equal(LINK('/x/').value.destination.$$type, 'url', 'plain path unchanged');
  const bn = button('Read', dyn.postUrl());
  assert.deepEqual(bn.settings.link.value.destination, dyn.postUrl());
});

/* runtime intrinsics */
test('runtime: <h1 dyn={…}> and <text dyn={…}> bind content; children ignored', () => {
  const hn = render(h('h1', { dyn: dyn.postTitle(), size: 40 }, 'ignored'));
  assert.deepEqual(hn.settings.title, dyn.postTitle());
  const pn = render(h('text', { dyn: dyn.postDate() }));
  assert.deepEqual(pn.settings.paragraph, dyn.postDate());
});

test('runtime: <img src={dyn.featuredImage()}> and href={dyn.postUrl()}', () => {
  const im = render(h('img', { src: dyn.featuredImage(), w: '100%' }));
  assert.deepEqual(im.settings.image.value.src, dyn.featuredImage());
  const t = render(h('text', { href: dyn.postUrl() }, 'Read more'));
  assert.deepEqual(t.settings.link.value.destination, dyn.postUrl());
});

/* single theme part */
test('parts.single compiles to the single-post document with singular conditions', () => {
  const site = defineSite({
    name: 'cms',
    pages: [{ title: 'p', slug: 'p', node: h('text', {}, 'x') }],
    parts: { single: { node: h('box', { tag: 'article', pad: [40, 24] }, h('h1', { dyn: dyn.postTitle() })) } },
  });
  const b = compileSite(site);
  assert.equal(b.parts.length, 1);
  assert.equal(b.parts[0].type, 'single-post');
  assert.deepEqual(b.parts[0].conditions, ['include/singular/post']);
  assert.equal(b.parts[0].title, 'cms single');
});

/* collection loop */
test('loopGrid: canonical 3-level structure — loop{source,per_page} > layout > item(template) > children', () => {
  const g = loopGrid({ source: 'post', perPage: 4, layout: { display: S('grid'), 'grid-template-columns': S('repeat(3, 1fr)') } }, [
    heading('h3', dyn.postTitle()),
    para(dyn.postExcerpt()),
  ]);
  assert.equal(g.elType, 'e-collection-loop');
  assert.deepEqual(g.settings.source, S('post'));
  assert.equal(g.settings.posts_per_page.value, 4);
  const layout = g.elements[0];
  assert.equal(layout.elType, 'e-collection-loop-layout');
  const st = Object.values(layout.styles)[0];
  assert.equal(st.variants[0].props['grid-template-columns'].value, 'repeat(3, 1fr)', 'grid props go on the LAYOUT');
  const item = layout.elements[0];
  assert.equal(item.elType, 'e-collection-loop-item');
  assert.equal(item.elements.length, 2, 'item is the repeating template');
  assert.deepEqual(item.elements[0].settings.title, dyn.postTitle());
  assert.doesNotThrow(() => assertTree([g]));
});

test('loopGrid: source enum guarded at build', () => {
  assert.throws(() => loopGrid({ source: 'product' }), /enum is post\|page/);
});

test('dynamic content styles like any text (sx props coexist with dyn binding)', () => {
  const hn = render(h('h1', { dyn: dyn.postTitle(), size: 44, weight: 800, color: '#111111' }));
  const sid = Object.keys(hn.styles)[0];
  assert.equal(hn.styles[sid].variants[0].props['font-size'].value.size, 44);
  assert.deepEqual(hn.settings.title, dyn.postTitle());
});
