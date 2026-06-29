/**
 * Generates a shell wrapper that prepends an engram context pack to `agy`
 * (Antigravity CLI) print-mode invocations. Used by
 * `engram companion --harness antigravity` as the fallback delivery mechanism
 * (Antigravity has no documented force-injection per-prompt hook).
 */
export function generateShellWrapper(): string {
  return `
# engram context injection for Antigravity CLI (agy)
# Add to your shell profile (~/.bashrc, ~/.zshrc)
_engram_agy() {
  local prompt="$*"
  local db=".engram"
  if [ -f "$db" ] && command -v engram &>/dev/null; then
    local pack
    pack=$(command engram context "$prompt" --format md --token-budget 8000 --db "$db" 2>/dev/null)
    if [ -n "$pack" ]; then
      command agy -p "$pack

---

$prompt"
      return
    fi
  fi
  command agy "$@"
}
alias agy='_engram_agy'
`.trim();
}
