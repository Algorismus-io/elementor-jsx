import { defineTheme } from '../../src/theme.mjs';
export const nocturne = defineTheme({
  name: 'nocturne', mode: 'literal',
  color: { primary: '#EDEEF7', accent: '#7C6BFF', ink: '#EDEEF7', muted: '#8A8FA3', surface: '#141625', bg: '#0B0C15', line: '#242840', footer: '#0B0C15', onPrimary: '#0B0C15', onAccent: '#0B0C15' },
  font: { head: 'Space Grotesk', body: 'Inter' },
  radius: { sm: 10, md: 14, lg: 20, xl: 28 },
  space: [0, 4, 8, 12, 16, 24, 32, 48, 64, 96],
  tints: [ {bg:'#7C6BFF',dark:true}, {bg:'#141625',dark:true}, {bg:'#1B1E33',dark:true}, {bg:'#2A2350',dark:true}, {bg:'#141625',dark:true}, {bg:'#1B1E33',dark:true}, {bg:'#242840',dark:true} ],
});
