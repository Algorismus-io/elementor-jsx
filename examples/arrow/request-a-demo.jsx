import { defineSite } from '../../src/site.mjs';
import { arrow } from './theme.mjs';
import { FONT_CSS } from './fonts.mjs';

/* Arrow AI — Request a Demo, faithful rebuild of https://tryreachwise.space/request-a-demo/ as
   elementor-jsx. Same theme tokens + nav/footer as the home example (kept INLINE here so site.jsx /
   theme.mjs / components stay untouched). Build with --inline (self-contained, free Elementor).
   The live page embeds a Contact Form 7 form — the JSX framework can't render a live CF7 form, so the
   "Request your demo" form below is a STATIC VISUAL REPLICA (same fields/labels/placeholders/button),
   not a working submit. */

const RED = '#E01118', BG = '#07071C', PANEL = '#12122a', MUTED = '#8A8B9E', LINE = 'rgba(255,255,255,0.08)';
const HEAD = 'Geist', BODY = 'Manrope';
const HOST = 'http://localhost:8915/wp-content/uploads/2026/07';
const LOGO = `${HOST}/exjsx-arw-logo.png`; // shared logo already sideloaded for the home page

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

const NAV = ['HOME', 'ABOUT', 'SERVICES', 'INDUSTRIES', 'PLATFORM'];
const FOOT = {
  company: [['Home', '/arrow-home/'], ['About', '/arrow-about/'], ['Services', '/arrow-services/'], ['Industries', '/arrow-industries/'], ['Platform', '/arrow-platform/'], ['Contact', '/arrow-contact-us/'], ['Careers', '/arrow-about/#careers']],
  services: [['AI Strategy & Consulting', '/arrow-services/'], ['Artificial Intelligence Solutions', '/arrow-services/'], ['Data Science & Analytics', '/arrow-services/'], ['Software Development', '/arrow-services/'], ['SigmaX™ Platform', '/arrow-platform/']],
  touch: [['info@arrowai.com', 'mailto:info@arrowai.com'], ['www.arrowai.com', '/arrow-home/'], ['Request a Demo', '/arrow-request-a-demo/'], ['Talk to Our Experts', '/arrow-contact-us/']],
};
const EXPECT = [
  'A live tour of AI, analytics and geomechanics workflows in SigmaX™',
  'Guidance tailored to your discipline across Oil & Gas and energy',
  'How your existing data integrates into a unified intelligence layer',
  'A clear view of deployment, security and scaling options',
];
const PILLS = ['Oil & Gas', 'Energy', 'Artificial Intelligence', 'Machine Learning', 'Data Science', 'Cloud & Digital Twins', 'Carbon Capture & Storage', 'Engineering Consulting'];

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
<div class="exjsx-demo-panel">
  <div class="exjsx-panel-head">
    <div><span class="exjsx-mini-l">Email us directly</span><a href="mailto:info@arrowai.com" class="exjsx-mini-v">info@arrowai.com</a></div>
    <div><span class="exjsx-mini-l">Typical response</span><span class="exjsx-mini-v2">Within one business day</span></div>
  </div>
  <h3 class="exjsx-form-title">Request your demo</h3>
  <form class="exjsx-form" onsubmit="return false;" aria-label="Request a demo (visual replica)">
    <label>Full name *<input type="text" placeholder="Your name" /></label>
    <label>Work email *<input type="email" placeholder="you@company.com" /></label>
    <label>Company *<input type="text" placeholder="Company" /></label>
    <label>Phone<input type="tel" placeholder="Phone" /></label>
    <label>Industry
      <select>
        <option>Select an industry</option>
        <option>Oil &amp; Gas</option><option>Mining</option><option>Geomechanics</option>
        <option>Energy</option><option>Civil &amp; Infrastructure</option><option>Geothermal</option>
        <option>Carbon Capture &amp; Storage</option><option>Other</option>
      </select>
    </label>
    <label>What would you like to see?<textarea rows="4" placeholder="Tell us about your use case, data, and goals..."></textarea></label>
    <button type="submit">Book My Demo</button>
  </form>
</div>
<style>
  .exjsx-demo-panel{background:${PANEL};border:1px solid ${LINE};padding:32px;width:100%;}
  .exjsx-panel-head{display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;padding-bottom:22px;margin-bottom:22px;border-bottom:1px solid ${LINE};}
  .exjsx-mini-l{display:block;font:600 11px/1.4 ${BODY},sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:4px;}
  .exjsx-mini-v{font:700 15px/1.3 ${HEAD},sans-serif;color:#fff;text-decoration:none;}
  .exjsx-mini-v2{font:700 15px/1.3 ${HEAD},sans-serif;color:#fff;}
  .exjsx-form-title{font:800 24px/1.2 ${HEAD},sans-serif;color:#fff;margin:0 0 20px;}
  .exjsx-form{display:flex;flex-direction:column;gap:16px;}
  .exjsx-form label{display:flex;flex-direction:column;gap:7px;font:600 13px/1.4 ${BODY},sans-serif;color:rgba(255,255,255,0.85);}
  .exjsx-form input,.exjsx-form select,.exjsx-form textarea{background:${BG};border:1px solid ${LINE};color:#fff;padding:13px 14px;font:400 15px/1.4 ${BODY},sans-serif;outline:none;border-radius:0;}
  .exjsx-form input::placeholder,.exjsx-form textarea::placeholder{color:#5a5b70;}
  .exjsx-form select{appearance:none;color:#8A8B9E;}
  .exjsx-form textarea{resize:vertical;}
  .exjsx-form button{margin-top:6px;background:${RED};color:#fff;border:0;padding:16px 30px;font:700 13px/1 ${BODY},sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}
</style>`;

const Hero = (
  <Sec bg={BG} pad={[90, 24, 30, 24]} gap={22} maxw={780}
    raw="background-image:radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);background-size:24px 24px;">
    <Eyebrow>[ Request a Demo ]</Eyebrow>
    <AH tag="h1" size={62} maxw={780} mobile={{ size: 36 }}>{'See Arrow AI and the <span>SigmaX™ Platform</span> in action'}</AH>
    <text color={MUTED} size={17} lh={1.6} maxw={680}>Book a personalized walkthrough with our team. We’ll map Arrow’s AI solutions and the SigmaX™ platform to your subsurface, production and asset-integrity challenges — and show how intelligent workflows accelerate your decisions.</text>
  </Sec>
);

const Working = (
  <Sec bg={BG} pad={[20, 24, 90, 24]} gap={0} align="flex-start">
    <box w="100%" pad={0} gridCols="1fr 1fr" gap={56} align="flex-start" mobile={{ gridCols: 1 }}>
      <box pad={0} gap={20} align="flex-start">
        <Eyebrow>[ What to Expect ]</Eyebrow>
        <AH size={40} mobile={{ size: 28 }}>{'A working session, not a <span>sales pitch</span>'}</AH>
        <text color={MUTED} size={16} lh={1.7} maxw={520}>In 30–45 minutes our engineers and data scientists walk through the AI workflows that matter most to your operation and answer the hard technical questions.</text>
        <box pad={[8, 0, 0, 0]} gap={16} w="100%" align="flex-start">
          {EXPECT.map((c) => (
            <box dir="row" w="100%" gap={12} align="flex-start" pad={0}>
              <text color={RED} size={16} weight={800} w="hug">✓</text>
              <text color="rgba(255,255,255,0.9)" size={15} lh={1.5}>{c}</text>
            </box>
          ))}
        </box>
      </box>
      <box pad={0} w="100%"><html raw={FORM_HTML} /></box>
    </box>
  </Sec>
);

const Trusted = (
  <Sec bg={PANEL} pad={[90, 24]} maxw={980} gap={22} align="center">
    <Eyebrow ta="center">[ Trusted Across Industries ]</Eyebrow>
    <AH size={44} ta="center" mobile={{ size: 28 }}>{'Built for the world’s most <span>demanding environments</span>'}</AH>
    <box dir="row" w="100%" wrap gap={14} justify="center" align="center" pad={[16, 0, 0, 0]}>
      {PILLS.flatMap((p, i) => (i
        ? [<text color={RED} size={9} w="hug" raw="align-self:center;">◆</text>, <text color="rgba(255,255,255,0.6)" size={13} weight={600} ls={0.05} w="hug" raw="text-transform:uppercase;">{p}</text>]
        : [<text color="rgba(255,255,255,0.6)" size={13} weight={600} ls={0.05} w="hug" raw="text-transform:uppercase;">{p}</text>]))}
    </box>
  </Sec>
);

const Questions = (
  <box tag="section" w="100%" bg={RED} pad={[100, 24]} align="center">
    <box w="100%" maxw={820} center pad={0} gap={26} align="center">
      <text color="rgba(255,255,255,0.88)" size={12} weight={700} ls={0.16} ta="center" raw="text-transform:uppercase;">[ Have Questions First? ]</text>
      <heading tag="h2" color="#fff" size={58} weight={800} font={HEAD} lh={1.05} ta="center" maxw={640} mobile={{ size: 34 }}>Talk to our team</heading>
      <box dir="row" w="hug" gap={16} align="center" justify="center" pad={[10, 0, 0, 0]}>
        <Btn label="Explore Services" kind="dark" href="/arrow-services/" />
        <Btn label="View the Platform" kind="ctatext" href="/arrow-platform/" />
      </box>
    </box>
  </box>
);

export const RequestDemo = () => [
  <html raw={`<style>${FONT_CSS}</style>`} />,
  <html raw="<style>html,body{background:#07071C!important;margin:0;} *{box-sizing:border-box;}</style>" />,
  Nav, Hero, Working, Trusted, Questions, Footer,
];

export default defineSite({
  name: 'arrow-demo',
  theme: arrow,
  pages: [{ title: 'Arrow AI — Request a Demo (exjsx)', slug: 'arrow-request-a-demo', node: <RequestDemo /> }],
});
