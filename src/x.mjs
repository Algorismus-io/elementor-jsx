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
  S, C, N, B, SZ, DIM, P0, M, PDIM, RAD, RADT, RADB, BG, GRAD, SHADOW, SHADOWS, HUG, AUTO, HTML, LINK,
  CLS, IMG_ID, IMG_URL, SVG_ID, CUSTOM_CSS, VIDEO_URL, VIDEO_ID, KV, EMAIL_ACTION, TRACKS, GAPXY,
  node, css, clone, fx, assertTree, emit, col, row, grid, nativeGrid, hugRow, hugCol, bar, hero,
  hamburgerNav, sect, abs, archConvex, archConcave, heading, para, button, image, imageUrl,
  textLink, divider, youtube, video, tabs, DYN, isDyn, dyn, IMG_DYN, interaction, interact,
  loopGrid, formInput, formTextarea, formSelect, formCheckbox, formLabel, formSubmit, field, form,
  formSuccessMessage, formErrorMessage, checkboxRow, normalizeFaValue,
  faIcon, svgIcon, iconChip, hover, stateVariant, STYLE_STATES, ATTRS, fontLoader, formSuccess
} from './kit/kit.mjs';

export {
  FLEX, sx, splitStates, applyStates, bgImage, box, styled, bindClass, h2, h3, txt, eyebrow, accentHeading, sectionHeader,
  section, card, bento, cardGrid, stat, step, chip, logoStrip, testimonial, footer, ctaBand,
  navBar, browserMock, barChart, lineChart, donut, chatMock,
  skipLink, srOnly, focusRing, keyboardScrollable, SR_ONLY_CSS
} from './kit/kit-components.mjs';

/* compile-time accessibility (see src/a11y.mjs + docs/A11Y.md) */
export {
  analyzeContrast, analyzePageContrast, contrastRatio, contrastRatioExact, meetsRatio, relativeLuminance, parseColor, composite,
  isLargeText, requiredRatio, landmarkSettings, readLandmark, LANDMARKS, UNIQUE_LANDMARKS,
  variableMap, colorFromEnvelope, backgroundFromEnvelope, nodeProps, nodeText, toHex,
  suggestAccessibleColor, rgbToHsl, rawCssOf
} from './a11y.mjs';

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
export {
  defineComponent
} from './component.mjs';
