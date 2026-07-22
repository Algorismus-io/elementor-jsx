import { defineSite } from '../../src/site.mjs';
import { arrow } from './theme.mjs';
import { FONT_CSS } from './fonts.mjs';

/* Arrow AI — Platform page. Faithful rebuild of live https://tryreachwise.space/platform/ as
   elementor-jsx. Standalone defineSite (own page file, no edits to site.jsx/theme.mjs). Bespoke
   components stay inline here. Build with --inline. Reuses the arrow theme + Geist/Manrope fonts +
   the same nav/footer/patterns as the home build for consistency. The live Platform page ships NO
   product screenshots (all content is text/number/chip based) — logo is the only image, sideloaded
   as exjsx-arw-plat-1. The "Integrated Workflows" mapping is an interactive/animated widget on the
   live page (mu-plugin, out of scope): heading + intro reproduced faithfully. */

const RED = '#E01118', BG = '#07071C', PANEL = '#12122a', MUTED = '#8A8B9E', LINE = 'rgba(255,255,255,0.08)';
const HEAD = 'Geist', BODY = 'Manrope';
const HOST = 'http://localhost:8915/wp-content/uploads/2026/07';
const LOGO = `${HOST}/exjsx-arw-logo.png`;

/* ── primitives ── */
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
const LEAD_PARAS = [
  'SigmaX is a 3D reservoir geomechanics platform designed to turn complex subsurface data into practical engineering insight for the energy industry. Built for applications ranging from oil & gas field development, well construction, and reservoir management to unconventional development, CO₂ storage, and underground gas storage, it provides an integrated environment that helps technical teams build, analyze, and apply field-scale geomechanical models more efficiently and consistently.',
  'SigmaX bridges the gap between geoscience interpretation, geomechanical modeling, and engineering decision-making. It works within existing industry software ecosystems — connecting with widely used G&G platforms such as Petrel and leading geomechanical numerical simulators such as FLAC3D and Abaqus — complementing them with dedicated geomechanics workflows, data-processing tools, model-building utilities, and application-focused analysis capabilities.',
  'Built for geoscientists, geomechanics engineers, drilling engineers, reservoir engineers, and field-development teams, its modern and intuitive interface supports fast adoption by entry-level users while maintaining the technical depth and flexibility required by advanced geomechanics specialists.',
];
const MODULES = [
  ['01', 'Drilling Geomechanics', 'Wellbore stability, mud-weight windows, trajectory and casing support for safe, optimized well construction.'],
  ['02', 'Reservoir Geomechanics', 'Stress-path, compaction, subsidence and coupled reservoir-simulation workflows across the producing life of the field.'],
  ['03', 'Unconventional Reservoir Geomechanics', 'Hydraulic-fracture design, fracture-gradient prediction and stimulation workflows for unconventional development.'],
];
const LIFECYCLE = [
  ['01', 'Exploration', ['Prospect evaluation', 'Well planning', 'Stress prediction']],
  ['02', 'Drilling', ['Wellbore stability', 'Mud weight optimization', 'Casing design', 'Trajectory optimization']],
  ['03', 'Completion', ['Perforation design', 'Hydraulic fracturing', 'Sand control']],
  ['04', 'Production', ['Reservoir management', 'Compaction prediction', 'Subsidence analysis', 'Production optimization']],
  ['05', 'Carbon Storage', ['CO₂ sequestration', 'Injection monitoring', 'Seal integrity', 'Long-term storage assessment']],
];
const WHY = [
  ['01', 'Advanced Mechanical Earth Modeling', 'Build calibrated, field-scale 3D Mechanical Earth Models that capture rock properties, pore pressure, and the full stress state.'],
  ['02', 'Integrated Reservoir Workflows', 'Seamlessly connect interpretation, model-building, simulation, and visualization in one repeatable workflow layer.'],
  ['03', 'Enterprise-Scale Performance', 'Handle large, complex field models with the speed and stability demanded by enterprise engineering teams.'],
  ['04', 'High-Speed Calculations', 'Accelerated geomechanical computations compress lengthy analyses into fast, iterative engineering cycles.'],
  ['05', 'Interactive 3D Visualization', 'Explore models, stresses, and results in fully interactive 3D maps for clear, confident interpretation.'],
  ['06', 'Automated Reporting', 'Generate professional, presentation-ready reports and plots directly from your models.'],
  ['07', 'Modular Architecture', 'A core module plus drilling, reservoir, and unconventional modules — adopt only what you need.'],
  ['08', 'Cloud & On-Premise Deployment', 'Deploy flexibly across local and cloud environments for individual users or scalable team workflows.'],
  ['09', 'Expert Technical Support', 'Backed by domain experts in reservoir engineering, geomechanics, and data science.'],
];
const STACK = [
  'Artificial Intelligence', 'Machine Learning', 'Data Science', 'Large Language Models (LLMs)',
  'Cloud Computing', 'Digital Twins', 'Data Analytics', '.NET', 'Web Technologies', 'GIS Integration',
  'Real-Time Data Processing', 'REST APIs', 'Enterprise Integration',
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
  <Sec bg={BG} pad={[100, 24, 84, 24]} gap={24}
    raw="background-image:radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);background-size:24px 24px;">
    <Eyebrow>[ FLAGSHIP PRODUCT ]</Eyebrow>
    <AH tag="h1" size={68} maxw={900} mobile={{ size: 34 }}>{'SigmaX™ Reservoir <span>Geomechanics</span> Platform'}</AH>
    <text color={MUTED} size={19} lh={1.6} maxw={760}>A 3D reservoir geomechanics platform that turns complex subsurface data into practical engineering insight — with workflows spanning the entire asset lifecycle, from exploration and drilling to production, injection, and abandonment.</text>
    <box dir="row" w="hug" gap={16} align="center" pad={[8, 0, 0, 0]}>
      <Btn label="Talk to Our Team" kind="solid" href="/arrow-contact-us/" />
      <Btn label="Request a Demo" kind="text" href="/arrow-request-a-demo/" />
    </box>
    <box pad={[24, 0, 0, 0]} gap={18} w="100%" align="flex-start" maxw={900}>
      {LEAD_PARAS.map((p) => <text color="rgba(255,255,255,0.72)" size={15.5} lh={1.7}>{p}</text>)}
    </box>
  </Sec>
);

const ModuleCard = ([num, title, desc]) => (
  <box pad={32} gap={12} align="flex-start" h="100%" bg={BG} raw={`border:1px solid ${LINE};`}>
    <text color={RED} size={13} weight={800} font={HEAD}>{num}</text>
    <heading tag="h3" color="#fff" size={22} weight={700} font={HEAD} lh={1.25}>{title}</heading>
    <text color={MUTED} size={14.5} lh={1.6}>{desc}</text>
  </box>
);
const Architecture = (
  <Sec bg={PANEL} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={860}>
      <Eyebrow>[ PLATFORM ARCHITECTURE ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'One core, three <span>application modules</span>'}</AH>
      <text color={MUTED} size={16} lh={1.7} maxw={820}>A core 3D geomechanics module supports field-scale model building, data processing, model preparation, analysis management, and visualization — the foundation for importing, organizing, validating, and preparing data for 3D geomechanical modeling. Three application-focused modules build on top of it.</text>
    </box>
    <box w="100%" pad={0} gridCols={3} gap={24} mobile={{ gridCols: 1 }}>
      {MODULES.map(ModuleCard)}
    </box>
    <text color="rgba(255,255,255,0.65)" size={15} lh={1.7} maxw={860} pad={[8, 0, 0, 0]}>SigmaX is designed for flexible deployment across local and cloud-based environments, supporting both individual technical users and scalable team workflows. Its architecture supports future AI-assisted capabilities — guided workflows, faster model setup, quality control, and interpretation assistance — while keeping technical judgment and final decisions with the user.</text>
  </Sec>
);

const Workflows = (
  <Sec bg={BG} pad={[100, 24]} gap={18} align="flex-start" maxw={860}>
    <Eyebrow>[ INTEGRATED WORKFLOWS ]</Eyebrow>
    <AH size={48} mobile={{ size: 30 }}>{'From objective <span>to outcome</span>'}</AH>
    <text color={MUTED} size={17} lh={1.7} maxw={720}>SigmaX™ maps every customer objective to an intelligent workflow and a concrete engineering outcome.</text>
  </Sec>
);

const LifeCard = ([num, title, items]) => (
  <box pad={28} gap={14} align="flex-start" h="100%" raw={`border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};`}>
    <text color={RED} size={13} weight={800} font={HEAD}>{num}</text>
    <heading tag="h4" color="#fff" size={20} weight={700} font={HEAD} lh={1.2}>{title}</heading>
    <box pad={0} gap={8} align="flex-start" w="100%">
      {items.map((it) => (
        <box dir="row" w="100%" gap={10} align="flex-start" pad={0}>
          <text color={RED} size={13} weight={800} w="hug">→</text>
          <text color={MUTED} size={14} lh={1.5}>{it}</text>
        </box>
      ))}
    </box>
  </box>
);
const LifeCycle = (
  <Sec bg={PANEL} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={820}>
      <Eyebrow>[ E&amp;P LIFE CYCLE ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'Intelligence at <span>every stage</span>'}</AH>
      <text color={MUTED} size={16} lh={1.7} maxw={760}>SigmaX™ applies across the full exploration &amp; production life cycle — one platform, one continuous flow of intelligence.</text>
    </box>
    <box w="100%" pad={0} gridCols={5} gap={0} mobile={{ gridCols: 1 }} tablet={{ gridCols: 2 }} raw={`border-top:1px solid ${LINE};border-left:1px solid ${LINE};`}>
      {LIFECYCLE.map(LifeCard)}
    </box>
  </Sec>
);

const WhyCard = ([num, title, desc]) => (
  <box pad={30} gap={12} align="flex-start" h="100%" raw={`border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};`}>
    <text color={RED} size={13} weight={800} font={HEAD}>{num}</text>
    <heading tag="h3" color="#fff" size={20} weight={700} font={HEAD} lh={1.25}>{title}</heading>
    <text color={MUTED} size={14.5} lh={1.6}>{desc}</text>
  </box>
);
const WhySigmaX = (
  <Sec bg={BG} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={820}>
      <Eyebrow>[ WHY SIGMAX™ ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'A platform built on <span>engineering intelligence</span>'}</AH>
    </box>
    <box w="100%" pad={0} gridCols={3} gap={0} mobile={{ gridCols: 1 }} raw={`border-top:1px solid ${LINE};border-left:1px solid ${LINE};`}>
      {WHY.map(WhyCard)}
    </box>
  </Sec>
);

const Stack = (
  <Sec bg={PANEL} pad={[100, 24]} gap={36} align="center">
    <box pad={0} gap={14} align="center">
      <Eyebrow ta="center">[ TECHNOLOGY STACK ]</Eyebrow>
      <AH size={50} ta="center" mobile={{ size: 30 }}>{'Built for Modern <span>Energy Companies</span>'}</AH>
    </box>
    <box dir="row" w="100%" wrap gap={12} justify="center" align="center" pad={0} maxw={900}>
      {STACK.map((c) => (
        <box pad={[12, 22]} w="hug" bg={BG} align="center" justify="center" raw={`border:1px solid ${LINE};`}>
          <text color="rgba(255,255,255,0.85)" size={14} weight={600} ls={0.02} raw="white-space:nowrap;">{c}</text>
        </box>
      ))}
    </box>
  </Sec>
);

const CTA = (
  <box tag="section" w="100%" bg={RED} pad={[110, 24]} align="center">
    <box w="100%" maxw={880} center pad={0} gap={28} align="center">
      <text color="rgba(255,255,255,0.88)" size={12} weight={600} ls={0.18} ta="center" raw="text-transform:uppercase;">Engineering Intelligence. Powered by Arrow AI.</text>
      <heading tag="h2" color="#fff" size={70} weight={800} font={HEAD} lh={1.05} ta="center" maxw={720} mobile={{ size: 36 }}>See SigmaX™ in action</heading>
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

export const ArrowPlatform = () => [
  <html raw={`<style>${FONT_CSS}</style>`} />,
  <html raw="<style>html,body{background:#07071C!important;margin:0;} *{box-sizing:border-box;}</style>" />,
  Nav, Hero, Architecture, Workflows, LifeCycle, WhySigmaX, Stack, CTA, Footer,
];

export default defineSite({
  name: 'arrow-platform',
  theme: arrow,
  pages: [{ title: 'Arrow AI — Platform (exjsx)', slug: 'arrow-platform', node: <ArrowPlatform /> }],
});
