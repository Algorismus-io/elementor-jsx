/**
 * components/index.jsx — generic, theme-aware components. ZERO brand literals: every color/radius/
 * font/space comes from `theme` (2nd arg, from render context). Swap the theme → the whole set re-skins.
 * Intrinsics used (from the runtime): <box>/<row>/<section>/<h1..3>/<text>/<html>/<img>, props = sx shorthand.
 */
import { navBar, browserMock, chatMock, lineChart, donut } from '../kit/kit-components.mjs';

export const Page = ({ children }) => children; // sections stay top-level (Fragment-like)

export const Section = ({ id, bg, eyebrow, title, body, align = 'flex-start', children }, { theme: t }) => (
  <section cls="section" id={id} bg={bg} pad={[t.space(9), t.space(5)]} align="center" w="100%">
    <box cls="wrap" w="100%" maxw={1200} center gap={t.space(7)} align={align} pad={0}>
      {(eyebrow || title || body) && (
        <box gap={t.space(3)} align={align === 'center' ? 'center' : 'flex-start'} pad={0}>
          {eyebrow && <text cls="eyebrow" weight={700} size={12.5} ls={0.12} color={t.color.muted} ta={align === 'center' ? 'center' : 'left'}>{eyebrow}</text>}
          {title && <h2 cls="h2" color={t.color.primary} size={44} weight={800} font={t.font.head} lh={1.05} ta={align === 'center' ? 'center' : 'left'}>{title}</h2>}
          {body && <text cls="body" color={t.color.muted} size={17} lh={1.6} maxw={620} ta={align === 'center' ? 'center' : 'left'}>{body}</text>}
        </box>
      )}
      {children}
    </box>
  </section>
);

export const Card = ({ title, desc, tint, ink, span, children }, { theme: t }) => (
  <box cls="card" span={span} bg={tint || t.color.surface} ink={ink} radius={t.radius('md')} pad={t.space(5)} gap={t.space(2)} align="flex-start" h="100%">
    {title && <h3 color={ink || t.color.ink} size={18} weight={700} font={t.font.head}>{title}</h3>}
    {desc && <text color={ink ? 'rgba(255,255,255,0.8)' : t.color.muted} size={14} lh={1.55}>{desc}</text>}
    {children}
  </box>
);

// Bento: a real atomic CSS grid (native props → works on FREE Elementor, unlike custom_css).
// Children carry `span` (native grid-column). Stacks to 1 col on mobile.
export const Bento = ({ cols = 12, gap, children }, { theme: t }) => (
  <box cls="bento" w="100%" pad={0} gridCols={cols} gap={gap ?? t.space(5)} mobile={{ gridCols: 1 }}>{children}</box>
);

export const Stat = ({ value, label, tint, ink }, { theme: t }) => (
  <box cls="stat" bg={tint || t.color.surface} radius={t.radius('sm')} pad={t.space(5)} gap={t.space(1)} align="flex-start" h="100%">
    <h3 color={ink || t.color.ink} size={40} weight={800} font={t.font.head} ls={-0.02}>{value}</h3>
    <text color={ink ? 'rgba(255,255,255,0.7)' : t.color.muted} size={13.5}>{label}</text>
  </box>
);

export const CTA = ({ eyebrow, title, body }, { theme: t }) => (
  <section cls="cta" bg={t.color.primary} pad={[t.space(9), t.space(5)]} align="center" w="100%">
    <box w="100%" maxw={820} center gap={t.space(4)} align="center" pad={0}>
      {eyebrow && <text weight={700} size={12.5} ls={0.12} color={t.color.accent} ta="center">{eyebrow}</text>}
      <h2 color={t.color.onPrimary || '#fff'} size={44} weight={800} font={t.font.head} ta="center">{title}</h2>
      {body && <text color="rgba(255,255,255,0.75)" size={17} lh={1.6} maxw={620} ta="center">{body}</text>}
    </box>
  </section>
);

export const Footer = ({ brand, blurb, cols = [] }, { theme: t }) => (
  <section cls="footer" bg={t.color.footer || t.color.primary} pad={[t.space(8), t.space(5)]} align="center" w="100%">
    <row w="100%" maxw={1200} center gap={t.space(8)} wrap>
      <box gap={t.space(3)} maxw={320} pad={0}>
        <h3 color="#fff" size={22} weight={800} font={t.font.head}>{brand}</h3>
        <text color="rgba(255,255,255,0.6)" size={14} lh={1.6}>{blurb}</text>
      </box>
      {cols.map((c) => (
        <box gap={t.space(2)} pad={0}>
          <text weight={700} size={12.5} ls={0.12} color="rgba(255,255,255,0.6)">{c.title}</text>
          {c.links.map((l) => <text color="rgba(255,255,255,0.6)" size={14}>{l}</text>)}
        </box>
      ))}
    </row>
  </section>
);

// Nav wraps the free-Elementor dropdown+hamburger kit component (an html widget with inline CSS →
// needs LITERAL colors, not variable refs, since Elementor variables only resolve inside atomic props).
export const Nav = ({ logo, links, ctas }, { theme: t }) => navBar({ logo, links, ctas, accent: t.lit.accent, ink: t.lit.primary });

export const Mock = { browser: browserMock, chat: chatMock, line: lineChart, donut };

/* ── data-driven page components ── */
// Layout: the shared site shell (nav + content + footer) — define once, wrap every page.
export const Layout = ({ nav, footer, children }, { theme: t }) => [
  <Nav {...nav} />, ...(Array.isArray(children) ? children : [children]), <Footer {...footer} />,
];

export const Hero = ({ eyebrow, title, sub, buttons = [] }, { theme: t }) => (
  <section cls="hero" bg={t.color.bg} pad={[t.space(9), t.space(5)]} align="center" w="100%">
    <box cls="wrap" w="100%" maxw={1200} center gap={t.space(4)} pad={0} align="flex-start">
      {eyebrow && <text cls="eyebrow" weight={700} size={12.5} ls={0.12} color={t.color.accent}>{eyebrow}</text>}
      <h1 cls="h1" color={t.color.primary} size={54} weight={800} font={t.font.head} lh={1.05} maxw={900}>{title}</h1>
      {sub && <text cls="lede" color={t.color.muted} size={19} lh={1.6} maxw={640}>{sub}</text>}
    </box>
  </section>
);

export const FeatureGrid = ({ title, items = [] }, { theme: t }) => (
  <Section title={title} bg={t.color.surface}>
    <Bento cols={12}>
      {items.map((it) => <Card span={6} title={it.title} desc={it.text} tint={t.color.bg} />)}
    </Bento>
  </Section>
);

export const FAQ = ({ title, items = [] }, { theme: t }) => (
  <Section title={title} bg={t.color.bg}>
    <box cls="faqlist" w="100%" gap={t.space(3)} pad={0}>
      {items.map((f) => (
        <box cls="faq" w="100%" bg={t.color.surface} radius={t.radius('md')} pad={t.space(5)} gap={t.space(2)} align="flex-start" border={[1, t.lit.line]}>
          <h3 cls="faq-q" color={t.color.ink} size={17} weight={700} font={t.font.head}>{f.q}</h3>
          <text cls="faq-a" color={t.color.muted} size={15} lh={1.6}>{f.a}</text>
        </box>
      ))}
    </box>
  </Section>
);

// RelatedLinks: cross-page navigation — chips linking to sibling generated pages (by slug).
export const RelatedLinks = ({ title, links = [] }, { theme: t }) => (
  <Section title={title} bg={t.color.surface}>
    <box cls="relgrid" w="100%" dir="row" wrap gap={t.space(3)} pad={0}>
      {links.map((l) => (
        <box cls="relchip" dir="row" bg={t.color.bg} radius={999} pad={[t.space(2), t.space(4)]} gap={t.space(2)} align="center" w="hug">
          <text cls="rellink" href={l.href} color={t.color.primary} size={14.5} weight={600}>{l.label}</text>
        </box>
      ))}
    </box>
  </Section>
);
