import pc from "picocolors";

// Respect NO_COLOR env var (spec: any value, including empty string, disables color)
// and non-TTY output (pipes, CI). Use separate flags for stdout vs stderr so that
// piping stdout does not strip color from stderr error messages and vice versa.
const noColor = process.env.NO_COLOR !== undefined;
const stdoutColor = !noColor && !!process.stdout.isTTY;
const stderrColor = !noColor && !!process.stderr.isTTY;

export const c = {
  bold: (s: string) => (stdoutColor ? pc.bold(s) : s),
  dim: (s: string) => (stdoutColor ? pc.dim(s) : s),
  // red is used on stderr (console.error) — gate on stderrColor
  red: (s: string) => (stderrColor ? pc.red(s) : s),
  yellow: (s: string) => (stdoutColor ? pc.yellow(s) : s),
  green: (s: string) => (stdoutColor ? pc.green(s) : s),
  cyan: (s: string) => (stdoutColor ? pc.cyan(s) : s),
};
