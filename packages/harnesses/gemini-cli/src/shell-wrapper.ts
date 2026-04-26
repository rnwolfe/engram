/**
 * Generates a shell wrapper script that prepends engram context to gemini invocations.
 * Used by `engram companion --harness gemini-cli` as the fallback delivery mechanism.
 */
export function generateShellWrapper(): string {
  return `
# engram context injection for Gemini CLI
# Add to your shell profile (~/.bashrc, ~/.zshrc)
_engram_gemini() {
  local prompt="$*"
  local db=".engram"
  if [ -f "$db" ] && command -v engram &>/dev/null; then
    local pack
    pack=$(engram context "$prompt" --format md --token-budget 8000 --db "$db" 2>/dev/null)
    if [ -n "$pack" ]; then
      gemini -p "$pack

---

$prompt"
      return
    fi
  fi
  gemini "$@"
}
alias gemini='_engram_gemini'
`.trim();
}
