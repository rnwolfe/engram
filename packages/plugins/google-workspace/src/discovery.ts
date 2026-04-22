/**
 * discovery.ts — Drive discovery helpers for folder and query scopes.
 *
 * Ported from packages/engram-core/src/ingest/adapters/google-workspace-discovery.ts
 * into the in-repo plugin package.
 *
 * Provides:
 * - `enumerateFolderDocs()` — list all Google Docs in a Drive folder (flat or recursive BFS)
 * - `enumerateQueryDocs()` — execute a Drive search query, AND-injecting mimeType constraint
 *
 * These functions are called from the GoogleWorkspaceAdapter when scope is
 * `folder:<id>` or `query:<q>`. They return arrays of doc-id / modifiedTime pairs
 * that the adapter then fans out to the existing per-doc ingest logic.
 *
 * Cursor semantics:
 *   Callers pass a `since` ISO8601 cursor. Discovery functions append
 *   `modifiedTime > '<cursor>'` to the Drive query so only changed docs are returned.
 *   After a run, the adapter stores `max(modifiedTime)` seen across all docs as the
 *   new cursor.
 */

import { EnrichmentAdapterError } from "engram-core";
import type { GWFetchFn } from "./helpers.js";
import { apiGetGW } from "./helpers.js";

// ---------------------------------------------------------------------------
// Drive API types (only fields we use)
// ---------------------------------------------------------------------------

export interface DriveFileItem {
  id: string;
  modifiedTime?: string;
}

interface DriveFilesListResponse {
  files?: DriveFileItem[];
  nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// Parsed folder scope
// ---------------------------------------------------------------------------

export interface ParsedFolderScope {
  folderId: string;
  recursive: boolean;
}

/**
 * Parse a `folder:<id>` or `folder:<id>?recursive=true` scope string.
 * Throws on unrecognised query params.
 */
export function parseFolderScope(scope: string): ParsedFolderScope {
  // Strip the "folder:" prefix
  const rest = scope.slice("folder:".length);

  const qIdx = rest.indexOf("?");
  if (qIdx === -1) {
    const folderId = rest.trim();
    if (!folderId) {
      throw new Error("folder scope must include a folder ID: folder:<id>");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(folderId)) {
      throw new Error(
        `invalid folder ID: expected alphanumeric/underscore/dash characters only`,
      );
    }
    return { folderId, recursive: false };
  }

  const folderId = rest.slice(0, qIdx).trim();
  if (!folderId) {
    throw new Error("folder scope must include a folder ID: folder:<id>");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(folderId)) {
    throw new Error(
      `invalid folder ID: expected alphanumeric/underscore/dash characters only`,
    );
  }

  const queryString = rest.slice(qIdx + 1);
  const params = new URLSearchParams(queryString);

  // Validate: only 'recursive' is a recognised key
  for (const key of params.keys()) {
    if (key !== "recursive") {
      throw new Error(
        `Unknown query parameter in folder scope: '${key}'. Valid keys: recursive`,
      );
    }
  }

  const recursiveVal = params.get("recursive");
  let recursive = false;
  if (recursiveVal !== null) {
    if (recursiveVal !== "true" && recursiveVal !== "false") {
      throw new Error(
        `Invalid value for recursive in folder scope: '${recursiveVal}'. Use true or false`,
      );
    }
    recursive = recursiveVal === "true";
  }

  return { folderId, recursive };
}

// ---------------------------------------------------------------------------
// Drive list helper (one page)
// ---------------------------------------------------------------------------

/**
 * Fetch one page of Drive files matching `query`.
 * Handles 400 (malformed query) → data_error, 404 (folder not found) → data_error.
 */
async function driveListPage(
  fetchFn: GWFetchFn,
  token: string,
  query: string,
  pageToken: string | undefined,
  fields: string,
): Promise<DriveFilesListResponse> {
  const params = new URLSearchParams({
    q: query,
    fields,
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

  try {
    return await apiGetGW<DriveFilesListResponse>(fetchFn, url, token);
  } catch (err) {
    if (err instanceof EnrichmentAdapterError) {
      // apiGetGW maps unexpected statuses to data_error with the status code in the message
      if (err.code === "data_error" && err.message.includes("404")) {
        throw new EnrichmentAdapterError(
          "data_error",
          `folder not found: check the folder ID and Drive permissions`,
        );
      }
      if (err.code === "data_error" && err.message.includes("400")) {
        throw new EnrichmentAdapterError(
          "data_error",
          `Drive query error (400): ${err.message}`,
        );
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Enumerate docs in a single folder (one level only)
// ---------------------------------------------------------------------------

async function enumerateDocsInFolder(
  fetchFn: GWFetchFn,
  token: string,
  folderId: string,
  since: string | null,
): Promise<DriveFileItem[]> {
  let q =
    `mimeType='application/vnd.google-apps.document'` +
    ` and '${folderId}' in parents` +
    ` and trashed=false`;

  if (since) {
    q += ` and modifiedTime > '${since}'`;
  }

  const docs: DriveFileItem[] = [];
  let pageToken: string | undefined;

  do {
    const resp = await driveListPage(
      fetchFn,
      token,
      q,
      pageToken,
      "files(id,modifiedTime),nextPageToken",
    );
    for (const f of resp.files ?? []) {
      if (f.id) docs.push(f);
    }
    pageToken = resp.nextPageToken;
  } while (pageToken);

  return docs;
}

// ---------------------------------------------------------------------------
// Enumerate subfolders inside a folder (BFS, cycle-guarded)
// ---------------------------------------------------------------------------

async function enumerateSubfolders(
  fetchFn: GWFetchFn,
  token: string,
  folderId: string,
): Promise<string[]> {
  const q =
    `mimeType='application/vnd.google-apps.folder'` +
    ` and '${folderId}' in parents` +
    ` and trashed=false`;

  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const resp = await driveListPage(
      fetchFn,
      token,
      q,
      pageToken,
      "files(id),nextPageToken",
    );
    for (const f of resp.files ?? []) {
      if (f.id) ids.push(f.id);
    }
    pageToken = resp.nextPageToken;
  } while (pageToken);

  return ids;
}

// ---------------------------------------------------------------------------
// Public: enumerateFolderDocs
// ---------------------------------------------------------------------------

/**
 * Enumerate all Google Docs inside `folderId`, optionally recursing into
 * subfolders (BFS with cycle guard).
 *
 * @param fetchFn  - Injected fetch implementation (real or test stub).
 * @param token    - Bearer token for Drive API.
 * @param folderId - Drive folder ID to enumerate.
 * @param recursive - Whether to recurse into subfolders.
 * @param since    - ISO8601 cursor. If provided, only docs modified after
 *                   this timestamp are returned.
 * @returns Array of `{ id, modifiedTime }` tuples for matched docs.
 */
export async function enumerateFolderDocs(
  fetchFn: GWFetchFn,
  token: string,
  folderId: string,
  recursive: boolean,
  since: string | null,
): Promise<DriveFileItem[]> {
  const allDocs: DriveFileItem[] = [];
  const visitedFolders = new Set<string>();

  // BFS queue — starts with the root folder
  const queue: string[] = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift() as string;

    if (visitedFolders.has(currentId)) {
      // Cycle guard: skip already-visited folders (handles Drive shortcuts)
      continue;
    }
    visitedFolders.add(currentId);

    const docs = await enumerateDocsInFolder(fetchFn, token, currentId, since);
    allDocs.push(...docs);

    if (recursive) {
      const subfolders = await enumerateSubfolders(fetchFn, token, currentId);
      for (const subfolderId of subfolders) {
        if (!visitedFolders.has(subfolderId)) {
          queue.push(subfolderId);
        }
      }
    }
  }

  return allDocs;
}

// ---------------------------------------------------------------------------
// Public: enumerateQueryDocs
// ---------------------------------------------------------------------------

/**
 * Execute a Drive search query, always AND-injecting `mimeType` and `trashed`
 * constraints so users cannot accidentally retrieve non-Doc files.
 *
 * @param fetchFn   - Injected fetch implementation.
 * @param token     - Bearer token for Drive API.
 * @param userQuery - User-supplied Drive query fragment (e.g. `name contains 'spec'`).
 * @param since     - ISO8601 cursor. If provided, also injects `modifiedTime > '<since>'`.
 * @returns Array of `{ id, modifiedTime }` tuples for matched docs.
 */
export async function enumerateQueryDocs(
  fetchFn: GWFetchFn,
  token: string,
  userQuery: string,
  since: string | null,
): Promise<DriveFileItem[]> {
  if (!userQuery.trim()) {
    throw new EnrichmentAdapterError(
      "data_error",
      "query scope must include a non-empty Drive query: query:<q>",
    );
  }

  // AND-inject mimeType + trashed constraints, then wrap user query in parens
  let q =
    `mimeType='application/vnd.google-apps.document'` +
    ` and trashed=false` +
    ` and (${userQuery})`;

  if (since) {
    q += ` and modifiedTime > '${since}'`;
  }

  const docs: DriveFileItem[] = [];
  let pageToken: string | undefined;

  do {
    const resp = await driveListPage(
      fetchFn,
      token,
      q,
      pageToken,
      "files(id,modifiedTime),nextPageToken",
    );
    for (const f of resp.files ?? []) {
      if (f.id) docs.push(f);
    }
    pageToken = resp.nextPageToken;
  } while (pageToken);

  return docs;
}

// ---------------------------------------------------------------------------
// Cursor: compute max modifiedTime from a set of discovered docs
// ---------------------------------------------------------------------------

/**
 * Given a list of enumerated Drive file items, return the maximum
 * `modifiedTime` seen as an ISO8601 string — to be stored as the run cursor.
 * Returns `null` if the list is empty or no item has a `modifiedTime`.
 */
export function computeDiscoveryCursor(items: DriveFileItem[]): string | null {
  let maxSeen: string | null = null;
  for (const item of items) {
    if (item.modifiedTime) {
      if (
        !maxSeen ||
        new Date(item.modifiedTime).getTime() > new Date(maxSeen).getTime()
      ) {
        maxSeen = item.modifiedTime;
      }
    }
  }
  return maxSeen;
}
