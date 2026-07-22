import { defineSite } from '../../src/site.mjs';
import { arrow } from './theme.mjs';
import { FONT_CSS } from './fonts.mjs';

/* Arrow AI — Contact Us, faithful rebuild of https://tryreachwise.space/contact-us/ as elementor-jsx.
   Same theme tokens + nav/footer as the home example (kept INLINE here so site.jsx / theme.mjs /
   components stay untouched). Build with --inline (self-contained, free Elementor).
   The live page embeds a Contact Form 7 form — the JSX framework can't render a live CF7 form, so the
   "Send us a message" form below is a STATIC VISUAL REPLICA (same fields/labels/placeholders/button),
   not a working submit. Hero image sideloaded as exjsx-arw-contact-1. */

const RED = '#E01118', BG = '#07071C', PANEL = '#12122a', MUTED = '#8A8B9E', LINE = 'rgba(255,255,255,0.08)';
const HEAD = 'Geist', BODY = 'Manrope';
const HOST = 'http://localhost:8915/wp-content/uploads/2026/07';
const LOGO = `${HOST}/exjsx-arw-logo.png`;            // shared logo (already sideloaded for home)
const HERO_IMG = `${HOST}/exjsx-arw-contact-1.jpg`;   // sideloaded contact hero (id 1547)

/* ── primitives (mirrors examples/arrow/site.jsx) ── */
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

const NAV = ['HOME', 'ABOUT', 'SERVICES', 'INDUSTRIES', 'PLATFORM'];
const FOOT = {
  company: [['Home', '/arrow-home/'], ['About', '/arrow-about/'], ['Services', '/arrow-services/'], ['Industries', '/arrow-industries/'], ['Platform', '/arrow-platform/'], ['Contact', '/arrow-contact-us/'], ['Careers', '/arrow-about/#careers']],
  services: [['AI Strategy & Consulting', '/arrow-services/'], ['Artificial Intelligence Solutions', '/arrow-services/'], ['Data Science & Analytics', '/arrow-services/'], ['Software Development', '/arrow-services/'], ['SigmaX™ Platform', '/arrow-platform/']],
  touch: [['info@arrowai.com', 'mailto:info@arrowai.com'], ['www.arrowai.com', '/arrow-home/'], ['Request a Demo', '/arrow-request-a-demo/'], ['Talk to Our Experts', '/arrow-contact-us/']],
};
const WHY = [
  ['Industry Knowledge', 'Solutions developed by engineers who understand subsurface challenges and operational realities.'],
  ['Artificial Intelligence', 'State-of-the-art AI integrated with engineering workflows to improve decision quality.'],
  ['Practical Innovation', 'Advanced software and digital workflows — including our SigmaX™ platform — built to solve real operational problems.'],
  ['Faster Decisions', 'Reduce engineering time from days to minutes with intelligent automation.'],
  ['Reduced Risk', 'Predict problems before they occur and optimize operations with confidence.'],
  ['Scalable Architecture', 'Cloud-ready, secure and capable of enterprise-wide deployment.'],
];
const CONTACT = [
  ['Email', 'info@arrowai.com'],
  ['Phone', '+92 300 0000000'],
  ['Headquarters', 'Energy District · Global'],
  ['Business Hours', 'Mon–Fri, 9:00 AM – 6:00 PM'],
];

/* ── shared shell ── */
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
          <text color="rgba(255,255,255,0.4)" size={12.5} lh={1.6}>Artificial Intelligence · Machine Learning · Data Science · Software Development · Oil & Gas · Energy · Cloud · Digital Twins</text>
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

/* ── static visual form replica (NOT a working CF7 submit) ── */
const FORM_HTML = `
<div class="exjsx-ct-panel">
  <h3 class="exjsx-form-title">Send us a message</h3>
  <form class="exjsx-form" onsubmit="return false;" aria-label="Contact form (visual replica)">
    <div class="exjsx-two">
      <label>Name *<input type="text" placeholder="Your name" /></label>
      <label>Company<input type="text" placeholder="Company" /></label>
    </div>
    <div class="exjsx-two">
      <label>Email *<input type="email" placeholder="you@company.com" /></label>
      <label>Phone<input type="tel" placeholder="Phone" /></label>
    </div>
    <label>Subject<input type="text" placeholder="How can we help?" /></label>
    <label>Message *<textarea rows="5" placeholder="Tell us about your project..."></textarea></label>
    <button type="submit">Send Message</button>
  </form>
</div>
<style>
  .exjsx-ct-panel{background:${PANEL};border:1px solid ${LINE};padding:32px;width:100%;}
  .exjsx-form-title{font:800 24px/1.2 ${HEAD},sans-serif;color:#fff;margin:0 0 20px;}
  .exjsx-form{display:flex;flex-direction:column;gap:16px;}
  .exjsx-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  @media(max-width:600px){.exjsx-two{grid-template-columns:1fr;}}
  .exjsx-form label{display:flex;flex-direction:column;gap:7px;font:600 13px/1.4 ${BODY},sans-serif;color:rgba(255,255,255,0.85);}
  .exjsx-form input,.exjsx-form textarea{background:${BG};border:1px solid ${LINE};color:#fff;padding:13px 14px;font:400 15px/1.4 ${BODY},sans-serif;outline:none;border-radius:0;}
  .exjsx-form input::placeholder,.exjsx-form textarea::placeholder{color:#5a5b70;}
  .exjsx-form textarea{resize:vertical;}
  .exjsx-form button{margin-top:6px;background:${RED};color:#fff;border:0;padding:16px 30px;font:700 13px/1 ${BODY},sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}
</style>`;

const Hero = (
  <Sec bg={BG} pad={[90, 24, 60, 24]} gap={0} align="flex-start"
    raw="background-image:radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);background-size:24px 24px;">
    <box w="100%" pad={0} gridCols="1.05fr 0.95fr" gap={56} align="center" mobile={{ gridCols: 1 }}>
      <box pad={0} gap={22} align="flex-start">
        <Eyebrow>[ Let’s Connect ]</Eyebrow>
        <AH tag="h1" size={62} maxw={620} mobile={{ size: 36 }}>{'Let’s Build the <span>Future Together</span>'}</AH>
        <text color={MUTED} size={17} lh={1.6} maxw={540}>Tell us about your challenge — and let’s explore how AI can help you make smarter, faster decisions across your operations.</text>
      </box>
      <Img src={HERO_IMG} ar="558 / 420" />
    </box>
  </Sec>
);

const WhyCard = ([title, desc]) => (
  <box pad={28} gap={12} align="flex-start" h="100%" bg={BG} raw={`border:1px solid ${LINE};`}>
    <heading tag="h3" color="#fff" size={20} weight={700} font={HEAD} lh={1.2}>{title}</heading>
    <text color={MUTED} size={14} lh={1.6}>{desc}</text>
  </box>
);
const Why = (
  <Sec bg={PANEL} pad={[90, 24]} gap={40} align="flex-start">
    <box pad={0} gap={14} align="flex-start" maxw={760}>
      <Eyebrow>[ Why Choose Us ]</Eyebrow>
      <AH size={44} mobile={{ size: 28 }}>{'A partner built for <span>intelligent energy</span>'}</AH>
      <text color={MUTED} size={16} lh={1.6} maxw={640}>We combine deep domain expertise with advanced AI — delivering integrated, independent solutions across the complete asset lifecycle.</text>
    </box>
    <box w="100%" pad={0} gridCols={3} gap={20} mobile={{ gridCols: 1 }}>
      {WHY.map(WhyCard)}
    </box>
  </Sec>
);

const ContactRow = ([label, val]) => (
  <box pad={0} gap={4} align="flex-start" w="100%">
    <text color={RED} size={12} weight={700} ls={0.08} raw="text-transform:uppercase;">{label}</text>
    <text color="rgba(255,255,255,0.9)" size={16} lh={1.4}>{val}</text>
  </box>
);
const GetInTouch = (
  <Sec bg={BG} pad={[90, 24]} gap={0} align="flex-start">
    <box w="100%" pad={0} gridCols="0.9fr 1.1fr" gap={56} align="flex-start" mobile={{ gridCols: 1 }}>
      <box pad={0} gap={22} align="flex-start">
        <Eyebrow>[ Get in touch ]</Eyebrow>
        <AH size={40} mobile={{ size: 28 }}>{'We’d love to <span>hear from you</span>'}</AH>
        <text color={MUTED} size={16} lh={1.7} maxw={480}>Whether you’re looking to deploy AI, modernize engineering workflows, or implement advanced reservoir geomechanics, our experts are ready to help.</text>
        <box pad={[10, 0, 0, 0]} gap={22} w="100%" align="flex-start">
          {CONTACT.map(ContactRow)}
        </box>
      </box>
      <box pad={0} w="100%"><html raw={FORM_HTML} /></box>
    </box>
  </Sec>
);

export const ContactUs = () => [
  <html raw={`<style>${FONT_CSS}</style>`} />,
  <html raw="<style>html,body{background:#07071C!important;margin:0;} *{box-sizing:border-box;}</style>" />,
  Nav, Hero, Why, GetInTouch, Footer,
];

export default defineSite({
  name: 'arrow-contact',
  theme: arrow,
  pages: [{ title: 'Arrow AI — Contact Us (exjsx)', slug: 'arrow-contact-us', node: <ContactUs /> }],
});
