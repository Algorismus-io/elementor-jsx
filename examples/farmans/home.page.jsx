import { defineSite } from '../../src/site.mjs';
import { Page, Section, Card, Bento, Stat, CTA, Footer, Nav } from '../../src/components/index.jsx';
import { fontLoader } from '../../src/kit/kit.mjs';
import { farmans } from './theme.mjs';

const services = [
  { title: 'Web Design', desc: 'Conversion-first sites that look the part and load fast.', tint: '#093D57', ink: '#fff', span: 6 },
  { title: 'AI Automation', desc: 'Bots that book, reply and qualify around the clock.', tint: '#85C441', span: 6 },
  { title: 'SEO & Local SEO', desc: 'Rank where buyers search.', tint: '#DCEAEF', span: 4 },
  { title: 'eCommerce', desc: 'Stores built to sell.', tint: '#25708D', ink: '#fff', span: 4 },
  { title: 'Branding', desc: 'Identities people remember.', tint: '#ECF2D6', span: 4 },
  { title: 'Development', desc: 'Clean, scalable code.', tint: '#ffffff', span: 6 },
  { title: '24/7 Support', desc: 'Real humans, monitoring round the clock.', tint: '#E4F0CE', span: 6 },
];

const Home = ({ theme: t }) => (
  <Page theme={t}>
    {fontLoader('Poppins', [400, 600, 700, 800])}
    {fontLoader('Inter', [400, 500, 700])}
    <Nav logo="farmans.co"
         links={[{ text: 'Services', menu: services.slice(0, 6).map((s) => ({ title: s.title, desc: s.desc })) }, { text: 'Work' }, { text: 'Industries' }, { text: 'Blog' }, { text: 'About' }]}
         ctas={[{ text: 'See our work' }, { text: 'Get a Proposal' }]} />

    <Section bg={t.color.bg} align="flex-start">
      <text weight={700} size={12.5} ls={0.12} color={t.color.teal || '#25708D'}>IT · WEB · GROWTH · AI</text>
      <h1 color={t.color.primary} size={56} weight={800} font={t.font.head} lh={1.05}>One partner. Every layer of your growth.</h1>
      <text color={t.color.muted} size={18} lh={1.6} maxw={560}>farmans.co designs, builds, ranks and automates the digital work your business needs. One team, one roof.</text>
      <row gap={t.space(5)} wrap w="100%">
        <Stat value="$12M+" label="in revenue generated" tint={t.color.primary} ink="#fff" />
        <Stat value="150+" label="projects delivered" tint={t.color.accent} />
        <Stat value="4.9★" label="average Google rating" tint="#E4F0CE" />
      </row>
    </Section>

    <Section id="services" bg={t.color.bg} eyebrow="WHAT WE DO" title="Everything you need, in one stack."
             body="Design, build, sell, automate and grow — handled by one team, under one roof.">
      <Bento cols={12}>
        {services.map((s) => <Card span={s.span} title={s.title} desc={s.desc} tint={s.tint} ink={s.ink} />)}
      </Bento>
    </Section>

    <CTA eyebrow="GET STARTED" title="Ready to build your growth engine?"
         body="Book a free strategy call — we map your growth in under an hour." />

    <Footer brand="farmans.co" blurb="One partner for design, development, SEO and AI automation."
            cols={[{ title: 'SERVICES', links: ['Web Design', 'AI Automation', 'SEO', 'eCommerce'] },
                   { title: 'COMPANY', links: ['About', 'Work', 'Blog', 'Contact'] }]} />
  </Page>
);

export default defineSite({ name: 'farmans', theme: farmans, pages: [{ title: 'Home (exjsx)', slug: 'home-exjsx', node: <Home theme={farmans} /> }] });
