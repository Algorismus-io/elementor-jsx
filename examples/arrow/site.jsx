import { defineSite } from '../../src/site.mjs';
import { arrow } from './theme.mjs';
import { FONT_CSS } from './fonts.mjs';

/* Arrow AI home — faithful rebuild of the live staging site (tryreachwise.space) as elementor-jsx.
   Colors/type/copy reverse-engineered from the live DOM. Build with --inline (self-contained, free
   Elementor). Fonts (Geist + Manrope) self-hosted as data-URI woff2 pulled from the live site.
   All images sideloaded onto :8915 (exjsx-arw-*) so nothing hotlinks. */

const RED = '#E01118', REDHI = '#ff3b3b', BG = '#07071C', PANEL = '#12122a', MUTED = 'rgba(255,255,255,0.66)', LINE = 'rgba(255,255,255,0.08)';
const HEAD = 'Geist', BODY = 'Geist';
const HOST = 'http://localhost:8915/wp-content/uploads/2026/07';
const IMG = {
  team: `${HOST}/exjsx-arw-team.jpg`,
  net: `${HOST}/exjsx-arw-net.jpg`,
  desk: `${HOST}/exjsx-arw-desk.jpg`,
  laptop: `${HOST}/exjsx-arw-laptop.jpg`,
  viz: `${HOST}/exjsx-arw-viz.jpg`,
};
const LOGO = `${HOST}/exjsx-arw-logo.png`;

/* ── primitives ── */
const Sec = ({ bg, pad = [100, 24], maxw = 1320, gap = 28, align = 'flex-start', raw, children }) => (
  <box tag="section" w="100%" bg={bg} pad={pad} align="center" raw={raw}>
    <box w="100%" maxw={maxw} center pad={0} gap={gap} align={align}>{children}</box>
  </box>
);
const Eyebrow = ({ ta, children }) => (
  <text weight={600} size={12} ls={0.2} color={REDHI} ta={ta} raw="text-transform:uppercase;">{children}</text>
);
const AH = ({ tag = 'h2', size = 52, ls = -0.02, ta, mobile, maxw, children }) => (
  <heading tag={tag} color="#fff" size={size} weight={700} font={HEAD} lh={1.05} ls={ls} ta={ta} mobile={mobile} maxw={maxw}
    raw="& span{color:#E01118;}">{children}</heading>
);
const Btn = ({ label, kind = 'solid', href }) => (
  <box dir="row" w="hug" align="center" justify="center" href={href}
    bg={kind === 'solid' ? RED : kind === 'dark' ? BG : 'rgba(0,0,0,0)'}
    pad={kind === 'text' ? [13, 2] : [13, 26]}
    border={kind === 'ghost' ? [1, 'rgba(255,255,255,0.3)'] : undefined}>
    <text color={kind === 'ctatext' ? BG : '#fff'} weight={600} size={12} ls={0.12} raw="text-transform:uppercase;white-space:nowrap;">{label}</text>
  </box>
);
const Img = ({ src, ar = '558 / 348' }) => (
  <box pad={0} w="100%"><html raw={`<img src="${src}" alt="" style="display:block;width:100%;height:100%;object-fit:cover;aspect-ratio:${ar};" />`} /></box>
);

/* ── data ── */
const NAV = ['HOME', 'ABOUT', 'SERVICES', 'INDUSTRIES', 'PLATFORM'];
const PILLS = ['MACHINE LEARNING', 'DATA SCIENCE', 'GENERATIVE AI', 'LARGE LANGUAGE MODELS', 'PREDICTIVE ANALYTICS', 'COMPUTER VISION'];
const SERVICES = [
  ['01', 'AI Strategy & Consulting', 'A practical AI roadmap aligned with your business objectives — AI readiness assessment, digital transformation strategy, opportunity identification, technology selection, governance and ROI analysis.', IMG.team],
  ['02', 'Artificial Intelligence Solutions', 'AI-powered applications built for industrial environments — predictive analytics, machine learning models, generative AI, AI agents, LLM integration, computer vision and decision support.', IMG.net],
  ['03', 'Data Science & Advanced Analytics', 'Turn industrial data into business insight — data engineering, predictive modeling, time-series forecasting, digital-twin analytics, interactive dashboards and business intelligence.', IMG.desk],
  ['04', 'Software Development', 'Custom enterprise software for engineering-intensive industries — desktop, web, cloud and mobile applications, engineering simulation, API development and enterprise integration.', IMG.laptop],
];
const INDUSTRIES = [
  ['01', 'Oil & Gas Operators', 'AI and analytics for exploration, drilling, production and asset optimization across conventional and unconventional assets.'],
  ['02', 'National & International Oil Companies', 'Enterprise-scale AI, data platforms and digital transformation for major upstream and integrated energy operators.'],
  ['03', 'Drilling Contractors', 'Predictive maintenance, real-time monitoring and performance analytics to reduce non-productive time and improve drilling performance.'],
  ['04', 'Oilfield Service Companies', 'Intelligent automation and decision-support tools that boost efficiency and preserve engineering knowledge.'],
  ['05', 'Reservoir & Carbon Storage Operators', 'Digital-twin analytics and machine learning for reservoir management and safe long-term CO₂ storage.'],
  ['06', 'Engineering & Research Organizations', 'Applied AI, data science and simulation software for engineering consultancies and research teams.'],
];
const CHECKS = ['Core 3D Geomechanics module — model building & visualization', 'Drilling Geomechanics', 'Reservoir Geomechanics', 'Unconventional Reservoir Geomechanics'];
const FOOT = {
  company: [['Home', '/arrow-home/'], ['About', '/arrow-about/'], ['Services', '/arrow-services/'], ['Industries', '/arrow-industries/'], ['Platform', '/arrow-platform/'], ['Contact', '/arrow-contact-us/'], ['Careers', '/arrow-about/#careers']],
  services: [['AI Strategy & Consulting', '/arrow-services/'], ['Artificial Intelligence Solutions', '/arrow-services/'], ['Data Science & Analytics', '/arrow-services/'], ['Software Development', '/arrow-services/'], ['SigmaX™ Platform', '/arrow-platform/']],
  touch: [['info@arrowai.com', 'mailto:info@arrowai.com'], ['www.arrowai.com', '/arrow-home/'], ['Request a Demo', '/arrow-request-a-demo/'], ['Talk to Our Experts', '/arrow-contact-us/']],
};

/* ── sections ── */
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
  .axnav{position:sticky;top:0;z-index:60;background:rgba(7,7,28,.92);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.08);font-family:Geist,sans-serif}
  .axnav-in{max-width:1320px;margin:0 auto;display:flex;align-items:center;gap:28px;padding:16px 24px}
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

const Announce = (
  <box tag="section" w="100%" bg="#0A0A20" pad={0} align="center" raw="border-bottom:1px solid rgba(255,255,255,0.06);">
    <box dir="row" w="100%" maxw={1320} center align="center" justify="space-between" pad={[11, 24]}>
      <box dir="row" gap={12} align="center" pad={0}>
        <box pad={[3, 8]} bg={RED} w="hug"><text color="#fff" size={10} weight={800} ls={0.08} raw="text-transform:uppercase;">NEW</text></box>
        <text color="rgba(255,255,255,0.7)" size={13}>Now driving innovation through Artificial Intelligence — Arrow AI</text>
      </box>
      <text color={RED} size={13} weight={700} w="hug" href="/arrow-platform/" raw="white-space:nowrap;" mobile={{ display: 'none' }}>Explore the platform →</text>
    </box>
  </box>
);

const Hero = (
  <Sec bg={BG} pad={[100, 24, 110, 24]} gap={26}
    raw="background-image:radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);background-size:24px 24px;">
    <Eyebrow>ARTIFICIAL INTELLIGENCE · MACHINE LEARNING · DATA ANALYTICS</Eyebrow>
    <AH tag="h1" size={80} ls={-0.03} maxw={760} mobile={{ size: 40 }}>{'Driving Innovation Through <span>Artificial Intelligence</span>'}</AH>
    <text color="rgba(255,255,255,0.82)" size={18} lh={1.8} maxw={600}>Arrow AI is a technology consulting company specializing in Artificial Intelligence, Machine Learning, Data Analytics, Automation and industry-specific digital solutions that generate real business value.</text>
    <box dir="row" w="hug" gap={16} align="center" pad={0}>
      <Btn label="Request a Demo" kind="solid" href="/arrow-request-a-demo/" />
      <Btn label="Talk to Our Experts" kind="text" href="/arrow-contact-us/" />
    </box>
    <box dir="row" w="100%" gap={56} align="flex-start" pad={[24, 0, 0, 0]} raw="flex-wrap:wrap;">
      <box pad={0} gap={4} w="hug" align="flex-start"><heading tag="h3" color="#fff" size={30} weight={700} font={HEAD} lh={1} ls={-0.01}>5</heading><text color={MUTED} size={13} raw="text-transform:uppercase;">Core Service Lines</text></box>
      <box pad={0} gap={4} w="hug" align="flex-start"><heading tag="h3" color="#fff" size={30} weight={700} font={HEAD} lh={1} ls={-0.01}>13</heading><text color={MUTED} size={13} raw="text-transform:uppercase;">Core Technologies</text></box>
      <box pad={0} gap={4} w="hug" align="flex-start"><heading tag="h3" color="#fff" size={30} weight={700} font={HEAD} lh={1} ls={-0.01}>SigmaX™</heading><text color={MUTED} size={13} raw="text-transform:uppercase;">Flagship Product</text></box>
    </box>
  </Sec>
);

const Marquee = (
  <Sec bg={RED} pad={[110, 24]} maxw={1000} gap={22} align="center">
    <text color="rgba(255,255,255,0.85)" size={12.5} weight={700} ls={0.16} ta="center" raw="text-transform:uppercase;">INTELLIGENT SOLUTIONS FOR MODERN ENERGY COMPANIES</text>
    <heading tag="h2" color="#fff" size={70} weight={800} font={HEAD} lh={1.02} ls={-0.03} ta="center" mobile={{ size: 34 }}>Reduce Risk. Optimize Operations. Accelerate Decisions.</heading>
  </Sec>
);

const About = (
  <Sec bg={PANEL} pad={[100, 24]} maxw={980} gap={24} align="center">
    <Eyebrow ta="center">[ ABOUT US ]</Eyebrow>
    <AH size={48} ta="center" mobile={{ size: 30 }}>{'Intelligent solutions built on <span>expertise</span>'}</AH>
    <text color={MUTED} size={16} lh={1.7} ta="center" maxw={780}>We are a technology consulting company specializing in AI, machine learning, data analytics and automation. We combine deep domain expertise, advanced AI technologies and software engineering excellence to help organizations modernize operations and make smarter decisions.</text>
    <box dir="row" w="100%" wrap gap={14} justify="center" align="center" pad={[16, 0, 0, 0]}>
      {PILLS.flatMap((p, i) => (i
        ? [<text color={RED} size={9} w="hug" raw="align-self:center;">◆</text>, <text color="rgba(255,255,255,0.55)" size={12.5} weight={600} ls={0.06} w="hug" raw="text-transform:uppercase;">{p}</text>]
        : [<text color="rgba(255,255,255,0.55)" size={12.5} weight={600} ls={0.06} w="hug" raw="text-transform:uppercase;">{p}</text>]))}
    </box>
  </Sec>
);

const ServiceRow = ([num, title, desc, img], i) => {
  const txt = (
    <box pad={0} gap={14} align="flex-start" justify="center">
      <text color={RED} size={14} weight={800} font={HEAD}>{num}</text>
      <heading tag="h3" color="#fff" size={32} weight={800} font={HEAD} lh={1.1} mobile={{ size: 26 }}>{title}</heading>
      <text color={MUTED} size={15} lh={1.6} maxw={470}>{desc}</text>
      <text color={RED} size={14} weight={700} ls={0.02}>Read more →</text>
    </box>
  );
  const image = <Img src={img} />;
  return (
    <box w="100%" pad={i ? [76, 0, 28, 0] : [0, 0, 28, 0]} gridCols="1fr 1fr" gap={56} align="center" mobile={{ gridCols: 1 }}
      raw={i ? `border-top:1px solid ${LINE};` : ''}>
      {i % 2 === 0 ? [txt, image] : [image, txt]}
    </box>
  );
};
const Services = (
  <Sec bg={BG} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start">
      <Eyebrow>[ OUR SERVICES ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'Intelligent solutions, <span>end to end</span>'}</AH>
      <text color={MUTED} size={16} lh={1.6} maxw={620}>From AI strategy and machine learning to data science, software development and digital transformation — solutions for the full energy value chain.</text>
    </box>
    {SERVICES.map(ServiceRow)}
    <box pad={[24, 0, 0, 0]} w="hug"><Btn label="Explore All Services" kind="ghost" /></box>
  </Sec>
);

const IndCard = ([num, title, desc]) => (
  <box pad={32} gap={12} align="flex-start" h="100%" raw={`border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};`}>
    <text color={RED} size={13} weight={800} font={HEAD}>{num}</text>
    <heading tag="h3" color="#fff" size={22} weight={700} font={HEAD} lh={1.2}>{title}</heading>
    <text color={MUTED} size={14} lh={1.6}>{desc}</text>
  </box>
);
const Industries = (
  <Sec bg={PANEL} pad={[100, 24]} gap={44} align="flex-start">
    <box pad={0} gap={14} align="flex-start">
      <Eyebrow>[ WHO WE SERVE ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'Trusted across the <span>energy value chain</span>'}</AH>
    </box>
    <box w="100%" pad={0} gridCols={3} gap={0} mobile={{ gridCols: 1 }} raw={`border-top:1px solid ${LINE};border-left:1px solid ${LINE};`}>
      {INDUSTRIES.map(IndCard)}
    </box>
    <box pad={0} w="hug"><Btn label="View Industries" kind="ghost" /></box>
  </Sec>
);

const Flagship = (
  <Sec bg={BG} pad={[100, 24]} gap={0} align="flex-start">
    <box w="100%" pad={0} gridCols="1.05fr 0.95fr" gap={56} align="center" mobile={{ gridCols: 1 }}>
      <box pad={0} gap={20} align="flex-start">
        <Eyebrow>[ FLAGSHIP PRODUCT ]</Eyebrow>
        <AH size={44} mobile={{ size: 28 }}>{'SigmaX™ — Advanced <span>Reservoir Geomechanics</span> Platform'}</AH>
        <text color={MUTED} size={15} lh={1.6} maxw={520}>A 3D reservoir geomechanics platform that turns complex subsurface data into practical engineering insight — covering the entire asset lifecycle from exploration and drilling to production, injection and abandonment.</text>
        <box pad={[8, 0, 0, 0]} gap={14} w="100%" align="flex-start">
          {CHECKS.map((c) => (
            <box dir="row" w="100%" gap={12} align="flex-start" pad={0}>
              <text color={RED} size={16} weight={800} w="hug">✓</text>
              <text color="rgba(255,255,255,0.9)" size={15} lh={1.5}>{c}</text>
            </box>
          ))}
        </box>
        <box pad={[8, 0, 0, 0]} w="hug"><Btn label="Explore the Platform" kind="solid" href="/arrow-platform/" /></box>
      </box>
      <Img src={IMG.viz} ar="509 / 637" />
    </box>
  </Sec>
);

/* On-brand faux-dashboard visuals for the 3 SigmaX modules (no real UI shots to embed). */
const MODS = [
  ['Drilling Geomechanics', 'Wellbore stability, mud-weight windows and real-time drilling-risk analysis.'],
  ['Reservoir Geomechanics', '3D model building, stress-field mapping and depletion analysis.'],
  ['Unconventional Geomechanics', 'Fracture modeling, completion design and production insight.'],
];
const mockUI = () => `<div style="aspect-ratio:16/10;background:linear-gradient(135deg,#0c0c24,#161638);position:relative;overflow:hidden">
  <div style="height:26px;background:rgba(255,255,255,.04);display:flex;align-items:center;gap:6px;padding:0 11px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="width:8px;height:8px;border-radius:9px;background:#E01118"></span><span style="width:8px;height:8px;border-radius:9px;background:rgba(255,255,255,.18)"></span><span style="width:8px;height:8px;border-radius:9px;background:rgba(255,255,255,.18)"></span></div>
  <div style="position:absolute;inset:26px 0 0;display:flex">
    <div style="width:34%;border-right:1px solid rgba(255,255,255,.06);padding:13px;display:flex;flex-direction:column;gap:8px">${[72,52,62,46,58].map((w) => `<span style="height:6px;width:${w}%;background:rgba(255,255,255,.13);border-radius:3px"></span>`).join('')}</div>
    <div style="flex:1;padding:15px;display:flex;align-items:flex-end;gap:9px">${[42,72,56,92,60,80].map((h) => `<span style="flex:1;height:${h}%;background:linear-gradient(#E01118,#ff3b3b);border-radius:3px 3px 0 0;opacity:.85"></span>`).join('')}</div>
  </div></div>`;
const Software = (
  <Sec bg={PANEL} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start">
      <Eyebrow>[ INSIDE SIGMAX ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'A closer look at the <span>software</span>'}</AH>
      <text color={MUTED} size={16} lh={1.6} maxw={620}>Purpose-built modules for the full 3D geomechanics workflow — model building, visualization and analysis across the asset lifecycle.</text>
    </box>
    <box w="100%" pad={0} gridCols={3} gap={24} mobile={{ gridCols: 1 }}>
      {MODS.map(([t, d]) => (
        <box pad={0} gap={0} align="stretch" bg={BG} h="100%" raw="border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
          <html raw={mockUI()} />
          <box pad={20} gap={7} align="flex-start">
            <text color="#fff" size={15} weight={700} font={HEAD}>{t}</text>
            <text color={MUTED} size={13} lh={1.5}>{d}</text>
          </box>
        </box>
      ))}
    </box>
  </Sec>
);

const CTA = (
  <box tag="section" w="100%" bg={RED} pad={[110, 24]} align="center">
    <box w="100%" maxw={860} center pad={0} gap={30} align="center">
      <text color="rgba(255,255,255,0.88)" size={12} weight={600} ls={0.18} ta="center" raw="text-transform:uppercase;">Driving Innovation Through Artificial Intelligence</text>
      <heading tag="h2" color="#fff" size={62} weight={700} font={HEAD} lh={1.05} ta="center" maxw={640} mobile={{ size: 36 }}>Ready to build the future together?</heading>
      <box dir="row" w="hug" gap={16} align="center" justify="center" pad={[10, 0, 0, 0]}>
        <Btn label="Request a Consultation" kind="dark" href="/arrow-request-a-demo/" />
        <Btn label="Schedule a Demo" kind="ctatext" href="/arrow-request-a-demo/" />
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
    <box w="100%" maxw={1320} center pad={0} gap={40} align="stretch">
      <box dir="row" w="100%" gap={56} align="flex-start" justify="space-between" pad={0} raw="flex-wrap:wrap;">
        <box pad={0} gap={16} align="flex-start" maxw={360}>
          <heading tag="h3" color="#fff" size={26} weight={800} font={HEAD} raw="& span{color:#E01118;}">{'Arrow<span>AI</span>'}</heading>
          <text color="rgba(255,255,255,0.6)" size={14} lh={1.6}>AI strategy, machine learning, data science, software and digital transformation that help energy companies reduce risk, improve efficiency and accelerate decisions.</text>
          <text color="rgba(255,255,255,0.4)" size={12.5} lh={1.6}>Artificial Intelligence · Machine Learning · Data Science · LLMs · Cloud · Digital Twins · Software Development · Digital Transformation</text>
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

export const ArrowHome = () => [
  <html raw={`<style>${FONT_CSS}</style>`} />,
  <html raw="<style>html,body{background:#07071C!important;margin:0;font-family:'Geist',sans-serif!important;} *{box-sizing:border-box;} .elementor .e-paragraph-base,.elementor p,.elementor .e-heading-base,.elementor h1,.elementor h2,.elementor h3,.elementor h4,.axnav,.axnav *{font-family:'Geist',sans-serif!important;}</style>" />,
  Nav, Announce, Hero, Marquee, About, Services, Industries, Flagship, Software, CTA, Footer,
];

export default defineSite({
  name: 'arrow',
  theme: arrow,
  pages: [{ title: 'Arrow AI — Home (exjsx)', slug: 'arrow-home', node: <ArrowHome /> }],
});
