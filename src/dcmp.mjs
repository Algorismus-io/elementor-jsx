/**
 * dcmp.mjs — components the decompiler emits that the base intrinsics don't cover:
 *   <Button text href .../>  → an atomic e-button (the widget Elementor uses for buttons/nav links)
 *   <Raw>{node}</Raw>        → verbatim kit-node passthrough (for widget types with no JSX mapping)
 * Both return plain kit nodes, so render() passes them straight through.
 */
import { button } from '../../.claude/skills/elementor-ultra/lib/kit.mjs';
import { sx } from '../../.claude/skills/elementor-ultra/lib/kit-components.mjs';

/** e-button. Tolerant href (kit's button() throws on '#'/empty; decompiled links may be bare). */
export const Button = ({ text = '', href, cls, gcls, ...style } = {}) => {
  const n = button(text, href && href !== '#' ? href : '/', sx(style));
  const ids = [gcls, cls].filter(Boolean).join(' ').trim().split(/\s+/).filter(Boolean);
  if (ids.length) {
    const cur = n.settings.classes?.value || [];
    n.settings.classes = { $$type: 'classes', value: [...ids, ...cur.filter((c) => !ids.includes(c))] };
  }
  return n;
};

/** verbatim passthrough — child is an already-built kit node (or its JSON). */
export const Raw = ({ children } = {}) => {
  const c = Array.isArray(children) ? children[0] : children;
  return typeof c === 'string' ? JSON.parse(c) : c;
};
