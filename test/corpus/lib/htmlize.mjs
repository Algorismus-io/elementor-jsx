/**
 * htmlize.mjs — corpus file (.html | .tsx) → the component's plain HTML markup.
 *
 * .html files: the <body> inner markup is extracted verbatim.
 * .tsx files: imports are stripped (their identifiers resolve to stubs.mjs), TS/JSX is
 * transformed by esbuild (the same transformer the exjsx pipeline uses), the module is
 * evaluated with a tiny h() that builds vnodes, and the default export renders to HTML.
 *
 * The output is what BOTH sides consume: the reference render (real Tailwind on the markup)
 * and the exjsx conversion (DOM tree → intrinsics). One source of truth per component.
 */
import esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { makeStubs } from './stubs.mjs';

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'circle', 'path', 'rect', 'line']);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/* React attr name → HTML attr name (the corpus uses a small, known set) */
const ATTR = { className: 'class', htmlFor: 'for', strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', fillRule: 'fill-rule', clipRule: 'clip-rule', viewBox: 'viewBox' };

function serialize(n) {
  if (n == null || n === false || n === true) return '';
  if (Array.isArray(n)) return n.map(serialize).join('');
  if (typeof n === 'string' || typeof n === 'number') return esc(n);
  if (!n.$$h) return '';
  const { tag, props, children } = n;
  let attrs = '';
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false || k === 'key' || k === 'children' || typeof v === 'function' || typeof v === 'object') continue;
    const name = ATTR[k] ?? k.replace(/^data([A-Z])/, (m, c) => 'data-' + c.toLowerCase());
    attrs += v === true ? ` ${name}` : ` ${name}="${escAttr(v)}"`;
  }
  if (VOID.has(tag)) return `<${tag}${attrs} />`;
  return `<${tag}${attrs}>${children.map(serialize).join('')}</${tag}>`;
}

const FRAGMENT = Symbol('corpus.Fragment');

function makeH(stubs) {
  return function h(type, props, ...children) {
    const kids = children.flat(Infinity).filter((c) => c != null && c !== false);
    if (type === FRAGMENT) return kids;
    if (typeof type === 'function') return type({ ...(props || {}), children: kids.length === 1 ? kids[0] : kids });
    return { $$h: true, tag: type, props: props || {}, children: kids };
  };
}

/** collect identifiers bound by the import statements we strip */
function importedNames(src) {
  const names = [];
  for (const m of src.matchAll(/^import\s+([\s\S]*?)\s+from\s*["'][^"']+["'];?\s*$/gm)) {
    let clause = m[1].replace(/\btype\s+/g, '');
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const p = part.trim();
        if (!p) continue;
        const as = p.match(/^\S+\s+as\s+(\S+)$/);
        names.push(as ? as[1] : p);
      }
      clause = clause.replace(/\{[\s\S]*?\}/, '');
    }
    for (const d of clause.split(',')) { const t = d.trim().replace(/^\*\s+as\s+/, ''); if (/^[A-Za-z_$][\w$]*$/.test(t)) names.push(t); }
  }
  return [...new Set(names)];
}

async function evalTsx(src, { placeholder }) {
  const names = importedNames(src);
  let code = src
    .replace(/^import\s+[\s\S]*?\s+from\s*["'][^"']+["'];?\s*$/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+default\s+function\s+([A-Za-z_$][\w$]*)/gm, '__DEFAULT__ = function $1')
    .replace(/^export\s+default\s+/gm, '__DEFAULT__ = ')
    .replace(/^export\s+/gm, '');
  const out = await esbuild.transform(code, { loader: 'tsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__F' });
  const h = makeH();
  const stubs = makeStubs(h, { placeholder });
  // an identifier both imported AND declared in-file (shadcn/magicui corpus files inline their
  // registry sources below the page) → the in-file declaration wins; no stub parameter for it
  const declared = (n) => new RegExp(`\\b(?:const|let|var|function|class)\\s+${n}\\b`).test(out.code);
  const scope = Object.fromEntries(names.filter((n) => !declared(n)).map((n) => [n, stubs[n] ?? stubs.__generic]));
  scope.React = { Fragment: FRAGMENT };
  const fn = new Function('__h', '__F', ...Object.keys(scope), `let __DEFAULT__;\n${out.code}\nreturn __DEFAULT__;`);
  const Root = fn(h, FRAGMENT, ...Object.values(scope));
  if (typeof Root !== 'function') throw new Error('corpus tsx: no default-exported component found');
  return serialize(h(Root, {}));
}

/** file path → { name, html } (component markup, no wrapper). */
export async function htmlize(file, opts) {
  const name = basename(file).replace(/\.(html|tsx)$/, '');
  const src = readFileSync(file, 'utf8');
  let html;
  if (extname(file) === '.html') {
    const body = src.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    html = (body ? body[1] : src).trim();
  } else {
    html = await evalTsx(src, opts);
  }
  // relative image srcs (/placeholder.svg…) have no host here and the deploy validator rejects
  // them — substitute the bench placeholder in the ONE html both sides consume
  html = html.replace(/src="(?!https?:\/\/|data:)[^"]*"/g, `src="${opts.placeholder}"`);
  return { name, html };
}
