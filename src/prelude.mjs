/**
 * prelude.mjs — the AUTO-USING surface. Injected by the build (esbuild `inject`), so page/part
 * files use these as free variables with ZERO imports:
 *
 *   export default () => <section tw="…">{fontLoader('Poppins', [600])}{tabs([...])}</section>
 *
 * How it works: esbuild substitutes free identifiers with imports of this module's exports —
 * unused names tree-shake away, and an explicit user import/binding of the same name ALWAYS wins
 * (only FREE variables are substituted), so this can never break existing code.
 *
 * Curated subset of the x.mjs barrel — deliberately NOT everything. Short/generic names
 * (S, C, N, DIM, node, abs, bar, hover, h2/h3/txt, raw envelope constructors …) are excluded:
 * auto-injecting them would turn common typos and shadowed helpers into silent behavior instead
 * of a loud ReferenceError. Need one of those? Import it: `import { DIM } from 'elementor-jsx'`.
 * test/unit/surface.test.mjs enforces prelude ⊆ barrel∪components and the deny-list.
 */
export {
  h, Fragment, useTheme, useCtx, defineSite, fromData, defineTheme, defineComponent, sx, box, styled, bindClass,
  css, clone, interact, fontLoader, formSuccess, col, row, grid, nativeGrid, hugRow, hugCol, sect, hero, hamburgerNav,
  heading, para, button, image, imageUrl, textLink, divider, youtube, video, tabs, archConvex,
  archConcave, dyn, loopGrid, form, field, formInput, formTextarea, formSelect, formCheckbox,
  formLabel, formSubmit, formSuccessMessage, formErrorMessage, checkboxRow, EMAIL_ACTION, faIcon, svgIcon, iconChip, eyebrow, accentHeading,
  sectionHeader, section, card, bento, cardGrid, stat, step, chip, logoStrip, testimonial,
  footer, ctaBand, navBar, browserMock, barChart, lineChart, donut, chatMock
} from './x.mjs';

// the JSX component library (esbuild context only — .jsx can't load under bare node)
export {
  Page, Section, Card, Bento, Stat, CTA, Footer, Nav, Mock, Layout, Hero, FeatureGrid, FAQ,
  RelatedLinks
} from './components/index.jsx';
