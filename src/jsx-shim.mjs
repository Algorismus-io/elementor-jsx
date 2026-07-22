/** esbuild `inject` target: makes the JSX factory available in every .jsx without an explicit import.
 * The factory is aliased to `_jsx`/`_Fragment` (not `h`) so an author's own variable named `h`
 * can never shadow the factory — that shadowing produced the cryptic "h4 is not a function" footgun. */
export { h as _jsx, Fragment as _Fragment } from './runtime.mjs';
