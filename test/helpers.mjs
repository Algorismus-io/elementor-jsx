/**
 * helpers.mjs — shared assertions/finders for the parity-engine test suite.
 * Everything here is offline; integration helpers live in integration/harness.mjs.
 */
import { resetIds } from '../../.claude/skills/elementor-ultra/lib/kit.mjs';

/** Reset the kit id registry between tests so builds are deterministic and isolated. */
export { resetIds };

/** Depth-first flatten of a kit tree (array of nodes) into a flat node list. */
export function allNodes(elements) {
  const out = [];
  (function walk(ns) { for (const n of ns || []) { out.push(n); walk(n.elements); } })(elements);
  return out;
}

/** First node matching a predicate, or throw. */
export function findNode(elements, pred, what = 'node') {
  const hit = allNodes(elements).find(pred);
  if (!hit) throw new Error(`findNode: no ${what} matched`);
  return hit;
}

export const byWidget = (t) => (n) => n.widgetType === t;

/** The single local style record of a node (most kit nodes have exactly one). */
export function styleOf(n) {
  const sids = Object.keys(n.styles || {});
  if (sids.length !== 1) throw new Error(`styleOf: expected exactly 1 style, got ${sids.length}`);
  return n.styles[sids[0]];
}

/** Desktop base-variant props of a node's local style ({} if styleless). */
export function deskProps(n) {
  const sid = Object.keys(n.styles || {})[0];
  if (!sid) return {};
  const v = (n.styles[sid].variants || []).find((x) => x.meta?.breakpoint === 'desktop' && !x.meta?.state);
  return v?.props || {};
}

/** Variant props for a given breakpoint/state. */
export function variantProps(n, breakpoint, state = null) {
  const sid = Object.keys(n.styles || {})[0];
  const v = (n.styles?.[sid]?.variants || []).find((x) => x.meta?.breakpoint === breakpoint && (x.meta?.state ?? null) === state);
  return v?.props;
}

/** Decode a variant's base64 custom_css to plain text ('' if none). */
export function customCssOf(n, breakpoint = 'desktop') {
  const sid = Object.keys(n.styles || {})[0];
  const v = (n.styles?.[sid]?.variants || []).find((x) => x.meta?.breakpoint === breakpoint);
  const b64 = v?.custom_css?.raw;
  return b64 ? Buffer.from(b64, 'base64').toString('utf8') : '';
}

/** The plain text of a heading/paragraph widget (html-v3 envelope). */
export function textOf(n) {
  return n.settings?.title?.value?.content?.value ?? n.settings?.paragraph?.value?.content?.value ?? null;
}

/** Class refs on a node. */
export const classRefs = (n) => n.settings?.classes?.value ?? [];

/** Assert helper: every id in a tree is unique (elements AND style ids). */
export function collectIds(elements) {
  const el = [], st = [];
  for (const n of allNodes(elements)) { el.push(n.id); st.push(...Object.keys(n.styles || {})); }
  return { el, st };
}
