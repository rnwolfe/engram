I will search the repository to see if there is any mention of a lightweight command or mechanism for an agent to file a fact mid-task (such as a planned command, issue discussion, or spec), or if this concept has been discussed.
I will search for files containing the word "beads" or "freshness" in the codebase, specifically checking if issue discussions or specs reference this design pattern.
I will list the contents of the workspace root to understand the project structure and locate the documentation directory.
I will list the contents of the `docs` directory to see what documentation is available.
I will list the contents of `docs/internal` to find specifications or ADRs that might discuss agent commands or mid-task facts.
I will list the contents of `docs/internal/specs` directory.
I will grep inside `docs/internal/DECISIONS.md` for keywords like "note", "fact", "learn", "addEntity", or similar terms.
I will search for `addEntity` or related methods across all files in the repository to locate where entities are created and see if there are any lightweight helper functions or commands.
I will grep for keywords like "ceremony", "mid-task", "quick", "learned", or "scratch" across the workspace to see if there is any mention of such a planned CLI command or concept.
I will grep for "mid-task" (case insensitive) to see if that appears in the codebase or docs.
I will search the repository for references to "freshness" or "277" to see if there is any design draft, test fixture, or issue note regarding the "agent-facing freshness UX" mentioned in issue #277.
I will search for any references to "277" in the workspace.
I will perform a case-insensitive search for "freshness" and "beads" in `docs/internal` directory to see if they are referenced in internal specifications.
I will list the contents of the `docs/internal/research` directory to check if there are any research notes or drafts discussing this.
I will view `docs/internal/specs/cli-as-agent-surface.md` to see the current contract for agent interactions and if any planned commands for quick fact filing are mentioned.
I will search for occurrences of terms like "learn", "note", "remember", "assert", or "scratch" in the internal documentation directory to find any references to a lightweight fact-filing command.
I will view the `vocabulary.md` file to see if there is any custom terminology regarding agents, facts, or lightweight fact recording.
I will view the contents of `docs/internal/DECISIONS.md` to see if there are any ADRs (Architecture Decision Records) or decisions discussing agent interaction patterns, scratchpads, or quick-fact filing.
I will run a broader regex search for keywords like "learn", "note", "remember", "assert", "scratch", "bead", or "fact" across all source code and files in the repository.
I will view `docs/internal/VISION.md` to see the roadmap phases and if any lightweight fact-filing or notes features are planned.
I will check my permission grants to see what paths I can access.
I will search the git commit history for references to issue #277 to see if any commits, discussions, or drafts were added to the repository.
I will view `docs/internal/STATUS.md` to see what features or PRs are completed or planned, and check if any mentions of issue #277 or agent fact-filing are listed.
I will view `docs/whats-new.json` to see if it lists any recent changes, planned features, or notes regarding a lightweight fact-filing command.
I will search the internal documentation for any occurrences of the word "planned" to find planned commands or features that might not be on the main roadmap yet.
I will list the contents of the `.claude` directory to check if there are scripts, configuration files, or guidelines for agents using engram.
I will list the `.claude/skills` directory to see what specialized skills are defined for agent execution.
I will view `.claude/skills/brainstorm/SKILL.md` to see if there is any discussion or workflow helper for brainstorming/noting facts mid-task.
I will view `forge.toml` to see if it lists a GitHub repository that I can query via the GitHub CLI or web search.
I will search the web for issue #277 of the `rnwolfe/engram` repository to retrieve its full text and discussion details.
I will attempt to retrieve the content of issue #277 using `read_url_content` to see if we can read the full text of the issue.
I will view the markdown content of the fetched URL to read the issue discussion details.
I will search the repository to see if the proposed `engram observe` command has been implemented or if any files contain the word "observe" in a command registration context.
I will list the command files in `packages/engram-cli/src/commands` to verify the exact list of registered commands.
I will view the `add.ts` command to check the requirements and syntax of the existing command for adding entities/edges.
Yes, a lightweight command for an agent to file a fact mid-task has been explicitly considered, though it is not yet implemented.

### Has this been considered?
Yes. The concept was proposed as **Idea #4 (`engram observe`)** in the brainstorming discussion under [GitHub Issue #277](https://github.com/rnwolfe/engram/issues/277) ("discussion: agent-facing freshness UX — patterns to borrow from beads"):

*   **Proposed Command:** `engram observe "<fact>" --link <type>:<identifier>` (e.g., `engram observe "Bob now owns auth/middleware" --link entity:auth-middleware --link person:bob`).
*   **How it would work:** It is conceived as a thin wrapper over the core library's `addEntity` and `addEdge` APIs. It would automatically perform entity/alias resolution, create a `manual` episode representing the assertion, and link it as evidence to the newly created `asserted` edges.
*   **Current Status:** It remains a proposed feature. In the issue recommendations, the primary focus for implementation was directed towards `engram ready` (Idea #1) and `engram resume` (Idea #2). It has not yet been scheduled on the roadmap in [VISION.md](file:///tmp/engram-pr-archive/docs/internal/VISION.md) or [STATUS.md](file:///tmp/engram-pr-archive/docs/internal/STATUS.md).

### What is the closest existing command?
Currently, the closest command is `engram add` (defined in [add.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/add.ts)). However:
*   It only inserts a raw, unstructured `manual` episode.
*   It does **not** perform entity resolution, entity creation, or edge linkage (which still require programmatic `addEntity` and `addEdge` calls).

***

### Summary of Work
1.  **Codebase Search:** Checked the repository's documentation and code for keywords (`beads`, `observe`, `learn`, `addEntity`, `ceremony`) to locate feature plans and command structures.
2.  **Issue Retrieval:** Retrieved the full web content of [GitHub Issue #277](https://github.com/rnwolfe/engram/issues/277) to extract the details of the proposed `engram observe` command.
3.  **Command Verification:** Verified that `engram observe` is not registered in the CLI commands directory (`packages/engram-cli/src/commands`) and analyzed the implementation of the existing `engram add` command.
