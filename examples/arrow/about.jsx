import { defineSite } from '../../src/site.mjs';
import { arrow } from './theme.mjs';
import { FONT_CSS } from './fonts.mjs';

/* Arrow AI — ABOUT page, faithful rebuild of https://tryreachwise.space/about/ as elementor-jsx.
   Self-contained inline build (--inline). Reuses the home theme tokens + Nav/Footer/CTA patterns for
   visual consistency. Hero image sideloaded onto :8915 (exjsx-arw-about-1). Copy is verbatim from live. */

const RED = '#E01118', BG = '#07071C', PANEL = '#12122a', MUTED = '#8A8B9E', LINE = 'rgba(255,255,255,0.08)';
const HEAD = 'Geist', BODY = 'Manrope';
const HOST = 'http://localhost:8915/wp-content/uploads/2026/07';
const LOGO = `${HOST}/exjsx-arw-logo.png`;
const IMG_HERO = `${HOST}/exjsx-arw-about-1.jpg`;

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
const TECHS = ['Artificial Intelligence', 'Machine Learning', 'Data Science', 'Large Language Models', 'Predictive Analytics', 'Computer Vision', 'Digital Twins', 'Cloud Computing', 'Automation', 'Digital Transformation'];
const VALUES = ['Innovation', 'Customer Success', 'Integrity', 'Excellence', 'Collaboration', 'Data-Driven Decisions', 'Continuous Learning', 'Responsibility'];
const WHY = [
  ['Industry Knowledge', 'Our solutions are developed by engineers who understand subsurface challenges and operational realities.'],
  ['Artificial Intelligence', 'We integrate state-of-the-art AI technologies with engineering workflows to improve decision quality.'],
  ['Practical Innovation', 'Every solution is designed to solve real operational problems while fitting seamlessly into existing workflows.'],
  ['Faster Decisions', 'Reduce engineering time from days to minutes using intelligent automation.'],
  ['Reduced Risk', 'Predict problems before they occur and optimize operations with confidence.'],
  ['Scalable Architecture', 'Cloud-ready, secure, and capable of enterprise-wide deployment.'],
];
const DELIVER = ['Faster decisions', 'Reduced risk', 'Improved efficiency', 'Lower costs', 'Smarter, data-driven decisions', 'Scalable solutions', 'Measurable business value'];
const ROLES = ['AI Engineers', 'Data Scientists', 'Petroleum Engineers', 'Reservoir Engineers', 'Geomechanics Engineers', 'Software Developers', 'Cloud Engineers', 'UI/UX Designers'];
const FOOT = {
  company: [['Home', '/arrow-home/'], ['About', '/arrow-about/'], ['Services', '/arrow-services/'], ['Industries', '/arrow-industries/'], ['Platform', '/arrow-platform/'], ['Contact', '/arrow-contact-us/'], ['Careers', '/arrow-about/#careers']],
  services: [['AI Strategy & Consulting', '/arrow-services/'], ['Artificial Intelligence Solutions', '/arrow-services/'], ['Data Science & Analytics', '/arrow-services/'], ['Software Development', '/arrow-services/'], ['SigmaX™ Platform', '/arrow-platform/']],
  touch: [['info@arrowai.com', 'mailto:info@arrowai.com'], ['www.arrowai.com', '/arrow-home/'], ['Request a Demo', '/arrow-request-a-demo/'], ['Talk to Our Experts', '/arrow-contact-us/']],
};

/* ── shared shell (nav + footer + cta) ── */
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
  <Sec bg={BG} pad={[100, 24, 90, 24]} gap={0}
    raw="background-image:radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);background-size:24px 24px;">
    <box w="100%" pad={0} gridCols="1.05fr 0.95fr" gap={56} align="center" mobile={{ gridCols: 1 }}>
      <box pad={0} gap={24} align="flex-start">
        <Eyebrow>[ ABOUT US ]</Eyebrow>
        <AH tag="h1" size={62} maxw={620} mobile={{ size: 38 }}>{'Driving Innovation Through <span>Artificial Intelligence</span>'}</AH>
        <text color={MUTED} size={17} lh={1.7} maxw={560}>Arrow AI is a technology consulting company specializing in Artificial Intelligence, Machine Learning, Data Analytics, Automation and industry-specific digital solutions. Our mission is to bridge the gap between business challenges and intelligent technologies by delivering AI solutions that generate real business value.</text>
        <text color={MUTED} size={16} lh={1.7} maxw={560}>Our professionals combine deep domain expertise, advanced AI technologies and software engineering excellence to help organizations modernize operations and make smarter decisions.</text>
      </box>
      <Img src={IMG_HERO} ar="558 / 372" />
    </box>
    <box w="100%" pad={[40, 0, 0, 0]} gap={20} align="flex-start">
      <text color="rgba(255,255,255,0.75)" size={15} lh={1.6} maxw={720}>We combine machine learning, data science, automation and engineering to help energy organizations innovate, optimize operations and achieve sustainable growth.</text>
      <box dir="row" w="100%" wrap gap={12} align="center" pad={0}>
        {TECHS.map((p) => (
          <box pad={[8, 16]} w="hug" bg={PANEL} align="center" raw={`border:1px solid ${LINE};`}>
            <text color="rgba(255,255,255,0.7)" size={12.5} weight={600} ls={0.04} w="hug" raw="text-transform:uppercase;white-space:nowrap;">{p}</text>
          </box>
        ))}
      </box>
    </box>
  </Sec>
);

const Values = (
  <Sec bg={PANEL} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={720}>
      <Eyebrow>[ OUR VALUES ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'What we believe in'}</AH>
      <text color={MUTED} size={16} lh={1.6} maxw={620}>Our culture is built on principles that guide every project — from first conversation to long-term partnership.</text>
    </box>
    <box w="100%" pad={0} gridCols={4} gap={0} mobile={{ gridCols: 1 }} raw={`border-top:1px solid ${LINE};border-left:1px solid ${LINE};`}>
      {VALUES.map((v, i) => (
        <box pad={28} gap={10} align="flex-start" h="100%" raw={`border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};`}>
          <text color={RED} size={13} weight={800} font={HEAD}>{String(i + 1).padStart(2, '0')}</text>
          <heading tag="h3" color="#fff" size={20} weight={700} font={HEAD} lh={1.2}>{v}</heading>
        </box>
      ))}
    </box>
  </Sec>
);

const VisionMission = (
  <Sec bg={BG} pad={[100, 24]} gap={0} align="flex-start">
    <box w="100%" pad={0} gridCols="1fr 1fr" gap={48} align="flex-start" mobile={{ gridCols: 1 }}>
      <box pad={36} gap={16} align="flex-start" bg={PANEL} h="100%" raw={`border-top:2px solid ${RED};`}>
        <Eyebrow>OUR VISION</Eyebrow>
        <text color="rgba(255,255,255,0.85)" size={17} lh={1.7}>To become a globally trusted leader in Artificial Intelligence by transforming data into intelligent, actionable solutions that enable organizations to innovate, optimize operations, and achieve sustainable growth across industries.</text>
      </box>
      <box pad={36} gap={16} align="flex-start" bg={PANEL} h="100%" raw={`border-top:2px solid ${RED};`}>
        <Eyebrow>OUR MISSION</Eyebrow>
        <text color="rgba(255,255,255,0.85)" size={15.5} lh={1.7}>Our mission is to design and deliver innovative, reliable, and scalable AI solutions that solve complex business challenges. By combining advanced machine learning, data science, automation, and domain expertise, we empower organizations to make smarter decisions, improve operational efficiency, reduce costs, and unlock new opportunities for growth. We are committed to delivering measurable value through technology while maintaining the highest standards of quality, integrity, and customer success.</text>
      </box>
    </box>
  </Sec>
);

const WhyCard = ([title, desc], i) => (
  <box pad={32} gap={12} align="flex-start" h="100%" raw={`border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};`}>
    <text color={RED} size={13} weight={800} font={HEAD}>{String(i + 1).padStart(2, '0')}</text>
    <heading tag="h3" color="#fff" size={22} weight={700} font={HEAD} lh={1.2}>{title}</heading>
    <text color={MUTED} size={14} lh={1.6}>{desc}</text>
  </box>
);
const WhyChoose = (
  <Sec bg={PANEL} pad={[100, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={720}>
      <Eyebrow>[ WHY CHOOSE US ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'Why our clients choose us'}</AH>
      <text color={MUTED} size={16} lh={1.6} maxw={640}>We combine deep domain expertise, advanced AI technologies, and software engineering excellence to help organizations modernize operations and make smarter decisions.</text>
    </box>
    <box w="100%" pad={0} gridCols={3} gap={0} mobile={{ gridCols: 1 }} raw={`border-top:1px solid ${LINE};border-left:1px solid ${LINE};`}>
      {WHY.map(WhyCard)}
    </box>
  </Sec>
);

const Deliver = (
  <Sec bg={BG} pad={[100, 24]} gap={36} align="flex-start">
    <box pad={0} gap={14} align="flex-start">
      <Eyebrow>[ WHAT WE DELIVER ]</Eyebrow>
      <AH size={48} mobile={{ size: 30 }}>{'The value we create'}</AH>
    </box>
    <box dir="row" w="100%" wrap gap={16} align="center" pad={0}>
      {DELIVER.map((d) => (
        <box dir="row" w="hug" gap={12} align="center" pad={[16, 24]} bg={PANEL} raw={`border:1px solid ${LINE};`}>
          <text color={RED} size={16} weight={800} w="hug">✓</text>
          <text color="rgba(255,255,255,0.9)" size={16} weight={600} w="hug" raw="white-space:nowrap;">{d}</text>
        </box>
      ))}
    </box>
  </Sec>
);

const Commitment = (
  <Sec bg={RED} pad={[90, 24]} maxw={900} gap={20} align="flex-start">
    <text weight={700} size={13} ls={0.12} color="rgba(255,255,255,0.85)" raw="text-transform:uppercase;">[ OUR COMMITMENT ]</text>
    <heading tag="h2" color="#fff" size={44} weight={800} font={HEAD} lh={1.1} mobile={{ size: 28 }}>Our commitment</heading>
    <text color="rgba(255,255,255,0.92)" size={18} lh={1.7} maxw={840}>At Arrow AI, we are committed to delivering AI solutions that are innovative, secure, ethical, and built for real-world industrial environments. Every project is guided by our dedication to safety, operational excellence, transparency, and long-term customer success. We work closely with our clients to ensure that our technologies generate measurable business value while supporting sustainable growth and responsible digital transformation.</text>
  </Sec>
);

const Careers = (
  <box tag="section" id="careers" w="100%" bg={PANEL} pad={[100, 24]} align="center">
    <box w="100%" maxw={1200} center pad={0} gap={36} align="flex-start">
      <box pad={0} gap={14} align="flex-start" maxw={720}>
        <Eyebrow>[ CAREERS ]</Eyebrow>
        <AH size={48} mobile={{ size: 30 }}>{'Join Our Team'}</AH>
        <text color={MUTED} size={16} lh={1.6} maxw={640}>We’re building the future of intelligent energy technologies. We’re looking for talented people to join our team.</text>
      </box>
      <box w="100%" pad={0} gridCols={4} gap={16} mobile={{ gridCols: 2 }}>
        {ROLES.map((r) => (
          <box pad={[22, 24]} gap={0} align="flex-start" bg={BG} h="100%" raw={`border:1px solid ${LINE};`}>
            <text color="#fff" size={16} weight={700} font={HEAD}>{r}</text>
          </box>
        ))}
      </box>
    </box>
  </box>
);

const CTA = (
  <box tag="section" w="100%" bg={RED} pad={[110, 24]} align="center">
    <box w="100%" maxw={860} center pad={0} gap={30} align="center">
      <text color="rgba(255,255,255,0.88)" size={12} weight={600} ls={0.18} ta="center" raw="text-transform:uppercase;">Driving Innovation Through Artificial Intelligence</text>
      <heading tag="h2" color="#fff" size={70} weight={800} font={HEAD} lh={1.05} ta="center" maxw={640} mobile={{ size: 36 }}>Ready to build the future together?</heading>
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

export const ArrowAbout = () => [
  <html raw={`<style>${FONT_CSS}</style>`} />,
  <html raw="<style>html,body{background:#07071C!important;margin:0;} *{box-sizing:border-box;}</style>" />,
  Nav, Hero, Values, VisionMission, WhyChoose, Deliver, Commitment, Careers, CTA, Footer,
];

export default defineSite({
  name: 'arrow-about',
  theme: arrow,
  pages: [{ title: 'Arrow AI — About (exjsx)', slug: 'arrow-about', node: <ArrowAbout /> }],
});
