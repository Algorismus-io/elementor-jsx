/**
 * .tsx intellisense — the REAL cli builds a typed .tsx entry (esbuild strips types), and
 * tsc --strict (skipLibCheck OFF, so errors inside types.d.ts itself fail too) typechecks the
 * same probe against the global JSX namespace: positives + 5 @ts-expect-error negatives.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'test', 'fixtures', 'tsx-probe.tsx');
const run = (args) => execFileSync('node', [join(root, 'src', 'cli.mjs'), ...args], { encoding: 'utf8' });

test('cli build: .tsx entry — esbuild strips types, jsx factory injected, bundle exact', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'exjsx-tsx-')), 'b.json');
  const log = run(['build', fixture, out]);
  assert.match(log, /built exjsx-tsx-probe: 1 page\(s\)/);
  const b = JSON.parse(readFileSync(out, 'utf8'));

  const flat = [];
  (function w(ns) { for (const n of ns || []) { flat.push(n); w(n.elements); } })(b.pages[0].elements);

  // typed-param interpolation ({title} Probe) survived type stripping via textOf → html-v3
  const h1 = flat.find((n) => n.widgetType === 'e-heading' && n.settings?.tag?.value === 'h1');
  assert.ok(h1, 'h1 heading present');
  assert.deepEqual(h1.settings.tag, { $$type: 'string', value: 'h1' });
  assert.deepEqual(h1.settings.title, {
    $$type: 'html-v3',
    value: { content: { $$type: 'string', value: 'TSX Probe' }, children: [] },
  });

  // img URL form → IMG_URL envelope with inline alt; img id form → IMG_ID (url null)
  const imgs = flat.filter((n) => n.widgetType === 'e-image');
  const urlImg = imgs.find((n) => n.settings.image.value.src.value.url);
  assert.deepEqual(urlImg.settings.image, {
    $$type: 'image',
    value: {
      src: {
        $$type: 'image-src',
        value: {
          id: null,
          url: { $$type: 'url', value: 'https://example.com/hero.jpg' },
          alt: { $$type: 'string', value: 'Hero' },
        },
      },
      size: { $$type: 'string', value: 'full' },
    },
  });
  const idImg = imgs.find((n) => n.settings.image.value.src.value.id);
  assert.equal(idImg.settings.image.value.src.value.id.value, 42);
  assert.equal(idImg.settings.image.value.src.value.url, null);

  // gap={n * 8} with const n: number = 2 → 16px on the container class — TS annotations stripped, not mangled
  const gapCls = b.classes.order.find((c) => c.startsWith('g-tsx-gap'));
  assert.ok(gapCls, 'g-tsx-gap class present');
  const desk = b.classes.items[gapCls].variants.find((v) => v.meta.breakpoint === 'desktop');
  assert.deepEqual(desk.props.gap, { $$type: 'size', value: { unit: 'px', size: 16 } });
});

test('types.d.ts: global JSX namespace typechecks tsx-probe (positives + 5 @ts-expect-error negatives)', async (t) => {
  let ts;
  try { ts = (await import('typescript')).default; }
  catch { return t.skip('typescript not installed — npm i -D typescript'); }

  // skipLibCheck OFF: errors INSIDE types.d.ts (not just the probe) fail this test.
  const prog = ts.createProgram([join(root, 'types.d.ts'), fixture], {
    strict: true,
    noEmit: true,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: false,
  });
  const diags = ts.getPreEmitDiagnostics(prog).map((d) =>
    `${d.file?.fileName.split('/').pop()}:${d.file ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : '?'} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  // zero diagnostics proves all positives typecheck AND all 5 negatives still error
  // (an unused @ts-expect-error is itself a diagnostic)
  assert.deepEqual(diags, [], `tsc found type errors (fix types.d.ts JSX namespace or the probe):\n  ${diags.join('\n  ')}`);
});
