import { Layout, Hero, FeatureGrid, FAQ, RelatedLinks, CTA } from '../../../src/components/index.jsx';
import { stateSlug } from '../data.mjs';

export const StatePage = (state, theme, siblings) => (
  <Layout theme={theme}
    nav={{ logo: 'farmans.co', links: [{ text: 'Services' }, { text: 'Work' }, { text: 'Locations' }, { text: 'About' }], ctas: [{ text: 'Get a Proposal' }] }}
    footer={{ brand: 'farmans.co', blurb: 'Web design, SEO and AI automation for local businesses.', cols: [{ title: 'SERVICES', links: ['Web Design', 'SEO', 'AI Automation'] }, { title: 'LOCATIONS', links: siblings.slice(0, 4).map((s) => s.name) }] }}>
    <Hero eyebrow={`${state.name.toUpperCase()} · WEB · SEO · AI`} title={state.h1} sub={state.heroSub} />
    <FeatureGrid title={state.whyTitle} items={state.whyPoints} />
    <FAQ title={`${state.name} questions, answered.`} items={state.faqs} />
    <RelatedLinks title={`We also serve other states`} links={siblings.filter((s) => s.abbr !== state.abbr).map((s) => ({ label: s.name, href: `/${stateSlug(s)}/` }))} />
    <CTA eyebrow="GET STARTED" title={`Ready to grow your ${state.name} business?`} body="Book a free strategy call — we map your growth in under an hour." />
  </Layout>
);
