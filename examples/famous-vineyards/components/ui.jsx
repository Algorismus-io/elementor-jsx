/** Famous Vineyards components — framework via the auto-using prelude, zero imports. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// absolute base — esbuild inlines this file into a tmp entry, so import.meta.url would lie
const DATA = process.env.EXJSX_DATA || '/Users/shahmir/projects/wpos-muneeb-backend/elementor-jsx/examples/famous-vineyards/data';
export const A = JSON.parse(readFileSync(join(DATA, 'media.json'), 'utf8'));
const svgRaw = (name) => readFileSync(join(DATA, `${name}.svg`), 'utf8').replace('width="100%" height="100%"', '');
export const Svg = ({ name, w, h }) => <html raw={`<div style="width:${w}px;height:${h}px;display:flex;">${svgRaw(name).replace('<svg ', `<svg width="${w}" height="${h}" `)}</div>`} />;

const DEEP = '#105742';
/** the signature asymmetric-border button (design-context exact: t3 r3 b6 l6, r8, 24×12 pad) */
export const Btn = ({ label, onDark }) => (
  <text size={16} weight={600} color={DEEP} bg="#fff" pad={[12, 24]} href="#top" cls="fv-btn"
        raw={`border-style: solid; border-color: ${DEEP}; border-width: 3px 3px 6px 6px; border-radius: 8px; font-family: 'Quicksand'; white-space: nowrap;`}>{label}</text>
);
/** green Sign Up variant (newsletter) */
export const BtnGreen = ({ label }) => (
  <text size={16} weight={600} color="#fff" bg={DEEP} pad={[12, 24]} href="#top" cls="fv-btn-green"
        raw={`border-radius: 8px; font-family: 'Quicksand'; white-space: nowrap;`}>{label}</text>
);

export const Leaves = ({ w = 120 }) => <img src={A.leaves} alt="" w={w} tw="object-contain" />;

/** vertical pinstripe section background */
export const Stripes = ({ children, pad, theme: t }) => (
  <box tw="flex flex-col w-full items-center" pad={pad}
       raw={`background-image: repeating-linear-gradient(90deg, ${t.lit.stripeA} 0px, ${t.lit.stripeA} 5.65px, ${t.lit.stripeB} 5.65px, ${t.lit.stripeB} 11.3px);`}>
    {children}
  </box>
);
export const NavyBand = ({ h = 24, theme: t }) => <box tw="flex flex-col w-full" h={h} bg={t.color.navy} />;

/** FFE product card: pouch bleeding over the pastel panel */
export const VarietyCard = ({ img, tint, headColor, title, body, btn, link, theme: t }) => (
  <box tw="flex flex-col items-start" w={405} cls="fv-card">
    <box tw="flex flex-col items-center w-full" raw="margin-bottom: -160px; position: relative; z-index: 3;">
      <img src={img} alt={title} w={340} h={340} tw="object-contain" />
    </box>
    <box tw="flex flex-col items-start w-full rounded-2xl" bg={tint} pad={{ t: 200, b: 32, l: 28, r: 28 }} minh={524} cls="fv-card-panel">
      <heading tag="h3" size={32} weight={700} color={headColor} lh={1.25} font={t.font.head}>{title}</heading>
      <text size={15} color={headColor} lh={1.55} m={{ t: 16 }} raw="font-family: 'Quicksand'; font-weight: 500;">{body}</text>
      <box tw="flex flex-col w-fit" m={{ t: 24 }}><Btn label={btn} /></box>
    </box>
    <box tw="flex flex-row items-center gap-2 w-fit" m={{ t: 18 }} href="#top">
      <text size={15} weight={600} color={headColor} raw="font-family: 'Quicksand';">{link}</text>
      <text size={15} weight={600} color={headColor}>›</text>
    </box>
  </box>
);

export const ElevateCard = ({ img, cat, title, body, theme: t }) => (
  <box tw="flex flex-col items-start" w={600} cls="fv-elevate-card">
    <img src={img} alt={title} w={600} h={360} tw="object-cover rounded-xl w-full" />
    <text size={13} weight={600} color={t.color.deep} m={{ t: 20 }} raw="font-family: 'Quicksand';">{cat}</text>
    <heading tag="h3" size={22} weight={700} color={t.color.deep} lh={1.3} m={{ t: 8 }} font={t.font.head}>{title}</heading>
    <text size={15} color={t.color.ink} lh={1.55} m={{ t: 10 }} raw="font-family: 'Quicksand'; font-weight: 500;">{body}</text>
  </box>
);

export const NatItem = ({ title, body, theme: t }) => (
  <box tw="flex flex-col items-start w-full" cls="fv-nat">
    <heading tag="h3" size={24} weight={600} color={t.color.deep} lh={1.3} font={t.font.head}>{title}</heading>
    <text size={15} color={t.color.ink} lh={1.5} m={{ t: 10 }} raw="font-family: 'Quicksand'; font-weight: 500;">{body}</text>
    <box tw="flex flex-col w-full" h={1} bg="#c9dfce" m={{ t: 22 }} />
  </box>
);

export const RootedCol = ({ icon, title, body, theme: t }) => (
  <box tw="flex flex-col items-center text-center" w={368} cls="fv-rooted">
    <Svg name={icon} w={40} h={40} />
    <heading tag="h3" size={22} weight={600} color={t.color.deep} m={{ t: 20 }} font={t.font.head}>{title}</heading>
    <text size={15} color={t.color.ink} lh={1.5} m={{ t: 12 }} maxw={330} raw="font-family: 'Quicksand'; font-weight: 500;">{body}</text>
  </box>
);

export const FootLink = ({ label, theme: t }) => (
  <text size={15} weight={600} color={t.color.deep} href="#top" cls="fv-foot-link" raw="font-family: 'Quicksand';">{label}</text>
);
