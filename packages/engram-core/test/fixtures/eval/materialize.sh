#!/usr/bin/env bash
#
# Deterministically materialize an engram-on-engram eval fixture.
#
#   ./materialize.sh engram-mcp-decision
#
# Produces, next to <name>.yaml:
#   <name>.engram/            the knowledge graph (git + sectioned decision docs)
#   <name>.bare-cwd/          a sanitized worktree for the bare condition — the
#                             real tree minus the eval meta-docs and the eval
#                             fixtures dir, so a bare agent cannot read the
#                             answer key. Has .git, so `git log` still works.
#
# Both artifacts are .gitignore'd — regenerate on demand rather than committing a
# graph derived from the repo itself.
#
# Requires: the workspace `engram` binary on PATH (bun link --cwd packages/engram-cli).
set -euo pipefail

NAME="${1:-engram-mcp-decision}"
FIXTURE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$FIXTURE_DIR" rev-parse --show-toplevel)"
ENGRAM="${ENGRAM:-engram}"

DB="$FIXTURE_DIR/$NAME.engram"
# bare-cwd lives OUTSIDE the repo: it is a full source checkout, and a copy of
# the tree inside the tree breaks biome ("nested root configuration") and makes
# `bun test` discover duplicate test files.
BARE_CWD="${TMPDIR:-/tmp}/engram-eval-$NAME.bare-cwd"

echo "Materializing $NAME"
echo "  repo:   $REPO_ROOT"
echo "  engram: $("$ENGRAM" --version 2>/dev/null || echo MISSING)"

# ---------------------------------------------------------------------------
# 1. Sanitized checkout. The graph is built FROM this tree so source ingestion
#    never sees the eval meta-docs (direction-2026-h2.md, near-term-plan.md) —
#    they quote the prompt and state the answer. Git history is shared with the
#    real repo via the worktree, so commit-message rationale is preserved.
# ---------------------------------------------------------------------------
git -C "$REPO_ROOT" worktree remove --force "$BARE_CWD" 2>/dev/null || true
rm -rf "$BARE_CWD"
git -C "$REPO_ROOT" worktree add --quiet --detach "$BARE_CWD" HEAD
rm -f "$BARE_CWD/docs/internal/direction-2026-h2.md" \
      "$BARE_CWD/docs/internal/near-term-plan.md"
rm -rf "$BARE_CWD/packages/engram-core/test/fixtures/eval"
echo "  bare:   $BARE_CWD (meta-docs + eval fixtures removed)"

# ---------------------------------------------------------------------------
# 2. Knowledge graph — built with cwd = the sanitized tree so BOTH git history
#    and source ingestion (which walks cwd) see only sanitized content. Git
#    history still contains the meta-doc commits, but only their commit messages
#    (not the answer-key prose) become substrate.
# ---------------------------------------------------------------------------
rm -rf "$DB"
( cd "$BARE_CWD" && \
  "$ENGRAM" init --yes --embedding-model none --db "$DB" --from-git . >/dev/null && \
  "$ENGRAM" ingest md "docs/internal/DECISIONS.md" --db "$DB" >/dev/null && \
  "$ENGRAM" ingest md "docs/internal/harness-pivot-plan.md" --db "$DB" >/dev/null )
echo "  graph:  $(sqlite3 "$DB/engram.db" 'SELECT count(*) FROM episodes;') episodes"

echo "Done. Run: bun run eval --fixture $NAME   (bare cwd: $BARE_CWD)"
