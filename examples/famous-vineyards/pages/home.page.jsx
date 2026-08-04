/** Famous Vineyards homepage — Figma 400:7508 (1440×6225). Section y-targets:
 *  nav 0-90 · hero →790 · worthy →1652 · varieties →2837 · elevate →3922 ·
 *  natgood →4784 · rooted 4706→5353 · newsletter →5778 · footer →6226 */
import { A, Svg, Btn, BtnGreen, Leaves, Stripes, NavyBand, VarietyCard, ElevateCard, NatItem, RootedCol, FootLink } from '../components/ui.jsx';

export const meta = {
  title: 'Famous Vineyards',
  seo: { title: 'Famous Vineyards — Famously Delicious', description: 'A curated collection of the most exceptional grapes: green, red, and black varieties selected for flavor, texture, and character.' },
};

const QS = "font-family: 'Quicksand'; font-weight: 500;";

export default ({ theme: t }) => (
  <section id="top" tw="flex flex-col w-full items-center bg-white" pad={0}>
    {fontLoader('Fraunces', [400, 600, 700, 900])}
    {fontLoader('Quicksand', [400, 500, 600, 700])}

    {/* ── nav: pinstripe band + white bar ── */}
    <box tw="flex flex-col w-full" h={14}
         raw={`background-image: repeating-linear-gradient(90deg, #73bf86 0px, #73bf86 5.65px, #a4d866 5.65px, #a4d866 11.3px);`} />
    <box tw="flex flex-row items-center justify-between w-full px-8" h={76} bg="#fff" raw="position: relative; z-index: 10;">
      <box tw="flex flex-col w-fit" raw="margin-bottom: -66px; position: relative; z-index: 12;"><Svg name="logo" w={170} h={110} /></box>
      <box tw="flex flex-row items-center gap-8 w-fit">
        {['Our Grapes', 'About Famous Vineyards', 'Where to Buy', 'From the Vine ▾', 'Contact Us'].map((l) => (
          <text size={14} weight={600} color={t.color.deep} href="#top" cls="fv-nav-link" raw="font-family: 'Quicksand';">{l}</text>
        ))}
      </box>
    </box>

    {/* ── hero (photo 85→790, column centered) ── */}
    <box tw="flex flex-col items-center w-full" minh={705} pad={0}
         raw={`background-image: url('${A['hero-bg']}'); background-size: cover; background-position: center;`}>
      <box tw="flex flex-col items-center text-center" w={768} pad={{ t: 195 }}>
        <heading tag="h1" size={56} weight={900} color="#fff" lh={1.2} font={t.font.head}
                 raw="text-shadow: 0px 6px 5px rgba(0,0,0,0.33), 0px 2px 1.5px rgba(0,0,0,0.33);">Famously Delicious.</heading>
        <heading tag="h2" size={24} weight={600} color="#fff" lh={1.2} m={{ t: 10 }} font={t.font.head}
                 raw="text-shadow: 0px 4px 4px rgba(0,0,0,0.33);">Every Grape Has a Story Worth Tasting</heading>
        <text size={18} color="#fff" lh={1.5} m={{ t: 18 }} maxw={768} raw={QS + ' text-shadow: 0px 2px 3px rgba(0,0,0,0.4);'}>
          Famous Vineyards brings you a curated collection of the most exceptional grapes. Each variety is selected for its
          distinct flavor, texture, and character. Discover what makes every bite unforgettable.
        </text>
        <box tw="flex flex-col w-fit" m={{ t: 32 }}><Btn label="Find a Store" /></box>
      </box>
    </box>

    {/* ── worthy of the fame (striped, circle photo right) ── */}
    <Stripes theme={t} pad={{ t: 153, b: 96 }}>
      <box tw="flex flex-row items-center justify-between" w={1280}>
        <box tw="flex flex-col items-start" w={560}>
          <heading tag="h2" size={40} weight={700} color={t.color.deep} lh={1.25} font={t.font.head}>Worthy of the Fame in Our Name</heading>
          <text size={16} color={t.color.ink} lh={1.6} m={{ t: 24 }} maxw={540} raw={QS}>
            Famous Vineyards is where curiosity meets expertise. We trial, we taste, and we only bring to market the grapes
            that earn their place at your table. For over 50 years, we’ve devoted ourselves to one pursuit: finding and
            growing the varieties that truly stand apart. That’s what it means to be curators of flavor.
          </text>
          <box tw="flex flex-col w-fit" m={{ t: 36 }}><Btn label="Meet Famous Vineyards" /></box>
        </box>
        <img src={A.couple} alt="Famous Vineyards growers" w={560} h={560} tw="rounded-full object-cover" />
      </box>
    </Stripes>
    <NavyBand theme={t} />

    {/* ── a full-flavored exploration ── */}
    <box tw="flex flex-col w-full items-center" bg="#fff" pad={{ t: 175, b: 83 }}>
      <html raw={`<h2 style="margin:0;font-family:'Fraunces',serif;font-weight:700;font-size:48px;line-height:1.2;color:#105742;display:flex;align-items:center;gap:10px;">A Full<img src="http://localhost:8919/wp-content/uploads/2026/07/leaves.png" style="width:46px;height:14px;object-fit:contain;" alt=""/>Flavored Exploration</h2>`} />
      <text size={16} color={t.color.ink} lh={1.55} m={{ t: 20 }} maxw={768} tw="text-center" raw={QS}>
        Most people think of grapes in three colors. We see them as endless experiences, each with its own flavor profile,
        size, and crunch. Explore our carefully curated varieties and find the one you’ll be proud to share.
      </text>
      <box tw="flex flex-row items-start justify-center gap-8 w-full" m={{ t: 33 }}>
        <VarietyCard theme={t} img={A['pouch-green']} tint="#a4d866" headColor={t.color.deep}
          title="Bright. Crisp. Refreshing." btn="Explore Green Varieties" link="View Green Grape Pairings"
          body="Our green varieties deliver a satisfying crunch and a clean, sweet finish that’s as versatile as it is irresistible. Whether you’re building a cheese board or looking for an everyday snack that feels anything but ordinary, start here." />
        <VarietyCard theme={t} img={A['pouch-red']} tint="#ffb3b9" headColor="#661d34"
          title="Bold. Juicy. Complex." btn="Explore Red Varieties" link="View Red Grape Pairings"
          body="A snap of flavor, our red grape varieties bring richness and depth with every handful. These are the grapes that elevate any simple gathering, from charcuterie boards and wine pairings to late-summer entertaining." />
        <VarietyCard theme={t} img={A['pouch-black']} tint="#88dcec" headColor="#350078"
          title="Rich. Intense. Unforgettable." btn="Explore Black Varieties" link="View Black Grape Pairings"
          body="Our black grape varieties are where indulgence meets sophistication. With deep, layered flavors and a satisfying sweetness, they’re a natural companion to dark chocolate, aged cheeses, and any moment that calls for something a little more extraordinary." />
      </box>
    </box>
    <NavyBand theme={t} />

    {/* ── elevate the moments ── */}
    <Stripes theme={t} pad={{ t: 102, b: 88 }}>
      <box tw="flex flex-col items-start" w={1280}>
        <heading tag="h2" size={40} weight={700} color={t.color.deep} lh={1.25} font={t.font.head}>Elevate the Moments that Matter</heading>
        <text size={16} color={t.color.ink} lh={1.6} m={{ t: 20 }} maxw={760} raw={QS}>
          Grapes are more than just a snack. They’re an ingredient, a centerpiece, and a conversation starter. Make any
          occasion more memorable and effortlessly upgrade your table with recipes, hosting ideas, and pairing guides that
          bring out the best in every gathering.
        </text>
        <box tw="flex flex-row items-start justify-between w-full" m={{ t: 56 }}>
          <ElevateCard theme={t} img={A['elevate-host']} cat="Blog" title="How to Be the Host with the Most"
            body="A few simple touches turn any gathering into something worth savoring. From cheese boards to dessert, discover how grapes steal the show." />
          <ElevateCard theme={t} img={A['elevate-burrata']} cat="Recipe" title="Roasted Grapes with Burrata and Honey"
            body="Sweet, savory, and ready in minutes. This easy showstopper proves the best dishes start with the freshest, simplest ingredients." />
        </box>
        <box tw="flex flex-col items-center w-full" m={{ t: 56 }}><Btn label="Explore Recipes + More" /></box>
      </box>
    </Stripes>
    <NavyBand theme={t} />

    {/* ── naturally good ── */}
    <box tw="flex flex-col w-full items-center" bg="#f2f9e8" pad={{ t: 172, b: 96 }}>
      <box tw="flex flex-row items-center justify-between" w={1280}>
        <img src={A.natgood} alt="Enjoying grapes" w={560} h={560} tw="rounded-full object-cover" />
        <box tw="flex flex-col items-start" w={620}>
          <heading tag="h2" size={40} weight={700} color={t.color.deep} lh={1.25} font={t.font.head}>Naturally Good</heading>
          <text size={16} color={t.color.ink} lh={1.55} m={{ t: 16 }} raw={QS}>
            Grapes offer a rare combination of exceptional flavor and real nutrition. Here’s what makes them one of
            nature’s most rewarding snacks.
          </text>
          <box tw="flex flex-col gap-6 w-full" m={{ t: 40 }}>
            <NatItem theme={t} title="Heart-Healthy Antioxidants" body="A natural source of powerful antioxidants that support cardiovascular health. Dark varieties like reds and blacks are especially rich." />
            <NatItem theme={t} title="Vitamins + Minerals" body="A handful of the essentials, from Vitamin C to potassium. A naturally sweet burst of goodness." />
            <NatItem theme={t} title="Guilt-Free Satisfaction" body="Naturally sweet with no added sugars and no processing. All the flavor, none of the compromise." />
          </box>
        </box>
      </box>
    </box>
    <NavyBand theme={t} />

    {/* ── rooted in expertise (striped) ── */}
    <Stripes theme={t} pad={{ t: 33, b: 192 }}>
      <Leaves w={100} />
      <heading tag="h2" size={48} weight={700} color={t.color.deep} lh={1.2} m={{ t: 12 }} font={t.font.head}>Rooted in Expertise</heading>
      <text size={16} color={t.color.ink} lh={1.55} m={{ t: 16 }} maxw={620} tw="text-center" raw={QS}>
        Behind every Famous Vineyards grape is half a century of passion, expertise, and an unwavering commitment to the
        craft of growing.
      </text>
      <box tw="flex flex-row items-start justify-center gap-16 w-full" m={{ t: 48 }}>
        <RootedCol theme={t} icon="clock" title="50+ Years" body="Five decades of learning and growing with every season, we have perfected what we do so you can taste the difference." />
        <RootedCol theme={t} icon="grape" title="Curated Varieties" body="Conventional and organic, each one carefully selected for exceptional flavor, crunch, and character." />
        <RootedCol theme={t} icon="box" title="Care in Every Step" body="We manage every step from vine to store to ensure quality and freshness." />
      </box>
    </Stripes>
    <NavyBand theme={t} />

    {/* ── newsletter ── */}
    <box tw="flex flex-col w-full items-center justify-start" minh={425} pad={{ t: 56 }}
         raw={`background-image: linear-gradient(rgba(10,30,15,0.35), rgba(10,30,15,0.35)), url('${A.vineyard}'); background-size: cover; background-position: center;`}>
      <box tw="flex flex-row items-center justify-between" w={1280}>
        <box tw="flex flex-col items-start" w={620}>
          <heading tag="h2" size={40} weight={700} color="#fff" lh={1.25} font={t.font.head}>Savor the Latest from Famous Vineyards.</heading>
          <text size={16} color="#fff" lh={1.55} m={{ t: 18 }} maxw={560} raw={QS}>
            Be the first to hear about new varieties, seasonal recipes, and where to find Famous Vineyards near you. Join
            our community of grape enthusiasts.
          </text>
        </box>
        <box tw="flex flex-col items-start" w={480}>
          <box tw="flex flex-row items-center gap-3 w-full">
            <text size={15} color="#8a8f85" bg="#fff" pad={[14, 20]} w={330} radius={10} raw="font-family: 'Quicksand';">Enter your email</text>
            <BtnGreen label="Sign Up" />
          </box>
          <text size={11} color="#e8efe4" m={{ t: 10 }} raw={QS}>By clicking Sign Up you’re confirming that you agree with our Terms and Conditions.</text>
        </box>
      </box>
    </box>

    {/* ── footer ── */}
    <box tw="flex flex-col w-full items-center" bg={t.color.lime} pad={{ t: 80, b: 0 }}>
      <box tw="flex flex-row items-start justify-between w-full" maxw={1280}>
        <box tw="flex flex-col items-start w-fit">
          <Svg name="logo" w={150} h={97} />
          <box tw="flex flex-row items-center gap-4 w-fit" m={{ t: 28 }}>
            {['fs2', 'fs3', 'fs4', 'fs5', 'fs6'].map((n) => <Svg name={n} w={20} h={20} />)}
          </box>
        </box>
        <box tw="flex flex-row items-start gap-24 w-fit">
          <box tw="flex flex-col items-start gap-4 w-fit">
            {['Our Grapes', 'About Famous Vineyards', 'Where to Buy', 'Recipes + Food Pairings'].map((l) => <FootLink theme={t} label={l} />)}
          </box>
          <box tw="flex flex-col items-start gap-4 w-fit">
            {['Blogs', 'Contact Us', 'Press Releases', 'FAQs'].map((l) => <FootLink theme={t} label={l} />)}
          </box>
        </box>
      </box>
      <box tw="flex flex-col w-full" maxw={1280} h={1} bg={t.color.deep} m={{ t: 76 }} raw="opacity: .35;" />
      <box tw="flex flex-row items-center justify-between w-full" maxw={1280} pad={{ t: 44, b: 62 }}>
        <text size={13} weight={600} color={t.color.deep} raw="font-family: 'Quicksand';">Copyright © 2026 Sun Pacific. All rights reserved.</text>
        <box tw="flex flex-row items-center gap-8 w-fit">
          {['Privacy Policy', 'Terms of Service', 'Cookies Settings'].map((l) => <FootLink theme={t} label={l} />)}
        </box>
      </box>
      <box tw="flex flex-col w-full" h={14}
           raw={`background-image: repeating-linear-gradient(90deg, #73bf86 0px, #73bf86 5.65px, ${t.lit.lime} 5.65px, ${t.lit.lime} 11.3px);`} />
    </box>
  </section>
);
