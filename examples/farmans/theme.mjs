import { defineTheme } from '../../src/theme.mjs';
export const farmans = defineTheme({
  name: 'farmans', mode: 'var',
  color: { primary: '#093D57', accent: '#85C441', ink: '#0A2230', muted: '#5B6B72', surface: '#ffffff', bg: '#F5F9E6', line: '#E4E9DC', footer: '#06293C', onPrimary: '#ffffff', onAccent: '#06293C' },
  font: { head: 'Poppins', body: 'Inter' },
  radius: { sm: 16, md: 24, lg: 32, xl: 44 },
  space: [0, 4, 8, 12, 16, 24, 32, 48, 64, 96],
  tints: [ {bg:'#093D57',dark:true}, {bg:'#85C441',dark:false}, {bg:'#DCEAEF',dark:false}, {bg:'#25708D',dark:true}, {bg:'#ECF2D6',dark:false}, {bg:'#ffffff',dark:false}, {bg:'#E4F0CE',dark:false} ],
});
