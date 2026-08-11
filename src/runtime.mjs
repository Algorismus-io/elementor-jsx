/**
 * runtime.mjs — the render engine. JSX (via esbuild, jsxFactory:'h') compiles to h() calls;
 * render() walks the vnode tree and emits kit atomic nodes. Theme flows through a render context
 * (useTheme()), so components read tokens without prop-drilling — the React model, no per-call theming.
 *
 * Two kinds of `type`:
 *   - function  → a Component: called as (props, ctx) → returns more vnodes (or a kit node).
 *   - string    → an intrinsic: 'box'|'row'|'col'|'section'|'grid'|'h1..h3'|'text'|'html'|'img' → kit builder.
 * A returned kit node (has .elType) passes straight through — the escape hatch to raw kit.
 */
import { box, sx, styled, splitStates, applyStates, h2 as kh2, h3 as kh3, txt as ktxt } from './kit/kit-components.mjs';
import { heading, para, image, imageUrl, node, nativeGrid, LINK, interact, ATTRS } from './kit/kit.mjs';
import { mergeTw } from './tw.mjs';

/* Symbol.for, not Symbol: a relative-import entry gets its OWN bundled runtime copy (the cli's
 * packages:'external' only externalizes bare imports), so <>…</> made by that copy must still
 * match this module's Fragment when compile.mjs renders — the global registry keeps identity. */
export const Fragment = Symbol.for('exjsx.Fragment');

/** React.createElement-style factory. children are flattened; null/false/'' dropped. */
export function h(type, props, ...children) {
  return { $$v: true, type, props: props || {}, children: children.flat(Infinity).filter((c) => c != null && c !== false && c !== '') };
}

/* ── render context (theme + breakpoint) — a simple synchronous stack ── */
/* CTX lives on globalThis under a registered symbol for the same reason Fragment does: the
 * build BUNDLES a second copy of this module into the entry (pages call the bundled useTheme),
 * while compileSite renders with the disk copy (which seeds its own CTX). Module-level state
 * split across the two copies made useTheme() null inside every fs-project page — found the
 * day useTheme was first actually used from a project. */
const CTX_KEY = Symbol.for('exjsx.CTX');
if (!globalThis[CTX_KEY]) globalThis[CTX_KEY] = { theme: null, bp: 'desktop' };
const getCTX = () => globalThis[CTX_KEY];
const setCTX = (v) => { globalThis[CTX_KEY] = v; };
export const useTheme = () => getCTX().theme;
export const useCtx = () => getCTX();

const isKitNode = (x) => x && typeof x === 'object' && typeof x.elType === 'string';
/* Inline vnodes inside text intrinsics serialize to the html-v3 whitelisted tags (the <em> accent
 * recipe: `<h1 raw="& em {…}">Ship <em>insight</em></h1>`). Anything else THROWS — it used to be
 * silently dropped, which ate the word from the headline (found by the nebula showcase build). */
const INLINE_TAGS = new Set(['em', 'strong', 'br']);
const textOf = (children) => children.map((c) => {
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (c?.$$v && INLINE_TAGS.has(c.type)) return c.type === 'br' ? '<br>' : `<${c.type}>${textOf(c.children)}</${c.type}>`;
  if (c?.$$v) {
    const name = typeof c.type === 'function' ? c.type.name || 'Component' : c.type;
    throw new Error(`exjsx: <${name}> inside a text intrinsic — only <em>/<strong>/<br> nest in heading/text (html-v3 whitelist); put other content in a sibling element`);
  }
  return '';
}).join('');

/** Render a vnode (or array/primitive/kit-node) into kit atomic node(s). */
export function render(vnode) {
  if (vnode == null || vnode === false || vnode === '') return null;
  if (Array.isArray(vnode)) return vnode.flatMap((v) => render(v)).filter(Boolean);
  if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode);
  if (isKitNode(vnode)) { renderEmbedded(vnode); return vnode; }  // raw kit node passthrough
  if (!vnode.$$v) return vnode;
  const { type, props, children } = vnode;

  if (type === Fragment) return render(children);

  if (typeof type === 'function') {                 // Component
    const prev = getCTX();
    if (props.theme) setCTX({ ...prev, theme: props.theme });
    const out = type({ ...props, children }, getCTX());
    const built = render(out);
    setCTX(prev);
    return built;
  }
  return intrinsic(type, props, children);          // 'box' | 'heading' | ...
}

/** RENDER JSX vnodes embedded ANYWHERE in a kit subtree — authors naturally mix
 * section({children:[<row/>]}) / kit helpers with JSX children; a leaked {$$v} vnode
 * 422s at the PHP validator with a cryptic R1. Recursive, in place. */
function renderEmbedded(k) {
  if (!k.elements?.length) return;
  if (k.elements.some((c) => c?.$$v)) {
    k.elements = k.elements.flatMap((c) => {
      const r = render(c);
      return r == null ? [] : (Array.isArray(r) ? r : [r]).filter(isKitNode);
    });
  }
  for (const c of k.elements) if (isKitNode(c)) renderEmbedded(c);
}

/** stamp a semantic class-label hint on a node's local style so the dedup pass names the shared class
 * (`card`/`section`) instead of a content hash. Same cls + different styles → auto-suffixed (card-2). */
const markCls = (n, cls) => { const sid = Object.keys(n.styles || {})[0]; if (sid && cls) n.styles[sid].__cls = cls; return n; };

/** Prepend EXTERNAL global-class refs (e.g. `g-kxhero`) to a node's class list — the round-trip
 * escape hatch so decompiled trees re-reference the kit's shared classes (which the deploy carries)
 * in addition to their own local style. Global classes go first (match Elementor's authored order). */
const addGcls = (n, gcls) => {
  if (!gcls) return n;
  const ids = [...new Set(String(gcls).trim().split(/\s+/))];
  const cur = n.settings.classes?.value || [];
  n.settings.classes = { $$type: 'classes', value: [...ids, ...cur.filter((c) => !ids.includes(c))] };
  return n;
};

/** Intrinsic element types → kit builders. Props are the `sx` shorthand + a few specials. */
function intrinsic(type, props, children) {
  const kids = () => render(children) || [];
  // tw="px-6 flex …" (Tailwind subset) expands to sx shorthand first; explicit props win.
  // State objects (hover/active/focus/focus-visible/checked — sx vocabulary + raw) split out
  // BEFORE sx sees the props; applied as NATIVE state variants (+ per-state custom_css) below.
  const { rest: p2, states } = splitStates(mergeTw(props));
  const { tag, dir, raw, href, id, alt, cls, gcls, dyn: dynTag, motion, animate, attrs, ...style } = p2;
  // motion={{effect,trigger,…}} (or an array ≤5) → native interactions on the built node via
  // interact()/interaction() — the JSX layer is a thin adapter, kit stays canonical. `animate`
  // is the pre-1.8 spelling, kept as an alias; both at once is ambiguous → loud.
  if (motion !== undefined && animate !== undefined) throw new Error(`exjsx: <${type}> has both motion and animate — they are the same prop (motion is canonical); pass one`);
  const fx = motion ?? animate;
  // attrs={{'data-x':'y'}} → the settings.attributes envelope (STORED & editor-validated on
  // Elementor 4.2.1; DOM emission depends on Elementor enabling its transformer — verified
  // per-version by the certification suite).
  const withFx = (n) => {
    if (attrs && Object.keys(attrs).length) n.settings.attributes = ATTRS(attrs);
    applyStates(n, states);
    return fx ? interact(n, fx) : n;
  };
  switch (type) {
    case 'box': case 'div': case 'col': case 'row': case 'section': {
      const b = box({ ...style, raw, dir: type === 'row' ? 'row' : dir, tag: type === 'section' ? 'section' : tag }, kids());
      if (id) b.settings._cssid = { $$type: 'string', value: id };
      if (href) b.settings.link = LINK(href);   // container-level link (cross-page nav chips, clickable cards)
      return withFx(addGcls(markCls(b, cls), gcls));
    }
    case 'grid': {
      // NATIVE e-grid container (Elementor ≥ 4.2). cols/rows: number = equal fr tracks
      // (repeat(N,1fr)), string = custom track list. gapX/gapY (or gap-x-*/gap-y-* via tw)
      // compile to the two-axis layout-direction gap. sx-computed envelopes (pad/gap/tw
      // gridCols…) override the nativeGrid defaults per prop key.
      const { cols, rows, ...styleRest } = style;
      const g = nativeGrid({ cols, rows, tag, props: sx(styleRest) }, kids());
      if (id) g.settings._cssid = { $$type: 'string', value: id };
      if (href) g.settings.link = LINK(href);
      if (raw) styled(g, { raw });
      return withFx(addGcls(markCls(g, cls), gcls));
    }
    case 'h1': case 'h2': case 'h3': case 'h4': case 'heading': {
      // dyn={dyn.postTitle()} binds the content to a dynamic tag (children ignored)
      const hn = heading(type === 'heading' ? tag || 'h2' : type, dynTag ?? textOf(children), sx(style));
      if (id) hn.settings._cssid = { $$type: 'string', value: id };
      if (href) hn.settings.link = LINK(href);
      if (raw) styled(hn, { raw });              // raw CSS applies to text nodes too (uppercase, nowrap, accent spans…)
      return withFx(addGcls(markCls(hn, cls), gcls));
    }
    case 'text': case 'p': {
      const pn = para(dynTag ?? textOf(children), sx(style));
      if (id) pn.settings._cssid = { $$type: 'string', value: id };
      if (href) pn.settings.link = LINK(href);   // atomic paragraph renders a real anchor
      if (raw) styled(pn, { raw });
      return withFx(addGcls(markCls(pn, cls), gcls));
    }
    case 'html':
      // classic html widget: no atomic settings/styles — attributes/state variants can't land here
      if (fx) throw new Error('exjsx: motion on <html> — interactions render only on atomic elements (the classic html widget gets no data-interaction-id); wrap it in a <box motion={…}> instead');
      if (attrs && Object.keys(attrs).length) throw new Error('exjsx: attrs on <html> — the classic html widget has no attributes setting; write the attributes into the raw markup itself');
      if (Object.keys(states).length) throw new Error(`exjsx: ${Object.keys(states)[0]} state on <html> — the classic html widget carries no atomic styles; put a <style> block in the raw markup instead`);
      return { id: node('e-div-block').id, elType: 'widget', widgetType: 'html', settings: { html: raw ?? textOf(children) }, styles: {}, elements: [] };
    case 'img': {
      // URL src → inline alt works (transformer reads src.alt). Attachment-id src → alt comes
      // from the attachment's alt_text ONLY (Elementor 4.1.4) — an alt prop there would be
      // silently dropped, so fail loudly with the working recipe instead.
      if (props.alt && typeof props.src !== 'string') {
        throw new Error('exjsx: <img src={id} alt="…"> — Elementor takes alt for attachment images from the attachment\'s alt_text (set `alt:` in the media manifest), or pass a URL src to use inline alt');
      }
      const im = typeof props.src === 'string' ? imageUrl(props.src, alt || '', sx(style)) : image(props.src, sx(style));
      if (id) im.settings._cssid = { $$type: 'string', value: id };
      if (raw) styled(im, { raw });
      return withFx(addGcls(markCls(im, cls), gcls));
    }
    default:
      throw new Error(
        `exjsx: unknown intrinsic <${type}> — valid: box|div|row|col|section|grid (containers), ` +
          `h1|h2|h3|h4|heading, text|p, img, html. No <button>/<a>: use <text href="…"> ` +
          `(renders a real anchor) or the kit button() helper; no <span>: use raw CSS accents.`,
      );
  }
}

/** Render a full page vnode to a flat top-level elements array (kit trees). */
export function renderPage(vnode) {
  const out = render(vnode);
  return (Array.isArray(out) ? out : [out]).filter(isKitNode);
}
