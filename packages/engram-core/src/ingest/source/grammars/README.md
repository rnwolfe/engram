# Vendored Tree-Sitter Grammar WASMs

Pre-built WASM grammar files for `web-tree-sitter`. These are checked in so the
parser works without a build step or internet access at runtime.

## Files

| File | Language | Source |
|------|----------|--------|
| `tree-sitter-typescript.wasm` | TypeScript | `tree-sitter/tree-sitter-typescript` |
| `tree-sitter-tsx.wasm` | TSX | `tree-sitter/tree-sitter-typescript` |
| `tree-sitter-go.wasm` | Go | `tree-sitter/tree-sitter-go` |
| `tree-sitter-python.wasm` | Python | `tree-sitter/tree-sitter-python` |

See `MANIFEST.json` for pinned version and commit.

## Updating the grammars

To rebuild for a newer `tree-sitter-typescript` release:

1. Find the target release tag at
   <https://github.com/tree-sitter/tree-sitter-typescript/releases>

2. Download the pre-built WASMs from the release assets:

   ```sh
   VERSION=v0.23.2
   curl -L -o tree-sitter-typescript.wasm \
     "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/${VERSION}/tree-sitter-typescript.wasm"
   curl -L -o tree-sitter-tsx.wasm \
     "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/${VERSION}/tree-sitter-tsx.wasm"
   ```

3. Update `MANIFEST.json` with the new version and commit SHA (obtain from
   `https://api.github.com/repos/tree-sitter/tree-sitter-typescript/git/refs/tags/${VERSION}`).

4. Verify the parser tests still pass:

   ```sh
   bun test packages/engram-core/test/ingest/source/parser.test.ts
   ```

## Compatibility note

The WASM grammars must be compatible with the `web-tree-sitter` version in
`packages/engram-core/package.json`. Grammar ABI version mismatches will cause
a runtime error when loading the language. If you see `"incompatible ABI"` errors,
check the `web-tree-sitter` release notes and use a grammar version built against
the same ABI.
