import { defineSite } from '../../src/site.mjs';
import { arrow } from './theme.mjs';
import { FONT_CSS } from './fonts.mjs';

/* Arrow AI — Industries page. Faithful rebuild of live https://tryreachwise.space/industries/ as
   elementor-jsx. Standalone defineSite (own page file, no edits to site.jsx/theme.mjs). Bespoke
   components stay inline here. Build with --inline (self-contained, free Elementor). Reuses the arrow
   theme + Geist/Manrope fonts + the same nav/footer/patterns as the home build for consistency.
   Only image on the live page is the logo (all cards are text) — sideloaded as exjsx-arw-ind-1. */

const RED = '#E01118', BG = '#07071C', PANEL = '#12122a', MUTED = '#8A8B9E', LINE = 'rgba(255,255,255,0.08)';
const HEAD = 'Geist', BODY = 'Manrope';
const HOST = 'http://localhost:8915/wp-content/uploads/2026/07';
const LOGO = `${HOST}/exjsx-arw-logo.png`;

/* ── primitives (mirror the home build for a consistent shell) ── */
const Sec = ({ bg, pad = [96, 24], maxw = 1200, gap = 28, align = 'flex-start', raw, children }) => (
  <box tag="section" w="100%" bg={bg} pad={pad} align="center" raw={raw}>
    <box w="100%" maxw={maxw} center pad={0} gap={gap} align={align}>{children}</box>
  </box>
);
const Eyebrow = ({ ta, children }) => (
  <text weight={700} size={13} ls={0.12} color={RED} ta={ta} raw="text-transform:uppercase;">{children}</text>
);
const AH = ({ tag = 'h2', size = 50, ta, mobile, maxw, children }) => (
  <heading tag={tag} color="#fff" size={size} weight={800} font={HEAD} lh={1.05} ta={ta} mobile={mobile} maxw={maxw}
    raw="& span{color:#E01118;}">{children}</heading>
);
const Btn = ({ label, kind = 'solid', href }) => (
  <box dir="row" w="hug" align="center" justify="center" href={href}
    bg={kind === 'solid' ? RED : kind === 'dark' ? BG : 'rgba(0,0,0,0)'}
    pad={kind === 'text' ? [14, 2] : [16, 30]}
    border={kind === 'ghost' ? [1, 'rgba(255,255,255,0.3)'] : undefined}>
    <text color={kind === 'ctatext' ? BG : '#fff'} weight={700} size={13} ls={0.06} raw="text-transform:uppercase;white-space:nowrap;">{label}</text>
  </box>
);

/* ── data ── */
const NAV = ['HOME', 'ABOUT', 'SERVICES', 'INDUSTRIES', 'PLATFORM'];
const CLIENTS = [
  ['01', 'Oil & Gas Operators', 'AI and analytics across exploration, drilling, production and asset optimization.'],
  ['02', 'National Oil Companies', 'Enterprise-scale AI, data platforms and digital transformation for state energy portfolios.'],
  ['03', 'International Oil Companies', 'Integrated AI and analytics for global upstream and integrated operations.'],
  ['04', 'Drilling Contractors', 'Real-time monitoring and predictive analytics that reduce non-productive time.'],
  ['05', 'Oilfield Service Companies', 'Intelligent automation and decision support that preserve engineering knowledge.'],
  ['06', 'Reservoir Consultants', 'Advanced reservoir geomechanics, modeling and analytics for confident recommendations.'],
  ['07', 'Carbon Storage Operators', 'Machine learning and digital-twin analytics for safe, long-term CO₂ storage.'],
  ['08', 'Engineering Consultancies', 'Custom engineering software, simulation and applied AI for technical teams.'],
  ['09', 'Research Organizations', 'Applied AI, data science and machine learning for energy research programs.'],
];
const BENEFITS = [
  'Reduce engineering effort', 'Improve drilling performance', 'Detect operational anomalies',
  'Predict equipment failures', 'Improve production efficiency', 'Reduce non-productive time',
  'Preserve engineering knowledge', 'Increase operational safety', 'Enhance collaboration',
  'Accelerate decision making',
];
const FOOT = {
  company: [['Home', '/arrow-home/'], ['About', '/arrow-about/'], ['Services', '/arrow-services/'], ['Industries', '/arrow-industries/'], ['Platform', '/arrow-platform/'], ['Contact', '/arrow-contact-us/'], ['Careers', '/arrow-about/#careers']],
  services: [['AI Strategy & Consulting', '/arrow-services/'], ['Artificial Intelligence Solutions', '/arrow-services/'], ['Data Science & Analytics', '/arrow-services/'], ['Software Development', '/arrow-services/'], ['SigmaX™ Platform', '/arrow-platform/']],
  touch: [['info@arrowai.com', 'mailto:info@arrowai.com'], ['www.arrowai.com', '/arrow-home/'], ['Request a Demo', '/arrow-request-a-demo/'], ['Talk to Our Experts', '/arrow-contact-us/']],
};

/* ── shell ── */
/* Linked nav with a working mobile drawer (self-contained html widget → survives --inline). */
const Nav = (
  <html raw={`<nav class="axnav"><div class="axnav-in">
  <a class="axnav-logo" href="/arrow-home/"><img src="${LOGO}" alt="Arrow AI"/></a>
  <div class="axnav-links"><a href="/arrow-home/">HOME</a><a href="/arrow-about/">ABOUT</a><a href="/arrow-services/">SERVICES</a><a href="/arrow-industries/">INDUSTRIES</a><a href="/arrow-platform/">PLATFORM</a></div>
  <a class="axnav-cta" href="/arrow-request-a-demo/">Request a Demo</a>
  <button class="axnav-burger" aria-label="Menu" onclick="this.closest('.axnav').classList.toggle('open')"><span></span><span></span><span></span></button>
  </div>
  <div class="axnav-mobile"><a href="/arrow-home/">Home</a><a href="/arrow-about/">About</a><a href="/arrow-services/">Services</a><a href="/arrow-industries/">Industries</a><a href="/arrow-platform/">Platform</a><a href="/arrow-contact-us/">Contact</a><a class="axnav-cta" href="/arrow-request-a-demo/">Request a Demo</a></div></nav>
  <style>
  .axnav{position:sticky;top:0;z-index:60;background:rgba(7,7,28,.92);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.08);font-family:Manrope,sans-serif}
  .axnav-in{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:28px;padding:16px 24px}
  .axnav-logo{margin-right:auto;display:flex}.axnav-logo img{height:26px;width:auto;display:block}
  .axnav-links{display:flex;gap:28px}
  .axnav-links a{color:rgba(255,255,255,.85);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
  .axnav-links a:hover{color:#fff}
  .axnav-cta{background:#E01118;color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:12px 22px;white-space:nowrap}
  .axnav-burger{display:none;flex-direction:column;gap:5px;background:none;border:0;cursor:pointer;padding:4px}
  .axnav-burger span{width:24px;height:2px;background:#fff;display:block}
  .axnav-mobile{display:none}
  @media(max-width:820px){.axnav-links,.axnav-in>.axnav-cta{display:none}.axnav-burger{display:flex}
    .axnav.open .axnav-mobile{display:flex;flex-direction:column;padding:8px 24px 22px;border-top:1px solid rgba(255,255,255,.08)}
    .axnav-mobile a{color:#fff;text-decoration:none;font-size:17px;font-weight:600;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.08)}
    .axnav-mobile a.axnav-cta{background:#E01118;text-align:center;border:0;margin-top:14px;padding:15px;text-transform:uppercase;font-size:13px}}
  </style>`} />
);

const Hero = (
  <Sec bg={BG} pad={[100, 24, 96, 24]} gap={26}
    raw="background-image:radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);background-size:24px 24px;">
    <Eyebrow>[ WHO WE SERVE ]</Eyebrow>
    <AH tag="h1" size={76} maxw={860} mobile={{ size: 38 }}>{'Trusted Across the <span>Energy Sector</span>'}</AH>
    <text color={MUTED} size={18} lh={1.6} maxw={720}>From oil &amp; gas operators to national oil companies, drilling contractors and carbon storage operators, we bring Artificial Intelligence and data science to the entire energy value chain.</text>
    <box dir="row" w="hug" gap={16} align="center" pad={[8, 0, 0, 0]}>
      <Btn label="View Our Services" kind="solid" href="/arrow-services/" />
      <Btn label="Request a Demo" kind="text" href="/arrow-request-a-demo/" />
    </box>
  </Sec>
);

const ClientCard = ([num, title, desc]) => (
  <box pad={32} gap={12} align="flex-start" h="100%" raw={`border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};`}>
    <text color={RED} size={13} weight={800} font={HEAD}>{num}</text>
    <heading tag="h2" color="#fff" size={22} weight={700} font={HEAD} lh={1.2}>{title}</heading>
    <text color={MUTED} size={14} lh={1.6}>{desc}</text>
  </box>
);
const Clients = (
  <Sec bg={PANEL} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={820}>
      <Eyebrow>[ CLIENTS ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'Trusted <span>by</span>'}</AH>
      <text color={MUTED} size={16} lh={1.6} maxw={760}>From national and international oil companies to drilling contractors, oilfield service companies, reservoir consultants, carbon storage operators, engineering consultancies and research organizations.</text>
    </box>
    <box w="100%" pad={0} gridCols={3} gap={0} mobile={{ gridCols: 1 }} raw={`border-top:1px solid ${LINE};border-left:1px solid ${LINE};`}>
      {CLIENTS.map(ClientCard)}
    </box>
  </Sec>
);

const WhyAI = (
  <Sec bg={BG} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={820}>
      <Eyebrow>[ WHY AI FOR OIL &amp; GAS ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'AI is changing how <span>energy operates</span>'}</AH>
      <text color={MUTED} size={16} lh={1.6} maxw={720}>Artificial Intelligence is changing the way energy companies operate. Our solutions enable organizations to:</text>
    </box>
    <box w="100%" pad={0} gridCols={2} gap={0} mobile={{ gridCols: 1 }} raw={`border-top:1px solid ${LINE};border-left:1px solid ${LINE};`}>
      {BENEFITS.map((b, i) => (
        <box dir="row" w="100%" gap={14} align="center" pad={[22, 28]} h="100%" raw={`border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};`}>
          <text color={RED} size={13} weight={800} font={HEAD} w="hug">{String(i + 1).padStart(2, '0')}</text>
          <text color="rgba(255,255,255,0.9)" size={16} lh={1.4} weight={600}>{b}</text>
        </box>
      ))}
    </box>
  </Sec>
);

const CTA = (
  <box tag="section" w="100%" bg={RED} pad={[110, 24]} align="center">
    <box w="100%" maxw={880} center pad={0} gap={28} align="center">
      <text color="rgba(255,255,255,0.88)" size={12} weight={600} ls={0.18} ta="center" raw="text-transform:uppercase;">Driving Innovation Through Artificial Intelligence</text>
      <heading tag="h2" color="#fff" size={64} weight={800} font={HEAD} lh={1.05} ta="center" maxw={720} mobile={{ size: 34 }}>Intelligent solutions for your operations</heading>
      <box dir="row" w="hug" gap={16} align="center" justify="center" pad={[10, 0, 0, 0]}>
        <Btn label="Request a Demo" kind="dark" href="/arrow-request-a-demo/" />
        <Btn label="Talk to Our Experts" kind="ctatext" href="/arrow-contact-us/" />
      </box>
    </box>
  </box>
);

const FootCol = (title, links) => (
  <box pad={0} gap={14} align="flex-start" w="hug">
    <heading tag="h4" color="rgba(255,255,255,0.9)" size={12} weight={700} font={HEAD} ls={0.1} raw="text-transform:uppercase;">{title}</heading>
    {links.map(([l, href]) => <text color="rgba(255,255,255,0.55)" size={14} lh={1.4} href={href} raw="& a{color:inherit;}&:hover{color:rgba(255,255,255,0.9);}">{l}</text>)}
  </box>
);
const Footer = (
  <box tag="section" w="100%" bg={BG} pad={[104, 24, 40, 24]} align="center" raw={`border-top:1px solid ${LINE};`}>
    <box w="100%" maxw={1200} center pad={0} gap={40} align="stretch">
      <box dir="row" w="100%" gap={56} align="flex-start" justify="space-between" pad={0} raw="flex-wrap:wrap;">
        <box pad={0} gap={16} align="flex-start" maxw={360}>
          <heading tag="h3" color="#fff" size={26} weight={800} font={HEAD} raw="& span{color:#E01118;}">{'Arrow<span>AI</span>'}</heading>
          <text color="rgba(255,255,255,0.6)" size={14} lh={1.6}>AI, machine learning, data science, software and digital transformation solutions that help energy companies reduce risk, improve efficiency and accelerate decisions across operations.</text>
          <text color="rgba(255,255,255,0.4)" size={12.5} lh={1.6}>Artificial Intelligence · Machine Learning · Data Science · Software Development · Oil &amp; Gas · Energy · Cloud · Digital Twins</text>
          <box dir="row" gap={10} w="hug" pad={[8, 0, 0, 0]}>
            {['in', '▶', '𝕏'].map((s) => <box pad={0} w={40} h={40} align="center" justify="center" raw="border:1px solid rgba(255,255,255,0.15);"><text color="rgba(255,255,255,0.7)" size={13}>{s}</text></box>)}
          </box>
        </box>
        {FootCol('Company', FOOT.company)}
        {FootCol('Services', FOOT.services)}
        {FootCol('Get in Touch', FOOT.touch)}
      </box>
      <box dir="row" w="100%" pad={[24, 0, 0, 0]} align="center" justify="space-between" raw={`border-top:1px solid ${LINE};flex-wrap:wrap;`}>
        <text color="rgba(255,255,255,0.45)" size={13}>© 2026 Arrow AI. All rights reserved.</text>
        <text color={RED} size={12.5} weight={700} ls={0.08} w="hug" raw="text-transform:uppercase;" mobile={{ ta: 'left' }}>Driving Innovation Through Artificial Intelligence</text>
      </box>
    </box>
  </box>
);

export const ArrowIndustries = () => [
  <html raw={`<style>${FONT_CSS}</style>`} />,
  <html raw="<style>html,body{background:#07071C!important;margin:0;} *{box-sizing:border-box;}</style>" />,
  Nav, Hero, Clients, WhyAI, CTA, Footer,
];

export default defineSite({
  name: 'arrow-industries',
  theme: arrow,
  pages: [{ title: 'Arrow AI — Industries (exjsx)', slug: 'arrow-industries', node: <ArrowIndustries /> }],
});
