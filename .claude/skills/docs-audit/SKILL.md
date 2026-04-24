---
name: docs-audit
description: "Audit README and STATUS against shipped code — surface documentation drift, then apply targeted edits on approval"
disable-model-invocation: true
---

# Docs Audit — Keep User-Facing Docs in Sync with Reality

You are auditing the user-facing docs (`README.md` and `docs/internal/STATUS.md`)
against what has actually shipped. The goal is to catch drift — new commands
missing from the table, stale version headers, plugins listed as "Planned" that
have already shipped as plugins, "in development" language after a tagged
release — and fix it with **targeted edits, not rewrites**.

**Scope boundary:** This skill does not touch:
- `CHANGELOG.md` — owned by `/release`. Treat it as an authoritative input.
- `docs/internal/VISION.md` — owned by `/product`. Only flag drift for a
  human to route; do not edit it here.
- `docs/internal/DECISIONS.md` — ADRs are append-only; this skill only reads.
- Spec files under `docs/internal/specs/` — ditto.

---

## Input

```
/docs-audit          — Gap list mode: survey drift, report, wait for approval
/docs-audit apply    — Apply the edits proposed in the most recent gap list
/docs-audit readme   — Scope audit to README.md only
/docs-audit status   — Scope audit to docs/internal/STATUS.md only
```

Default is gap-list-then-wait. Only apply edits after the user has seen the
gap list and approved.

---

## Step 0 — Read Project Configuration

Read `forge.toml` at the repo root to confirm `base_branch` and `repo`. If
missing, stop and tell the user to run `/onboard` first.

---

## Step 1 — Establish the Audit Window

Find the last point where docs were intentionally synced:

```bash
# Last commit that touched README or STATUS with a docs: prefix
git log -n 1 --format=%H --grep='^docs' -- README.md docs/internal/STATUS.md

# Fall back to the last release tag if no docs commit is recent
git describe --tags --abbrev=0
```

Call this point `SINCE`. Everything merged after `SINCE` is in the audit
window. Report the chosen anchor to the user so they can override if it's
wrong (e.g. `/docs-audit since=v0.2.0`).

---

## Step 2 — Collect Ground Truth

Read these, in this order:

1. `CHANGELOG.md` — full list of shipped features, grouped by version. This
   is the authoritative "what shipped" record. Pay attention to entries newer
   than `SINCE`.
2. `README.md` — the doc you're about to audit.
3. `docs/internal/STATUS.md` — the status doc.
4. `packages/engram-cli/src/cli.ts` — the registered command list. Every
   `register<X>(program)` call is a command that must appear in the README
   commands table.
5. `ls packages/plugins/` — current bundled plugins. Every subdirectory
   should be represented in the enrichment table.
6. `ls docs/examples/` — config examples worth linking.

Collect live commit data:

```bash
# Commits in the audit window (newest first)
git log --oneline $SINCE..HEAD

# Files touched (helps spot adapter/CLI/spec additions)
git log --name-only --pretty=format:'%h %s' $SINCE..HEAD
```

For each new CLI command (anything imported in `cli.ts` whose file was added
in the window), read the command's `.description()` and `.addHelpText("after", ...)`
so your proposed table row quotes real help text, not fabricated prose.

---

## Step 3 — Run the Audit Checks

Produce findings across six categories. Each finding must name a specific
file + section + what's stale + the evidence from Step 2.

### A. CLI surface drift (README "Commands" table)

- Every `register<X>` in `cli.ts` must appear in the table.
- Flag commands in the table whose description no longer matches the
  `.description()` in the command file.
- Flag new `--flag` options worth surfacing (e.g. `context --as-of`).

### B. Adapter / plugin drift (README "Enrichment" + "Plugins" sections)

- Every directory under `packages/plugins/` must appear as "Plugin (bundled)"
  in the enrichment table.
- Anything listed as "Planned" or "Desired" that now has a bundled plugin
  or built-in is stale.
- `packages/plugins/*` should be mentioned in the Architecture inventory.

### C. Version / status drift

- Header language like "v0.X (schema) — in development" is stale once a
  tag newer than that exists. Check `git describe --tags --abbrev=0`.
- STATUS.md `Latest release:` line must match the highest tag.
- README "Status" table should include rows for anything landed in the
  window, marked `Experimental` until the owner says otherwise.

### D. Feature coverage (README body)

For each **Added** entry in CHANGELOG newer than `SINCE`, confirm there's a
README reference. Missing narrative-level features (new workflows, new config
files, new top-level commands) usually justify a sentence or subsection.
Minor fixes and internal refactors do not.

### E. Ingestion / config examples

- `engram sync` and its config schema should have a subsection if the
  `sync` command exists in `cli.ts`.
- `docs/examples/.engram.config.json` should be linked from the sync
  subsection.
- `.engramignore` / vendor heuristics should be mentioned if implemented
  in source ingest.

### F. STATUS.md-specific checks

- `Last synced:` date should be today.
- Section headings referencing "since v0.X.0 tag" become stale once X.0 is
  no longer the latest — rename to the release they actually shipped in.
- `Architecture Stats` counts (packages, specs, ADRs, schema version,
  adapter contract) should match the current repo. Cross-check by counting:

```bash
ls packages/ | wc -l                        # core packages
ls packages/plugins/ 2>/dev/null | wc -l    # plugins
ls docs/internal/specs/*.md 2>/dev/null | wc -l   # specs
grep -c '^## ADR-' docs/internal/DECISIONS.md     # ADRs
```

---

## Step 4 — Report the Gap List

Output one organized block per file. Each finding names:
- **Location** (section heading and, where it helps, line number)
- **What's stale**
- **Proposed edit** (quote the replacement text, not a description of it)
- **Evidence** (commit, changelog entry, or file path)

Format:

```markdown
### README.md

1. **Commands table** — missing `engram sync`, `engram why`, `engram brief`,
   `engram onboard`, `engram diff`, `engram whats-new`, `engram update`,
   `engram plugin info`.
   Evidence: cli.ts:6–32 imports all of these; CHANGELOG 0.3.0 §Added.
   Proposed rows:
   ```
   | `engram sync` | Run every source declared in `.engram.config.json`… |
   | `engram why <file|symbol|line>` | Narrate the history and rationale… |
   …
   ```

2. **Status section header** — says "v0.2 (schema) — in development" but
   `git describe` shows v0.3.1.
   Evidence: `git describe --tags --abbrev=0` → v0.3.1.
   Proposed: "Latest release: v0.3.1 (schema v0.2, adapter contract v2)."

### docs/internal/STATUS.md

…
```

At the end of the report, print:

> Run `/docs-audit apply` to commit these edits, or reply with specific
> finding numbers to keep (e.g. "apply 1, 3, 5 only"). No files have been
> modified yet.

**Do not modify any files in gap-list mode.**

---

## Step 5 — Apply (only on explicit approval)

Triggered by `/docs-audit apply` or a reply indicating which findings to
apply. Rules:

- Use `Edit` with unique `old_string` / `new_string`, not `Write`. Targeted
  edits only — one finding = one `Edit` call where possible.
- Preserve existing voice, table formatting, heading structure, and capitalization.
- Do not expand the README by more than ~20% per audit. If the gap list
  would require more, flag it and stop — a larger overhaul needs a
  deliberate doc PR, not an audit pass.
- After each edit, read back the affected region to confirm the result
  reads coherently (watch for broken TOC anchors, orphaned references).
- Do not stage, commit, or push. Leave the working tree dirty for the user
  to review with `git diff`.

When done, print:

```
Applied N findings across M files. Run `git diff` to review.
```

---

## Guardrails

- **Targeted, not total rewrites.** The README is a living document the user
  has opinions about — surgical edits preserve voice. A complete rewrite
  resets that voice.
- **No new sections without justification.** A new top-level section is only
  warranted when a major user-facing capability lands that doesn't fit an
  existing section (e.g. v0.3 narrative commands warranted "Narrative
  queries"; a small new flag does not).
- **Quote help text, don't invent it.** Table rows and prose descriptions
  for CLI commands must come from `.description()` / `.addHelpText()`, not
  from your interpretation of what the command does.
- **Don't touch CHANGELOG or VISION.** If audit surfaces drift there, note
  it and route the user to `/release` or `/product`.
- **Always report `SINCE`.** The user needs to know what window you
  audited against so they can challenge the anchor if it's wrong.
