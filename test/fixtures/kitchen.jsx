/** KITCHEN SINK fixture — the ENTIRE component library + kit escape hatches on real pages.
 * Deploying this = the live PHP validator accepting every shape the framework can emit.
 * Audit-clean by design: exactly one h1, real hrefs, semantic landmarks. */
import { defineSite, fromData } from '../../src/site.mjs';
import { defineTheme } from '../../src/theme.mjs';
import {
  navBar, section, card, cardGrid, bento, stat, step, chip, logoStrip, testimonial,
  footer, ctaBand, lineChart, donut, barChart, browserMock, chatMock, styled, sx,
} from '../../../.claude/skills/elementor-ultra/lib/kit-components.mjs';
import {
  hero, heading, para, button, hover, css, clone, SZ, S,
  divider, youtube, video, tabs,
} from '../../../.claude/skills/elementor-ultra/lib/kit.mjs';

const theme = defineTheme({
  name: 'exjsx-kitchen',
  color: { brand: '#7C3AED', ink: '#17151F', muted: '#5D5A6B', surface: '#F7F5FB' },
  font: { head: 'Trebuchet MS', body: 'Georgia' },
});

/* hover-lift card: base transition via css(), hover variant via hover() */
const liftCard = () => {
  const c = card({ icon: 'bolt', title: 'Hoverable', desc: 'Lifts on hover.', tint: '#ffffff' });
  styled(c, { shadow: [6, 24, -10, 'rgba(23,21,31,0.18)'] });
  css(c, 'transition: background .18s ease, box-shadow .18s ease;');
  // multi-prop state variant: bg + color + shadow all shift on hover (verified envelope shapes)
  hover(c, sx({ bg: '#F1EBFB', color: '#2A1B54', shadow: [10, 30, -12, 'rgba(124,58,237,0.35)'] }));
  return c;
};

const Home = () => (
  <box pad={0} gap={0}>
    {navBar({
      logo: 'KitchenX', accent: '#7C3AED', ink: '#17151F',
      links: [
        { text: 'Features', href: '/exjsx-k-alpha/', menu: [{ title: 'Speed', desc: 'Fast builds', href: '/exjsx-k-alpha/' }, { title: 'Scale', desc: 'Many pages', href: '/exjsx-k-beta/' }] },
        { text: 'Pricing', href: '/exjsx-k-beta/' },
      ],
      ctas: [{ text: 'Sign in', href: '/exjsx-k-gamma/' }, { text: 'Start free', href: '/exjsx-k-alpha/' }],
    })}
    {hero(1583, 'rgba(23,21,31,0.55)', sx({ pad: [110, 24], gap: 14 }), [
      heading('h1', 'Kitchen Sink Torture', sx({ color: '#ffffff', size: 58, weight: 800, ta: 'center', lh: 1.05 })),
      para('Every component, one deploy.', sx({ color: 'rgba(255,255,255,0.85)', size: 18, ta: 'center' })),
      button('Explore features', '/exjsx-k-alpha/', sx({ bg: '#7C3AED', color: '#ffffff', radius: 999, pad: [14, 26], weight: 700 })),
    ])}
    {section({
      id: 'features', bg: theme.color.surface,
      header: { eyebrow: 'FEATURES', title: 'Everything ships', body: 'Cards, grids, stats, charts — all of it.', accent: '#7C3AED' },
      children: [
        cardGrid([
          card({ icon: 'bolt', title: 'Fast', desc: 'One-shot deploys.', href: '/exjsx-k-alpha/' }),
          card({ icon: 'layer-group', title: 'Deduped', desc: 'Shared classes.', href: '/exjsx-k-beta/' }),
          liftCard(),
        ]),
        bento([
          stat({ value: '482→33', label: 'styles deduped', span: 6, icon: 'compress' }),
          step({ n: 1, title: 'Author', desc: 'Write JSX.', span: 6 }),
        ]),
        <row gap={12} pad={0} wrap>
          {chip('Idempotent')}
          {chip('Themable')}
          {chip('Testable')}
        </row>,
        logoStrip(['Acme', 'Globex', 'Initech'], { caption: 'RUNS EVERYWHERE' }),
      ],
    })}
    {section({
      bg: '#ffffff',
      header: { eyebrow: 'DATA', title: 'Charts and mocks' },
      children: [
        <row gap={20} pad={0} wrap>
          <col pad={0} w={280}>{lineChart([10, 40, 30, 70, 95], { accent: '#7C3AED' })}</col>
          <col pad={0} w={200}>{donut(64, { accent: '#7C3AED', label: 'adoption' })}</col>
          <col pad={0} w={280}>{barChart([20, 55, 90], { accent: '#7C3AED', label: 'Throughput' })}</col>
        </row>,
        <row gap={20} pad={0} wrap>
          <col pad={0} w={300}>{browserMock('kitchenx.dev', { accent: '#7C3AED' })}</col>
          <col pad={0} w={300}>{chatMock([['Does it scale?', 0], ['Yes — N pages, one registry.', 1]])}</col>
        </row>,
        testimonial({ quote: 'The suite caught bugs we shipped for weeks.', name: 'Dana', role: 'Eng Lead' }),
        <img src={`${process.env.WP_URL || 'http://localhost:8915'}/wp-includes/images/media/default.png`} alt="decorative probe" w={64} h={64} />,
      ],
    })}
    {section({
      id: 'media-lab', bg: '#ffffff',
      header: { eyebrow: 'MEDIA', title: 'Interactive widgets' },
      children: [
        divider({ width: SZ(100, '%'), height: SZ(2), background: { $$type: 'background', value: { color: { $$type: 'color', value: '#E6E1F2' } } } }),
        tabs([
          { label: 'Tab Alpha', content: [para('Alpha panel content.', sx({ size: 15 }))] },
          { label: 'Tab Beta', content: [para('Beta panel content.', sx({ size: 15 }))] },
        ]),
        <row gap={20} pad={0} wrap>
          <col pad={0} w={360}>{youtube('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { rel: false })}</col>
          <col pad={0} w={360}>{video(`${process.env.WP_URL || 'http://localhost:8915'}/wp-content/uploads/exjsx-sample.mp4`, { controls: true, mute: true, preload: 'metadata' })}</col>
        </row>,
      ],
    })}
    <section pad={[70, 24]} bg={theme.color.ink} id="xss-lab">
      <box maxw={900} center gap={12} pad={0}>
        <h2 color="#ffffff" size={30} animate={{ effect: 'fade', trigger: 'load', duration: 500 }}>{'Content lab <script>alert(9101)</script> end'}</h2>
        <text color="#B9B4C7" size={15}>{'Injection probe <img src=x onerror=alert(9102)> and an <em>accent</em> that SHOULD render.'}</text>
      </box>
    </section>
    {ctaBand({
      eyebrow: 'READY?', title: 'Deploy the whole library', body: 'One bundle. Two kit writes.',
      buttons: [{ text: 'Start now', href: '/exjsx-k-alpha/' }, { text: 'Talk to us', href: '/exjsx-k-beta/' }],
      bg: '#2A1B54', accent: '#7C3AED',
    })}
    {footer({
      brand: 'KitchenX', blurb: 'A fixture that proves the parity engine.',
      cols: [
        { title: 'Product', links: [{ text: 'Features', href: '/exjsx-k-alpha/' }, { text: 'Pricing', href: '/exjsx-k-beta/' }] },
        { title: 'Company', links: [{ text: 'About', href: '/exjsx-k-gamma/' }] },
      ],
      bg: '#17151F',
    })}
  </box>
);

/* data-driven satellite pages — same Card class across all of them */
const Feature = ({ label, blurb }) => (
  <section pad={[70, 24]}>
    <box maxw={860} center gap={18} pad={0}>
      <h2 cls="k-title" color={theme.color.ink} size={34}>{label}</h2>
      <text cls="k-blurb" color={theme.color.muted} size={16} lh={1.6}>{blurb}</text>
      {card({ icon: 'check', title: label, desc: blurb, href: '/exjsx-k-home/' })}
      <text href="/exjsx-k-home/" color={theme.color.brand} weight={600}>Back to the kitchen →</text>
    </box>
  </section>
);

const satellites = fromData(
  [
    { slug: 'exjsx-k-alpha', label: 'Alpha speed', blurb: 'Builds compile offline in milliseconds.' },
    { slug: 'exjsx-k-beta', label: 'Beta scale', blurb: 'N pages share one deduped registry.' },
    { slug: 'exjsx-k-gamma', label: 'Gamma theme', blurb: 'Swap the theme, re-skin the site.' },
  ],
  (r) => ({ title: r.label, slug: r.slug, node: <Feature label={r.label} blurb={r.blurb} /> }),
);

export default defineSite({
  name: 'exjsx-kitchen',
  theme,
  pages: [{ title: 'K Home', slug: 'exjsx-k-home', node: <Home /> }, ...satellites],
});
