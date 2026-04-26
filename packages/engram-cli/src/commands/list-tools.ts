/**
 * list-tools.ts — `engram --list-tools` option.
 *
 * Registers a top-level option on the program that, when passed, emits a JSON
 * array of tool descriptors to stdout and exits 0. This is the machine-readable
 * discovery contract described in docs/internal/specs/cli-as-agent-surface.md.
 *
 * The catalogue is hardcoded rather than derived from commander at runtime
 * because commander does not expose a stable reflection API for subcommand
 * option schemas. The catalogue must be kept in sync with actual command
 * registrations in cli.ts.
 */

import type { Command } from "commander";

interface ArgDescriptor {
  name: string;
  required: boolean;
  description: string;
}

interface FlagDescriptor {
  name: string;
  description: string;
  values?: string[];
  default?: string | number | boolean;
}

interface ToolDescriptor {
  name: string;
  description: string;
  args: ArgDescriptor[];
  flags: FlagDescriptor[];
  output_schema_ref: string;
}

const TOOL_CATALOGUE: ToolDescriptor[] = [
  {
    name: "context",
    description:
      "Assemble a token-budgeted context pack for injection into an agent prompt",
    args: [
      {
        name: "query",
        required: true,
        description: "Natural-language query to retrieve context for",
      },
    ],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--format",
        description: "Output format",
        values: ["md", "json"],
        default: "md",
      },
      {
        name: "--token-budget",
        description: "Max tokens in the assembled pack",
        default: 8000,
      },
      {
        name: "--min-confidence",
        description:
          "Minimum confidence (0.0–1.0) for a discussion hit to be included",
        default: 0.8,
      },
      {
        name: "--max-entities",
        description:
          "Hard cap on entities included regardless of token budget (default: uncapped)",
      },
      {
        name: "--max-edges",
        description:
          "Hard cap on edges included regardless of token budget (default: uncapped)",
      },
      {
        name: "--as-of",
        description:
          "Assemble context as of a past point in time. Accepts ISO8601, bare date, or relative strings (yesterday, last week, 6 months ago, etc.)",
      },
      {
        name: "--scope",
        description: "Filter to entities and edges matching this scope pattern",
      },
      {
        name: "-v, --verbose",
        description: "Emit diagnostic notes to stderr",
        default: false,
      },
    ],
    output_schema_ref: "context.json",
  },
  {
    name: "sync",
    description:
      "Run all configured ingesters from .engram.config.json, then resolve cross-refs",
    args: [],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--config",
        description: "Path to sync config file",
      },
      {
        name: "--format",
        description: "Output format",
        values: ["human", "json"],
        default: "human",
      },
      {
        name: "--only",
        description:
          "Comma-separated list of source names to run (subset of configured sources)",
      },
      {
        name: "--continue-on-error",
        description:
          "Run remaining sources after a failure (default: fail-fast)",
        default: false,
      },
      {
        name: "--no-cross-refs",
        description: "Skip the cross-ref resolver step",
        default: false,
      },
      {
        name: "--dry-run",
        description:
          "Validate config and print plan without executing any ingestion",
        default: false,
      },
      {
        name: "--scope",
        description:
          "Tag all output entities, edges, and projections with this scope identifier",
      },
    ],
    output_schema_ref: "sync.json",
  },
  {
    name: "ingest",
    description:
      "Ingest data into the graph. Subcommands: git, md, source, enrich",
    args: [
      {
        name: "subcommand",
        required: true,
        description: "Ingestion source: git | md | source | enrich <adapter>",
      },
    ],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--since",
        description:
          "Ingest commits or items after this ISO8601 timestamp (git, enrich)",
      },
      {
        name: "--branch",
        description: "Git branch to ingest (git only)",
      },
      {
        name: "--scope",
        description: "Scope tag for enrichment adapters",
      },
      {
        name: "--dry-run",
        description: "Preview what would be ingested without writing",
        default: false,
      },
      {
        name: "--verbose",
        description: "Emit per-item progress to stderr",
        default: false,
      },
      {
        name: "--token",
        description:
          "Auth bearer token for enrichment adapters (deprecated: prefer --oauth-token or adapter auth config)",
      },
    ],
    output_schema_ref: "ingest.json",
  },
  {
    name: "search",
    description: "Search the knowledge graph",
    args: [
      {
        name: "query",
        required: true,
        description: "Keyword or natural-language search query",
      },
    ],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--format",
        description: "Output format",
        values: ["text", "json"],
        default: "text",
      },
      {
        name: "--limit",
        description: "Maximum results to return",
        default: 20,
      },
      {
        name: "--valid-at",
        description: "Filter edges valid at this ISO8601 timestamp",
      },
    ],
    output_schema_ref: "search.json",
  },
  {
    name: "show",
    description: "Show entity details, edges, and evidence",
    args: [
      {
        name: "entity",
        required: true,
        description: "Entity ID (ULID) or canonical name",
      },
    ],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--format",
        description: "Output format",
        values: ["text", "json"],
        default: "text",
      },
    ],
    output_schema_ref: "show.json",
  },
  {
    name: "stats",
    description:
      "Show graph counts (entities, edges, episodes). For a full health dashboard, see engram status.",
    args: [],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--format",
        description: "Output format",
        values: ["text", "json"],
        default: "text",
      },
    ],
    output_schema_ref: "stats.json",
  },
  {
    name: "verify",
    description: "Validate .engram integrity (evidence invariants)",
    args: [],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--format",
        description: "Output format",
        values: ["text", "json"],
        default: "text",
      },
    ],
    output_schema_ref: "verify.json",
  },
  {
    name: "init",
    description: "Create a new .engram knowledge graph database",
    args: [],
    flags: [
      {
        name: "--db",
        description: "Path for the .engram file",
        default: ".engram",
      },
      {
        name: "--format",
        description: "Output format",
        values: ["json"],
      },
      {
        name: "--from-git",
        description: "Ingest a git repository after creating",
      },
      {
        name: "--ingest-md",
        description: "Ingest markdown docs from this directory/glob",
      },
      {
        name: "--embed",
        description: "Generate vector embeddings after ingestion",
        default: false,
      },
      {
        name: "--embedding-model",
        description: "Embedding model to use (or 'none')",
      },
      {
        name: "--embedding-provider",
        description: "Override embedding provider",
        values: ["ollama", "openai", "google"],
      },
      {
        name: "--github-repo",
        description:
          "GitHub repo for enrichment (auto-detected from git remote when GITHUB_TOKEN is set)",
      },
      {
        name: "--yes",
        description: "Skip all prompts (non-interactive)",
        default: false,
      },
      {
        name: "--no-verify",
        description: "Skip reachability check",
        default: false,
      },
    ],
    output_schema_ref: "init.json",
  },
  {
    name: "companion",
    description:
      "Write a reusable agent companion prompt to stdout. Append to CLAUDE.md, AGENTS.md, or similar.",
    args: [],
    flags: [
      {
        name: "--harness",
        description: "Agent harness to target",
        values: ["generic", "claude-code", "cursor", "gemini"],
        default: "generic",
      },
      {
        name: "--file",
        description: "Target file to check (used with --check)",
      },
      {
        name: "--check",
        description:
          "Exit 0 if companion content is already present in --file, exit 1 if not",
        default: false,
      },
    ],
    output_schema_ref: "companion.json",
  },
  {
    name: "project",
    description: "Author a projection on an anchor with explicit inputs",
    args: [],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--kind",
        description:
          "Projection kind — lowercase letters, digits, underscores only (e.g. entity_summary)",
      },
      {
        name: "--anchor",
        description:
          'Anchor for the projection (e.g. "entity:01HX..." or "none")',
      },
      {
        name: "--input",
        description:
          'Input substrate element (may be repeated, e.g. "episode:01HX...")',
      },
      {
        name: "--dry-run",
        description:
          "Validate and print what would be authored without writing",
        default: false,
      },
    ],
    output_schema_ref: "project.json",
  },
  {
    name: "reconcile",
    description: "Run the two-phase projection maintenance loop",
    args: [],
    flags: [
      {
        name: "--db",
        description: "Path to .engram file",
        default: ".engram",
      },
      {
        name: "--phase",
        description: "Which phase to run",
        values: ["assess", "discover", "both"],
        default: "both",
      },
      {
        name: "--scope",
        description: "Limit scope: kind:<value> or anchor:<value>",
      },
      {
        name: "--max-cost",
        description: "Token budget cap (required unless --dry-run)",
      },
      {
        name: "--max-delta-items",
        description:
          "Max substrate items per discover call — larger values use more tokens (default: 500)",
      },
      {
        name: "--dry-run",
        description: "Assess but do not persist any changes",
        default: false,
      },
      {
        name: "--reset-cursor",
        description:
          "Clear reconciliation history so the next run re-processes all substrate data",
        default: false,
      },
      {
        name: "--cross-refs",
        description:
          "Re-run cross-source reference resolution over all episodes",
        default: false,
      },
    ],
    output_schema_ref: "reconcile.json",
  },
];

export function registerListTools(program: Command): void {
  program.option(
    "--list-tools",
    "emit a JSON catalogue of all commands and exit",
  );

  program.hook("preAction", () => {
    // noop — actual handling is done via an early parse check below
  });

  // We use a hook on the program's parseOptions to intercept --list-tools before
  // any subcommand action runs. Commander does not have a pre-parse hook that fires
  // before subcommand dispatch, so we inspect argv directly after calling
  // program.parseOptions() implicitly through program.parse(). Instead, we attach
  // a listener to the 'option:list-tools' event that commander emits when it sees
  // the flag during parse.
  program.on("option:list-tools", () => {
    process.stdout.write(JSON.stringify(TOOL_CATALOGUE, null, 2));
    process.stdout.write("\n");
    process.exit(0);
  });
}
