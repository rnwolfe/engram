/**
 * base.ts — Base companion prompt template.
 *
 * Teaches an agent when and how to use `engram context` to retrieve
 * temporal knowledge-graph signals. Harness-specific overrides are applied
 * on top of this content by companion.ts.
 */

export const BASE_COMPANION = `\
## Engram context pack — usage guide

Engram maintains a temporal knowledge graph over this codebase: git commits, PRs,
issues, code entities, ownership, and structural co-change relationships.
Use \`engram context <query>\` to retrieve a token-budgeted pack of relevant signals.

### When to call \`engram context\`

Call it **before**:
- Modifying unfamiliar code — to check prior design rationale and co-change footprint
- Answering "why is this written this way?" — to surface PR/issue history you cannot grep
- Proposing a refactor — to check if the current shape was deliberately chosen over a reverted alternative
- Making multi-file changes — to discover which files historically move together

Do **not** call it when:
- The answer is in a single readable file (file search is faster and cheaper)
- You already have the relevant context from recent conversation

### How to interpret pack sections

**Possibly relevant discussions** — PRs, issues, and commit messages matching your query
terms. These *may or may not* address your specific question. Verify by reading the source
before citing. An absent Discussions section means no confident hit was found — fall back
to file search rather than treating absence as signal.

**Structural signals** — Co-change edges, ownership signals, and supersession chains
derived from git history. These reflect historical coupling patterns the current code does
not reveal. Cite these freely; they are derived from observed fact, not heuristic inference.

**Entities** — A navigation aid. Use as a starting file/symbol list, not as authority.

**Evidence excerpts** — Raw source text (commit messages, PR excerpts). Citable if you
verify the excerpt matches current code before quoting it.

### How to handle low-confidence or empty sections

A missing "Possibly relevant discussions" section is a positive signal: the graph had no
confident hit. Fall back to file search rather than treating absence as evidence of
anything. Do not fabricate rationale from a low-confidence excerpt.

**Critical rule:** If no Discussion in the pack explicitly states *why* a design decision
was made (not merely that it exists), treat the Discussions section as navigation hints
only and search the codebase directly for ground-truth files. A PR that mentions a concept
coincidentally is not the same as a PR that explains its rationale. When in doubt, read
the source — constants files, architecture docs, inline comments — before concluding.
Do not construct a design narrative from circumstantially related PRs.

### When to prefer pack signal over current code

Co-change edges and supersession chains reflect patterns that current code may not make
visible. Prefer pack signal when:
- You need to understand which files typically change together
- You suspect a design was intentionally reverted or superseded
- You are tracing ownership across a large codebase with unclear attribution
`;
