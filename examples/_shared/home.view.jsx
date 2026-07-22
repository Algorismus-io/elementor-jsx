import { Page, Section, Card, Bento, Stat, CTA, Footer, Nav } from '../../src/components/index.jsx';
import { fontLoader } from '../../src/kit/kit.mjs';

const SERVICES = [
  ['Web Design', 'Conversion-first sites that look the part and load fast.', 6],
  ['AI Automation', 'Bots that book, reply and qualify around the clock.', 6],
  ['SEO & Local SEO', 'Rank where buyers search.', 4],
  ['eCommerce', 'Stores built to sell.', 4],
  ['Branding', 'Identities people remember.', 4],
  ['Development', 'Clean, scalable code.', 6],
  ['24/7 Support', 'Real humans, monitoring round the clock.', 6],
];

export const HomeView = ({ theme: t }) => (
  <Page theme={t}>
    {fontLoader(t.litFont('head'), [400, 600, 700, 800])}
    {fontLoader(t.litFont('body'), [400, 500, 700])}
    <Nav logo={t.name + '.co'}
         links={[{ text: 'Services', menu: SERVICES.slice(0, 6).map(([title, desc]) => ({ title, desc })) }, { text: 'Work' }, { text: 'Industries' }, { text: 'Blog' }, { text: 'About' }]}
         ctas={[{ text: 'See our work' }, { text: 'Get a Proposal' }]} />

    <Section bg={t.color.bg} align="flex-start">
      <text weight={700} size={12.5} ls={0.12} color={t.color.accent}>IT · WEB · GROWTH · AI</text>
      <h1 color={t.color.primary} size={56} weight={800} font={t.font.head} lh={1.05}>One partner. Every layer of your growth.</h1>
      <text color={t.color.muted} size={18} lh={1.6} maxw={560}>{t.name} designs, builds, ranks and automates the digital work your business needs. One team, one roof.</text>
      <row gap={t.space(5)} wrap w="100%">
        <Stat value="$12M+" label="in revenue generated" tint={t.color.primary} ink={t.color.onPrimary} />
        <Stat value="150+" label="projects delivered" tint={t.color.accent} ink={t.color.onAccent} />
        <Stat value="4.9★" label="average Google rating" tint={t.tint(4).bg} />
      </row>
    </Section>

    <Section id="services" bg={t.color.bg} eyebrow="WHAT WE DO" title="Everything you need, in one stack."
             body="Design, build, sell, automate and grow — handled by one team, under one roof.">
      <Bento cols={12}>
        {SERVICES.map(([title, desc, span], i) => {
          const tn = t.tint(i);
          return <Card span={span} title={title} desc={desc} tint={tn.bg} ink={tn.dark ? '#fff' : undefined} />;
        })}
      </Bento>
    </Section>

    <CTA eyebrow="GET STARTED" title="Ready to build your growth engine?"
         body="Book a free strategy call — we map your growth in under an hour." />

    <Footer brand={t.name + '.co'} blurb="One partner for design, development, SEO and AI automation."
            cols={[{ title: 'SERVICES', links: ['Web Design', 'AI Automation', 'SEO', 'eCommerce'] },
                   { title: 'COMPANY', links: ['About', 'Work', 'Blog', 'Contact'] }]} />
  </Page>
);
