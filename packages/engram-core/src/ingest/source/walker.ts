import * as fs from "node:fs";
import * as path from "node:path";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import ignore, { type Ignore } from "ignore";

export interface FileEntry {
  relPath: string; // posix, relative to root
  absPath: string;
  contentHash: string; // blake3 hex
  size: number;
  body: string;
}

export interface WalkOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean; // default true
  respectEngramignore?: boolean; // default true
  maxFileBytes?: number; // default 1_048_576
}

/** Directory names that are always excluded regardless of .gitignore */
const DENY_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  // vendor / third-party
  "vendor",
  "third_party",
  "_vendor",
  "extern",
  // generated / proto output
  "generated",
  "gen",
  "pb",
  "proto_gen",
  // test fixtures
  "testdata",
]);

/** File glob patterns that are always excluded */
const DENY_FILE_PATTERNS = [
  /\.min\.js$/,
  /\.min\.css$/,
  /\.map$/,
  /\.lockb$/,
  /\.wasm$/,
  /\.engram$/,
  /\.engram-wal$/,
  /\.engram-shm$/,
  /^package-lock\.json$/,
  /^bun\.lock$/,
  /^bun\.lockb$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^\.gitmodules$/,
  /^\.engramignore$/,
];

const DEFAULT_MAX_FILE_BYTES = 1_048_576; // 1MB
const BINARY_PROBE_BYTES = 4096;

function isDeniedFile(filename: string): boolean {
  return DENY_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function isDeniedDir(dirname: string): boolean {
  return DENY_DIRS.has(dirname) || dirname.startsWith(".");
}

function isBinary(buffer: Buffer): boolean {
  const probe = buffer.subarray(0, BINARY_PROBE_BYTES);
  return probe.includes(0x00);
}

function computeBlake3Hex(content: string): string {
  const bytes = new TextEncoder().encode(content);
  const hash = blake3(bytes);
  return bytesToHex(hash);
}

/**
 * Load .gitignore file and return an `ignore` instance, or null if not found.
 */
function loadGitignore(dirPath: string): Ignore | null {
  const gitignorePath = path.join(dirPath, ".gitignore");
  try {
    const content = fs.readFileSync(gitignorePath, "utf8");
    const ig = ignore();
    ig.add(content);
    return ig;
  } catch {
    return null;
  }
}

/**
 * Load .engramignore file and return an `ignore` instance, or null if not found.
 */
function loadEngramignore(dirPath: string): Ignore | null {
  const engramignorePath = path.join(dirPath, ".engramignore");
  try {
    const content = fs.readFileSync(engramignorePath, "utf8");
    const ig = ignore();
    ig.add(content);
    return ig;
  } catch {
    return null;
  }
}

/**
 * Walk a directory tree, yielding FileEntry objects for each ingestable file.
 */
export async function* walk(opts: WalkOptions): AsyncIterable<FileEntry> {
  const {
    root,
    exclude = [],
    respectGitignore = true,
    respectEngramignore = true,
    maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  } = opts;

  const absRoot = path.resolve(root);

  // Build root-level ignore instance for user-supplied excludes
  const rootUserIg = ignore();
  if (exclude.length > 0) {
    rootUserIg.add(exclude);
  }

  // Track visited inodes to prevent symlink loops
  const visitedInodes = new Set<bigint | number>();

  // gitignore instances per directory path (keyed by absPath)
  const gitignoreCache = new Map<string, Ignore | null>();
  // engramignore instances per directory path (keyed by absPath)
  const engramignoreCache = new Map<string, Ignore | null>();

  function getGitignore(dirPath: string): Ignore | null {
    const cached = gitignoreCache.get(dirPath);
    if (cached !== undefined) {
      return cached;
    }
    const ig = respectGitignore ? loadGitignore(dirPath) : null;
    gitignoreCache.set(dirPath, ig);
    return ig;
  }

  function getEngramignore(dirPath: string): Ignore | null {
    const cached = engramignoreCache.get(dirPath);
    if (cached !== undefined) {
      return cached;
    }
    const ig = respectEngramignore ? loadEngramignore(dirPath) : null;
    engramignoreCache.set(dirPath, ig);
    return ig;
  }

  /**
   * Check if a path (relative to root, posix) is ignored by any gitignore
   * in the chain from root to the file's parent directory.
   */
  function isGitignored(relPosix: string): boolean {
    if (!respectGitignore) return false;

    // Walk from root down to the file's parent, checking each directory's gitignore
    const parts = relPosix.split("/");

    for (let depth = 0; depth < parts.length; depth++) {
      const dirRelParts = parts.slice(0, depth);
      const dirAbsPath =
        dirRelParts.length === 0 ? absRoot : path.join(absRoot, ...dirRelParts);
      const ig = getGitignore(dirAbsPath);
      if (ig) {
        // Check relative to this directory
        const relToDir = parts.slice(depth).join("/");
        if (ig.ignores(relToDir)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if a path (relative to root, posix) is ignored by any .engramignore
   * in the chain from root to the file's parent directory.
   *
   * .engramignore and .gitignore are independent sequential filters — each is
   * checked separately and a file must pass both to be included. Negation
   * patterns in .engramignore only work within .engramignore itself (e.g.
   * `*.pb.ts` followed by `!custom.ts` in the same file). They cannot
   * re-include a path that .gitignore has excluded, because .gitignore is a
   * separate gate applied after .engramignore.
   *
   * Implementation note: the `ignore` library's `ignores()` returns false for
   * paths that match a negation pattern (i.e. the path is not ignored). We
   * therefore use `ignores()` directly — a negation re-includes automatically
   * within the scope of .engramignore.
   */
  function isEngramignored(relPosix: string): boolean {
    if (!respectEngramignore) return false;

    const parts = relPosix.split("/");

    for (let depth = 0; depth < parts.length; depth++) {
      const dirRelParts = parts.slice(0, depth);
      const dirAbsPath =
        dirRelParts.length === 0 ? absRoot : path.join(absRoot, ...dirRelParts);
      const ig = getEngramignore(dirAbsPath);
      if (ig) {
        const relToDir = parts.slice(depth).join("/");
        if (ig.ignores(relToDir)) {
          return true;
        }
      }
    }
    return false;
  }

  async function* walkDir(
    absDir: string,
    relDir: string, // posix relative to root
  ): AsyncIterable<FileEntry> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryName = entry.name;
      const absEntryPath = path.join(absDir, entryName);
      const relPosix = relDir === "" ? entryName : `${relDir}/${entryName}`;

      // Resolve symlinks
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absEntryPath);
      } catch {
        continue;
      }

      // Track inodes to prevent symlink loops
      const inode = stat.ino;
      if (visitedInodes.has(inode)) {
        continue;
      }

      if (stat.isDirectory()) {
        // Apply denylist for directories (always enforced — hard floor)
        if (isDeniedDir(entryName)) {
          continue;
        }

        visitedInodes.add(inode);
        yield* walkDir(absEntryPath, relPosix);
        visitedInodes.delete(inode);
      } else if (stat.isFile()) {
        // Apply denylist for files (always enforced)
        if (isDeniedFile(entryName)) {
          continue;
        }

        // Apply root user excludes
        if (exclude.length > 0 && rootUserIg.ignores(relPosix)) {
          continue;
        }

        // Apply .engramignore chain (independent of .gitignore — negation only
        // works within .engramignore itself, not across the .gitignore gate)
        if (respectEngramignore && isEngramignored(relPosix)) {
          continue;
        }

        // Apply gitignore chain
        if (respectGitignore && isGitignored(relPosix)) {
          continue;
        }

        // Size limit check (before reading file into memory)
        const fileSize = stat.size;
        if (fileSize > maxFileBytes) {
          console.warn(
            `[engram walker] skipping ${relPosix}: file size ${fileSize} exceeds limit ${maxFileBytes}`,
          );
          continue;
        }

        // Read the file
        let fileBuffer: Buffer;
        try {
          fileBuffer = fs.readFileSync(absEntryPath);
        } catch {
          continue;
        }

        // Binary detection: check first 4KB for null bytes
        if (isBinary(fileBuffer)) {
          continue;
        }

        const body = fileBuffer.toString("utf8");
        const contentHash = computeBlake3Hex(body);

        yield {
          relPath: relPosix,
          absPath: absEntryPath,
          contentHash,
          size: fileSize,
          body,
        };
      }
    }
  }

  // Mark root inode as visited
  try {
    const rootStat = fs.statSync(absRoot);
    visitedInodes.add(rootStat.ino);
  } catch {
    return;
  }

  yield* walkDir(absRoot, "");
}
