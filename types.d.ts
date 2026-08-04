/**
 * elementor-jsx public API types — editor intellisense + documentation.
 * The runtime stays plain JS; these declarations mirror the tested behavior
 * (every claim here is enforced by the suite in test/).
 */

/** A compiled Elementor atomic node (kit tree). */
export interface KitNode {
  id: string;
  elType: string;
  widgetType?: string;
  settings: Record<string, unknown>;
  styles: Record<string, unknown>;
  elements: KitNode[];
  interactions?: { version: 1; items: unknown[] };
}

/** A typed Elementor prop envelope ({$$type, value}). */
export interface Envelope { $$type: string; value: unknown }

/** Dynamic-tag envelope (Pro): text props take it directly; image/link nest it. */
export interface DynEnvelope extends Envelope { $$type: 'dynamic' }

/** Motion interaction options (free core: load/scrollIn + fade/slide/scale). */
export interface AnimateOptions {
  trigger?: 'load' | 'scrollIn' | 'scrollOut' | 'scrollOn' | 'hover' | 'click';
  effect?: 'fade' | 'slide' | 'scale' | 'custom';
  type?: 'in' | 'out';
  direction?: '' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  duration?: number;   // ms
  delay?: number;      // ms
  easing?: 'easeIn' | 'easeOut' | 'easeInOut' | 'backIn' | 'backInOut' | 'backOut' | 'linear';
  replay?: boolean;
}

/** The sx shorthand — every key maps to a verified atomic envelope (see unit/sx.test.mjs).
 * Standard CSS property names (kebab or camelCase: `padding`, `maxWidth`, `textAlign`, …) are
 * accepted as aliases for these keys, with CSS-string values parsed (`padding: '96px 24px'`). */
export interface SxProps {
  bg?: string | [angle: number, from: string, to: string] | Envelope;
  grad?: [angle: number, from: string, to: string];
  /** number (uniform) | [v,h] / [t,r,b,l] | CSS string '96px 24px' | PARTIAL sides {t,r,b,l} —
   * partial emits only the given sides (unset sides inherit; safe in tablet/mobile variants). */
  pad?: number | number[] | string | { t?: number; r?: number; b?: number; l?: number };
  m?: number | (number | 'auto')[] | string | { t?: number | 'auto'; r?: number | 'auto'; b?: number | 'auto'; l?: number | 'auto' };
  center?: boolean;
  radius?: number;
  gap?: number;
  w?: number | string | 'hug' | 'auto';
  h?: number | string;
  maxw?: number;
  minh?: number;
  align?: string;
  justify?: string;
  dir?: 'row' | 'column';
  wrap?: boolean | string;
  color?: string | Envelope;
  size?: number;
  weight?: number | string;
  font?: string | Envelope;
  ta?: 'left' | 'right' | 'center' | 'justify' | 'start' | 'end';
  lh?: number;
  ls?: number;
  span?: number;
  flex?: number;
  display?: string;
  gridCols?: number | string;
  pos?: string;
  shadow?: [v: number, blur: number, spread: number, color: string] | Envelope;
  fit?: string;
  border?: string | [width: number, color: string];
  tablet?: SxProps;
  mobile?: SxProps;
  props?: Record<string, unknown>;
}

/** Intrinsic JSX props = sx shorthand + the specials. */
export interface IntrinsicProps extends SxProps {
  /** Tailwind-subset utility string (desktop-first: base = desktop, max-lg: = tablet,
   * max-md: = mobile). Expands to sx shorthand; explicit sx props win on conflict.
   * Unknown utilities and palette color names throw at compile time (see src/tw.mjs). */
  tw?: string;
  tag?: string;
  raw?: string;                       // custom CSS (renders via global classes; --inline emits a <style>)
  href?: string | DynEnvelope;
  id?: string;                        // _cssid anchor
  alt?: string;                       // URL-src images only (id-src takes attachment alt_text)
  cls?: string;                       // semantic class-label hint for dedup naming
  gcls?: string;                      // external global-class refs (space-separated)
  dyn?: DynEnvelope;                  // dynamic-tag content binding (children ignored)
  animate?: AnimateOptions | AnimateOptions[] | unknown[];
}

export interface ThemeSpec {
  name?: string;
  color?: Record<string, string>;
  font?: Record<string, string>;
  radius?: Record<string, number>;
  space?: number[];
  shadow?: Record<string, unknown>;
  tints?: { bg: string; dark: boolean }[];
  mode?: 'var' | 'literal';
}

export interface Theme {
  name: string;
  spec: ThemeSpec;
  color: Record<string, Envelope | string>;
  lit: Record<string, string>;
  font: Record<string, Envelope | string>;
  litFont(k: string): string;
  radius(k: string | number): number;
  space(n: number): number;
  shadow(k: string): unknown;
  tint(i: number): { bg: string; dark: boolean };
  variablesMeta(): { data: Record<string, unknown>; watermark: number; version: 1 };
}

export interface SeoMeta {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
}

export interface PageDef {
  title: string;
  slug: string;
  /** 'elementor_canvas' (default; suppresses theme parts) or 'elementor_header_footer'. */
  template?: string;
  seo?: SeoMeta;
  node: unknown;
}

export interface PartDef {
  title?: string;
  node: unknown;
  /** theme-builder conditions, e.g. ['include/general']; sensible defaults per part type. */
  conditions?: string[];
  /** popup only: {pageLoad?: seconds, scrollPercent?: n, exitIntent?: true} or canonical {triggers,timing}. */
  display?: Record<string, unknown>;
}

export interface SiteDef {
  name?: string;
  theme?: Theme;
  pages?: PageDef[];
  /** site-wide theme parts (Pro theme-builder documents). */
  parts?: { header?: PartDef; footer?: PartDef; single?: PartDef; popup?: PartDef; archive?: PartDef; error404?: PartDef } | null;
}

export function defineSite(def: SiteDef): { $$site: true } & SiteDef;
export function fromData<T>(items: T[], map: (item: T, i: number) => PageDef): PageDef[];
export function defineTheme(spec: ThemeSpec): Theme;
export function compileSite(site: { $$site: true }): Record<string, unknown>;
/** cfg accepts dry/force/wpcli/cli/wpUrl plus only?: string[] (deploy only those slugs; skips all kit writes). */
export function deployBundle(bundle: Record<string, unknown>, cfg?: Record<string, unknown>): Promise<Record<string, unknown>>;
export function shouldWriteVariables(bundle: Record<string, unknown>): boolean;
/** Pure --only planner: filters bundle.pages by derived slug (throws on unknown/empty entries), flags kit skip + registry-lag warning. */
export function planOnly(bundle: Record<string, unknown>, only?: string[]): { pages: PageDef[]; skipKit: boolean; warnings: string[] };
/** Read-only bundle formatter (`exjsx inspect`): summary + element tree (or one --el dump) with every custom_css base64-DECODED; never mutates the bundle. */
export function inspectBundle(bundle: Record<string, unknown>, opts?: { page?: string; el?: string }): string;

/** One conventions violation (`exjsx lint`); severity 'error' fails the lint, 'warn' fails with --strict. */
export interface LintFinding { rule: string; severity: 'error' | 'warn' | 'info'; where: string; message: string; fix: string }
/** Conventions check over a compiled bundle (see CONVENTIONS.md — every rule cites the incident it prevents). Pure, offline. */
export function lintBundle(bundle: Record<string, unknown>): { findings: LintFinding[]; counts: { error: number; warn: number; info: number } };
export function formatLint(r: { findings: LintFinding[]; counts: { error: number; warn: number; info: number } }): string;

/** fs-project manifest (`exjsx build <dir>`): pages/*.page.jsx = content, parts/<type>.part.jsx = chrome, theme.mjs = tokens. */
export interface ProjectManifest {
  dir: string; name: string; themeFile: string | null; configFile: string | null;
  pages: { file: string; rel: string; dynamic: boolean; param: string | null; slug: string | null }[];
  parts: { file: string; type: 'header' | 'footer' | 'single' | 'archive' | 'error404' | 'popup' }[];
}
/** Scan a project dir; throws ONE aggregated error listing every layout violation with its fix. */
export function discoverProject(dir: string): ProjectManifest;
/** Manifest → plain-JS entry module source that assembles defineSite (per-file contract guards name the offending file). */
export function synthesizeEntry(manifest: ProjectManifest): string;

/** The vnode h()/JSX produces (runtime.mjs h()); render() consumes it. JSX.Element = VNode below,
 * so component return positions typecheck against the real runtime shape. */
export interface VNode { $$v: true; type: unknown; props: Record<string, unknown>; children: unknown[] }

/* ── global JSX namespace: editor autocomplete + tsc typecheck of .tsx entries ──
 * Helper types below are deliberately NOT exported — a .d.ts module may declare
 * non-exported interfaces consumed only by the `declare global` block. */
type Children = unknown;
interface WithChildren { children?: Children }
/** box|div|row|col|section — container intrinsics (runtime.mjs intrinsic() switch). */
interface ContainerProps extends IntrinsicProps, WithChildren {}
/** h1..h4|heading|text|p — text intrinsics; children serialize via textOf (html-v3). */
interface TextIntrinsicProps extends IntrinsicProps, WithChildren {}
/** <html raw="…"> — raw HTML widget; raw wins over children when both are given. */
interface HtmlProps extends IntrinsicProps, WithChildren { raw?: string }
/** <img> discriminates on src: string = URL image (inline alt supported); number attachment id
 * or DynEnvelope = id/dynamic image, where alt comes from the attachment's alt_text and passing
 * an inline alt THROWS at render — hence `alt?: never` on that arm. */
type ImgProps =
  | (IntrinsicProps & { src: string; alt?: string })
  | (Omit<IntrinsicProps, 'alt'> & { src: number | DynEnvelope; alt?: never });

declare global {
  namespace JSX {
    type Element = VNode;
    interface ElementChildrenAttribute { children: {} }
    /** EXACT runtime intrinsic set — NO index signature: unknown tags and unknown props must be
     * compile errors, mirroring the render-time throws in runtime.mjs. */
    interface IntrinsicElements {
      box: ContainerProps;
      div: ContainerProps;
      row: ContainerProps;
      col: ContainerProps;
      section: ContainerProps;
      h1: TextIntrinsicProps;
      h2: TextIntrinsicProps;
      h3: TextIntrinsicProps;
      h4: TextIntrinsicProps;
      heading: TextIntrinsicProps;
      text: TextIntrinsicProps;
      p: TextIntrinsicProps;
      /** em/strong/br: legal ONLY nested inside heading/text intrinsics (html-v3 whitelist);
       * top-level use throws at render — the type layer cannot express the nesting restriction. */
      em: WithChildren;
      strong: WithChildren;
      br: {};
      img: ImgProps;
      html: HtmlProps;
    }
  }
}
