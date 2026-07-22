import { defineSite } from '../../src/site.mjs';
import { arrow } from './theme.mjs';
import { FONT_CSS } from './fonts.mjs';

/* Arrow AI — SERVICES page, faithful rebuild of https://tryreachwise.space/services/ as elementor-jsx.
   Self-contained inline build (--inline). Reuses the home theme tokens + Nav/Footer/CTA patterns for
   visual consistency. Service images sideloaded onto :8915 (exjsx-arw-services-1..5). Copy verbatim. */

const RED = '#E01118', BG = '#07071C', PANEL = '#12122a', MUTED = '#8A8B9E', LINE = 'rgba(255,255,255,0.08)';
const HEAD = 'Geist', BODY = 'Manrope';
const HOST = 'http://localhost:8915/wp-content/uploads/2026/07';
const LOGO = `${HOST}/exjsx-arw-logo.png`;
const S = (n) => `${HOST}/exjsx-arw-services-${n}.jpg`;

/* ── primitives (mirrored from the home build for a consistent look) ── */
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
const Img = ({ src, ar = '558 / 348' }) => (
  <box pad={0} w="100%"><html raw={`<img src="${src}" alt="" style="display:block;width:100%;height:100%;object-fit:cover;aspect-ratio:${ar};" />`} /></box>
);

/* ── data ── */
const NAV = ['HOME', 'ABOUT', 'SERVICES', 'INDUSTRIES', 'PLATFORM'];
const SERVICES = [
  ['01', 'AI Strategy & Consulting', 'Our experts can develop a practical AI roadmap aligned with your business objectives.', S(1),
    ['AI Readiness Assessment', 'Digital Transformation Strategy', 'AI Opportunity Identification', 'Technology Selection', 'AI Governance', 'ROI Analysis']],
  ['02', 'Artificial Intelligence Solutions', 'We design and develop AI-powered applications tailored for industrial environments.', S(2),
    ['Predictive Analytics', 'Machine Learning Models', 'Generative AI Applications', 'AI Agents', 'Large Language Model Integration', 'Intelligent Decision Support Systems', 'Computer Vision', 'Natural Language Processing', 'Knowledge Management Platforms']],
  ['03', 'Data Science & Advanced Analytics', 'We can turn industrial data into valuable business insights.', S(3),
    ['Data Engineering', 'Data Warehousing', 'Predictive Modeling', 'Statistical Analysis', 'Time Series Forecasting', 'Digital Twin Analytics', 'Interactive Dashboards', 'Business Intelligence', 'Data Visualization', 'KPI Monitoring']],
  ['04', 'Software Development', 'Custom enterprise software designed for engineering-intensive industries.', S(4),
    ['Desktop Applications', 'Web Applications', 'Cloud Platforms', 'Mobile Applications', 'Engineering Simulation Software', 'API Development', 'Database Design', 'Enterprise System Integration']],
  ['05', 'Digital Transformation', 'Accelerate your organization’s digital journey.', S(5),
    ['Digital Workflows', 'Cloud Migration', 'AI Automation', 'Smart Reporting', 'Process Optimization', 'Digital Asset Management', 'Workflow Automation', 'Operational Intelligence']],
];
const BENEFITS = ['Reduced engineering effort', 'Improved drilling performance', 'Operational anomaly detection', 'Predicted equipment failures', 'Improved production efficiency', 'Reduced non-productive time', 'Preserved engineering knowledge', 'Increased operational safety', 'Enhanced collaboration', 'Accelerated decision making'];
const FOOT = {
  company: [['Home', '/arrow-home/'], ['About', '/arrow-about/'], ['Services', '/arrow-services/'], ['Industries', '/arrow-industries/'], ['Platform', '/arrow-platform/'], ['Contact', '/arrow-contact-us/'], ['Careers', '/arrow-about/#careers']],
  services: [['AI Strategy & Consulting', '/arrow-services/'], ['Artificial Intelligence Solutions', '/arrow-services/'], ['Data Science & Analytics', '/arrow-services/'], ['Software Development', '/arrow-services/'], ['SigmaX™ Platform', '/arrow-platform/']],
  touch: [['info@arrowai.com', 'mailto:info@arrowai.com'], ['www.arrowai.com', '/arrow-home/'], ['Request a Demo', '/arrow-request-a-demo/'], ['Talk to Our Experts', '/arrow-contact-us/']],
};

/* ── shared shell ── */
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
  <Sec bg={BG} pad={[100, 24, 90, 24]} gap={24} maxw={900} align="flex-start"
    raw="background-image:radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);background-size:24px 24px;">
    <Eyebrow>[ OUR SERVICES ]</Eyebrow>
    <AH tag="h1" size={72} maxw={760} mobile={{ size: 40 }}>{'Intelligent Solutions, <span>End to End</span>'}</AH>
    <text color={MUTED} size={18} lh={1.6} maxw={680}>From AI strategy and machine learning to data science, software development and digital transformation — technology services for the full energy value chain.</text>
  </Sec>
);

const ServiceRow = ([num, title, desc, img, bullets], i) => {
  const txt = (
    <box pad={0} gap={16} align="flex-start" justify="center">
      <text color={RED} size={14} weight={800} font={HEAD}>{num}</text>
      <heading tag="h2" color="#fff" size={34} weight={800} font={HEAD} lh={1.1} mobile={{ size: 26 }}>{title}</heading>
      <text color={MUTED} size={16} lh={1.6} maxw={480}>{desc}</text>
      <box w="100%" pad={[6, 0, 0, 0]} gridCols={2} gap={12} align="flex-start" mobile={{ gridCols: 1 }}>
        {bullets.map((b) => (
          <box dir="row" w="100%" gap={10} align="flex-start" pad={0}>
            <text color={RED} size={14} weight={800} w="hug" raw="line-height:1.5;">▪</text>
            <text color="rgba(255,255,255,0.88)" size={14.5} lh={1.5}>{b}</text>
          </box>
        ))}
      </box>
    </box>
  );
  const image = <Img src={img} ar="558 / 372" />;
  return (
    <box w="100%" pad={i ? [72, 0, 28, 0] : [0, 0, 28, 0]} gridCols="1fr 1fr" gap={56} align="center" mobile={{ gridCols: 1 }}
      raw={i ? `border-top:1px solid ${LINE};` : ''}>
      {i % 2 === 0 ? [txt, image] : [image, txt]}
    </box>
  );
};
const Services = (
  <Sec bg={BG} pad={[40, 24, 100, 24]} gap={0} align="flex-start">
    {SERVICES.map(ServiceRow)}
  </Sec>
);

const Benefits = (
  <Sec bg={PANEL} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={720}>
      <Eyebrow>[ CLIENT BENEFITS ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'The value we deliver'}</AH>
      <text color={MUTED} size={16} lh={1.6} maxw={640}>Our solutions are designed to create measurable impact — smarter decisions, faster results and higher efficiency across your operations.</text>
    </box>
    <box w="100%" pad={0} gridCols={2} gap={0} mobile={{ gridCols: 1 }} raw={`border-top:1px solid ${LINE};border-left:1px solid ${LINE};`}>
      {BENEFITS.map((b, i) => (
        <box dir="row" pad={[22, 28]} gap={14} align="center" h="100%" raw={`border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};`}>
          <text color={RED} size={14} weight={800} font={HEAD} w="hug">{String(i + 1).padStart(2, '0')}</text>
          <text color="rgba(255,255,255,0.9)" size={16} weight={600}>{b}</text>
        </box>
      ))}
    </box>
  </Sec>
);

const CTA = (
  <box tag="section" w="100%" bg={RED} pad={[110, 24]} align="center">
    <box w="100%" maxw={860} center pad={0} gap={30} align="center">
      <text color="rgba(255,255,255,0.88)" size={12} weight={600} ls={0.18} ta="center" raw="text-transform:uppercase;">Driving Innovation Through Artificial Intelligence</text>
      <heading tag="h2" color="#fff" size={64} weight={800} font={HEAD} lh={1.05} ta="center" maxw={680} mobile={{ size: 34 }}>Let’s build the future together</heading>
      <box dir="row" w="hug" gap={16} align="center" justify="center" pad={[10, 0, 0, 0]}>
        <Btn label="Request a Consultation" kind="dark" href="/arrow-request-a-demo/" />
        <Btn label="Explore Our Platform" kind="ctatext" href="/arrow-platform/" />
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
          <text color="rgba(255,255,255,0.5)" size={11} weight={700} ls={0.14} raw="text-transform:uppercase;">Driving Innovation Through Artificial Intelligence</text>
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

export const ArrowServices = () => [
  <html raw={`<style>${FONT_CSS}</style>`} />,
  <html raw="<style>html,body{background:#07071C!important;margin:0;} *{box-sizing:border-box;}</style>" />,
  Nav, Hero, Services, Benefits, CTA, Footer,
];

export default defineSite({
  name: 'arrow-services',
  theme: arrow,
  pages: [{ title: 'Arrow AI — Services (exjsx)', slug: 'arrow-services', node: <ArrowServices /> }],
});
