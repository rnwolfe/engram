#!/usr/bin/env bash
#
# Deterministically materialize an engram-on-engram eval fixture.
#
#   ./materialize.sh engram-mcp-decision
#   ./materialize.sh engram-pr-rationale     # also ingests GitHub issues/PRs
#
# Produces, next to <name>.yaml:
#   <name>.engram/     the knowledge graph (git + source + sectioned decision
#                      docs; + GitHub issues/PRs for the pr-rationale fixture)
#   <name>.bare-cwd/   a sanitized, `.git`-LESS archive of HEAD for the bare
#                      condition — full code + docs minus the eval meta-docs and
#                      the eval fixtures dir. `.git`-less is load-bearing: an
#                      agentic harness (agy) follows a worktree's .git back to
#                      the real repo, leaking the answer key. A `git archive`
#                      checkout has no .git, so the agent is fully isolated.
#
# Both artifacts are .gitignore'd — regenerate on demand rather than committing a
# graph derived from the repo itself.
#
# Requires: workspace `engram` on PATH (bun link --cwd packages/engram-cli).
# For pr-rationale: gh authenticated (the script exports GITHUB_TOKEN=$(gh auth token)).
set -euo pipefail

NAME="${1:-engram-mcp-decision}"
FIXTURE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$FIXTURE_DIR" rev-parse --show-toplevel)"
ENGRAM="${ENGRAM:-engram}"

DB="$FIXTURE_DIR/$NAME.engram"
BARE_CWD="${TMPDIR:-/tmp}/engram-eval-$NAME.bare-cwd"

echo "Materializing $NAME"
echo "  repo:   $REPO_ROOT"
echo "  engram: $("$ENGRAM" --version 2>/dev/null || echo MISSING)"

# ---------------------------------------------------------------------------
# 1. Sanitized, `.git`-less archive of HEAD. The graph is built FROM this tree
#    so source ingestion never sees the eval meta-docs (direction-2026-h2.md,
#    near-term-plan.md). No .git → an agentic bare harness cannot follow it back
#    to the real repo.
# ---------------------------------------------------------------------------
rm -rf "$BARE_CWD"; mkdir -p "$BARE_CWD"
git -C "$REPO_ROOT" archive HEAD | tar -x -C "$BARE_CWD"
rm -f "$BARE_CWD/docs/internal/direction-2026-h2.md" \
      "$BARE_CWD/docs/internal/near-term-plan.md"
rm -rf "$BARE_CWD/docs/internal/experiments" \
       "$BARE_CWD/packages/engram-core/test/fixtures/eval"
echo "  bare:   $BARE_CWD (.git-less; meta-docs + experiments + eval fixtures removed)"

# ---------------------------------------------------------------------------
# 2. Knowledge graph — built with cwd = the sanitized archive so git history and
#    source ingestion both see only sanitized content. (git ingestion uses the
#    real repo's history via REPO_ROOT, so commit-message rationale is kept.)
# ---------------------------------------------------------------------------
rm -rf "$DB"
( cd "$BARE_CWD" && \
  "$ENGRAM" init --yes --embedding-model none --db "$DB" --from-git "$REPO_ROOT" >/dev/null && \
  "$ENGRAM" ingest md "docs/internal/DECISIONS.md" --db "$DB" >/dev/null )

case "$NAME" in
  engram-mcp-decision)
    ( cd "$BARE_CWD" && "$ENGRAM" ingest md "docs/internal/harness-pivot-plan.md" --db "$DB" >/dev/null )
    ;;
  engram-pr-rationale)
    # Off-tree rationale: GitHub issues/PRs (incl. #277).
    GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}"
    if [ -z "$GITHUB_TOKEN" ]; then
      echo "  WARN: no GITHUB_TOKEN / gh auth — skipping GitHub enrichment (fixture will be incomplete)." >&2
    else
      GITHUB_TOKEN="$GITHUB_TOKEN" "$ENGRAM" ingest enrich github --scope rnwolfe/engram --db "$DB" >/dev/null
    fi
    ;;
esac
echo "  graph:  $(sqlite3 "$DB/engram.db" 'SELECT count(*) FROM episodes;') episodes"

echo "Done. Run: bun run eval --fixture $NAME   (bare cwd: $BARE_CWD)"
