import pc from "picocolors";

// Respect NO_COLOR env var and non-TTY output (pipes, CI)
const enabled = process.stdout.isTTY && !process.env.NO_COLOR;

export const c = {
  bold: (s: string) => (enabled ? pc.bold(s) : s),
  dim: (s: string) => (enabled ? pc.dim(s) : s),
  red: (s: string) => (enabled ? pc.red(s) : s),
  yellow: (s: string) => (enabled ? pc.yellow(s) : s),
  green: (s: string) => (enabled ? pc.green(s) : s),
  cyan: (s: string) => (enabled ? pc.cyan(s) : s),
};
