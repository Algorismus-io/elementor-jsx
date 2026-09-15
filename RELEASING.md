# Releasing

One rule underneath everything here: **the registry is the product, the tag is the record.** npm is
the only surface users actually consume, and it is irreversible — a published version can be
deprecated but never changed. Everything below exists to make sure what lands there is what we meant,
and that Git can still tell us what it was six months later.

## Version numbers

`MAJOR.MINOR.PATCH`, judged by **what changes for someone who upgrades without reading anything**.

| bump | when | examples from this project |
|---|---|---|
| **PATCH** | Behaviour is fixed, and a user's existing input produces the *same shape* of output | `2.0.1` — inline styles landing on the wrong elements |
| **MINOR** | New capability, or the same input now produces **materially different (better) output** | `2.1.0` — `--atomic-forms`; `2.1.1` — heights/widths now emitted, folding reordered |
| **MAJOR** | Existing input breaks, or output changes in a way that needs human review before shipping | a `sx` prop being renamed or removed |

**The compiler-specific trap.** For a normal library, "fixes only" means PATCH. For a compiler, a fix
can silently change every page it emits. `2.1.1` shipped as a patch and, judged by this table, should
have been `2.2.0` — the same `.page.jsx` gained `h=`/`w=` props and folded overlays differently.
Anyone on `^2.1.0` picked that up automatically. **When in doubt, ask: "if a user re-runs the same
build tomorrow, will the output differ enough that they'd want to look at it?" If yes, MINOR.**

Do not bump for: README edits, tests, CI, comments. Those ride the next real release.

## The release itself

Releases are **tag-triggered**. You do not run `npm publish` by hand — CI does it, because a human
publishing from a laptop is how npm and GitHub drift apart (this repo shipped `2.1.0` and `2.1.1` to
npm with neither commit on `origin`).

```bash
# 1. Be on a release branch off main, working tree clean
git checkout -b release/2.2.0

# 2. Bump + changelog, in ONE commit with the code
#    (never a bare "bump version" commit — the version and the change it names belong together)
npm version 2.2.0 --no-git-tag-version
$EDITOR CHANGELOG.md

# 3. Prove it locally before asking CI to
npm test
node src/cli.mjs import <a real page> --out /tmp/x.page.jsx   # the smoke test below

git commit -am "import: <what actually changed, not 'release 2.2.0'>"
git push -u origin release/2.2.0

# 4. Open a PR into main. CI runs tests on the PR.
# 5. Merge. Then tag main — the tag is what publishes.
git checkout main && git pull
git tag v2.2.0 && git push origin v2.2.0
```

`.github/workflows/release.yml` takes it from there: re-runs the suite, verifies the tag matches
`package.json`, publishes to npm with provenance, and opens a GitHub Release with the changelog
section.

## What must be true before you tag

Not a ritual — each of these has caught a real defect here:

- [ ] **`npm test` green.** The coverage audit fails the suite if a new export has no test; the
      surface test fails if a new export is neither in the barrel nor documented as excluded. Both
      have caught real omissions.
- [ ] **End-to-end smoke test on a real page**, not a fixture: `import` → `lint` → `build` → and if a
      WordPress is up, `deploy`. Unit tests pass happily while the actual pipeline is broken —
      `formSelect` threw `options.map is not a function` and killed every build on a page with a
      `<select>`, with 919 unit tests green.
- [ ] **Free-core path unchanged.** Import a page *without* `--atomic-forms` and confirm zero
      Pro-only widgets are emitted. Free Elementor is most of the audience; a Pro-only element makes
      their deploy abort.
- [ ] **The changelog says what a user will notice**, in their words. "Fixed width handling" is
      useless; "a full-width input rendered at 203px" is not.
- [ ] **Version bump matches the table above**, deliberately — including the compiler trap.

## After it publishes

- [ ] **Fresh-install verification** — `npm i @algorismus/elementor-jsx@<v>` into an empty dir and
      confirm the new code paths are actually in the tarball. `files`/`.npmignore` mistakes are
      invisible locally.
- [ ] **Update the downstream surfaces** — see `docs/DISTRIBUTION.md`. npm is not the only place a
      version number appears, and the others do not update themselves.

## If you shipped something wrong

**Do not unpublish.** It breaks anyone who already installed, and npm blocks re-using the version.

```bash
npm deprecate @algorismus/elementor-jsx@2.1.1 "Broken X — use 2.1.2"
# then fix forward and release again
```

Roll forward, always. The bad version stays in the record, which is correct — it happened.
