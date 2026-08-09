/**
 * stubs.mjs — component stubs for evaluating the .tsx corpus files outside their apps.
 *
 * The corpus components import framework/app modules (next/image, shadcn ui, magicui, lucide
 * icons…) that don't exist here. Each import resolves to a SMALL DETERMINISTIC stub that renders
 * plain HTML with plain-palette Tailwind classes. The SAME expanded HTML feeds BOTH the reference
 * render (real Tailwind) and the exjsx conversion, so stub styling choices cancel out of the
 * parity score — the harness measures tw.mjs fidelity, not shadcn/magicui fidelity.
 */

const join = (...xs) => xs.flat(Infinity).filter((x) => typeof x === 'string' && x.trim()).join(' ');

/** Build the stub registry around the evaluator's h() and the media placeholder URL. */
export function makeStubs(h, { placeholder }) {
  const icon = (props = {}) =>
    h('svg', {
      className: props.className, xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24',
      width: props.width ?? 24, height: props.height ?? 24, fill: 'none',
      stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, h('path', { d: 'M4 5h16v14H4z M4 12h16' }));

  const stubs = {
    /* ── framework ── */
    cn: (...args) => join(...args.map((a) => (a && typeof a === 'object' ? Object.keys(a).filter((k) => a[k]) : a))),
    Image: ({ src, width, height, className, alt }) =>
      h('img', { src: typeof src === 'string' && src.startsWith('http') ? src : placeholder, width, height, className, alt: alt || '' }),
    Link: ({ href, className, children }) => h('a', { href, className }, children),

    /* ── cruip ── */
    Logo: () => h('a', { className: 'inline-flex', href: '#0' },
      h('svg', { width: 28, height: 28, viewBox: '0 0 28 28', xmlns: 'http://www.w3.org/2000/svg' },
        h('circle', { cx: 14, cy: 14, r: 14, fill: '#2563eb' }))),
    PageIllustration: () => null, // decorative absolute-positioned background art — out of component scope

    /* ── shadcn (plain-palette approximations of the registry components) ── */
    Button: ({ variant = 'default', className, children, type }) => {
      const variants = {
        default: 'bg-gray-900 text-gray-50 shadow-sm hover:bg-gray-800',
        outline: 'border border-gray-200 bg-white text-gray-900 shadow-sm hover:bg-gray-100',
        link: 'text-gray-900 underline-offset-4 hover:underline',
      };
      return h('button', { type, className: join('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2', variants[variant] || variants.default, className) }, children);
    },
    Input: ({ id, type, placeholder: ph, className }) =>
      h('input', { id, type, placeholder: ph, className: join('flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm', className) }),
    Field: ({ className, children }) => h('div', { className: join('flex flex-col gap-2', className) }, children),
    FieldGroup: ({ className, children }) => h('div', { className: join('flex flex-col gap-6', className) }, children),
    FieldLabel: ({ htmlFor, className, children }) => h('label', { htmlFor, className: join('text-sm font-medium', className) }, children),
    FieldDescription: ({ className, children }) => h('p', { className: join('text-sm text-gray-500', className) }, children),
    FieldSeparator: ({ className, children }) => h('div', { className: join('flex items-center gap-3 text-sm text-gray-500', className) },
      h('div', { className: 'h-px flex-1 bg-gray-200' }), h('span', {}, children), h('div', { className: 'h-px flex-1 bg-gray-200' })),

    /* ── magicui ── */
    Marquee: ({ className, children }) => h('div', { className: join('flex flex-row items-center gap-4 overflow-hidden', className) }, children),
    Calendar: ({ className }) => h('div', { className: join('h-64 w-60 rounded-md border border-gray-200 bg-white', className) }),
    AnimatedListDemo: ({ className }) => h('div', { className }),
    AnimatedBeamMultipleOutputDemo: ({ className }) => h('div', { className }),
  };
  /* icon components (lucide / radix): all render the same generic stroke icon */
  for (const name of ['GalleryVerticalEnd', 'ArrowRightIcon', 'CalendarIcon', 'FileTextIcon', 'BellIcon', 'Share2Icon', 'InputIcon', 'GlobeIcon']) stubs[name] = icon;

  /* fallback for anything not modeled: PascalCase → transparent div passthrough */
  stubs.__generic = ({ className, children }) => h('div', { className }, children);
  return stubs;
}
