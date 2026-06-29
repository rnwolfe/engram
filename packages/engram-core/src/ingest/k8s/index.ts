/**
 * Kubernetes-operator ingestion (tree-sitter-free).
 *
 * Walks Go files and extracts cross-file operator semantics — the kubebuilder
 * RBAC permission graph and the controller-runtime watch/owns graph — that a
 * single-file read does not reveal. Preserved from the removed tree-sitter
 * source ingestion per ADR-010, reimplemented over raw text (see scan.ts).
 *
 * Entities: reconciler structs (`module`), `k8s_resource_kind`, `rbac_permission`.
 * Edges: `rbac_grants`, `controller_watches`, `controller_owns` (all `observed`).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { resolveEntity } from "../../graph/aliases.js";
import { addEdge } from "../../graph/edges.js";
import { addEntity, type EvidenceInput } from "../../graph/entities.js";
import { addEpisode } from "../../graph/episodes.js";
import type { EngramGraph } from "../../graph/index.js";
import { ENTITY_TYPES, RELATION_TYPES } from "../../vocab/index.js";
import type { IngestResult } from "../git.js";
import { scanGoForK8s } from "./scan.js";

const EXTRACTOR = "k8s@0.1.0";

export interface K8sIngestOpts {
  actor?: string;
  owner_id?: string;
}

function walkGoFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkGoFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".go")) out.push(full);
  }
  return out;
}

/**
 * Ingest Kubernetes-operator semantics from Go files under `rootPath`.
 */
export function ingestK8s(
  graph: EngramGraph,
  rootPath: string,
  opts: K8sIngestOpts = {},
): IngestResult {
  const counts: IngestResult = {
    episodesCreated: 0,
    episodesSkipped: 0,
    entitiesCreated: 0,
    entitiesResolved: 0,
    edgesCreated: 0,
    edgesSuperseded: 0,
    runId: "",
  };

  const absRoot = path.resolve(rootPath);
  const stat = fs.statSync(absRoot);
  const files = stat.isDirectory() ? walkGoFiles(absRoot) : [absRoot];

  const ensureEntity = (
    canonical: string,
    entityType: string,
    ev: EvidenceInput[],
  ): string => {
    const existing = resolveEntity(graph, canonical, entityType);
    if (existing) {
      counts.entitiesResolved++;
      return existing.id;
    }
    const created = addEntity(
      graph,
      { canonical_name: canonical, entity_type: entityType },
      ev,
    );
    counts.entitiesCreated++;
    return created.id;
  };

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const result = scanGoForK8s(content);
    if (
      result.permissions.length === 0 &&
      result.grants.length === 0 &&
      result.watches.length === 0
    ) {
      continue;
    }

    const episode = addEpisode(graph, {
      source_type: "source",
      source_ref: `k8s:${file}`,
      content,
      actor: opts.actor,
      timestamp: new Date(fs.statSync(file).mtime).toISOString(),
      owner_id: opts.owner_id,
      metadata: { file_path: file, extractor: EXTRACTOR },
    });
    counts.episodesCreated++;
    const ev: EvidenceInput[] = [
      { episode_id: episode.id, extractor: EXTRACTOR, confidence: 1 },
    ];

    for (const perm of result.permissions) {
      ensureEntity(perm.canonicalName, ENTITY_TYPES.RBAC_PERMISSION, ev);
    }
    for (const grant of result.grants) {
      const src = ensureEntity(grant.struct, ENTITY_TYPES.MODULE, ev);
      const tgt = ensureEntity(
        grant.permission,
        ENTITY_TYPES.RBAC_PERMISSION,
        ev,
      );
      addEdge(
        graph,
        {
          source_id: src,
          target_id: tgt,
          relation_type: RELATION_TYPES.RBAC_GRANTS,
          edge_kind: "observed",
          fact: grant.fact,
        },
        ev,
      );
      counts.edgesCreated++;
    }
    for (const watch of result.watches) {
      const src = ensureEntity(watch.controller, ENTITY_TYPES.MODULE, ev);
      const tgt = ensureEntity(
        watch.resourceKind,
        ENTITY_TYPES.K8S_RESOURCE_KIND,
        ev,
      );
      addEdge(
        graph,
        {
          source_id: src,
          target_id: tgt,
          relation_type:
            watch.selector === "Owns"
              ? RELATION_TYPES.CONTROLLER_OWNS
              : RELATION_TYPES.CONTROLLER_WATCHES,
          edge_kind: "observed",
          fact: watch.fact,
        },
        ev,
      );
      counts.edgesCreated++;
    }
  }

  return counts;
}

export { scanGoForK8s } from "./scan.js";
