import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type FileEntry, walk } from "../../../src/ingest/source/walker";

const FIXTURE_ROOT = path.resolve(
  import.meta.dir,
  "../../fixtures/source-sample",
);

async function collectPaths(
  opts: Parameters<typeof walk>[0],
): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of walk(opts)) {
    paths.push(entry.relPath);
  }
  return paths.sort();
}

describe("walk()", () => {
  describe("basic fixture walk", () => {
    it("yields exactly the 3 ingestable files", async () => {
      const paths = await collectPaths({ root: FIXTURE_ROOT });
      expect(paths).toEqual(["src/a.ts", "src/b.ts", "src/nested/c.ts"]);
    });

    it("never yields node_modules/evil.ts (denylist dir)", async () => {
      const paths = await collectPaths({ root: FIXTURE_ROOT });
      expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    });

    it("never yields dist/bundle.js (denylist dir)", async () => {
      const paths = await collectPaths({ root: FIXTURE_ROOT });
      expect(paths.some((p) => p.includes("dist"))).toBe(false);
    });

    it("excludes src/generated.ts via root .gitignore", async () => {
      const paths = await collectPaths({ root: FIXTURE_ROOT });
      expect(paths).not.toContain("src/generated.ts");
    });

    it("excludes src/nested/hidden.ts via nested .gitignore", async () => {
      const paths = await collectPaths({ root: FIXTURE_ROOT });
      expect(paths).not.toContain("src/nested/hidden.ts");
    });

    it("skips assets/logo.bin silently (binary file)", async () => {
      const paths = await collectPaths({ root: FIXTURE_ROOT });
      expect(paths.some((p) => p.includes("logo.bin"))).toBe(false);
    });
  });

  describe("FileEntry shape", () => {
    it("yields entries with correct shape", async () => {
      const entries: FileEntry[] = [];
      for await (const entry of walk({ root: FIXTURE_ROOT })) {
        entries.push(entry);
      }
      expect(entries.length).toBe(3);
      for (const entry of entries) {
        expect(typeof entry.relPath).toBe("string");
        expect(typeof entry.absPath).toBe("string");
        expect(typeof entry.contentHash).toBe("string");
        expect(entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
        expect(typeof entry.size).toBe("number");
        expect(entry.size).toBeGreaterThan(0);
        expect(typeof entry.body).toBe("string");
        expect(entry.body.length).toBeGreaterThan(0);
      }
    });

    it("relPath uses posix separators", async () => {
      const paths = await collectPaths({ root: FIXTURE_ROOT });
      for (const p of paths) {
        expect(p).not.toContain("\\");
      }
    });

    it("absPath is absolute and exists", async () => {
      for await (const entry of walk({ root: FIXTURE_ROOT })) {
        expect(path.isAbsolute(entry.absPath)).toBe(true);
        expect(fs.existsSync(entry.absPath)).toBe(true);
      }
    });
  });

  describe("respectGitignore: false", () => {
    it("includes gitignored files but still respects denylist dirs", async () => {
      const paths = await collectPaths({
        root: FIXTURE_ROOT,
        respectGitignore: false,
      });
      // gitignored files come through
      expect(paths).toContain("src/generated.ts");
      expect(paths).toContain("src/nested/hidden.ts");
      // but denylist dirs are still excluded
      expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
      expect(paths.some((p) => p.includes("dist"))).toBe(false);
    });
  });

  describe("user exclude patterns", () => {
    it("excludes files matching user exclude patterns", async () => {
      const paths = await collectPaths({
        root: FIXTURE_ROOT,
        respectGitignore: false,
        exclude: ["src/a.ts", "src/nested/**"],
      });
      expect(paths).not.toContain("src/a.ts");
      expect(paths).not.toContain("src/nested/c.ts");
      expect(paths).not.toContain("src/nested/hidden.ts");
      expect(paths).toContain("src/b.ts");
      expect(paths).toContain("src/generated.ts");
    });

    it("exclude patterns layer on top of gitignore", async () => {
      const paths = await collectPaths({
        root: FIXTURE_ROOT,
        exclude: ["src/b.ts"],
      });
      expect(paths).not.toContain("src/b.ts");
      expect(paths).toContain("src/a.ts");
    });
  });

  describe("size limit", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-walker-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("skips files over the default 1MB limit with a console.warn", async () => {
      const bigFile = path.join(tmpDir, "big.ts");
      // write just over 1MB
      fs.writeFileSync(bigFile, "x".repeat(1_048_577));

      const smallFile = path.join(tmpDir, "small.ts");
      fs.writeFileSync(smallFile, "export const x = 1;");

      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      const paths = await collectPaths({ root: tmpDir });

      expect(paths).not.toContain("big.ts");
      expect(paths).toContain("small.ts");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("big.ts"));

      warnSpy.mockRestore();
    });

    it("respects custom maxFileBytes", async () => {
      const file = path.join(tmpDir, "medium.ts");
      fs.writeFileSync(file, "x".repeat(100));

      const paths = await collectPaths({ root: tmpDir, maxFileBytes: 50 });
      expect(paths).not.toContain("medium.ts");
    });

    it("includes files at exactly the size limit", async () => {
      const file = path.join(tmpDir, "exact.ts");
      fs.writeFileSync(file, "x".repeat(100));

      const paths = await collectPaths({ root: tmpDir, maxFileBytes: 100 });
      expect(paths).toContain("exact.ts");
    });
  });

  describe("symlink loop detection", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-walker-symlink-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("does not infinite loop on circular symlinks", async () => {
      // Create a real file
      const subDir = path.join(tmpDir, "subdir");
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, "real.ts"), "export const x = 1;");

      // Create a symlink from subdir/loop -> tmpDir (circular)
      const loopLink = path.join(subDir, "loop");
      fs.symlinkSync(tmpDir, loopLink);

      // Walk should complete without hanging and yield the real file
      const paths = await collectPaths({ root: tmpDir });
      expect(paths).toContain("subdir/real.ts");
      // loop dir itself is visited via symlink but tracked by inode
    });
  });

  describe("denylist file patterns", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-walker-deny-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("never yields *.min.js files", async () => {
      fs.writeFileSync(path.join(tmpDir, "app.min.js"), "var x=1;");
      fs.writeFileSync(path.join(tmpDir, "app.ts"), "export const x = 1;");
      const paths = await collectPaths({ root: tmpDir });
      expect(paths).not.toContain("app.min.js");
      expect(paths).toContain("app.ts");
    });

    it("never yields *.map files", async () => {
      fs.writeFileSync(path.join(tmpDir, "app.js.map"), "{}");
      fs.writeFileSync(path.join(tmpDir, "app.ts"), "export const x = 1;");
      const paths = await collectPaths({ root: tmpDir });
      expect(paths).not.toContain("app.js.map");
    });

    it("never yields package-lock.json", async () => {
      fs.writeFileSync(path.join(tmpDir, "package-lock.json"), "{}");
      fs.writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");
      const paths = await collectPaths({ root: tmpDir });
      expect(paths).not.toContain("package-lock.json");
    });

    it("never yields yarn.lock", async () => {
      fs.writeFileSync(path.join(tmpDir, "yarn.lock"), "# yarn lockfile");
      fs.writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");
      const paths = await collectPaths({ root: tmpDir });
      expect(paths).not.toContain("yarn.lock");
    });
  });
});
