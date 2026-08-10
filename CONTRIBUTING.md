# Contributing to elementor-jsx

Thanks for being here. This project moves fast and reviews faster — small, focused PRs land quickest.

## Quick start
1. `npm i` then `npm test` — the 400+ case suite is the contract. Green before and after your change.
2. A local WordPress for end-to-end work: `npx @algorismus/elementor-ultra-playground` (no Docker).
3. Live loop against it: `npx exjsx dev <site-dir> --gates`.

## What we love
- **Bug reports with a reproducing JSX snippet** — if `exjsx build` misbehaves on a tree, paste the smallest component that shows it.
- **Fidelity gaps**: places where compiled output diverges from what Elementor's editor produces natively.
- **tw= subset gaps**: utilities you expected that threw. Each one added ships with tests.
- Docs fixes, always.

## Ground rules
- Every behavior change lands with a test. `CONVENTIONS.md` explains the authoring doctrine; `npx exjsx lint --strict` must pass.
- The validator is authoritative: if server-side validation rejects your output, fix the compiler, not the validator.
- Be kind. Assume good faith. Maintainer response target: under 24h.

## Releases
Maintainers cut releases; versions are certified against specific Elementor releases before tagging.
