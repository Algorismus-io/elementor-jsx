/** Fixture site for pipeline + integration tests — exercises every intrinsic, theme tokens,
 * responsive variants, raw CSS, links, semantic classes, data-driven pages. */
import { defineSite, fromData } from '../../src/site.mjs';
import { defineTheme } from '../../src/theme.mjs';

const theme = defineTheme({
  name: 'exjsx-test',
  color: { primary: '#B31E2C', ink: '#101418', muted: '#5B6B72', surface: '#F4F6F8' },
  font: { head: 'Georgia', body: 'Verdana' },
  radius: { card: 18 },
});

const Card = ({ title, desc }) => (
  <box cls="t-card" bg="#ffffff" pad={22} radius={18} gap={8} border={[1, '#E2E6EA']}>
    <h3 color={theme.color.ink} size={19} weight={700}>{title}</h3>
    <text color={theme.color.muted} size={14} lh={1.55}>{desc}</text>
  </box>
);

const Home = () => (
  <section pad={[80, 24]} bg={theme.color.surface}>
    <box maxw={1080} center gap={32} pad={0}>
      <h1 cls="t-hero" color={theme.color.primary} font={theme.font.head} size={54} weight={800}
          ta="center" lh={1.08} ls={-0.02} mobile={{ size: 30 }}
          raw="text-transform:uppercase;">
        Parity Torture 9000
      </h1>
      <text ta="center" size={17} color={theme.color.muted} maxw={640} center>
        Every intrinsic, one page. {'&amp;'} entities survive.
      </text>
      <row gap={18} pad={0} wrap>
        <Card title="Alpha" desc="First card — identical style, shared class." />
        <Card title="Beta" desc="Second card — dedup proof." />
        <Card title="Gamma" desc="Third card — still one class." />
      </row>
      <box gridCols={3} gap={14} pad={0}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <text cls="t-cell" bg="#ffffff" pad={12} ta="center" size={13}>Cell {n}</text>
        ))}
      </box>
      <img src={Number(process.env.EXJSX_FIXTURE_IMG || 1583)} w="100%" h={180} fit="cover" radius={12} />
      <text href="/exjsx-t-branch/" color={theme.color.primary} weight={600} size={15}>Cross-page link →</text>
      <html raw={'<div id="exjsx-html-probe" style="height:4px"></div>'} />
    </box>
  </section>
);

const branchPages = fromData(
  [{ slug: 'exjsx-t-branch', label: 'Branch' }],
  (r) => ({
    title: `T ${r.label}`,
    slug: r.slug,
    node: (
      <section pad={[60, 24]}>
        <box maxw={900} center gap={20} pad={0}>
          <h2 color={theme.color.ink} size={36}>{r.label} page</h2>
          <Card title="Shared" desc="Same card class as the home page." />
        </box>
      </section>
    ),
  }),
);

export default defineSite({
  name: 'exjsx-test',
  theme,
  pages: [{ title: 'T Home', slug: 'exjsx-t-home', node: <Home /> }, ...branchPages],
});
