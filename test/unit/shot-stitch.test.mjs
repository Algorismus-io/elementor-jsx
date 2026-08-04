// Guards the elementor-ultra CLI tall-page screenshot slicer (toolset repo, reached through the
// parent-dir .claude/skills symlink). Skips — never fails — on checkouts without the toolset,
// mirroring test/integration/hardening.test.mjs's absent-dependency precedent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const LIB_DIR = new URL('../../../.claude/skills/elementor-ultra/lib/', import.meta.url);
const MOD_URL = new URL('shot-stitch.mjs', LIB_DIR);
const CLI_URL = new URL('cli.mjs', LIB_DIR);
const present = existsSync(fileURLToPath(MOD_URL));

test('planShotSlices: height→plan table (single-shot ≤8000, sliced above, clamped tail, no duplicate tail)', async (t) => {
  if (!present) return t.skip('toolset checkout absent');
  const { planShotSlices, MAX_SINGLE_SHOT_PX, SLICE_HEIGHT_PX } = await import(MOD_URL);
  assert.equal(MAX_SINGLE_SHOT_PX, 2500);   // lowered from 8000 — see shot-stitch.mjs field-found #2
  assert.equal(SLICE_HEIGHT_PX, 4000);
  const table = [
    { name: 'short page', args: [900], want: null },
    { name: 'exactly the single-shot ceiling', args: [2500], want: null },
    { name: 'over maxSingleShot but fits one slice', args: [3000, { maxSingleShot: 2000, sliceHeight: 4000 }], want: null },
    { name: 'one px over the ceiling → clamped overlapping tail', args: [8001], want: [{ scrollY: 0 }, { scrollY: 4000 }, { scrollY: 4001 }] },
    { name: 'exact multiple → no duplicate tail', args: [12000], want: [{ scrollY: 0 }, { scrollY: 4000 }, { scrollY: 8000 }] },
    { name: 'live /airpods-pro/ height', args: [22151], want: [{ scrollY: 0 }, { scrollY: 4000 }, { scrollY: 8000 }, { scrollY: 12000 }, { scrollY: 16000 }, { scrollY: 18151 }] },
  ];
  for (const { name, args, want } of table) assert.deepEqual(planShotSlices(...args), want, name);
});

test('planShotSlices: invalid pageHeight fails loudly', async (t) => {
  if (!present) return t.skip('toolset checkout absent');
  const { planShotSlices } = await import(MOD_URL);
  for (const bad of [0, -1, NaN, Infinity, '9000', undefined])
    assert.throws(() => planShotSlices(bad), /positive finite/, `pageHeight ${String(bad)}`);
});

test('stitchShotSlices: pixel-exact reassembly including the overlapping clamped tail', async (t) => {
  if (!present) return t.skip('toolset checkout absent');
  const { planShotSlices, stitchShotSlices } = await import(MOD_URL);
  // 8x10 source: every row has distinct RGBA so any mis-placed/overwritten row is detectable.
  const source = new PNG({ width: 8, height: 10 });
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      source.data[i] = y * 20;
      source.data[i + 1] = 255 - y * 20;
      source.data[i + 2] = y;
      source.data[i + 3] = 255;
    }
  const plan = planShotSlices(10, { sliceHeight: 4, maxSingleShot: 8 });
  assert.deepEqual(plan, [{ scrollY: 0 }, { scrollY: 4 }, { scrollY: 6 }]);
  const slices = plan.map(({ scrollY }) => {
    const png = new PNG({ width: 8, height: 4 });
    PNG.bitblt(source, png, 0, scrollY, 8, 4, 0, 0);
    return { png, dstY: scrollY };
  });
  const stitched = stitchShotSlices(PNG, slices, { width: 8, pageHeight: 10 });
  assert.equal(stitched.width, 8);
  assert.equal(stitched.height, 10);
  assert.equal(Buffer.compare(stitched.data, source.data), 0, 'overlap overwrite is lossless');
});

test('stitchShotSlices: loud failures name the defect and the fix', async (t) => {
  if (!present) return t.skip('toolset checkout absent');
  const { stitchShotSlices } = await import(MOD_URL);
  const mk = (width, height) => new PNG({ width, height });
  const table = [
    { name: 'empty slices', slices: [], regexes: [/STITCH_EMPTY/] },
    { name: 'width mismatch', slices: [{ png: mk(7, 4), dstY: 0 }], regexes: [/STITCH_WIDTH_MISMATCH/, /deviceScaleFactor/] },
    { name: 'out of bounds', slices: [{ png: mk(8, 4), dstY: 8 }], regexes: [/STITCH_OOB/, /re-run/] },
    { name: 'gap rows 4-5', slices: [{ png: mk(8, 4), dstY: 0 }, { png: mk(8, 4), dstY: 6 }], regexes: [/STITCH_GAP/] },
  ];
  for (const { name, slices, regexes } of table)
    for (const re of regexes)
      assert.throws(() => stitchShotSlices(PNG, slices, { width: 8, pageHeight: 10 }), re, `${name}: ${re}`);
});

test('cli.mjs shot verb routes through the slicer and keeps the single-shot path (source contract)', (t) => {
  if (!present) return t.skip('toolset checkout absent');
  const src = readFileSync(fileURLToPath(CLI_URL), 'utf8');
  assert.match(src, /from '\.\/shot-stitch\.mjs'/, 'cli imports the slicer module');
  const start = src.indexOf("cmd === 'shot'");
  assert.ok(start >= 0, 'shot branch exists');
  const end = src.indexOf('} else if', start);
  assert.ok(end > start, 'shot branch is delimited');
  const branch = src.slice(start, end);
  assert.match(branch, /planShotSlices/, 'shot branch plans slices');
  assert.match(branch, /stitchShotSlices/, 'shot branch stitches slices');
  assert.match(branch, /fullPage: true/, 'single-shot path preserved');
  const afterResize = branch.slice(branch.indexOf('setViewportSize'));
  assert.ok(branch.includes('setViewportSize'), 'sliced path resizes the viewport');
  assert.doesNotMatch(afterResize, /fullPage/, 'no fullPage screenshot on the sliced path');
});
