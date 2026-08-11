/// <reference path="../../types.d.ts" />
/** tsx-probe — typed .tsx entry: positive coverage of EVERY intrinsic tag plus 5 expect-error
 * negatives. Built by unit/tsx.test.mjs through the real cli (esbuild strips the types) AND
 * typechecked by tsc --strict against types.d.ts's global JSX namespace. Never deployed. */
// @ts-ignore — site.mjs is untyped JS; the cli-build test exercises this import at runtime
import { defineSite } from '../../src/site.mjs';

const n: number = 2;

const Page = ({ title, children }: { title: string; children?: unknown }) => (
  <section pad={[64, 24]} bg="#F4F6F8">
    <box cls="tsx-gap" maxw={960} center gap={n * 8} pad={0}>
      <h1 color="#B31E2C" size={44} weight={800} ta="center" mobile={{ size: 28 }}>{title} Probe</h1>
      <h2 size={30} tablet={{ size: 24 }}>Second heading</h2>
      <h3 size={22} lh={1.2}>Third heading</h3>
      <h4 dyn={{ $$type: 'dynamic', value: { name: 'post-title', group: 'post', settings: {} } }} />
      <heading tag="h3" size={20} weight={600}>Explicit tag</heading>
      <text href="/exjsx-tsx-probe/" size={15} lh={1.6}>
        Ships <em>fast</em> and <strong>typed</strong><br />today
      </text>
      <p ta="center" color="#5B6B72">Paragraph alias</p>
      <row gap={12} wrap>
        <img src="https://example.com/hero.jpg" alt="Hero" w={320} h={180} fit="cover" radius={12} />
        <img src={42} w={160} />
      </row>
      <col gap={8}>
        <div tw="flex px-6">
          <text size={13}>tw-styled cell</text>
        </div>
      </col>
      <html raw={'<div id="tsx-probe" style="height:4px"></div>'} />
      <box pad={0} attrs={{ 'data-probe': 'tsx', 'aria-label': 'probe' }} hover={{ bg: '#0f172a', raw: 'outline: none;' }} focus-visible={{ bg: '#ffffff' }} active={{ color: '#B31E2C', tablet: { color: '#5B6B72' } }}>
        <text checked={{ weight: 700 }}>state-typed cell</text>
      </box>
      {children}
    </box>
  </section>
);

/* Type-only negatives — NEVER rendered (each would also throw at render; see runtime.mjs).
 * An unused expect-error directive is itself a tsc error, so these fail if the types ever loosen. */
const negatives = () => [
  // @ts-expect-error unknown intrinsic — <span> is not in IntrinsicElements (runtime says: use raw CSS accents)
  <span>nope</span>,
  // @ts-expect-error img requires src (string URL, number attachment id, or DynEnvelope)
  <img />,
  // @ts-expect-error unknown prop — IntrinsicElements has no index signature; bogus props must fail
  <box bogusProp={1} />,
  // @ts-expect-error wrong prop type — size is a number of px, not a string
  <h2 size="big">x</h2>,
  // @ts-expect-error alt with attachment-id src throws at render (alt comes from the attachment's alt_text)
  <img src={42} alt="nope" />,
];
void negatives;

export default defineSite({
  name: 'exjsx-tsx-probe',
  pages: [
    {
      title: 'TSX Probe',
      slug: 'exjsx-tsx-probe',
      node: (
        <>
          <Page title="TSX">
            <text size={12}>fragment + component children</text>
          </Page>
        </>
      ),
    },
  ],
});
