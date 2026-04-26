# Eval Fixture System

This document specifies the schema, selection criteria, cache contract, and runner
contract for engram's eval fixture system. Eval fixtures are frozen, reproducible
scenarios used to validate the "wow moment" — the observable improvement an
engram-equipped agent achieves over bare file search on design-rationale questions.

---

## 1. YAML Schema

Each fixture is a single YAML file under
`packages/engram-core/test/fixtures/eval/<name>.yaml`. The file has four
top-level blocks.

### 1.1 `fixture:` — identity and source

```yaml
fixture:
  name: <string>           # Slug used for cache keying and CLI --fixture flag
  description: <string>    # Human-readable summary of what design decision is under test
  source:
    type: git              # Only 'git' is supported today
    repo: <url>            # Remote repo URL (HTTPS or SSH)
    pin: <sha|tag>         # Exact commit SHA or immutable tag — REQUIRED for reproducibility
    clone_strategy: cached # 'cached' (default) or 'fresh'
```

`pin` must be a full 40-character SHA or an immutable tag. A branch name is not
acceptable — branches move and break the determinism contract. Set `pin` to a
`TODO-pin-to-sha-...` string during authoring and replace it with the real SHA
before the fixture is used in CI.

`clone_strategy`:
- `cached` — clone once to `~/.cache/engram/eval-fixtures/<pin>/`, reuse on
  subsequent runs. Default.
- `fresh` — always re-clone. Use only for debugging; never commit a fixture with
  `fresh`.

### 1.2 `slice:` — sparse checkout paths

```yaml
slice:
  paths:
    - pkg/kubelet/container/**
    - staging/src/k8s.io/api/core/v1/types.go
```

The runner performs a sparse checkout limited to these glob patterns. This keeps
the working tree small for repos like kubernetes/kubernetes (millions of files).
Globs follow the same syntax as `.gitignore` patterns and are passed verbatim to
`git sparse-checkout set`. If `slice:` is omitted the full tree is checked out.

### 1.3 `ingest:` — sources to ingest into the fixture `.engram`

Each entry mirrors the `SyncSource` shape from
`packages/engram-core/src/sync/types.ts` exactly:

```yaml
ingest:
  - name: <string>        # Unique source name (passed to --only if needed)
    type: <string>        # 'git' | 'source' | 'github' | plugin type
    scope: <string>       # For network adapters (e.g. 'owner/repo' for github)
    path: <string>        # Filesystem path for 'git' adapter; RUNNER_POPULATED = runner fills this
    root: <string>        # Filesystem root for 'source' adapter; RUNNER_POPULATED = runner fills this
    auth:
      kind: bearer        # Matches SyncAuthConfig union: none | bearer | basic | service_account | oauth2
      tokenEnv: ENV_VAR   # Name of env var holding the token (never a literal value)
```

The sentinel value `RUNNER_POPULATED` tells the runner to substitute the actual
clone path at runtime. Use it for `path` and `root` on local sources so the
fixture YAML stays portable.

Auth entries follow `SyncAuthConfig` from `sync/types.ts`. Tokens are always
referenced by env var name — never stored as literals in fixture YAML.

### 1.4 `evaluation:` — model config, conditions, and prompts

```yaml
evaluation:
  model:
    provider: gemini                  # 'gemini' | 'openai' | 'anthropic' | 'ollama'
    model_id: gemini-2.5-pro          # Passed to the CLI as model selector
    cli_command: gemini               # Binary on PATH the runner shells out to
    cli_flags: ["-p"]                 # Extra flags prepended before the prompt

  conditions:
    - id: bare
      description: Agent answers from raw file search alone (no engram pack).
    - id: with_pack
      description: >
        Agent receives `engram context --format=md` pack prepended to the prompt.
        Pack is assembled against the materialized fixture .engram.

  prompts:
    - id: prompt-001
      text: |
        <multi-line prompt text>
      ground_truth:
        files:
          - path/to/relevant/file.go   # Files the agent should cite or read
        rationale_sources:
          - <url>                      # Canonical sources for the design rationale
        expected_answer_summary: |
          <what a correct answer covers>
```

`conditions` are evaluated in declaration order. The `bare` condition omits any
engram context injection; the `with_pack` condition prepends the output of
`engram context "<prompt text>" --db <fixture.engram> --format=md` to the model
prompt. Additional conditions (e.g. `with_pack_as_of`) may be added per-fixture.

`ground_truth` is documentation for human reviewers, not automated assertion.
Early eval cycles use eyeball verdicts against `expected_answer_summary`. Automated
scoring may be layered on top later.

---

## 2. Selection Criteria for Fixtures

A good eval fixture satisfies all three of the following:

**2.1 The answer lives in design rationale, not in code.**
The question should be unanswerable (or answerable only incorrectly) by reading
current source files or running `grep`. The authoritative reasoning lives in PR
discussions, KEP documents, commit messages, or linked issues — the kind of
signal that engram ingests but that a bare agent cannot access without tool calls
that are expensive or require knowing what to look for.

**2.2 The "bare" condition produces a generic or wrong answer.**
Without the engram context pack, the agent's answer should either be vague
("this is a common pattern for X"), miss the explicit rejected alternative, or
fabricate a rationale not grounded in the actual decision history. If a bare agent
can give a correct specific answer by reading two files, the fixture is too easy.

**2.3 The "with_pack" condition surfaces the specific rejected alternative.**
The pack should surface the concrete reason the current design was chosen *over*
the alternative the prompt proposes. The agent should be able to name the
rejected alternative, cite why it was rejected (not just that it was), and advise
the user accordingly. This is the wow-moment signal: specificity that grep buries.

**What makes a bad fixture:**
- The answer is in a comment in the main implementation file (file search wins).
- The repo is so small that the agent can read everything (no signal advantage).
- The design decision is undocumented — even engram cannot surface what was never
  written down.
- The `pin` points to a branch (non-deterministic, breaks caching).

---

## 3. Cache Directory Contract

### 3.1 Layout

```
~/.cache/engram/eval-fixtures/
  <pin-sha>/                        # Keyed on fixture.source.pin (full SHA)
    repo/                           # Sparse checkout of the repo at pin
    <ingest-hash>.engram            # Materialized graph; keyed on ingest config hash
    <ingest-hash>-lock              # Lock file preventing concurrent materialization
```

`<ingest-hash>` is the lowercase hex SHA-256 of the canonical JSON serialization
of the `ingest:` array from the fixture YAML (with `RUNNER_POPULATED` replaced by
the actual resolved path). This means:
- Same `pin` + same `ingest` config = same `.engram` file is reused.
- Changing any ingest entry (e.g. adding a source, changing `scope`) produces a
  new hash and triggers re-materialization.
- The model, conditions, and prompts do not affect the cache key — they only
  affect what is run against the already-materialized graph.

### 3.2 Cache invalidation

The runner never automatically invalidates cache entries. To force re-materialization:

```bash
bun run eval --fixture <name> --no-cache
```

This deletes `<ingest-hash>.engram` and rebuilds. The repo checkout at `<pin-sha>/repo/`
is preserved (re-cloning is expensive for large repos).

### 3.3 Determinism scope

What is deterministic given the same `(pin, ingest-hash)` pair:
- The `.engram` graph content (same commits, same episodes, same edges).
- The `engram context` pack output (same FTS + graph traversal results).
- The prompt text sent to the model.

What is not deterministic:
- Model output. Temperature > 0 (and some providers ignore temperature) means the
  model's response varies between runs. Early eval cycles therefore rely on
  eyeball verdicts from human reviewers rather than automated string matching.
  Automated scoring (e.g. LLM-as-judge) may be added later but must account for
  this variance explicitly.

Consequence: two runs with identical inputs may produce different pass/fail
verdicts if the human reviewer threshold is marginal. Record verdicts with the
`results.json` reviewer field so drift is visible over time.

---

## 4. Private-Repo Override Pattern

The fixture YAML schema works unchanged for private repos. Override two fields:

```yaml
fixture:
  source:
    repo: https://github.com/your-org/private-repo.git  # Private URL
    pin: <sha>

ingest:
  - name: private-prs
    type: github
    scope: your-org/private-repo
    auth:
      kind: bearer
      tokenEnv: PRIVATE_GITHUB_TOKEN    # Set in CI secrets or local env
```

Everything else (`slice`, `evaluation`) is identical to a public-repo fixture.
The runner resolves `tokenEnv` values at runtime — the fixture YAML itself never
contains a literal token.

When sharing fixture YAML with teammates, the `auth.tokenEnv` name is safe to
commit. The env var value is not.

---

## 5. Determinism Contract

| Input | Deterministic? | Notes |
|---|---|---|
| Repo content at `pin` | Yes | SHA-pinned; immutable |
| `.engram` graph | Yes | Same `(pin, ingest-hash)` → same graph |
| `engram context` pack | Yes | Same graph + same query → same pack |
| Model prompt | Yes | Pack + prompt text are composed identically |
| Model output | No | Sampling; eyeball verdict required |
| Human verdict | Partially | Marginal cases vary; record reviewer ID |

The eval system optimizes for deterministic *inputs* to the model, not
deterministic model outputs. This is the correct tradeoff for a knowledge-graph
eval: the question is whether the pack improves input quality, not whether
the model is consistent.

---

## 6. Runner Contract

### 6.1 Location

```
packages/engram-core/test/fixtures/eval/run.ts
```

### 6.2 Invocation

```bash
bun run eval --fixture <name>
```

`<name>` must match the `fixture.name` field of a YAML file in
`packages/engram-core/test/fixtures/eval/`.

**Note:** The flags below (`--no-cache`, `--condition`, `--prompt`, `--dry-run`)
are planned but not yet implemented in the current runner. The runner currently
only accepts `--fixture <name>`.

```bash
# Planned (not yet implemented):
bun run eval --fixture <name> --no-cache          # Force re-materialization
bun run eval --fixture <name> --condition bare    # Run only one condition
bun run eval --fixture <name> --prompt prompt-001 # Run only one prompt
bun run eval --fixture <name> --dry-run           # Print plan, no model calls
```

### 6.3 Runner steps

1. **Load fixture** — parse and validate YAML against the schema above.
2. **Resolve clone** — if `~/.cache/engram/eval-fixtures/<pin>/repo/` exists,
   reuse it. Otherwise clone with sparse checkout defined by `slice.paths`.
3. **Resolve `.engram`** — compute `<ingest-hash>` from the ingest config.
   If `<pin>/<ingest-hash>.engram` exists, reuse it. Otherwise run
   `engram sync` with a temporary config derived from the `ingest:` block
   (substituting `RUNNER_POPULATED` paths) against the cloned repo.
4. **Acquire lock** — write `<ingest-hash>-lock` before materialization to
   prevent concurrent runs from double-ingesting.
5. **Run conditions** — for each `(condition, prompt)` pair:
   - `bare`: invoke `<cli_command> <cli_flags> "<prompt.text>"` with no preamble.
   - `with_pack`: run `engram context "<prompt.text>" --db <ingest-hash>.engram --format=md`,
     prepend the output to `prompt.text`, then invoke the model CLI.
6. **Write results** — create `<fixture-name>-runs/<ISO-timestamp>/`:
   - `results.json` — machine-readable: condition, prompt ID, model, pack (if
     `with_pack`), raw model response, elapsed ms.
   - `results.md` — human-readable: side-by-side `bare` vs `with_pack` responses
     with `ground_truth.expected_answer_summary` for reviewer comparison.

### 6.4 Results schema (`results.json`)

The schema below reflects the actual runner output. Fields such as `verdict` and
`reviewerId` are not written by the runner — those are reserved for a future
human-review or LLM-as-judge layer.

```jsonc
{
  "fixture": "<name>",
  "runAt": "<ISO8601 timestamp>",
  "model": {
    "provider": "gemini",
    "model_id": "gemini-2.5-pro",
    "cli_command": "gemini",
    "cli_flags": ["-p"]
  },
  "conditions": [
    {
      "condition": "bare",           // condition id: "bare" | "with_pack"
      "prompt_id": "prompt-001",
      "prompt": "<full prompt sent to model>",
      // pack and pack_metrics are present only for "with_pack" condition:
      "pack": "<engram context output>",
      "pack_metrics": {
        "lines": 120,
        "hasDiscussions": true,
        "hasStructuralSignals": false,
        "discussionCount": 3,
        "confidenceScores": [0.85, 0.72, 0.61]
      },
      "answer": "<raw model output>",
      "cost": {
        "prompt_tokens": 512,
        "answer_tokens": 128,
        "total_tokens": 640
      }
    }
  ]
}
```

Token counts in `cost` are estimates derived from character count (1 token ≈ 4
characters). The runner never auto-fails a run based on model output.
