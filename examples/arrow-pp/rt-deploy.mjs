// Round-trip deploy: take the RECOMPILED decompiled bundle (dist/rt-home.json), merge the kit's 22
// global classes (which the gcls refs point at), remap media, and deploy — proving tree→JSX→tree.
import { readFileSync, existsSync } from 'node:fs';
import { deployBundle } from '../../src/deploy.mjs';

for (const d of [new URL('../../', import.meta.url).pathname]) {
  if (existsSync(d + '.env')) for (const l of readFileSync(d + '.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const IDMAP = { 48: 1576, 49: 1577, 50: 1578, 51: 1579, 52: 1580, 53: 1581, 54: 1582, 55: 1583 };
function remap(obj) {
  let s = JSON.stringify(obj).split('localhost:8917').join('localhost:8915');
  for (const [o, n] of Object.entries(IDMAP)) {
    s = s.replace(new RegExp('("image-attachment-id","value":)' + o + '\\b', 'g'), '$1' + n);
    s = s.replace(new RegExp('("\\$\\$type":"image-attachment-id","value":)' + o + '\\b', 'g'), '$1' + n);
    s = s.replace(new RegExp('(\\{"\\$\\$type":"number","value":)' + o + '\\}', 'g'), '$1' + n + '}'); // IMG_ID shape
  }
  return JSON.parse(s);
}

const dir = new URL('.', import.meta.url).pathname;
const bundle = JSON.parse(readFileSync(dir + '../../dist/rt-home.json', 'utf8'));
const gc = JSON.parse(readFileSync(dir + 'global-classes.json', 'utf8'));

bundle.variables = { data: {}, watermark: 1, version: 1 };   // valid watermark (null → kit-wide fatal)

// merge the kit's global classes into the compiled bundle's class set (both must be present)
bundle.classes.items = { ...gc.items, ...bundle.classes.items };
bundle.classes.order = [...gc.order, ...bundle.classes.order.filter((id) => !gc.order.includes(id))];

// remap media across every page tree
bundle.pages = bundle.pages.map((p) => ({ ...p, slug: 'arrow-rt-home', title: 'Arrow AI — Home (round-trip)', template: 'elementor_canvas', elements: remap(p.elements) }));

const r = await deployBundle(bundle, {});
console.log(JSON.stringify(r, null, 2));
