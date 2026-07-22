import { defineSite, fromData } from '../../src/site.mjs';
import { farmans } from './theme.mjs';
import { states, stateSlug } from './data.mjs';
import { StatePage } from './templates/state-page.jsx';
import { Layout, Hero, RelatedLinks } from '../../src/components/index.jsx';

const HomePage = (
  <Layout theme={farmans}
    nav={{ logo: 'farmans.co', links: [{ text: 'Services' }, { text: 'Locations' }, { text: 'About' }], ctas: [{ text: 'Get a Proposal' }] }}
    footer={{ brand: 'farmans.co', blurb: 'One partner for design, development, SEO and AI.', cols: [{ title: 'SERVICES', links: ['Web Design', 'SEO', 'AI Automation'] }] }}>
    <Hero eyebrow="IT · WEB · GROWTH · AI" title="One partner. Every layer of your growth." sub="farmans.co designs, builds, ranks and automates the digital work your business needs." />
    <RelatedLinks title="Find growth in your state" links={states.map((s) => ({ label: s.name, href: `/${stateSlug(s)}/` }))} />
  </Layout>
);

export default defineSite({
  name: 'farmans-multi', theme: farmans,
  pages: [
    { title: 'farmans — Home', slug: 'farmans-multi-home', node: HomePage },
    ...fromData(states, (s) => ({ title: `${s.name} — farmans`, slug: stateSlug(s), node: StatePage(s, farmans, states) })),
  ],
});
