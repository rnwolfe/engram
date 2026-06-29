I will start by checking the files and directories in the workspace to understand the codebase and its context.
I will search the repository for mentions of `addEntity` to see where and how entities or facts are handled.
I will list the contents of the `docs` directory to see if there are any documents, proposals, or specs.
I will list the `docs/internal` directory to see if there are internal design documents.
I will list the `docs/internal/specs` directory to see if there are any specific feature specifications.
I will view the content of `cli-as-agent-surface.md` as it specifies the command-line interface as an agent surface and might detail commands for fact ingestion or quick notes.
I will search `docs/internal/DECISIONS.md` for the word "fact" to see if there is any design decision related to quick note taking or fact insertion.
I will list the contents of the `docs/internal/research` directory to check if there are any research notes or explorations on lightweight fact injection or quick notes.
I will perform a search for the word "note" across the `docs/internal` directory to see if there is any concept of quick note taking, user notes, or ad-hoc fact logging.
I will view `docs/internal/specs/format-v0.1.md` around line 754 to see details about the planned `engram add` command.
I will search for files containing references to command definitions or `add` in the CLI package.
I will list the contents of `packages/engram-cli/src` to find the source code of the CLI commands.
I will list the `packages/engram-cli/src/commands` directory to check which CLI commands are currently defined in the code.
I will view `packages/engram-cli/src/commands/add.ts` to understand how the `add` command is currently implemented.
I will list the `packages` directory to see if there is an `engram-core` package.
I will search the `docs/` directory for terms like `learn`, `quick`, `fact`, or `add` command details to find design discussions about agents filing facts mid-task.
I will view `docs/internal/specs/format-v0.1.md` around line 1065 to see if there is further discussion of `engram add` and how it's used.
I will search `packages/engram-cli/src/cli.ts` to see if the `add` command is registered.
I will search for `relate` in the workspace to see if there is any other mention of it, planned or partially implemented.
I will view the beginning of `docs/internal/specs/format-v0.1.md` to see the design philosophy regarding manual notes and note-taking.
I will search `docs/internal/specs/projections.md` for terms like `manual` or `episode` to see how manual/ad-hoc episodes (such as those added via `engram add`) are handled and turned into entities/edges.
I will view `docs/internal/specs/projections.md` starting around line 50 to see the design principles of projections and manual assertions.
I will search for `list-tools.ts` in the CLI package to see what tools are advertised to agents.
Yes, this concept has been explicitly considered and designed for in the Engram architecture.

### 1. The Command: `engram add`
The lightweight command is **`engram add [content]`** (implemented in [add.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/add.ts)).

* **How it works:** It logs a manual note/fact (e.g., `engram add "Decided to use ULIDs for all entity IDs"`) directly into the knowledge graph as an episode with `source_type = 'manual'`.
* **Why it is ceremony-free:** It performs **no entity extraction or alias matching at write time**. It simply appends the raw fact to the database as immutable evidence. 

### 2. Design Consideration: "Evidence-First"
This design flows directly from Engram's **"Evidence-first"** design principle (Principle 4 in [format-v0.1.md](file:///tmp/engram-pr-archive/docs/internal/specs/format-v0.1.md#L37-L40)):

> *Episodes are immutable raw evidence. Entities and edges are derived projections supported by evidence chains. Manual additions are just another episode type, not a separate truth path. Every claim in the graph traces back to the source material that produced it.*

Under this architecture:
1. The agent files the learned fact quickly as a raw manual episode (evidence).
2. The entity/edge extraction and higher-level syntheses are derived during subsequent ingestion or reconciliation phases (e.g. through the `reconcile` loop using LLM-based projections, as detailed in [projections.md](file:///tmp/engram-pr-archive/docs/internal/specs/projections.md#L79-L80)).

Additionally, [format-v0.1.md](file:///tmp/engram-pr-archive/docs/internal/specs/format-v0.1.md#L757) mentions a planned `engram relate <entity> <rel> <entity>` command to manually assert relationships between existing entities (`edge_kind = 'asserted'`), though this is not yet implemented in the CLI.

### 3. Agent Integration Status
While `engram add` is fully implemented, it is **not** currently included in the `--list-tools` catalog in [list-tools.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/list-tools.ts) (which defines the machine-readable surface area for agents). If you want an agent to use this command mid-task, it will need to be added to the tool catalog first.
