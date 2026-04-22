---
name: cleanup
description: "Clean up stale git state — remove merged branches (local and remote), prune remote tracking refs, remove stale worktrees, and land on a clean main. Use this whenever the repo feels messy after forge-loop sessions, before starting new work, or when asked to tidy/clean up branches or worktrees. Also triggers for: 'what local work is out of sync?', 'I have stale branches', 'clean up after merging', 'remove old worktrees'."
disable-model-invocation: true
---

# Cleanup — Restore Clean Repo State

Remove merged branches, stale worktrees, and dead remote tracking refs, then land on
a verified-clean `main`. Safe by default: anything not provably merged is shown to the
user before deletion.

## Input

`$ARGUMENTS` — optional flags.

```
/cleanup              # Interactive: show plan, confirm before deleting anything ambiguous
/cleanup --dry-run    # Show what would be deleted without touching anything
/cleanup --yes        # Skip confirmation for merged items (still prompts for ambiguous)
```

---

## Step 0 — Read Configuration

Read `forge.toml` for `[project].base_branch` (default: `main`) and `[project].repo`.

If `forge.toml` is missing, assume `base_branch = main`.

---

## Step 1 — Discover State

Run these in parallel to build a complete picture before taking any action:

```bash
# 1. All worktrees
git worktree list --porcelain

# 2. Local branches merged into base (ancestry-based — misses squash merges)
git branch --merged $BASE_BRANCH

# 3. All local branches with upstream tracking info
git branch -vv

# 4. Remote tracking refs
git remote show origin

# 5. Open PRs (to avoid deleting a branch with active work)
gh pr list --repo $REPO --state open --json headRefName,number,title --limit 100

# 6. Recently merged PRs (catches squash merges that git cannot detect via ancestry)
gh pr list --repo $REPO --state merged --json headRefName,number,title,mergedAt --limit 50

# 7. Stash list (not cleaned up, but surfaced for the user)
git stash list

# 8. Working tree status
git status --short

# 9. Current branch
git rev-parse --abbrev-ref HEAD
```

**Important — squash merge detection:** This repo uses squash-merge PRs. Squash merges do not produce a traceable ancestry link, so `git branch --merged` will not include them. A branch is considered "merged" if it appears in either `git branch --merged` OR in `gh pr list --state merged` with a matching `headRefName`. Always cross-reference both sources.

Build four lists from this data:

| List | Criteria |
|------|----------|
| **merged_local** | Local branches found in `git branch --merged $BASE_BRANCH` OR whose `headRefName` appears in the merged PR list — excluding `$BASE_BRANCH` itself and the current branch |
| **dead_remote_tracking** | Remote tracking refs where the remote branch no longer exists (detected via `git branch -vv` showing `[origin/X: gone]`) |
| **stale_worktrees** | Non-main worktrees whose branch is in `merged_local` OR whose remote tracking ref is gone |
| **ambiguous** | Local branches not in `merged_local` but with no open PR and no recent commits (>14 days stale on remote) — these need user confirmation |

A branch with an **open PR** is never in any deletion list — skip it silently.

If `git stash list` returns any entries, note them in the plan. Stashes are never auto-dropped — they need human review. If the working tree has uncommitted changes on the base branch, note them too.

---

## Step 2 — Present Plan

Print a structured plan before touching anything:

```
Cleanup plan
────────────────────────────────────────

Worktrees to remove (branch merged):
  .worktrees/issue-42-auth-refactor    branch: autodev/issue-42-auth-refactor [merged via PR #42]
  .worktrees/issue-38-fix-decay        branch: autodev/issue-38-fix-decay [merged via PR #38]

Local branches to delete (merged into main):
  autodev/issue-42-auth-refactor   [ancestry]
  autodev/issue-38-fix-decay       [ancestry]
  fix/old-typo                     [squash PR #47, merged 2026-04-19]

Remote tracking refs to prune:
  origin/autodev/issue-42-auth-refactor  [gone]
  origin/autodev/issue-38-fix-decay      [gone]

Ambiguous branches (not merged, no open PR, >14 days stale):
  docs/readme-source-languages   last commit: 2026-04-15   [needs confirmation]

Nothing to do:
  main                           [base branch, protected]
  fix/cli-ux-audit               [has open PR #251]

Stashes (not auto-dropped — human review needed):
  stash@{0}  feat: extend init with enrichment selection
  stash@{1}  fix: edge fade animation

Working tree (uncommitted changes on main — not touched):
  M docs/internal/STATUS.md
  M docs/internal/VISION.md
```

For squash-merged branches, note which PR confirmed the merge — this is the evidence used if `-d` refuses.

In `--dry-run` mode, stop here and exit.

---

## Step 3 — Confirm

If `--yes` is set, skip confirmation for `merged_local` and `dead_remote_tracking` only.
Always prompt for `ambiguous` branches regardless of flags.

For the merged/dead items (unless `--yes`):

```
Proceed with deleting merged branches and pruning dead tracking refs? [Y/n]
```

For each ambiguous branch, ask individually:

```
Branch 'docs/readme-source-languages' has no open PR and hasn't been pushed in 14 days.
  Last commit: "docs: update readme" (2026-04-15)
  Delete this branch? [y/N]
```

Default is **No** for ambiguous branches.

---

## Step 4 — Execute

Execute in this order (order matters — remove worktrees before branches):

### 4a — Remove stale worktrees

```bash
git worktree remove --force ".worktrees/$SLUG"
```

If the worktree has uncommitted changes, report it and skip rather than force-removing.
The `--force` flag is safe here only because we checked the branch is merged.

### 4b — Delete confirmed local branches

```bash
git branch -d $BRANCH         # safe delete (refuses if unmerged by ancestry)
```

If `-d` fails because the branch was squash-merged (not in git ancestry): this is expected.
The merge evidence is the PR — you already cited it in the plan. Use `-D` for squash-merged
branches only, and only after the user has confirmed (or `--yes` was passed and you cited
the PR number). Never use `-D` without that evidence. Never use `-D` for ambiguous branches
regardless of flags.

### 4c — Prune remote tracking refs

```bash
git fetch --prune origin
```

This cleans all dead `origin/*` tracking refs in one shot — safer and faster than
deleting them one by one.

### 4d — Delete remote branches for confirmed-merged items

For each branch in `merged_local` that still exists on the remote:

```bash
git push origin --delete $BRANCH
```

Only do this for branches confirmed merged (not ambiguous). If the remote branch is
already gone (404), log it and continue — not an error.

### 4e — Check out base branch

```bash
git checkout $BASE_BRANCH
git pull origin $BASE_BRANCH --ff-only
```

If the current branch is the base branch, just pull. If `--ff-only` fails (diverged),
report the situation without force-resetting. The user needs to know.

---

## Step 5 — Verify and Report

Run a final state check:

```bash
git worktree list
git branch -vv
git status
```

Print a completion summary:

```
Cleanup complete
────────────────────────────────────────
Removed worktrees:     2
Deleted local branches:  3  (autodev/issue-42-auth-refactor, autodev/issue-38-fix-decay, fix/old-typo)
Deleted remote branches: 2  (autodev/issue-42-auth-refactor, autodev/issue-38-fix-decay)
Pruned tracking refs:    2
Skipped (open PR):       1  (fix/cli-ux-audit → PR #251)
Skipped (ambiguous):     1  (docs/readme-source-languages — user kept)

Current branch:   main
Status:           clean
Unpushed commits: none
```

If anything was skipped or failed, list it clearly so the user knows what still needs attention.

---

## Guardrails

- **Never delete `main` or the configured `base_branch`** — even if somehow merged into itself.
- **Never delete a branch with an open PR** — check PR list first.
- **Never force-delete (`-D`) without explicit user confirmation** — use `-d` and let it fail safe.
- **Never remove a worktree with uncommitted changes** — report it and skip.
- **Never `git reset --hard`** — if the base branch can't fast-forward, report and stop.
- If `git worktree remove` fails for any reason other than uncommitted changes, report the error and continue with the rest of the cleanup rather than aborting.
