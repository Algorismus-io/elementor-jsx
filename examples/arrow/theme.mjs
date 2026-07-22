import { defineTheme } from '../../src/theme.mjs';

// Arrow AI brand tokens — reverse-engineered from the live staging site (tryreachwise.space).
// bg #07071C, panels #12122a, red accent #E01118 / hi #ff3b3b, muted #8A8B9E, white headings.
// Heads: Geist (live site), body: Manrope (live site body font).
export const arrow = defineTheme({
  name: 'arrow', mode: 'var',
  color: {
    primary: '#FFFFFF',      // headings / primary ink
    accent: '#E01118',       // brand red
    hi: '#ff3b3b',
    ink: '#FFFFFF',
    muted: '#8A8B9E',        // body / secondary text on dark
    surface: '#12122a',      // panel
    bg: '#07071C',           // page background
    panel: '#12122a',
    line: 'rgba(255,255,255,0.08)',
    footer: '#07071C',
    onPrimary: '#07071C',
  },
  font: { head: 'Geist', body: 'Geist' },   // live site is all-Geist (body was wrongly Manrope)
  radius: { sm: 0, md: 0, lg: 0, xl: 0 },   // Arrow uses sharp corners everywhere
  space: [0, 4, 8, 12, 16, 24, 32, 48, 64, 96],
});
