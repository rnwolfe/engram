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

If `forge.toml` is missing or `repo` is absent, derive `$REPO` from the checkout:

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null \
  || git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
```

---

## Step 1 — Discover State

Start with a fetch so the local view of `origin/$BASE_BRANCH` and remote tracking refs
is current. This also ensures merged-branch detection compares against actual remote state:

```bash
git fetch origin --prune
```

Then run these in parallel:

```bash
# 1. All worktrees with full details (path, branch, HEAD)
git worktree list --porcelain

# 2. Local branches merged into remote base by ancestry (misses squash merges)
git branch --merged origin/$BASE_BRANCH

# 3. All local branches with upstream tracking info (shows [gone] for deleted remotes)
git branch -vv

# 4. Per-branch last-commit timestamp for staleness classification
git for-each-ref --format='%(refname:short) %(committerdate:iso8601)' refs/heads/

# 5. Open PRs (branches with open PRs are never deleted)
gh pr list --repo $REPO --state open --json headRefName,number,title --limit 100

# 6. Recently merged PRs — use a high limit to catch old squash-merged branches
gh pr list --repo $REPO --state merged --json headRefName,number,title,mergedAt --limit 200

# 7. Stash list (surfaced for the user, never auto-dropped)
git stash list

# 8. Working tree status
git status --short

# 9. Current branch
git rev-parse --abbrev-ref HEAD
```

**Squash merge detection:** Squash merges don't produce traceable git ancestry, so
`git branch --merged` won't include them. Cross-reference `gh pr list --state merged`:
a branch is in `merged_local` if its name matches a `headRefName` in the merged PR list,
even if git ancestry doesn't confirm it. Always cite which PR confirmed the merge.

Build four lists:

| List | Criteria |
|------|----------|
| **merged_local** | Local branches found in `git branch --merged origin/$BASE_BRANCH` OR whose name matches a `headRefName` in the merged PR list — excluding `$BASE_BRANCH` itself and the current branch |
| **dead_remote_tracking** | Branches showing `[origin/X: gone]` in `git branch -vv` (the `git fetch --prune` above already removed the stale refs; this list is for local branches that tracked them) |
| **stale_worktrees** | Non-main worktrees whose branch is in `merged_local` only — a gone upstream alone is not sufficient proof of merge |
| **ambiguous** | Local branches not in `merged_local`, with no open PR, and whose last commit is >14 days old (from `git for-each-ref` timestamps) — these need user confirmation; also includes worktrees whose upstream is gone but branch is not confirmed merged |

A branch with an **open PR** is excluded from all deletion lists. It will appear in the
plan under "Nothing to do" as an informational item — it is not silently omitted.

If `git stash list` returns entries, note them in the plan. Stashes are never auto-dropped.
If the working tree has uncommitted changes, note them too.

---

## Step 2 — Present Plan

Print a structured plan before touching anything:

```
Cleanup plan
────────────────────────────────────────

Worktrees to remove (branch confirmed merged):
  .worktrees/issue-42-auth-refactor    branch: autodev/issue-42-auth-refactor [merged via PR #42]
  .worktrees/issue-38-fix-decay        branch: autodev/issue-38-fix-decay [merged via PR #38]

Local branches to delete (merged into main):
  autodev/issue-42-auth-refactor   [ancestry]
  autodev/issue-38-fix-decay       [ancestry]
  fix/old-typo                     [squash PR #47, merged 2026-04-19]

Remote tracking refs to prune:
  (already pruned by git fetch --prune above)

Ambiguous (not confirmed merged, no open PR, >14 days since last commit):
  docs/readme-source-languages   last commit: 2026-04-08   [needs confirmation]

Ambiguous worktrees (upstream gone, branch not confirmed merged):
  .worktrees/spike-auth            branch: spike/auth [upstream gone, unconfirmed]

Nothing to do:
  main                           [base branch, protected]
  fix/cli-ux-audit               [has open PR #251]

Stashes (not auto-dropped — human review needed):
  stash@{0}  feat: extend init with enrichment selection
  stash@{1}  fix: edge fade animation

Working tree (uncommitted changes on main — not touched):
  M docs/internal/STATUS.md
```

In `--dry-run` mode, stop here and exit.

---

## Step 3 — Confirm

If `--yes` is set, skip confirmation for `merged_local` items only — `--yes` counts as
explicit confirmation that merged-PR evidence is sufficient. Still always prompt for
`ambiguous` branches and `ambiguous worktrees` regardless of flags.

For the merged items (unless `--yes`):

```
Proceed with deleting merged branches and removing their worktrees? [Y/n]
```

For each ambiguous branch or worktree, prompt individually:

```
Branch 'docs/readme-source-languages' has no open PR and last commit was 14 days ago.
  Last commit: "docs: update readme" (2026-04-08)
  Delete this branch? [y/N]

Worktree '.worktrees/spike-auth' has a gone upstream but branch 'spike/auth' is not confirmed merged.
  Delete this worktree and branch? [y/N]
```

Default is **No** for all ambiguous items.

---

## Step 4 — Execute

Execute in this order (worktrees before branches — a branch can't be deleted while a
worktree references it):

### 4a — Remove stale worktrees

Use the path discovered from `git worktree list --porcelain`, not a reconstructed path.
Before removing, check that specific worktree for uncommitted changes:

```bash
git -C "$WORKTREE_PATH" status --short
```

If the worktree has uncommitted changes, report it and skip — do not force-remove.
Only use `--force` when the worktree is clean and the branch is confirmed merged:

```bash
git worktree remove --force "$WORKTREE_PATH"
```

### 4b — Delete confirmed local branches

```bash
git branch -d $BRANCH         # safe delete (refuses if not in ancestry)
```

If `-d` refuses because the branch is squash-merged (expected — it's not in ancestry):
use `-D`, but only when the branch is in `merged_local` via PR evidence. Never use `-D`
for ambiguous branches. Passing `--yes` counts as explicit confirmation for merged branches.

### 4c — Delete remote branches for confirmed-merged items

For each branch in `merged_local` that still exists on the remote:

```bash
git push origin --delete $BRANCH
```

Only for confirmed-merged branches. If already gone (404), log and continue — not an error.

### 4d — Check out base branch

```bash
git checkout $BASE_BRANCH
git pull origin $BASE_BRANCH --ff-only
```

If already on the base branch, just pull. If `--ff-only` fails (diverged), report
without force-resetting — the user needs to resolve this manually.

---

## Step 5 — Verify and Report

```bash
git worktree list
git branch -vv
git status
```

Print a completion summary:

```
Cleanup complete
────────────────────────────────────────
Removed worktrees:       2
Deleted local branches:  3  (autodev/issue-42-auth-refactor, autodev/issue-38-fix-decay, fix/old-typo)
Deleted remote branches: 2  (autodev/issue-42-auth-refactor, autodev/issue-38-fix-decay)
Pruned tracking refs:    2  (via git fetch --prune)
Skipped (open PR):       1  (fix/cli-ux-audit → PR #251)
Skipped (ambiguous):     1  (docs/readme-source-languages — user kept)

Current branch:   main
Status:           clean
Unpushed commits: none
```

List anything skipped or failed so the user knows what still needs attention.

---

## Guardrails

- **Never delete `main` or the configured `base_branch`** — even if somehow merged into itself.
- **Never delete a branch with an open PR** — check PR list before any deletion.
- **Never force-delete (`-D`) without merge evidence** — use `-d` first; `-D` only for branches confirmed merged via PR. Passing `--yes` counts as explicit confirmation for merged branches only.
- **Never remove a worktree with uncommitted changes** — check `git -C $PATH status` first; skip and report if dirty.
- **Never remove a worktree solely because its upstream is gone** — a deleted remote branch is not proof of merge; treat as ambiguous and prompt.
- **Never `git reset --hard`** — if the base branch can't fast-forward, report and stop.
- If `git worktree remove` fails for any non-dirty reason, report the error and continue.
