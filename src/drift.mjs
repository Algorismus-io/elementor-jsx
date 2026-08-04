/**
 * drift.mjs — pure hand-edit drift detection core (no I/O; deploy.mjs does the wp-cli reads/writes).
 *
 * Deploy stamps every page it writes with `_exjsx_hash` = canonicalHash(saved _elementor_data).
 * On the next deploy, a stamp that no longer matches the live tree means someone edited the page
 * OUTSIDE exjsx (Elementor editor, plugin migration, direct SQL) — deploy warns and skips instead
 * of silently clobbering those edits (--force overrides).
 */
import { createHash } from 'node:crypto';

/* canonical JSON (sorted keys) — duplicated from the private stable() in src/classes.mjs (the
 * sibling); objects sort keys, arrays keep order — sibling order IS content in an Elementor tree. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

/**
 * 64-char lowercase-hex sha256 of the stable-sorted canonical JSON of an Elementor elements tree.
 * Accepts the tree directly (array/object) or the raw `_elementor_data` string as WP returns it —
 * including double-encoded strings (max 2 JSON.parse passes). Because BOTH sides pass through
 * JSON.parse before canonicalization, \uXXXX-escape vs literal-char and key-order differences hash
 * equal. Returns null for null/undefined/'' (no data to hash).
 */
export function canonicalHash(input) {
  if (input === null || input === undefined || input === '') return null;
  let v = input;
  for (let pass = 0; typeof v === 'string' && pass < 2; pass++) {
    try { v = JSON.parse(v); } catch {
      throw new Error(`_elementor_data appears hand-corrupted (not valid JSON): ${String(v).slice(0, 80)} — --force to overwrite, or fix the meta`);
    }
  }
  if (typeof v === 'string') {
    throw new Error('_elementor_data appears hand-corrupted (still a string after 2 JSON.parse passes) — --force to overwrite, or fix the meta');
  }
  return createHash('sha256').update(stable(v)).digest('hex');
}

/** The four-way deploy decision. `stamped` = _exjsx_hash meta (null if never stamped), `current` =
 * canonicalHash of the live _elementor_data (null if missing/unreadable — with a stamp, that IS drift). */
export function decideDrift({ stamped, current, force }) {
  if (!stamped) return { proceed: true, drifted: false, reason: 'first-stamp' };
  if (stamped === current) return { proceed: true, drifted: false, reason: 'clean' };
  return force
    ? { proceed: true, drifted: true, reason: 'drifted-forced' }
    : { proceed: false, drifted: true, reason: 'drifted-skip' };
}

/** First 10 hex chars for human-facing messages; null/undefined-safe. */
export function shortHash(h) {
  return h ? String(h).slice(0, 10) : '(none)';
}
