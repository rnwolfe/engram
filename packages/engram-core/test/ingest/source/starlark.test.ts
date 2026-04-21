/**
 * Tests for the Starlark/BUILD extractor.
 *
 * Covers:
 *   - languageForPath: BUILD, BUILD.bazel, BUCK → starlark; WORKSPACE, MODULE.bazel → null
 *   - extractStarlark: single target, multiple targets, relative dep, absolute dep,
 *     external dep, empty deps, select() deps, rule without name
 *   - Integration: ingestSource with BUILD files creates bazel_target entities
 *   - Idempotency: re-running doesn't duplicate entities/edges
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EngramGraph } from "../../../src/format/index.js";
import {
  closeGraph,
  createGraph,
  verifyGraph,
} from "../../../src/format/index.js";
import { findEdges } from "../../../src/graph/edges.js";
import { findEntities } from "../../../src/graph/entities.js";
import { extractStarlark } from "../../../src/ingest/source/extractors/starlark.js";
import { ingestSource } from "../../../src/ingest/source/index.js";
import {
  languageForPath,
  SourceParser,
} from "../../../src/ingest/source/parser.js";
import { ENTITY_TYPES, RELATION_TYPES } from "../../../src/vocab/index.js";

// ---------------------------------------------------------------------------
// languageForPath — Starlark file recognition
// ---------------------------------------------------------------------------

describe("languageForPath — Starlark BUILD files", () => {
  it("maps BUILD to starlark", () => {
    expect(languageForPath("BUILD")).toBe("starlark");
  });

  it("maps BUILD in a subdirectory to starlark", () => {
    expect(languageForPath("src/lib/BUILD")).toBe("starlark");
  });

  it("maps BUILD.bazel to starlark", () => {
    expect(languageForPath("BUILD.bazel")).toBe("starlark");
  });

  it("maps BUILD.bazel in a subdirectory to starlark", () => {
    expect(languageForPath("pkg/sub/BUILD.bazel")).toBe("starlark");
  });

  it("maps BUCK to starlark", () => {
    expect(languageForPath("BUCK")).toBe("starlark");
  });

  it("maps BUCK in a subdirectory to starlark", () => {
    expect(languageForPath("src/BUCK")).toBe("starlark");
  });
});

describe("languageForPath — WORKSPACE files return null", () => {
  it("returns null for WORKSPACE", () => {
    expect(languageForPath("WORKSPACE")).toBeNull();
  });

  it("returns null for WORKSPACE.bazel", () => {
    expect(languageForPath("WORKSPACE.bazel")).toBeNull();
  });

  it("returns null for MODULE.bazel", () => {
    expect(languageForPath("MODULE.bazel")).toBeNull();
  });

  it("returns null for WORKSPACE in a subdirectory", () => {
    expect(languageForPath("sub/WORKSPACE")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractStarlark unit tests (no DB, no parser — exercise extractor directly)
// ---------------------------------------------------------------------------

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function capture(src: string) {
  const tree = parser.parse(src, "starlark");
  return parser.runQuery(tree, "starlark");
}

describe("extractStarlark — single target", () => {
  const src = `cc_library(
    name = "hello",
    srcs = ["hello.cc"],
)`;

  it("produces one extraEntity for the named rule", () => {
    const { extraEntities } = extractStarlark(
      capture(src),
      "src/lib/BUILD",
      "/root",
    );
    expect(extraEntities?.length).toBe(1);
    expect(extraEntities?.[0].canonicalName).toBe("//src/lib:hello");
    expect(extraEntities?.[0].entityType).toBe(ENTITY_TYPES.BAZEL_TARGET);
  });

  it("produces no extraEdges when there are no deps", () => {
    const { extraEdges } = extractStarlark(
      capture(src),
      "src/lib/BUILD",
      "/root",
    );
    expect(extraEdges?.length).toBe(0);
  });

  it("returns empty symbols and rawImports", () => {
    const { symbols, rawImports } = extractStarlark(
      capture(src),
      "BUILD",
      "/root",
    );
    expect(symbols).toHaveLength(0);
    expect(rawImports).toHaveLength(0);
  });
});

describe("extractStarlark — multiple targets", () => {
  const src = `
cc_library(name = "lib_a")
cc_binary(name = "bin_b")
py_library(name = "py_c")
`;

  it("produces one entity per named rule", () => {
    const { extraEntities } = extractStarlark(
      capture(src),
      "pkg/BUILD",
      "/root",
    );
    const names = extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("//pkg:lib_a");
    expect(names).toContain("//pkg:bin_b");
    expect(names).toContain("//pkg:py_c");
  });
});

describe("extractStarlark — relative dep (:bar)", () => {
  const src = `
cc_binary(
    name = "app",
    deps = [":utils"],
)
`;

  it("resolves :bar to //<current-pkg>:bar", () => {
    const { extraEdges } = extractStarlark(capture(src), "cmd/BUILD", "/root");
    expect(extraEdges?.length).toBe(1);
    expect(extraEdges?.[0].target).toMatchObject({
      kind: "canonical",
      canonicalName: "//cmd:utils",
    });
  });

  it("source of edge is the current target", () => {
    const { extraEdges } = extractStarlark(capture(src), "cmd/BUILD", "/root");
    expect(extraEdges?.[0].source).toMatchObject({
      kind: "canonical",
      canonicalName: "//cmd:app",
    });
  });

  it("edge relationType is BUILD_DEPENDS_ON", () => {
    const { extraEdges } = extractStarlark(capture(src), "cmd/BUILD", "/root");
    expect(extraEdges?.[0].relationType).toBe(RELATION_TYPES.BUILD_DEPENDS_ON);
  });
});

describe("extractStarlark — absolute dep (//lib:baz)", () => {
  const src = `
cc_library(
    name = "consumer",
    deps = ["//lib:baz"],
)
`;

  it("leaves //lib:baz unchanged", () => {
    const { extraEdges } = extractStarlark(capture(src), "BUILD", "/root");
    expect(extraEdges?.[0].target).toMatchObject({
      kind: "canonical",
      canonicalName: "//lib:baz",
    });
  });
});

describe("extractStarlark — external dep (@repo//pkg:target)", () => {
  const src = `
cc_library(
    name = "mylib",
    deps = ["@com_google_absl//absl:strings"],
)
`;

  it("leaves external label unchanged", () => {
    const { extraEdges } = extractStarlark(capture(src), "BUILD", "/root");
    expect(extraEdges?.[0].target).toMatchObject({
      kind: "canonical",
      canonicalName: "@com_google_absl//absl:strings",
    });
  });
});

describe("extractStarlark — empty deps list", () => {
  const src = `cc_library(
    name = "empty_deps",
    deps = [],
)`;

  it("produces entity but no edges", () => {
    const result = extractStarlark(capture(src), "BUILD", "/root");
    const names = result.extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("//:empty_deps");
    expect(result.extraEdges?.length).toBe(0);
  });
});

describe("extractStarlark — select() deps (non-string entries skipped)", () => {
  const src = `
cc_library(
    name = "platform_lib",
    deps = [
        ":base",
        select({
            "//conditions:default": ["//fallback:lib"],
        }),
    ],
)
`;

  it("captures the string dep but skips select()", () => {
    const { extraEdges } = extractStarlark(capture(src), "BUILD", "/root");
    // Only ":base" is a string literal directly in the list — select() is skipped
    const targetNames =
      extraEdges?.map(
        (e) => (e.target as { canonicalName: string }).canonicalName,
      ) ?? [];
    expect(targetNames).toContain("//:base");
    // select() produces no dep edges
    expect(targetNames.every((n) => !n.includes("fallback"))).toBe(true);
  });
});

describe("extractStarlark — rule without name attribute", () => {
  const src = `
load("//tools:defs.bzl", "my_rule")
cc_library(
    srcs = ["a.cc"],
)
`;

  it("produces no entities or edges for rules without name", () => {
    const { extraEntities, extraEdges } = extractStarlark(
      capture(src),
      "BUILD",
      "/root",
    );
    expect(extraEntities?.length).toBe(0);
    expect(extraEdges?.length).toBe(0);
  });
});

describe("extractStarlark — root-level BUILD (pkg = '')", () => {
  const src = `cc_binary(
    name = "main",
    deps = ["//lib:core"],
)`;

  it("produces //:main canonical label for root BUILD", () => {
    const { extraEntities } = extractStarlark(capture(src), "BUILD", "/root");
    const names = extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("//:main");
  });
});

describe("extractStarlark — multiple deps", () => {
  const src = `
cc_binary(
    name = "server",
    deps = [
        ":proto",
        "//common:utils",
        "@boost//libs:system",
    ],
)
`;

  it("produces one edge per dep string", () => {
    const { extraEdges } = extractStarlark(capture(src), "src/BUILD", "/root");
    expect(extraEdges?.length).toBe(3);
  });

  it("dep entity is added to extraEntities for each dep", () => {
    const { extraEntities } = extractStarlark(
      capture(src),
      "src/BUILD",
      "/root",
    );
    const names = extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("//src:server");
    expect(names).toContain("//src:proto");
    expect(names).toContain("//common:utils");
    expect(names).toContain("@boost//libs:system");
  });
});

// ---------------------------------------------------------------------------
// Integration: ingestSource with BUILD files
// ---------------------------------------------------------------------------

let tmpDir: string;
let graphPath: string;
let graph: EngramGraph;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-starlark-test-"));
  graphPath = path.join(tmpDir, "test.engram");
  graph = await createGraph(graphPath);
});

afterEach(async () => {
  closeGraph(graph);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeFixture(files: Record<string, string>): string {
  const fixtureDir = path.join(tmpDir, "fixture");
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(fixtureDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return fixtureDir;
}

describe("ingestSource — BUILD file integration", () => {
  it("creates bazel_target entities from BUILD files", async () => {
    const root = makeFixture({
      "lib/BUILD": `
cc_library(
    name = "utils",
    srcs = ["utils.cc"],
)
`,
    });

    const result = await ingestSource(graph, { root, respectGitignore: false });
    expect(result.errors).toHaveLength(0);

    const targets = findEntities(graph, {
      entity_type: ENTITY_TYPES.BAZEL_TARGET,
    });
    expect(targets.length).toBeGreaterThan(0);
    const names = targets.map((t) => t.canonical_name);
    expect(names).toContain("//lib:utils");
  });

  it("creates build_depends_on edges for deps", async () => {
    const root = makeFixture({
      BUILD: `
cc_binary(
    name = "app",
    deps = ["//lib:utils"],
)
cc_library(
    name = "utils",
    srcs = ["a.cc"],
)
`,
      "lib/BUILD": `
cc_library(
    name = "utils",
    srcs = ["utils.cc"],
)
`,
    });

    await ingestSource(graph, { root, respectGitignore: false });

    const depEdges = findEdges(graph, {
      active_only: true,
      relation_type: RELATION_TYPES.BUILD_DEPENDS_ON,
    });
    expect(depEdges.length).toBeGreaterThan(0);
  });

  it("verifyGraph passes after BUILD file ingest", async () => {
    const root = makeFixture({
      "src/BUILD": `
cc_library(
    name = "foo",
    deps = [":bar"],
)
cc_library(
    name = "bar",
)
`,
    });

    await ingestSource(graph, { root, respectGitignore: false });

    const vr = verifyGraph(graph);
    expect(vr.violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("WORKSPACE files are not parsed as Starlark", async () => {
    const root = makeFixture({
      WORKSPACE: `workspace(name = "my_workspace")`,
      BUILD: `cc_library(name = "root_lib")`,
    });

    const result = await ingestSource(graph, { root, respectGitignore: false });
    expect(result.errors).toHaveLength(0);

    // WORKSPACE should not produce bazel_target entities from itself
    // Only the BUILD file target should be present
    const targets = findEntities(graph, {
      entity_type: ENTITY_TYPES.BAZEL_TARGET,
    });
    expect(targets.map((t) => t.canonical_name)).toContain("//:root_lib");
  });
});

describe("ingestSource — idempotency for BUILD files", () => {
  it("re-running does not duplicate bazel_target entities or edges", async () => {
    const root = makeFixture({
      "pkg/BUILD": `
cc_library(
    name = "mylib",
    deps = ["//other:dep"],
)
`,
      "other/BUILD": `cc_library(name = "dep")`,
    });

    await ingestSource(graph, { root, respectGitignore: false });
    const count1 = findEntities(graph, {
      entity_type: ENTITY_TYPES.BAZEL_TARGET,
    }).length;
    const edges1 = findEdges(graph, {
      active_only: true,
      relation_type: RELATION_TYPES.BUILD_DEPENDS_ON,
    }).length;

    await ingestSource(graph, { root, respectGitignore: false });
    const count2 = findEntities(graph, {
      entity_type: ENTITY_TYPES.BAZEL_TARGET,
    }).length;
    const edges2 = findEdges(graph, {
      active_only: true,
      relation_type: RELATION_TYPES.BUILD_DEPENDS_ON,
    }).length;

    expect(count2).toBe(count1);
    expect(edges2).toBe(edges1);
  }, 20_000);
});
