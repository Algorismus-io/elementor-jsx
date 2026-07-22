import { defineSite } from '../../src/site.mjs';
/* Decompiled from _elementor_data by exjsx decompile. Structure + local styles are inverted to
   sx/raw; global classes are kept as cls refs (defined in the sidecar classes file); anything the
   shorthand can't express is preserved verbatim in props={{…}}. Edit freely, then rebuild. */

export const RequestADemo = () => [
      <box w={"100%"} pad={0} bg={"#07071c"} align={"stretch"}>
        <html raw="<style>

.px-hero-liquid{opacity:0.22;}
.kx-cross{width:22px;height:22px;}
.kx-cross::before,.kx-cross::after{background:rgba(11,11,15,0.55);}
/* left-column contact lines (live .px-demo-contact) */
.kxd-contact{display:flex;flex-direction:column;gap:16px;}
.kxd-cl{display:flex;align-items:center;gap:16px;}
.kxd-ico{flex-shrink:0;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:#12122a;border:1px solid rgba(255,255,255,0.10);color:#e01118;}
.kxd-ico svg{width:20px;height:20px;}
.kxd-k{display:block;font-family:Geist, Helvetica, Arial, sans-serif;font-size:0.68rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#797a8c;margin-bottom:4px;}
.kxd-cl a,.kxd-a{color:#ffffff;text-decoration:none;font-size:1rem;line-height:1.5;}
.kxd-cl a:hover{color:#e01118;}
/* ── Pro form reskin → live .px-demo-form ── */
.e-u0000f-s .wpcf7 form{margin:0;}
.e-u0000f-s .kxf-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin:0;}
.e-u0000f-s .kxf-field{margin:0 0 16px;}
.e-u0000f-s .kxf-field.kxf-full{grid-column:1/-1;}
.e-u0000f-s .kxf-field label{font-family:Geist, Helvetica, Arial, sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#797a8c;display:block;width:100%;}
.e-u0000f-s .wpcf7-form-control-wrap{display:block;margin-top:8px;}
.e-u0000f-s .kxf-field input,.e-u0000f-s .kxf-field textarea,.e-u0000f-s .kxf-field select{width:100%;background:#07071c;border:1px solid rgba(255,255,255,0.10);border-radius:0;padding:14px 16px;font-family:Geist, Helvetica, Arial, sans-serif;font-size:0.96rem;line-height:1.5;color:#ffffff;transition:border-color 0.2s ease;box-shadow:none;letter-spacing:normal;text-transform:none;}
.e-u0000f-s .kxf-field ::placeholder{color:#5a5a66;opacity:1;}
.e-u0000f-s .kxf-field input:focus,.e-u0000f-s .kxf-field textarea:focus,.e-u0000f-s .kxf-field select:focus{outline:none;border-color:#e01118;}
.e-u0000f-s .kxf-field textarea{resize:vertical;}
.e-u0000f-s .kxf-submit{width:100%;background:#e01118;color:#07071c;border:1px solid #e01118;border-radius:0;padding:16px 24px;margin-top:6px;font-family:Geist, Helvetica, Arial, sans-serif;font-size:0.78rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;line-height:1.5;cursor:pointer;transition:background 0.25s ease,transform 0.25s ease,border-color 0.25s ease;box-shadow:none;}
.e-u0000f-s .kxf-submit:hover{background:#cf4a13;border-color:#cf4a13;transform:translateY(-2px);}
.e-u0000f-s .wpcf7-spinner{display:none;}
.e-u0000f-s .wpcf7-not-valid-tip{color:#ff3b3b;font-size:0.75rem;margin-top:6px;display:block;}
.e-u0000f-s .wpcf7 form .wpcf7-response-output{font-size:0.9rem;color:#797a8c;margin:14px 0 0!important;padding:10px 14px!important;border:1px solid rgba(255,255,255,0.10)!important;}
.kxd-note{font-size:0.9rem;color:#797a8c;margin:14px 0 0;min-height:1em;}
@media (max-width:900px){
  .e-u0000f-s .kxf-grid{grid-template-columns:1fr;gap:0;}
}

</style>" />
        <box tag="header" cls="g-kxheader" w={"100%"} pad={0} bg={"#07071c"} align={"stretch"}>
          <box w={"100%"} maxw={1320} pad={[20, 40, 20, 40]} center dir={"row"} justify={"space-between"} align={"center"} mobile={{ pad: [16, 22, 16, 22] }}>
            <html raw="<a href=\"/\" class=\"kx-logo\"><img src=\"http://localhost:8917/wp-content/uploads/2026/07/arrow-logo.png\" alt=\"Arrow AI\" style=\"height:26px;width:auto;display:block\"/></a>" />
            <box cls="g-kxdesknav" w={"fit-contentcustom"} pad={0} dir={"row"} gap={34} align={"center"} mobile={{ display: "none" }}>
              <Button text="Home" href="/" color={"#e01118"} />
              <Button text="About" href="/about/" color={"#e01118"} />
              <Button text="Services" href="/services/" color={"#e01118"} />
              <Button text="Industries" href="/industries/" color={"#e01118"} />
              <Button text="Platform" href="/platform/" color={"#e01118"} />
              <Button text="Request a Demo" href="/request-a-demo/" bg={"#cf4a13"} />
            </box>
          </box>
        </box>
        <section w={"100%"} pos={"relative"} pad={0} align={"stretch"}>
          <html raw="<div style=\"position:absolute;inset:0;overflow:hidden;pointer-events:none;\"><canvas class=\"px-hero-liquid\" aria-hidden=\"true\"></canvas></div>" />
          <box w={"100%"} maxw={1200} pos={"relative"} pad={[190, 40, 96, 40]} center align={"center"} mobile={{ pad: [150, 22, 70, 22] }}>
            <text weight={"700"} size={11.52} color={"#e01118"} ta={"center"} m={[12, 0, 22, 0]}>[ Request a Demo ]</text>
            <heading tag="h1" w={"100%"} maxw={980} weight={"800"} size={64} color={"#ffffff"} ta={"center"} m={[0, 0, 24, 0]} mobile={{ size: 35.2 }}>See Arrow AI and the SigmaX™ <em>Platform</em> in action</heading>
            <text maxw={760} weight={"400"} size={17.92} color={"#797a8c"} ta={"center"} center>Book a personalized walkthrough with our team. We’ll map Arrow’s AI solutions and the SigmaX™ platform to your subsurface, production and asset-integrity challenges — and show how intelligent workflows accelerate your decisions.</text>
          </box>
        </section>
        <section w={"100%"} pad={[96, 0, 96, 0]} bg={"#07071c"} align={"stretch"} mobile={{ pad: [66, 0, 66, 0] }}>
          <box w={"100%"} maxw={1200} pad={[0, 40, 0, 40]} center align={"flex-start"} mobile={{ pad: [0, 22, 0, 22] }}>
            <box w={"100%"} pad={0} gap={64} align={"start"} gridCols={"1fr 1fr"} mobile={{ gap: 44 }}>
              <box pad={0} align={"flex-start"}>
                <text weight={"700"} size={11.52} color={"#e01118"} m={[12, 0, 22, 0]}>[ What to Expect ]</text>
                <heading w={"100%"} weight={"800"} size={38.4} color={"#ffffff"} m={[0, 0, 18, 0]} mobile={{ size: 27.2 }}>A working session, not a sales pitch</heading>
                <text weight={"400"} size={16.96} color={"#797a8c"} m={[0, 0, 30, 0]}>In 30–45 minutes our engineers and data scientists walk through the AI workflows that matter most to your operation and answer the hard technical questions.</text>
                <box w={"100%"} pad={0} m={[0, 0, 40, 0]} align={"stretch"}>
                  <text w={"100%"} weight={"400"} size={16} color={"#ffffff"} pad={[16, 0, 16, 30]}>A live tour of AI, analytics and geomechanics workflows in SigmaX™</text>
                  <text w={"100%"} weight={"400"} size={16} color={"#ffffff"} pad={[16, 0, 16, 30]}>Guidance tailored to your discipline across Oil & Gas and energy</text>
                  <text w={"100%"} weight={"400"} size={16} color={"#ffffff"} pad={[16, 0, 16, 30]}>How your existing data integrates into a unified intelligence layer</text>
                  <text w={"100%"} weight={"400"} size={16} color={"#ffffff"} pad={[16, 0, 16, 30]}>A clear view of deployment, security and scaling options</text>
                </box>
                <html raw="<div class=\"kxd-contact\">
<div class=\"kxd-cl\"><div class=\"kxd-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" aria-hidden=\"true\"><path d=\"M4 6h16v12H4z\"/><path d=\"m4 7 8 6 8-6\"/></svg></div><div><span class=\"kxd-k\">Email us directly</span><a href=\"mailto:info@arrowai.com\">info@arrowai.com</a></div></div>
<div class=\"kxd-cl\"><div class=\"kxd-ico\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/></svg></div><div><span class=\"kxd-k\">Typical response</span><span class=\"kxd-a\">Within one business day</span></div></div>
</div>" />
              </box>
              <box pad={40} bg={"#12122a"} align={"stretch"} mobile={{ pad: 28 }}>
                <heading tag="h3" w={"100%"} weight={"800"} size={22.4} color={"#ffffff"} m={[0, 0, 26, 0]}>Request your demo</heading>
                <html raw="" />
                <html raw="<p class=\"kxd-note\" aria-hidden=\"true\"></p>" />
              </box>
            </box>
          </box>
        </section>
        <section w={"100%"} pad={[96, 0, 96, 0]} bg={"#12122a"} align={"stretch"} mobile={{ pad: [66, 0, 66, 0] }}>
          <box w={"100%"} maxw={1200} pad={[0, 40, 0, 40]} center align={"center"} mobile={{ pad: [0, 22, 0, 22] }}>
            <box w={"100%"} maxw={820} pad={0} m={[0, 'auto', 56, 'auto']} align={"center"}>
              <text weight={"700"} size={11.52} color={"#e01118"} ta={"center"} m={[12, 0, 22, 0]}>[ Trusted Across Industries ]</text>
              <heading w={"100%"} weight={"800"} size={44.8} color={"#ffffff"} ta={"center"} m={0} mobile={{ size: 28.8 }}>Built for the world’s most demanding environments</heading>
            </box>
            <box w={"100%"} maxw={920} pad={0} center dir={"row"} gap={12} justify={"center"}>
              <box w={"fit-contentcustom"} pad={[14, 26, 14, 26]} bg={"#07071c"}>
                <text weight={"500"} size={14.72} color={"#ffffff"}>Oil & Gas</text>
              </box>
              <box w={"fit-contentcustom"} pad={[14, 26, 14, 26]} bg={"#07071c"}>
                <text weight={"500"} size={14.72} color={"#ffffff"}>Energy</text>
              </box>
              <box w={"fit-contentcustom"} pad={[14, 26, 14, 26]} bg={"#07071c"}>
                <text weight={"500"} size={14.72} color={"#ffffff"}>Artificial Intelligence</text>
              </box>
              <box w={"fit-contentcustom"} pad={[14, 26, 14, 26]} bg={"#07071c"}>
                <text weight={"500"} size={14.72} color={"#ffffff"}>Machine Learning</text>
              </box>
              <box w={"fit-contentcustom"} pad={[14, 26, 14, 26]} bg={"#07071c"}>
                <text weight={"500"} size={14.72} color={"#ffffff"}>Data Science</text>
              </box>
              <box w={"fit-contentcustom"} pad={[14, 26, 14, 26]} bg={"#07071c"}>
                <text weight={"500"} size={14.72} color={"#ffffff"}>Cloud & Digital Twins</text>
              </box>
              <box w={"fit-contentcustom"} pad={[14, 26, 14, 26]} bg={"#07071c"}>
                <text weight={"500"} size={14.72} color={"#ffffff"}>Carbon Capture & Storage</text>
              </box>
              <box w={"fit-contentcustom"} pad={[14, 26, 14, 26]} bg={"#07071c"}>
                <text weight={"500"} size={14.72} color={"#ffffff"}>Engineering Consulting</text>
              </box>
            </box>
          </box>
        </section>
        <section w={"100%"} pos={"relative"} pad={[96, 40, 96, 40]} bg={"#e01118"} align={"stretch"}>
          <html raw="<span class=\"kx-cross\" style=\"top:26px;left:26px\"></span><span class=\"kx-cross\" style=\"top:26px;right:26px\"></span><span class=\"kx-cross\" style=\"bottom:26px;left:26px\"></span><span class=\"kx-cross\" style=\"bottom:26px;right:26px\"></span>" />
          <box w={"100%"} maxw={820} pad={0} center align={"center"}>
            <text w={"100%"} weight={"700"} size={11.84} color={"rgba(255,255,255,0.88)"} ta={"center"} m={[0, 0, 18, 0]}>[ Have Questions First? ]</text>
            <heading w={"100%"} weight={"800"} size={48} color={"#ffffff"} ta={"center"} m={[0, 0, 34, 0]} mobile={{ size: 30.4 }}>Talk to our team</heading>
            <box pad={0} dir={"row"} gap={16} justify={"center"}>
              <Button text="Explore Services" href="/services/" weight={"700"} size={12.16} color={"#ffffff"} pad={[16, 32, 16, 32]} bg={"#07071c"} props={{"border-radius":{"$$type":"border-radius","value":{"start-start":{"$$type":"size","value":{"size":0,"unit":"px"}},"start-end":{"$$type":"size","value":{"size":0,"unit":"px"}},"end-end":{"$$type":"size","value":{"size":0,"unit":"px"}},"end-start":{"$$type":"size","value":{"size":0,"unit":"px"}}}}}} />
              <Button text="View the Platform" href="/platform/" weight={"700"} size={12.16} color={"#ffffff"} pad={[16, 32, 16, 32]} bg={"rgba(0,0,0,0)"} props={{"border-radius":{"$$type":"border-radius","value":{"start-start":{"$$type":"size","value":{"size":0,"unit":"px"}},"start-end":{"$$type":"size","value":{"size":0,"unit":"px"}},"end-end":{"$$type":"size","value":{"size":0,"unit":"px"}},"end-start":{"$$type":"size","value":{"size":0,"unit":"px"}}}}}} />
            </box>
          </box>
        </section>
        <box tag="footer" cls="g-kxfooter" w={"100%"} pos={"relative"} pad={0} bg={"#07071c"} align={"stretch"}>
          <box w={"100%"} maxw={1240} pos={"relative"} pad={[88, 32, 30, 32]} center align={"stretch"}>
            <box w={"100%"} pad={0} gap={48} gridCols={"2fr 1fr 1fr 1fr"} mobile={{ gap: 36 }}>
              <box pad={0} align={"flex-start"}>
                <Button text="Arrow<span>AI</span>" href="/" weight={"800"} size={32} color={"#ffffff"} pad={0} m={[0, 0, 22, 0]} bg={"rgba(0,0,0,0)"} props={{"border-radius":{"$$type":"border-radius","value":{"start-start":{"$$type":"size","value":{"size":0,"unit":"px"}},"start-end":{"$$type":"size","value":{"size":0,"unit":"px"}},"end-end":{"$$type":"size","value":{"size":0,"unit":"px"}},"end-start":{"$$type":"size","value":{"size":0,"unit":"px"}}}}}} />
                <text weight={"400"} size={15.2} color={"#797a8c"} m={[0, 0, 16, 0]}>AI, machine learning, data science, software and digital transformation solutions that help energy companies reduce risk, improve efficiency and accelerate decisions across operations.</text>
                <text weight={"500"} size={12.8} color={"#74747f"} m={[0, 0, 24, 0]}>Artificial Intelligence · Machine Learning · Data Science · Software Development · Oil &amp; Gas · Energy · Cloud · Digital Twins</text>
                <html raw="<div class=\"kx-social\">
<a href=\"https://www.linkedin.com/\" aria-label=\"LinkedIn\"><svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M6.94 5a2 2 0 1 1-4-.002 2 2 0 0 1 4 .002ZM7 8.48H3V21h4V8.48Zm6.32 0H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68Z\"/></svg></a>
<a href=\"https://www.youtube.com/\" aria-label=\"YouTube\"><svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M21.6 7.2a2.5 2.5 0 0 0-1.7-1.8C18.3 5 12 5 12 5s-6.3 0-7.9.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.7 1.8C5.7 19 12 19 12 19s6.3 0 7.9-.4a2.5 2.5 0 0 0 1.7-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3Z\"/></svg></a>
<a href=\"https://x.com/\" aria-label=\"X\"><svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M17.5 3h3l-6.6 7.5L21.7 21h-6l-4.7-6.1L5.6 21H2.5l7-8L2 3h6.2l4.3 5.6L17.5 3Zm-1.05 16h1.66L7.6 4.7H5.8L16.45 19Z\"/></svg></a>
</div>" />
              </box>
              <box pad={0} align={"flex-start"}>
                <heading tag="h4" w={"100%"} weight={"600"} size={11.84} color={"#ffffff"} m={[6, 0, 22, 0]}>Company</heading>
                <Button text="Home" cls="g-kxflink" href="/" />
                <Button text="About" cls="g-kxflink" href="/about/" />
                <Button text="Services" cls="g-kxflink" href="/services/" />
                <Button text="Industries" cls="g-kxflink" href="/industries/" />
                <Button text="Platform" cls="g-kxflink" href="/platform/" />
                <Button text="Contact" cls="g-kxflink" href="/contact-us/" />
                <Button text="Careers" cls="g-kxflink" href="/about/#careers" />
              </box>
              <box pad={0} align={"flex-start"}>
                <heading tag="h4" w={"100%"} weight={"600"} size={11.84} color={"#ffffff"} m={[6, 0, 22, 0]}>Services</heading>
                <Button text="AI Strategy & Consulting" cls="g-kxflink" href="/services/" />
                <Button text="Artificial Intelligence Solutions" cls="g-kxflink" href="/services/" />
                <Button text="Data Science & Analytics" cls="g-kxflink" href="/services/" />
                <Button text="Software Development" cls="g-kxflink" href="/services/" />
                <Button text="SigmaX™ Platform" cls="g-kxflink" href="/platform/" />
              </box>
              <box pad={0} align={"flex-start"}>
                <heading tag="h4" w={"100%"} weight={"600"} size={11.84} color={"#ffffff"} m={[6, 0, 22, 0]}>Get in touch</heading>
                <Button text="info@arrowai.com" cls="g-kxflink" href="mailto:info@arrowai.com" />
                <Button text="www.arrowai.com" cls="g-kxflink" href="https://www.arrowai.com" />
                <Button text="Request a Demo" cls="g-kxflink" href="/request-a-demo/" />
                <Button text="Talk to Our Experts" cls="g-kxflink" href="/contact-us/" />
              </box>
            </box>
            <box w={"100%"} pad={[26, 0, 0, 0]} m={[60, 0, 0, 0]} dir={"row"} gap={10} justify={"space-between"} mobile={{ align: "flex-start" }}>
              <text weight={"400"} size={13.12} color={"#74747f"} mobile={{ w: "100%" }}>© 2026 Arrow AI. All rights reserved.</text>
              <text weight={"600"} size={11.84} color={"#e01118"} mobile={{ w: "100%" }}>Driving Innovation Through Artificial Intelligence</text>
            </box>
          </box>
        </box>
        <html raw="<style>
/* detached element custom_css (Pro-free equivalent) */
.e-u0002g-s{font-family:Geist, Helvetica, Arial, sans-serif;font-weight:400;line-height:1.5;color:#ffffff;overflow:hidden;}
.e-u0001k-s{position:fixed;top:0;left:0;right:0;z-index:999;border-bottom:1px solid rgba(255,255,255,0.10);box-shadow:0 6px 24px rgba(0,0,0,0.35);}
.e-u0001c-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.13em;text-transform:uppercase;transition:color .25s ease;position:relative;}
.e-u0001c-s::after{content:\"\";position:absolute;left:0;bottom:-6px;width:0;height:1.5px;background:#e01118;transition:width .3s cubic-bezier(0.16,1,0.3,1);}
.e-u0001c-s:hover::after{width:100%;}
.e-u0001d-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.13em;text-transform:uppercase;transition:color .25s ease;position:relative;}
.e-u0001d-s::after{content:\"\";position:absolute;left:0;bottom:-6px;width:0;height:1.5px;background:#e01118;transition:width .3s cubic-bezier(0.16,1,0.3,1);}
.e-u0001d-s:hover::after{width:100%;}
.e-u0001e-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.13em;text-transform:uppercase;transition:color .25s ease;position:relative;}
.e-u0001e-s::after{content:\"\";position:absolute;left:0;bottom:-6px;width:0;height:1.5px;background:#e01118;transition:width .3s cubic-bezier(0.16,1,0.3,1);}
.e-u0001e-s:hover::after{width:100%;}
.e-u0001f-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.13em;text-transform:uppercase;transition:color .25s ease;position:relative;}
.e-u0001f-s::after{content:\"\";position:absolute;left:0;bottom:-6px;width:0;height:1.5px;background:#e01118;transition:width .3s cubic-bezier(0.16,1,0.3,1);}
.e-u0001f-s:hover::after{width:100%;}
.e-u0001g-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.13em;text-transform:uppercase;transition:color .25s ease;position:relative;}
.e-u0001g-s::after{content:\"\";position:absolute;left:0;bottom:-6px;width:0;height:1.5px;background:#e01118;transition:width .3s cubic-bezier(0.16,1,0.3,1);}
.e-u0001g-s:hover::after{width:100%;}
.e-u0001h-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.12em;text-transform:uppercase;border:1px solid #e01118;transition:background .25s ease,transform .25s ease,box-shadow .25s ease;}
.e-u0001h-s:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(236,90,30,0.34);}
.e-u00004-s{border-bottom:1px solid rgba(255,255,255,0.10);background:linear-gradient(118deg,rgba(236,90,30,0.07) 0%,transparent 22%,rgba(236,90,30,0.045) 46%,transparent 68%,rgba(236,90,30,0.06) 90%,transparent 100%),radial-gradient(circle,rgba(121,122,140,0.16) 1px,transparent 1.7px),radial-gradient(ellipse 90% 70% at 50% 0%,#1a1208 0%,#0e0e13 55%,#07071c 100%);background-size:100% 100%,13px 13px,100% 100%;}
.e-u00000-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.22em;text-transform:uppercase;}
.e-u00001-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:pretty;line-height:1.04;letter-spacing:-0.01em;}
.e-u00001-s em{color:#e01118;font-style:normal;}
.e-u00002-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.7;letter-spacing:normal;text-wrap:pretty;}
.e-u00005-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.22em;text-transform:uppercase;}
.e-u00006-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:pretty;line-height:1.12;letter-spacing:-0.01em;}
.e-u00006-s em{color:#e01118;font-style:normal;}
.e-u00007-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.75;letter-spacing:normal;text-wrap:pretty;}
.e-u00008-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.55;position:relative;border-bottom:1px solid rgba(255,255,255,0.10);border-top:1px solid rgba(255,255,255,0.10);}
.e-u00008-s::before{content:\"\";position:absolute;left:4px;top:26px;width:8px;height:8px;background:#e01118;transform:rotate(45deg);}
.e-u00009-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.55;position:relative;border-bottom:1px solid rgba(255,255,255,0.10);}
.e-u00009-s::before{content:\"\";position:absolute;left:4px;top:26px;width:8px;height:8px;background:#e01118;transform:rotate(45deg);}
.e-u0000a-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.55;position:relative;border-bottom:1px solid rgba(255,255,255,0.10);}
.e-u0000a-s::before{content:\"\";position:absolute;left:4px;top:26px;width:8px;height:8px;background:#e01118;transform:rotate(45deg);}
.e-u0000b-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.55;position:relative;border-bottom:1px solid rgba(255,255,255,0.10);}
.e-u0000b-s::before{content:\"\";position:absolute;left:4px;top:26px;width:8px;height:8px;background:#e01118;transform:rotate(45deg);}
.e-u0000f-s{border:1px solid rgba(255,255,255,0.10);}
.e-u0000e-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:pretty;line-height:1.1;letter-spacing:-0.01em;}
.e-u00010-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.22em;text-transform:uppercase;}
.e-u00011-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:pretty;line-height:1.1;letter-spacing:-0.01em;}
.e-u00011-s em{color:#e01118;font-style:normal;}
.e-u0000z-s{flex-wrap:wrap;}
.e-u0000k-s{border:1px solid rgba(255,255,255,0.10);transition:border-color .25s ease,transform .25s ease;}
.e-u0000k-s:hover{border-color:#e01118;transform:translateY(-3px);}
.e-u0000k-s:hover p{color:#e01118;}
.e-u0000k-s p{transition:color .25s ease;}
.e-u0000j-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.5;}
.e-u0000m-s{border:1px solid rgba(255,255,255,0.10);transition:border-color .25s ease,transform .25s ease;}
.e-u0000m-s:hover{border-color:#e01118;transform:translateY(-3px);}
.e-u0000m-s:hover p{color:#e01118;}
.e-u0000m-s p{transition:color .25s ease;}
.e-u0000l-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.5;}
.e-u0000o-s{border:1px solid rgba(255,255,255,0.10);transition:border-color .25s ease,transform .25s ease;}
.e-u0000o-s:hover{border-color:#e01118;transform:translateY(-3px);}
.e-u0000o-s:hover p{color:#e01118;}
.e-u0000o-s p{transition:color .25s ease;}
.e-u0000n-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.5;}
.e-u0000q-s{border:1px solid rgba(255,255,255,0.10);transition:border-color .25s ease,transform .25s ease;}
.e-u0000q-s:hover{border-color:#e01118;transform:translateY(-3px);}
.e-u0000q-s:hover p{color:#e01118;}
.e-u0000q-s p{transition:color .25s ease;}
.e-u0000p-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.5;}
.e-u0000s-s{border:1px solid rgba(255,255,255,0.10);transition:border-color .25s ease,transform .25s ease;}
.e-u0000s-s:hover{border-color:#e01118;transform:translateY(-3px);}
.e-u0000s-s:hover p{color:#e01118;}
.e-u0000s-s p{transition:color .25s ease;}
.e-u0000r-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.5;}
.e-u0000u-s{border:1px solid rgba(255,255,255,0.10);transition:border-color .25s ease,transform .25s ease;}
.e-u0000u-s:hover{border-color:#e01118;transform:translateY(-3px);}
.e-u0000u-s:hover p{color:#e01118;}
.e-u0000u-s p{transition:color .25s ease;}
.e-u0000t-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.5;}
.e-u0000w-s{border:1px solid rgba(255,255,255,0.10);transition:border-color .25s ease,transform .25s ease;}
.e-u0000w-s:hover{border-color:#e01118;transform:translateY(-3px);}
.e-u0000w-s:hover p{color:#e01118;}
.e-u0000w-s p{transition:color .25s ease;}
.e-u0000v-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.5;}
.e-u0000y-s{border:1px solid rgba(255,255,255,0.10);transition:border-color .25s ease,transform .25s ease;}
.e-u0000y-s:hover{border-color:#e01118;transform:translateY(-3px);}
.e-u0000y-s:hover p{color:#e01118;}
.e-u0000y-s p{transition:color .25s ease;}
.e-u0000x-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.5;}
.e-u00016-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.18em;text-transform:uppercase;}
.e-u00017-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:pretty;line-height:1.08;letter-spacing:-0.01em;}
.e-u00019-s{flex-wrap:wrap;}
.e-u00018-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.12em;text-transform:uppercase;text-wrap:wrap;transition:background .25s ease,border-color .25s ease,color .25s ease,transform .25s ease,box-shadow .25s ease;border:1px solid #07071c;}
.e-u00018-s:hover{transform:translateY(-2px);}
.e-u00015-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.12em;text-transform:uppercase;text-wrap:wrap;border:1px solid rgba(255,255,255,0.5);transition:transform .25s ease,background .25s ease,color .25s ease;}
.e-u00015-s:hover{background:rgba(255,255,255,0.14);transform:translateY(-2px);}
.e-u0002f-s{border-top:1px solid rgba(255,255,255,0.10);overflow:hidden;}
.e-u0002f-s::before{content:\"\";position:absolute;top:-160px;left:50%;transform:translateX(-50%);width:720px;height:320px;background:radial-gradient(ellipse at center,rgba(236,90,30,0.16),transparent 70%);pointer-events:none;}
.e-u0001l-s{font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.04em;line-height:1.5;}
.e-u0001l-s span{color:#e01118;text-transform:uppercase;}
.e-u0001m-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.7;max-width:400px;}
.e-u0001n-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;line-height:1.7;letter-spacing:.01em;max-width:400px;}
.e-u0001p-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:pretty;font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.16em;text-transform:uppercase;}
.e-u0001x-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:pretty;font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.16em;text-transform:uppercase;}
.e-u00024-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:pretty;font-family:Geist, Helvetica, Arial, sans-serif;letter-spacing:.16em;text-transform:uppercase;}
.e-u0002d-s{border-top:1px solid rgba(255,255,255,0.10);flex-wrap:wrap;}
.e-u0002b-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;letter-spacing:.02em;}
.e-u0002c-s{font-family:Geist, Helvetica, Arial, sans-serif;text-wrap:wrap;letter-spacing:.1em;text-transform:uppercase;}
</style>" />
        <html raw="<style>
html.sx-light .e-u0002g-s{background:#ffffff!important;color:#11131a!important;}
html.sx-light .e-u0001k-s{background:#ffffff!important;border-bottom:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0001c-s{color:#11131a!important;}
html.sx-light .e-u0001d-s{color:#11131a!important;}
html.sx-light .e-u0001e-s{color:#11131a!important;}
html.sx-light .e-u0001f-s{color:#11131a!important;}
html.sx-light .e-u0001g-s{color:#11131a!important;}
html.sx-light .e-u0001h-s{color:#11131a!important;}
html.sx-light .e-u00004-s{border-bottom:1px solid rgba(13,15,23,0.10)!important;background:linear-gradient(118deg,rgba(236,90,30,0.07) 0%,transparent 22%,rgba(236,90,30,0.045) 46%,transparent 68%,rgba(236,90,30,0.06) 90%,transparent 100%),radial-gradient(circle,rgba(121,122,140,0.16) 1px,transparent 1.7px),radial-gradient(ellipse 90% 70% at 50% 0%,#1a1208 0%,#0e0e13 55%,#ffffff 100%)!important;}
html.sx-light .e-u00001-s{color:#11131a!important;}
html.sx-light .e-u00002-s{color:#565b67!important;}
html.sx-light .e-u0000i-s{background:#ffffff!important;}
html.sx-light .e-u00006-s{color:#11131a!important;}
html.sx-light .e-u00007-s{color:#565b67!important;}
html.sx-light .e-u00008-s{color:#11131a!important;border-bottom:1px solid rgba(13,15,23,0.10)!important;border-top:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u00009-s{color:#11131a!important;border-bottom:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000a-s{color:#11131a!important;border-bottom:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000b-s{color:#11131a!important;border-bottom:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000f-s{background:#f4f6f8!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000e-s{color:#11131a!important;}
html.sx-light .e-u00014-s{background:#f4f6f8!important;}
html.sx-light .e-u00011-s{color:#11131a!important;}
html.sx-light .e-u0000k-s{background:#ffffff!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000j-s{color:#11131a!important;}
html.sx-light .e-u0000m-s{background:#ffffff!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000l-s{color:#11131a!important;}
html.sx-light .e-u0000o-s{background:#ffffff!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000n-s{color:#11131a!important;}
html.sx-light .e-u0000q-s{background:#ffffff!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000p-s{color:#11131a!important;}
html.sx-light .e-u0000s-s{background:#ffffff!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000r-s{color:#11131a!important;}
html.sx-light .e-u0000u-s{background:#ffffff!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000t-s{color:#11131a!important;}
html.sx-light .e-u0000w-s{background:#ffffff!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000v-s{color:#11131a!important;}
html.sx-light .e-u0000y-s{background:#ffffff!important;border:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0000x-s{color:#11131a!important;}
html.sx-light .e-u0002f-s{background:#ffffff!important;border-top:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0001l-s{color:#11131a!important;}
html.sx-light .e-u0001m-s{color:#565b67!important;}
html.sx-light .e-u0001n-s{color:#767b87!important;}
html.sx-light .e-u0001p-s{color:#11131a!important;}
html.sx-light .e-u0001x-s{color:#11131a!important;}
html.sx-light .e-u00024-s{color:#11131a!important;}
html.sx-light .e-u0002d-s{border-top:1px solid rgba(13,15,23,0.10)!important;}
html.sx-light .e-u0002b-s{color:#767b87!important;}
html.sx-light .e-u0002f-s{background:#f4f6f8!important;}
html.sx-light .e-u0002f-s::before{background:radial-gradient(ellipse at center,rgba(236,90,30,0.10),transparent 70%)!important;}
html.sx-light .e-u00004-s{background:linear-gradient(118deg,rgba(236,90,30,0.10) 0%,transparent 22%,rgba(236,90,30,0.06) 46%,transparent 68%,rgba(236,90,30,0.09) 90%,transparent 100%),radial-gradient(circle,rgba(121,122,140,0.18) 1px,transparent 1.7px),radial-gradient(ellipse 90% 70% at 50% 0%,#fff4ee 0%,#f6f7f9 55%,#ffffff 100%)!important;background-size:100% 100%,13px 13px,100% 100%!important;}
html.sx-light .kxd-ico{background:#f4f6f8!important;border-color:rgba(13,15,23,0.10)!important;}
html.sx-light .kxd-k{color:#565b67!important;}
html.sx-light .kxd-cl a,html.sx-light .kxd-a{color:#11131a!important;}
html.sx-light .kxd-cl a:hover{color:#e01118!important;}
html.sx-light .e-u0000f-s .kxf-field input,html.sx-light .e-u0000f-s .kxf-field textarea,html.sx-light .e-u0000f-s .kxf-field select{background:#ffffff!important;border-color:rgba(13,15,23,0.10)!important;color:#11131a!important;}
html.sx-light .e-u0000f-s .kxf-field input:focus,html.sx-light .e-u0000f-s .kxf-field textarea:focus{border-color:#e01118!important;}
html.sx-light .e-u0000f-s .kxf-field label{color:#565b67!important;}
html.sx-light .kxd-note{color:#565b67!important;}
</style>" />
      </box>
];

export default defineSite({
  name: 'RequestADemo',
  pages: [{ title: 'RequestADemo', slug: 'request-a-demo', node: <RequestADemo /> }],
});
