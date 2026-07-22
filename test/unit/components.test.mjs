/**
 * kit-components.mjs component library — every shipped component must (a) build the structure
 * it promises, (b) carry its content, (c) pass assertTree standalone, and (d) compile through
 * the full site pipeline (dedup) without loss. This is the surface real page authors touch.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  box, styled, bindClass, h2, h3, txt, eyebrow, accentHeading,
  sectionHeader, section, card, bento, cardGrid, stat, step, chip, logoStrip, testimonial,
  footer, ctaBand, navBar, browserMock, barChart, lineChart, donut, chatMock, CInc,
} from '../../../.claude/skills/elementor-ultra/lib/kit-components.mjs';
import { assertTree } from '../../../.claude/skills/elementor-ultra/lib/kit.mjs';
import { compileSite } from '../../src/compile.mjs';
import { defineSite } from '../../src/site.mjs';
import { resetIds, allNodes, deskProps, customCssOf, textOf, classRefs } from '../helpers.mjs';

beforeEach(() => resetIds());

const texts = (tree) => allNodes([tree].flat()).map((n) => textOf(n)).filter(Boolean);

/* ── box / styled / bindClass ── */
test('box: dir row + raw css in one call', () => {
  const b = box({ dir: 'row', gap: 8, pad: 0, raw: 'isolation:isolate;' }, [txt('a')]);
  assert.deepEqual(deskProps(b)['flex-direction'].value, 'row');
  assert.equal(customCssOf(b), 'isolation:isolate;');
});

test('styled: post-hoc sx + raw merge onto an existing node', () => {
  const n = h2('T', { size: 20 });
  styled(n, { color: '#123456', raw: 'text-wrap:balance;' });
  assert.equal(deskProps(n).color.value, '#123456');
  assert.equal(deskProps(n)['font-size'].value.size, 20, 'existing props kept');
  assert.equal(customCssOf(n), 'text-wrap:balance;');
});

test('styled: BOOTSTRAPS a style on a styleless node (the silent-drop bug that unstyled ctaBand buttons)', () => {
  const n = h2('T'); // no style holder
  styled(n, { color: '#B31E2C', weight: 700 });
  assert.equal(deskProps(n).color.value, '#B31E2C');
  assert.equal(deskProps(n)['font-weight'].value, '700');
  assert.ok(classRefs(n).length === 1, 'bootstrap style linked (R4)');
});

test('styled: responsive keys go to their OWN variants, never into desktop props', () => {
  const n = h2('T');
  styled(n, { size: 40, mobile: { size: 24 }, tablet: { size: 32 } });
  const st = Object.values(n.styles)[0];
  const byBp = Object.fromEntries(st.variants.map((v) => [v.meta.breakpoint, v.props]));
  assert.equal(byBp.desktop['font-size'].value.size, 40);
  assert.equal(byBp.tablet['font-size'].value.size, 32);
  assert.equal(byBp.mobile['font-size'].value.size, 24);
  assert.equal(byBp.desktop._m, undefined, 'no _m leaked into desktop props');
});

test('bindClass: attaches g- refs FIRST, auto-prefixes bare names, preserves locals', () => {
  const n = h2('T', { size: 20 });
  const local = classRefs(n)[0];
  bindClass(n, 'fm-card', 'g-explicit');
  assert.deepEqual(classRefs(n), ['g-fm-card', 'g-explicit', local]);
});

test('CInc: the re-export bag aliases the kit constructors exactly', async () => {
  const kit = await import('../../../.claude/skills/elementor-ultra/lib/kit.mjs');
  for (const k of ['S', 'C', 'N', 'B', 'SZ', 'DIM', 'M', 'RAD', 'BG', 'GRAD', 'SHADOW', 'HTML', 'LINK']) {
    assert.equal(CInc[k], kit[k], `CInc.${k} === kit.${k}`);
  }
});

/* ── text sugar ── */
test('eyebrow: bold small tracked label; accentHeading: nested-css accent (free-Elementor safe)', () => {
  const e = eyebrow('SERVICES');
  const p = deskProps(e);
  assert.equal(p['font-weight'].value, '700');
  assert.equal(p['letter-spacing'].value.size, 0.12);
  const a = accentHeading('h2', 'Grow <em>faster</em>', '#F43F5E');
  assert.match(customCssOf(a), /& span, & em \{ color:#F43F5E/);
  assert.equal(a.settings.tag.value, 'h2');
});

/* ── sections ── */
test('sectionHeader: eyebrow+title+body composition, center alignment variant', () => {
  const s = sectionHeader({ eyebrow: 'WHY', title: 'Why us', body: 'Because.', align: 'center' });
  assert.deepEqual(texts(s).sort(), ['Because.', 'WHY', 'Why us'].sort());
  const title = allNodes([s]).find((n) => n.widgetType === 'e-heading');
  assert.equal(deskProps(title)['text-align'].value, 'center');
  assert.doesNotThrow(() => assertTree([s]));
});

test('section: full-bleed shell + centered maxw wrap + header + _cssid anchor', () => {
  const s = section({ id: 'pricing', bg: '#F6F7F9', maxw: 1100, header: { title: 'Plans' }, children: [txt('body')] });
  assert.equal(s.settings.tag.value, 'section');
  assert.equal(s.settings._cssid.value, 'pricing');
  const wrap = s.elements[0];
  assert.equal(deskProps(wrap)['max-width'].value.size, 1100);
  assert.ok(texts(s).includes('Plans'));
  assert.doesNotThrow(() => assertTree([s]));
});

/* ── cards & grids ── */
test('card: icon chip + title + desc + link + span, assertTree-clean', () => {
  const c = card({ icon: 'bolt', title: 'Fast', desc: 'Very fast.', href: '/x/', span: 6, tint: '#FDECEC' });
  assert.ok(texts(c).includes('Fast') && texts(c).includes('Very fast.'));
  assert.equal(c.settings.link.value.destination.value, '/x/');
  assert.equal(deskProps(c)['grid-column'].value, 6);
  assert.equal(deskProps(c).background.value.color.value, '#FDECEC');
  assert.ok(allNodes([c]).some((n) => n.widgetType === 'icon'), 'icon chip present');
  assert.doesNotThrow(() => assertTree([c]));
});

test('bento: 12-col grid + mobile full-span fallback via custom_css', () => {
  const g = bento([card({ title: 'A', span: 8 }), card({ title: 'B', span: 4 })]);
  assert.equal(deskProps(g)['grid-template-columns'].value, 'repeat(12, 1fr)');
  assert.match(customCssOf(g), /@media\(max-width:767px\).*grid-column:span 12/s);
  assert.doesNotThrow(() => assertTree([g]));
});

test('cardGrid: auto-fit minmax without span math', () => {
  const g = cardGrid([card({ title: 'A' }), card({ title: 'B' })], { min: 260, gap: 24 });
  assert.equal(deskProps(g)['grid-template-columns'].value, 'repeat(auto-fit, minmax(260px, 1fr))');
  assert.equal(deskProps(g).gap.value.size, 24);
});

/* ── small pieces ── */
test('stat/step/chip/logoStrip/testimonial: content + structure + validity', () => {
  const pieces = [
    stat({ value: '97%', label: 'uptime', icon: 'bolt' }),
    step({ n: 2, title: 'Design', desc: 'We design.' }),
    chip('Live'),
    logoStrip(['Acme', 'Globex'], { caption: 'TRUSTED BY' }),
    testimonial({ quote: 'Great.', name: 'Ada', role: 'CTO' }),
  ];
  const all = texts(box({ pad: 0 }, pieces));
  for (const t of ['97%', 'uptime', '2', 'Design', 'We design.', 'Live', 'Acme', 'Globex', 'TRUSTED BY', 'Ada', 'CTO']) {
    assert.ok(all.some((x) => x.includes(t)), `text "${t}" present`);
  }
  resetIds();
  assert.doesNotThrow(() => assertTree([box({ pad: 0 }, [
    stat({ value: '1', label: 'l' }), step({ n: 1, title: 't', desc: 'd' }), chip('c'),
    logoStrip(['x']), testimonial({ quote: 'q', name: 'n', role: 'r' }),
  ])]));
});

/* ── bands ── */
test('footer: brand + blurb + link columns with real hrefs (slugified fallback)', () => {
  const f = footer({ brand: 'Acme', blurb: 'We do things.', cols: [{ title: 'Company', links: ['About Us', { text: 'Careers', href: '/jobs/' }] }] });
  const buttons = allNodes([f]).filter((n) => n.widgetType === 'e-button');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].settings.link.value.destination.value, '/about-us/'.replace(/\/$/, '') + '', 'slugified href');
  assert.equal(buttons[1].settings.link.value.destination.value, '/jobs/');
  assert.doesNotThrow(() => assertTree([f]));
});

test('ctaBand: gradient bg + centered content + primary/ghost button styling', () => {
  const b = ctaBand({ eyebrow: 'READY?', title: 'Start now', body: 'Go.', buttons: [{ text: 'Start', href: '/start/' }, { text: 'Talk', href: '/contact/' }] });
  assert.ok(deskProps(b).background.value['background-overlay'], 'gradient band');
  const btns = allNodes([b]).filter((n) => n.widgetType === 'e-button');
  assert.equal(btns.length, 2);
  const [primary, ghost] = btns.map((x) => deskProps(x));
  assert.notDeepEqual(primary.background, ghost.background, 'primary vs ghost differ');
  assert.doesNotThrow(() => assertTree([b]));
});

/* ── navBar + decorative mocks (self-contained html widgets) ── */
test('navBar: one self-contained html widget — links, mega menu, ctas, burger, mobile pane, scoped CSS', () => {
  const n = navBar({
    logo: 'Acme', accent: '#85C441', ink: '#093D57',
    links: [{ text: 'Services', href: '/services/', menu: [{ title: 'Consulting', desc: 'Advice', href: '/services/#c' }] }, { text: 'About', href: '/about/' }],
    ctas: [{ text: 'Sign in', href: '/login/' }, { text: 'Get started', href: '/start/' }],
  });
  assert.equal(n.widgetType, 'html');
  const html = n.settings.html;
  for (const bit of ['kn-mega', 'Consulting', 'kn-burger', 'kn-mobile', 'href="/services/"', 'href="/login/"', 'Get started', '<style>', '@media(max-width:900px)']) {
    assert.ok(html.includes(bit), `navBar html contains ${bit}`);
  }
  assert.ok(html.includes('#85C441') && html.includes('#093D57'), 'brand colors woven into the css');
});

test('decorative mocks: browserMock/barChart/lineChart/donut/chatMock emit valid html widgets', () => {
  const mocks = [browserMock('acme.co'), barChart([10, 50, 100], { label: 'Growth' }), lineChart([10, 90]), donut(42, { label: 'CTR' }), chatMock()];
  for (const m of mocks) { assert.equal(m.widgetType, 'html'); assert.ok(m.settings.html.length > 50); }
  assert.match(mocks[0].settings.html, /acme\.co/);
  assert.match(mocks[1].settings.html, /Growth/);
  assert.match(mocks[2].settings.html, /<svg viewBox/);
  assert.match(mocks[3].settings.html, /stroke-dasharray="42 100"/);
});

/* ── the whole library through the REAL pipeline ── */
test('component library kitchen-sink compiles + dedups through compileSite', () => {
  const pageNode = [
    navBar({ logo: 'K', links: [{ text: 'Home', href: '/' }], ctas: [] }),
    section({ header: { eyebrow: 'ALL', title: 'Everything' }, children: [
      cardGrid([card({ icon: 'bolt', title: 'A', desc: 'a' }), card({ icon: 'gear', title: 'B', desc: 'b' })]),
      bento([stat({ value: '9', label: 'n', span: 6 }), step({ n: 1, title: 'S', desc: 'd', span: 6 })].map((x, i) => Object.assign(x, {}))),
      logoStrip(['X', 'Y'], { caption: 'WITH' }),
      testimonial({ quote: 'q', name: 'n', role: 'r' }),
      lineChart([5, 95]),
    ] }),
    ctaBand({ title: 'Go', buttons: [{ text: 'Now', href: '/n/' }] }),
    footer({ brand: 'K', blurb: 'b', cols: [{ title: 'C', links: ['Docs'] }] }),
  ];
  const bundle = compileSite(defineSite({ name: 'lib', pages: [{ title: 'k', slug: 'k', node: pageNode }] }));
  assert.ok(bundle.stats.localStylesBefore > bundle.stats.sharedClasses, 'dedup engaged on library output');
  assert.ok(bundle.classes.order.length > 5, 'library produced a real class registry');
  // identical cards → shared class
  const flatNodes = allNodes(bundle.pages[0].elements);
  const cardRefs = flatNodes.filter((n) => n.elType === 'e-flexbox' && (n.settings.classes?.value || []).length)
    .map((n) => n.settings.classes.value.join())
    .filter((v, i, a) => a.indexOf(v) !== i);
  assert.ok(cardRefs.length > 0, 'at least one class is shared between structurally-equal nodes');
});
