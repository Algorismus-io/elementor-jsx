/** Famous Vineyards tokens — sampled from full-res Figma section exports (node 400:7508).
 *  Brand faces are commercial (Novaletra Serif CF / Armin Soft) — closest Google metrics:
 *  Fraunces (soft serif heads) + Quicksand (rounded geometric body). Documented substitution. */
export default defineTheme({
  name: 'famous-vineyards',
  color: {
    deep: '#105742',      // headings, borders, buttons (design-context exact)
    lime: '#a4d866',      // nav bar, footer, green card
    pink: '#ffb3b9', blue: '#88dcec',
    stripeA: '#f1f9e8', stripeB: '#e6f3f0',
    navy: '#1a1e2c',
    ink: '#1d3b2a',
  },
  font: { head: 'Fraunces', body: 'Quicksand' },
  mode: 'literal',
});
