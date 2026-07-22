// Pixel-perfect Arrow deploy: carry the real kx theme (installed as mu-plugin on target) +
// deploy the EXACT live _elementor_data trees + the live kit's 22 global classes, through the
// elementor-jsx deploy pipeline. Media remapped from the :8917 source ids to the :8915 sideloaded ids.
import { readFileSync, existsSync } from 'node:fs';
import { deployBundle } from '../../src/deploy.mjs';

// load .env (WP_URL/creds/EXJSX_*) so a direct node run has them
for (const d of [new URL('../../', import.meta.url).pathname]) {
  if (existsSync(d + '.env')) for (const l of readFileSync(d + '.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const IDMAP = { 48: 1576, 49: 1577, 50: 1578, 51: 1579, 52: 1580, 53: 1581, 54: 1582, 55: 1583 };
function remap(s) {
  s = s.split('localhost:8917').join('localhost:8915');           // domain (path/filename identical)
  for (const [o, n] of Object.entries(IDMAP))                     // attachment ids (scoped to image refs)
    s = s.replace(new RegExp('("image-attachment-id","value":)' + o + '\\b', 'g'), '$1' + n);
  return s;
}

const ONLY = process.argv[2];  // optional single slug (e.g. "home")
const PAGES = [
  ['home', 'arrow-pp-home', 'Arrow AI — Home (pp)'],
  ['about', 'arrow-pp-about', 'Arrow AI — About (pp)'],
  ['services', 'arrow-pp-services', 'Arrow AI — Services (pp)'],
  ['industries', 'arrow-pp-industries', 'Arrow AI — Industries (pp)'],
  ['platform', 'arrow-pp-platform', 'Arrow AI — Platform (pp)'],
  ['request-a-demo', 'arrow-pp-request-a-demo', 'Arrow AI — Request a Demo (pp)'],
  ['contact-us', 'arrow-pp-contact-us', 'Arrow AI — Contact Us (pp)'],
].filter(p => !ONLY || p[0] === ONLY);

const dir = new URL('.', import.meta.url).pathname;
const pages = PAGES.map(([file, slug, title]) => ({
  title, slug, template: 'elementor_canvas',
  elements: JSON.parse(remap(readFileSync(dir + `trees/${file}.json`, 'utf8'))),
}));
const gc = JSON.parse(readFileSync(dir + 'global-classes.json', 'utf8'));
const bundle = {
  name: 'arrow-pp',
  variables: { data: {}, watermark: 0, version: 1 },
  classes: { items: gc.items, order: gc.order },
  pages, fonts: [],
};
const r = await deployBundle(bundle, {});
console.log(JSON.stringify(r, null, 2));
