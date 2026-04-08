# engram-cli

Command-line interface for the engram temporal knowledge graph engine.

## Installation

```bash
bun install
bun run build
```

## Commands

### `engram init`

Initialize a new `.engram` knowledge graph database.

```bash
engram init                     # Create .engram in current directory
engram init --from-git .        # Ingest git history immediately
engram init --db path/to/file   # Custom database path
```

### `engram ingest`

Ingest data into the graph from various sources.

```bash
engram ingest git .                             # Ingest git history
engram ingest enrich github --token $TOKEN      # Enrich with GitHub PRs/issues
```

### `engram search`

Search the knowledge graph using full-text or hybrid search.

```bash
engram search "auth module"
engram search "who owns token validation" --limit 10
```

### `engram show`

Show details about a specific entity or edge.

```bash
engram show <entity-id>
```

### `engram history`

Show the temporal history of an edge or entity.

```bash
engram history <edge-id>
```

### `engram decay`

Show the knowledge decay report — identifying stale, dormant, or orphaned entries.

```bash
engram decay
engram decay --stale-days 90 --dormant-days 60
```

### `engram ownership`

Show an ownership risk report combining decay signals and owner analysis. Identifies
parts of the codebase that are one-person-deep or whose owner has gone quiet.

```bash
engram ownership                       # Top 20 risks, default thresholds
engram ownership --limit 50            # More results
engram ownership --module lib/auth     # Scope to a path prefix
engram ownership --format json         # Machine-readable JSON output
engram ownership --min-confidence 0.5  # Filter weak ownership signals
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--limit <n>` | 20 | Maximum number of entries to show |
| `--module <path>` | (none) | Scope to entities whose name starts with this prefix |
| `--format <fmt>` | `table` | Output format: `table` or `json` |
| `--min-confidence <f>` | `0.1` | Minimum `likely_owner_of` edge confidence (0.0–1.0) |
| `--db <path>` | `.engram` | Path to the `.engram` database file |

**Risk levels:**

| Level | Criteria |
|-------|----------|
| `CRITICAL` | Dormant owner (>180 days inactive) AND (concentrated-risk OR coupling ≥ 10) |
| `ELEVATED` | Concentrated-risk OR dormant owner OR coupling ≥ 10 |
| `STABLE` | All other cases |

**Example output:**

```
Ownership Risk Report — 2026-04-07T12:00:00.000Z
Analyzed: 142 entities  Critical: 3  Elevated: 12  Stable: 5

CRITICAL (3)
  lib/auth/token.ts
    Owner: @mcollina (confidence 89%)
    Status: dormant — last activity 247 days ago
    Decay signals: dormant_owner, concentrated_risk
    Coupling: 14 co_changes_with edges

  lib/schema/validator.ts
    Owner: @alice (confidence 76%)
    Status: dormant — last activity 193 days ago
    Decay signals: concentrated_risk
    Coupling: 11 co_changes_with edges

ELEVATED (12)
  ...
```

### `engram stats`

Show summary statistics about the graph.

```bash
engram stats
```

### `engram export`

Export the graph in various formats.

```bash
engram export --format json
engram export --format dot
```

### `engram verify`

Verify the graph invariants (evidence chains, temporal consistency).

```bash
engram verify
```

### `engram add`

Manually add an entity or edge with supporting evidence.

```bash
engram add entity --name "auth-service" --type "service"
engram add edge --source <id> --target <id> --relation "depends_on"
```

## Global Options

| Flag | Default | Description |
|------|---------|-------------|
| `--db <path>` | `.engram` | Path to the `.engram` database file |
