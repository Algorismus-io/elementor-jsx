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

/** The sx shorthand — every key maps to a verified atomic envelope (see unit/sx.test.mjs). */
export interface SxProps {
  bg?: string | [angle: number, from: string, to: string] | Envelope;
  grad?: [angle: number, from: string, to: string];
  pad?: number | number[];
  m?: number | (number | 'auto')[];
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
export function deployBundle(bundle: Record<string, unknown>, cfg?: Record<string, unknown>): Promise<Record<string, unknown>>;
