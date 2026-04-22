# engram plugin — gerrit

Ingest Gerrit code-review changes as episodes in your engram knowledge graph.
Each change becomes an episode; owners and reviewers become person entities with
`reviewed` / `authored` edges.

## Prerequisites

No credentials needed for public Gerrit instances. For authenticated instances,
create an HTTP password in your Gerrit profile and pass it as:

    engram ingest enrich gerrit --auth basic --token "user:password"

## Scope syntax

The scope is a Gerrit project name (no leading or trailing slashes).

| Scope | Description |
|-------|-------------|
| `my-project` | All changes in project `my-project` |
| `org/sub-project` | Nested project path |

## Examples

    # Ingest all changes from a public Gerrit project
    engram ingest enrich gerrit --scope chromium/src \
      --endpoint https://chromium-review.googlesource.com

    # Authenticated ingest
    engram ingest enrich gerrit --scope my-project \
      --endpoint https://gerrit.example.com \
      --auth basic --token "alice:mypassword"

    # Dry run (count changes without writing)
    engram ingest enrich gerrit --scope my-project --dry-run

## Limitations

- Fetches changes in batches of 100; large projects may take several minutes.
- Incremental re-ingest via cursor resumes from the last processed offset.
- Gerrit's XSSI prefix (`)]}'`) is stripped automatically.
