# Roadmap specs

Source-verified engineering specs. Every wire format cited here was extracted
from Elementor 4.2.1 free source and the elementor-ultra-mcp plugin with
file:line evidence (research session 2026-08-12); re-verify against the target
Elementor version at implementation time — the certification suite is the
mechanism.

| Release | Spec | One line |
|---|---|---|
| 1.7.x | [1.7.x-css-attrs-states.md](1.7.x-css-attrs-states.md) | any CSS native (incl. per-state), attributes (version-gated), full state coverage |
| 1.8 | [1.8-interactions.md](1.8-interactions.md) | `motion={}` → native Elementor interactions, lint-guarded, reduced-motion aware |
| 2.0 | [2.0-components.md](2.0-components.md) | JSX components → registered Elementor components with overridable props |
