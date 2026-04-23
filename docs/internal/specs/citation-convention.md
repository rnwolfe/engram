# Citation Convention

Every factual claim in `engram why` output is tagged with an episode ID so the
reader can trace the claim back to its source evidence.

## Formats

### text (default)

Inline `[E:<ulid>]` appended immediately after the cited claim.

```
feat: initial edges implementation  [E:01J9V0ABCDE]
```

### markdown

For GitHub PR/issue episodes: a hyperlink using the source_ref number and repo URL
(when available), else `[E:<ulid>]`.

```markdown
[#15](https://github.com/owner/repo/pull/15)

[E:01J9V0ABCDE]
```

Use `engram show <ulid>` to inspect the full episode when no URL is available.

### json

A `citations: []` array at the top level of the JSON output. Each entry:

```json
{
  "episode_id": "01J9V0ABCDE",
  "source_type": "git_commit",
  "source_ref": "abc1234",
  "url": null
}
```

For GitHub episodes with a known repo URL, `url` will be populated:

```json
{
  "episode_id": "01J9V0ABCDE",
  "source_type": "github_pr",
  "source_ref": "15",
  "url": "https://github.com/owner/repo/pull/15"
}
```

## Rules

1. Every factual claim in text/markdown output carries `[E:<ulid>]` immediately
   after it (no blank line between).
2. The ULID in the citation always refers to an episode in the `.engram` database.
3. AI-generated prose must cite the episode IDs provided in the generation prompt.
4. Citations appear in the `citations` array of JSON output even for claims not in
   the prose narrative.
5. `engram show <episode-id>` resolves the full episode content.

## Resolver

`[E:<ulid>]` citations can be resolved at any time:

```bash
engram show <ulid>
```

In CI or programmatic contexts, use `--format json` and process the `citations`
array to build hyperlinks or lookup tables.
