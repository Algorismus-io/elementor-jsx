/** Fixture exercising the ENTIRE src/components JSX library through the real pipeline. */
import { defineSite } from '../../src/site.mjs';
import { defineTheme } from '../../src/theme.mjs';
import {
  Page, Section, Card, Bento, Stat, CTA, Footer, Nav, Mock, Layout, Hero, FeatureGrid, FAQ, RelatedLinks,
} from '../../src/components/index.jsx';

const theme = defineTheme({
  name: 'exjsx-lib',
  color: { primary: '#1D3557', ink: '#101418', muted: '#5B6B72', surface: '#F1FAEE', bg: '#FFFFFF', accent: '#E63946', footer: '#0B1D33' },
  font: { head: 'Georgia', body: 'Verdana' },
  radius: { sm: 12, md: 20 },
});

const shell = {
  nav: { logo: 'LibBrand', links: [{ text: 'Home', href: '/exjsx-lib-home/' }], ctas: [{ text: 'Go', href: '/exjsx-lib-sub/' }] },
  footer: { brand: 'LibBrand', blurb: 'Library fixture.', cols: [{ title: 'MORE', links: ['Docs', 'Blog'] }] },
};

const Home = () => (
  <Page theme={theme}>
    <Layout {...shell}>
      <Hero eyebrow="LIB" title="Library torture home" sub="Every JSX component, one fixture." />
      <Section id="features" eyebrow="FEATURES" title="Feature section" body="A body line.">
        <Bento cols={12}>
          <Card span={6} title="Same card" desc="identical twin" />
          <Card span={6} title="Same card" desc="identical twin" />
          <Stat value="99.9%" label="uptime" />
        </Bento>
      </Section>
      <CTA eyebrow="GO" title="Ship the library" body="One deploy." />
    </Layout>
  </Page>
);

const Sub = () => (
  <Page theme={theme}>
    <Layout {...shell}>
      <FeatureGrid title="Grid section" items={[{ title: 'Grid A', text: 'a' }, { title: 'Grid B', text: 'b' }]} />
      <FAQ title="Questions" items={[{ q: 'Is it tested?', a: 'Yes — 300+ checks.' }]} />
      <RelatedLinks title="Related" links={[{ label: 'Back home', href: '/exjsx-lib-home/' }]} />
      <Section title="Charts">{Mock.line([10, 80])}</Section>
    </Layout>
  </Page>
);

export default defineSite({
  name: 'exjsx-lib',
  theme,
  pages: [
    { title: 'Lib Home', slug: 'exjsx-lib-home', node: <Home /> },
    { title: 'Lib Sub', slug: 'exjsx-lib-sub', node: <Sub /> },
  ],
});
