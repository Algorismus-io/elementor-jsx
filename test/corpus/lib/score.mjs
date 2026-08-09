/**
 * score.mjs — photometric comparison of reference vs exjsx screenshots.
 *
 * Same method family as the eu-studio pixeldiff gate (kept self-contained here on purpose):
 * grayscale mean |Δ| luminance over the COMMON region (min width × min height), plus the worst
 * 50px horizontal band (where does it diverge most), via python3 + PIL/numpy.
 *
 * Interpretation (empirical, same thresholds as eu-studio):
 *   ≤3 near-identical · 3–8 faithful (font/AA noise) · 8–20 visible deviations · >20 structural.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PY = `
import json, sys
from PIL import Image
import numpy as np
a = np.array(Image.open(sys.argv[1]).convert('L')).astype(int)   # reference
b = np.array(Image.open(sys.argv[2]).convert('L')).astype(int)   # exjsx
h = min(a.shape[0], b.shape[0]); w = min(a.shape[1], b.shape[1])
d = np.abs(a[:h, :w] - b[:h, :w]).astype(float)
worst = {'y': None, 'mean': 0.0}
for y in range(0, max(1, h - 49), 50):
    m = float(d[y:y+50].mean())
    if m > worst['mean']: worst = {'y': y, 'mean': round(m, 2)}
print(json.dumps({
    'mean': round(float(d.mean()), 2),
    'worstBand': worst,
    'common': [w, h],
    'refSize': [a.shape[1], a.shape[0]],
    'exSize': [b.shape[1], b.shape[0]],
    'heightDelta': int(b.shape[0]) - int(a.shape[0]),
}))
`;

let scriptPath = null;
export function score(refPng, exPng) {
  if (!scriptPath) {
    scriptPath = join(mkdtempSync(join(tmpdir(), 'corpus-score-')), 'score.py');
    writeFileSync(scriptPath, PY);
  }
  const out = execFileSync('python3', [scriptPath, refPng, exPng], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(out.trim());
}

export const band = (mean) => (mean <= 3 ? 'near-identical' : mean <= 8 ? 'faithful' : mean <= 20 ? 'visible' : 'structural');
