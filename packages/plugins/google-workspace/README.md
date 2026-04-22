# engram plugin — google-workspace

Ingest Google Docs as revision-aware episodes in your engram knowledge graph.
Each document becomes a `document` entity; revision changes are detected via the
Drive API `modifiedTime` and supersede prior episodes atomically. Document owners
and last-modifiers become `person` entities with `authored` / `edited` edges.

## Prerequisites

**Application Default Credentials (default)**

    gcloud auth application-default login \
      --scopes https://www.googleapis.com/auth/documents.readonly,\
               https://www.googleapis.com/auth/drive.readonly

**Bearer token (CI / non-gcloud environments)**

    engram ingest enrich google-workspace --scope doc:<id> \
      --auth bearer --token $OAUTH2_TOKEN

## Scope syntax

| Scope | Description |
|-------|-------------|
| `doc:<id>` | Single document by ID |
| `docs:<id>,<id>,...` | Explicit list of document IDs |
| `folder:<id>` | All Docs in a Drive folder |
| `folder:<id>?recursive=true` | Recursive folder traversal (cycle-safe) |
| `query:<drive-q>` | Arbitrary Drive search query |

The `query:` scope AND-injects `mimeType='application/vnd.google-apps.document'`
automatically — only Docs are enumerated regardless of the user query.

## Examples

    # Single document
    engram ingest enrich google-workspace \
      --scope doc:1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms

    # All docs in a folder, recursively
    engram ingest enrich google-workspace \
      --scope "folder:1A2B3C4D5E6F7G8H?recursive=true"

    # All docs owned by the authenticated user
    engram ingest enrich google-workspace \
      --scope "query:'me' in owners"

    # Dry run — enumerate and count without writing
    engram ingest enrich google-workspace \
      --scope "folder:1A2B3C4D5E6F7G8H" --dry-run

## Limitations

- Docs API quota: ~300 req/min/user. Large folders may trigger 429 backoff.
- Folder/query scopes use Drive list cursor; individual doc re-ingest uses
  `modifiedTime` for change detection.
- Cross-provider person deduplication is not yet implemented.
