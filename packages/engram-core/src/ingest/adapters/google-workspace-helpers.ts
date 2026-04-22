/**
 * google-workspace-helpers.ts — Internal helpers for the Google Workspace adapter.
 *
 * Provides:
 * - Scope parsing (doc:<id>, docs:<id>,<id>,...)
 * - Google Docs text extraction (extractDocText)
 * - Drive metadata fetching
 * - Error-classified HTTP fetch helpers
 */

import { EnrichmentAdapterError } from "../adapter.js";

// ---------------------------------------------------------------------------
// Google Docs API types (only fields we use)
// ---------------------------------------------------------------------------

export interface DocsTextRun {
  content?: string;
}

export interface DocsParagraphElement {
  textRun?: DocsTextRun;
  inlineObjectElement?: unknown;
}

export interface DocsParagraph {
  elements?: DocsParagraphElement[];
  paragraphStyle?: {
    namedStyleType?: string;
    indentLevel?: number;
  };
  bullet?: {
    nestingLevel?: number;
    listId?: string;
  };
}

export interface DocsTableCell {
  content?: DocsStructuralElement[];
}

export interface DocsTableRow {
  tableCells?: DocsTableCell[];
}

export interface DocsTable {
  tableRows?: DocsTableRow[];
}

export interface DocsStructuralElement {
  paragraph?: DocsParagraph;
  table?: DocsTable;
  sectionBreak?: unknown;
  tableOfContents?: unknown;
}

export interface DocsBody {
  content?: DocsStructuralElement[];
}

export interface DocsDocument {
  documentId?: string;
  title?: string;
  body?: DocsBody;
  revisionId?: string;
}

export interface DriveFile {
  modifiedTime?: string;
  owners?: DriveUser[];
  lastModifyingUser?: DriveUser;
  permissions?: DrivePermission[];
}

export interface DriveUser {
  emailAddress?: string;
  displayName?: string;
}

export interface DrivePermission {
  role?: string;
  type?: string;
  emailAddress?: string;
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Scope parsing
// ---------------------------------------------------------------------------

/**
 * Parses a Google Workspace scope string into a list of document IDs.
 *
 * Accepted formats:
 * - `doc:<id>`                     — single document
 * - `docs:<id>,<id>`              — comma-separated list of document IDs
 * - `folder:<id>`                  — all docs in a Drive folder (flat)
 * - `folder:<id>?recursive=true`  — all docs in a folder tree (BFS)
 * - `query:<drive-q>`             — arbitrary Drive search query
 *
 * For `folder:` and `query:` scopes this function returns an empty array —
 * the adapter discovers doc IDs at enrich time via Drive API enumeration.
 */
export function parseScope(scope: string): string[] {
  if (scope.startsWith("doc:")) {
    const id = scope.slice(4).trim();
    if (!id) throw new Error("doc scope must include a document ID: doc:<id>");
    return [id];
  }
  if (scope.startsWith("docs:")) {
    const raw = scope.slice(5);
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0)
      throw new Error(
        "docs scope must include at least one document ID: docs:<id>,<id>,...",
      );
    return ids;
  }
  if (scope.startsWith("folder:")) {
    // Validated elsewhere (parseFolderScope) — return empty so adapter takes
    // the discovery path
    return [];
  }
  if (scope.startsWith("query:")) {
    // Validated elsewhere — return empty so adapter takes the discovery path
    return [];
  }
  throw new Error(
    `Unsupported scope format: ${JSON.stringify(scope)}. ` +
      `Use 'doc:<id>', 'docs:<id>,<id>,...', 'folder:<id>', or 'query:<q>'`,
  );
}

/**
 * Validate a Google Workspace scope string.
 * Throws with a descriptive message on invalid input.
 *
 * Accepted formats:
 * - `doc:<id>`                     — single document
 * - `docs:<id>,<id>`              — comma-separated list of document IDs
 * - `folder:<id>`                  — all docs in a Drive folder (flat)
 * - `folder:<id>?recursive=true`  — all docs in a folder tree (BFS)
 * - `folder:<id>?recursive=false` — explicitly flat (same as no param)
 * - `query:<drive-q>`             — arbitrary Drive search query (non-empty)
 */
export function validateScope(scope: string): void {
  if (scope.startsWith("doc:")) {
    const id = scope.slice(4).trim();
    if (!id) throw new Error("doc scope must include a document ID: doc:<id>");
    return;
  }
  if (scope.startsWith("docs:")) {
    const raw = scope.slice(5);
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0)
      throw new Error(
        "docs scope must include at least one document ID: docs:<id>,<id>,...",
      );
    return;
  }
  if (scope.startsWith("folder:")) {
    validateFolderScope(scope);
    return;
  }
  if (scope.startsWith("query:")) {
    const q = scope.slice("query:".length).trim();
    if (!q) {
      throw new Error(
        "query scope must include a non-empty Drive query: query:<q>",
      );
    }
    return;
  }
  throw new Error(
    `Unsupported scope format: ${JSON.stringify(scope)}. ` +
      `Use 'doc:<id>', 'docs:<id>,<id>,...', 'folder:<id>', or 'query:<q>'`,
  );
}

/**
 * Validate a folder:<id> scope string inline (no import needed).
 */
function validateFolderScope(scope: string): void {
  const rest = scope.slice("folder:".length);
  const qIdx = rest.indexOf("?");
  const folderId = qIdx === -1 ? rest.trim() : rest.slice(0, qIdx).trim();

  if (!folderId) {
    throw new Error("folder scope must include a folder ID: folder:<id>");
  }

  if (qIdx !== -1) {
    const queryString = rest.slice(qIdx + 1);
    const params = new URLSearchParams(queryString);
    for (const key of params.keys()) {
      if (key !== "recursive") {
        throw new Error(
          `Unknown query parameter in folder scope: '${key}'. Valid keys: recursive`,
        );
      }
    }
    const recursiveVal = params.get("recursive");
    if (
      recursiveVal !== null &&
      recursiveVal !== "true" &&
      recursiveVal !== "false"
    ) {
      throw new Error(
        `Invalid value for recursive in folder scope: '${recursiveVal}'. Use true or false`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

const HEADING_PREFIXES: Record<string, string> = {
  HEADING_1: "# ",
  HEADING_2: "## ",
  HEADING_3: "### ",
  HEADING_4: "#### ",
  HEADING_5: "##### ",
  HEADING_6: "###### ",
};

/**
 * Extracts plain text from a Google Docs document body.
 *
 * Handles: paragraphs, headings (with # prefix), lists (indented),
 * tables (cell-by-cell), and nested structures.
 */
export function extractDocText(doc: DocsDocument): string {
  const parts: string[] = [];
  if (doc.title) {
    parts.push(`# ${doc.title}\n`);
  }
  if (doc.body?.content) {
    extractStructuralElements(doc.body.content, parts, 0);
  }
  return parts.join("").trimEnd();
}

function extractStructuralElements(
  elements: DocsStructuralElement[],
  out: string[],
  depth: number,
): void {
  for (const el of elements) {
    if (el.paragraph) {
      extractParagraph(el.paragraph, out, depth);
    } else if (el.table) {
      extractTable(el.table, out, depth);
    }
    // sectionBreak and tableOfContents are ignored
  }
}

function extractParagraph(
  para: DocsParagraph,
  out: string[],
  depth: number,
): void {
  const style = para.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT";
  const prefix = HEADING_PREFIXES[style] ?? "";

  // Determine list indent
  const bulletIndent =
    para.bullet != null ? (para.bullet.nestingLevel ?? 0) : -1;
  const listIndent = bulletIndent >= 0 ? `${"  ".repeat(bulletIndent)}- ` : "";

  // Collect text runs
  const text = (para.elements ?? [])
    .map((el) => el.textRun?.content ?? "")
    .join("");

  // Strip the trailing newline that Docs inserts per paragraph
  const cleaned = text.replace(/\n$/, "");

  if (cleaned.length === 0 && !prefix && !listIndent) {
    // Empty paragraph — emit blank line only at top level
    if (depth === 0) out.push("\n");
    return;
  }

  const indent = "  ".repeat(depth);
  out.push(`${indent}${listIndent}${prefix}${cleaned}\n`);
}

function extractTable(table: DocsTable, out: string[], depth: number): void {
  for (const row of table.tableRows ?? []) {
    const cellTexts: string[] = [];
    for (const cell of row.tableCells ?? []) {
      const cellParts: string[] = [];
      extractStructuralElements(cell.content ?? [], cellParts, depth + 1);
      cellTexts.push(
        cellParts.join("").replace(/\n+$/, "").replace(/\n/g, " "),
      );
    }
    out.push(`| ${cellTexts.join(" | ")} |\n`);
  }
  out.push("\n");
}

// ---------------------------------------------------------------------------
// HTTP fetch helpers
// ---------------------------------------------------------------------------

export type GWFetchFn = typeof fetch;

/**
 * Perform a GET to the Google APIs with Bearer auth.
 * Handles 429 (rate_limited) and 5xx (server_error, one retry).
 * 401/403 → throws with `code: 'auth_failure'` (refresh is handled by the adapter).
 */
export async function apiGetGW<T>(
  fetchFn: GWFetchFn,
  url: string,
  token: string,
): Promise<T> {
  const resp = await fetchFn(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (resp.status === 429) {
    const retryAfter = resp.headers.get("Retry-After") ?? "60";
    throw new EnrichmentAdapterError(
      "rate_limited",
      `Google API rate limited. Retry-After: ${retryAfter}s`,
    );
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new EnrichmentAdapterError(
      "auth_failure",
      `Google API auth error (HTTP ${resp.status})`,
    );
  }

  if (resp.status >= 500) {
    // One retry
    const resp2 = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp2.ok) {
      throw new EnrichmentAdapterError(
        "server_error",
        `Google API server error (HTTP ${resp2.status}) for ${url}`,
      );
    }
    return resp2.json() as Promise<T>;
  }

  if (!resp.ok) {
    throw new EnrichmentAdapterError(
      "data_error",
      `Google API unexpected status ${resp.status} for ${url}`,
    );
  }

  return resp.json() as Promise<T>;
}

/**
 * Fetch a Google Doc. Returns null with a warning for 404 (doc not found in a list).
 */
export async function fetchDoc(
  fetchFn: GWFetchFn,
  docId: string,
  token: string,
): Promise<DocsDocument | null> {
  const url = `https://docs.googleapis.com/v1/documents/${docId}`;
  try {
    return await apiGetGW<DocsDocument>(fetchFn, url, token);
  } catch (err) {
    if (
      err instanceof EnrichmentAdapterError &&
      err.code === "data_error" &&
      err.message.includes("404")
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Fetch Drive file metadata (owners, lastModifyingUser, modifiedTime).
 */
export async function fetchDriveMeta(
  fetchFn: GWFetchFn,
  docId: string,
  token: string,
): Promise<DriveFile> {
  const url = `https://www.googleapis.com/drive/v3/files/${docId}?fields=modifiedTime,owners,lastModifyingUser,permissions`;
  return apiGetGW<DriveFile>(fetchFn, url, token);
}
