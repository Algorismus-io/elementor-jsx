import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Data sources resolve from an absolute base (import.meta.url is unreliable once esbuild inlines this
// module into the bundle). A real project would set a configurable EXJSX_DATA root.
const DIR = process.env.EXJSX_DATA || '/Users/shahmir/projects/wpos-muneeb-backend/mcp-test-envs/wpos-stack/farmans-src/Farmans.co/Content-Data/state-content';
const load = (abbr) => JSON.parse(readFileSync(join(DIR, `state-${abbr}.json`), 'utf8').replace(/^﻿/, ''));
// a demo slice — swap for all 51 by globbing the dir
export const states = ['CA', 'TX', 'NY', 'FL', 'CO', 'AK'].map(load);
export const stateSlug = (s) => `web-growth-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
