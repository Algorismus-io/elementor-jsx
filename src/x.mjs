/**
 * x.mjs — the COMPLETE authoring barrel: one import surface for every public primitive.
 *
 *   import { defineSite, tabs, dyn, sx, fontLoader } from 'elementor-jsx';
 *
 * Explicit re-exports (never `export *` — ambiguous star-exports drop colliding names SILENTLY,
 * which is the opposite of coverage). test/unit/surface.test.mjs enforces the contract both ways:
 * every source-module export is either here or in its documented EXCLUDES list, and nothing here
 * is stale. Plain JS only — the JSX component library (Page/Section/…) is NOT re-exported here so
 * this module stays importable under bare node (tests, tooling); it ships in prelude.mjs (the
 * esbuild-injected auto-import surface) and via 'elementor-jsx/jsx-components'.
 *
 * EXCLUDES (the whole list — everything else is covered):
 *   kit.mjs: freshId, resetIds        — id-counter machinery; compiler/test concern, not authoring
 *   kit-components.mjs: CInc          — internal instance counter
 */
export {
  S, C, N, B, SZ, DIM, P0, M, PDIM, RAD, RADT, RADB, BG, GRAD, SHADOW, HUG, AUTO, HTML, LINK,
  CLS, IMG_ID, IMG_URL, SVG_ID, CUSTOM_CSS, VIDEO_URL, VIDEO_ID, KV, EMAIL_ACTION, node, css,
  clone, fx, assertTree, emit, col, row, grid, hugRow, hugCol, bar, hero, hamburgerNav, sect,
  abs, archConvex, archConcave, heading, para, button, image, imageUrl, textLink, divider,
  youtube, video, tabs, DYN, isDyn, dyn, IMG_DYN, interaction, interact, loopGrid, formInput,
  formTextarea, formSelect, formCheckbox, formLabel, formSubmit, field, form, normalizeFaValue,
  faIcon, svgIcon, iconChip, hover, fontLoader, formSuccess
} from './kit/kit.mjs';

export {
  FLEX, sx, bgImage, box, styled, bindClass, h2, h3, txt, eyebrow, accentHeading, sectionHeader,
  section, card, bento, cardGrid, stat, step, chip, logoStrip, testimonial, footer, ctaBand,
  navBar, browserMock, barChart, lineChart, donut, chatMock
} from './kit/kit-components.mjs';

export {
  defineTheme
} from './theme.mjs';
export {
  defineSite, fromData
} from './site.mjs';
export {
  twToSx, mergeTw
} from './tw.mjs';
export {
  Fragment, h, useTheme, useCtx, render, renderPage
} from './runtime.mjs';
