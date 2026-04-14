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
  maxFileBytes?: number; // default 1_048_576
}

/** Directory names that are always excluded regardless of .gitignore */
const DENY_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "target",
  ".git",
  "coverage",
]);

/** File glob patterns that are always excluded */
const DENY_FILE_PATTERNS = [
  /\.min\.js$/,
  /\.min\.css$/,
  /\.map$/,
  /\.lockb$/,
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
];

const DEFAULT_MAX_FILE_BYTES = 1_048_576; // 1MB
const BINARY_PROBE_BYTES = 4096;

function isDeniedFile(filename: string): boolean {
  return DENY_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function isDeniedDir(dirname: string): boolean {
  return DENY_DIRS.has(dirname);
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
 * Walk a directory tree, yielding FileEntry objects for each ingestable file.
 */
export async function* walk(opts: WalkOptions): AsyncIterable<FileEntry> {
  const {
    root,
    exclude = [],
    respectGitignore = true,
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

  function getGitignore(dirPath: string): Ignore | null {
    const cached = gitignoreCache.get(dirPath);
    if (cached !== undefined) {
      return cached;
    }
    const ig = respectGitignore ? loadGitignore(dirPath) : null;
    gitignoreCache.set(dirPath, ig);
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
        // Apply denylist for directories (always enforced)
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

        // Apply gitignore chain
        if (respectGitignore && isGitignored(relPosix)) {
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

        // Size limit check
        const fileSize = stat.size;
        if (fileSize > maxFileBytes) {
          console.warn(
            `[engram walker] skipping ${relPosix}: file size ${fileSize} exceeds limit ${maxFileBytes}`,
          );
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
