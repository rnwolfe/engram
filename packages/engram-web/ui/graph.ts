/**
 * graph.ts — cytoscape.js setup, layout config, and style rules.
 */

import type { Core, ElementDefinition, NodeSingular } from "cytoscape";
import cytoscape from "cytoscape";

// ── Color maps ────────────────────────────────────────────

export const NODE_COLORS: Record<string, string> = {
  file: "#4f86c6",
  person: "#e8845c",
  module: "#6ab187",
  decision: "#c06cb4",
  projection: "#f0b429",
  default: "#999999",
};

export const EDGE_COLORS: Record<string, string> = {
  likely_owner_of: "#e8845c",
  co_changes_with: "#4f86c6",
  authored_by: "#6ab187",
  reviewed_by: "#c06cb4",
  depends_on: "#e8c45c",
  default: "#aaaaaa",
};

// edge_kind → line-style
// observed → solid, inferred → dashed, asserted → dotted
const EDGE_KIND_STYLES: Record<string, string> = {
  observed: "solid",
  inferred: "dashed",
  asserted: "dotted",
};

function nodeColor(entityType: string): string {
  return NODE_COLORS[entityType] ?? NODE_COLORS.default ?? "#999999";
}

function edgeColor(relationType: string): string {
  return EDGE_COLORS[relationType] ?? EDGE_COLORS.default ?? "#aaaaaa";
}

function edgeLineStyle(edgeKind: string): string {
  return EDGE_KIND_STYLES[edgeKind] ?? "solid";
}

// ── Node sizing ───────────────────────────────────────────

function nodeSize(degree: number): number {
  return 30 + Math.sqrt(degree) * 5;
}

// ── Cytoscape init ────────────────────────────────────────

export function initCytoscape(container: HTMLElement): Core {
  const cy = cytoscape({
    container,
    elements: [],
    style: [
      {
        selector: "node",
        style: {
          "background-color": (ele: NodeSingular) =>
            nodeColor(ele.data("entity_type") as string),
          label: "data(label)",
          color: "#c9d1d9",
          "font-size": "10px",
          "min-zoomed-font-size": 14,
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 4,
          "text-max-width": "120px",
          "text-wrap": "ellipsis",
          width: (ele: NodeSingular) =>
            nodeSize((ele.degree(false) as number) ?? 0),
          height: (ele: NodeSingular) =>
            nodeSize((ele.degree(false) as number) ?? 0),
          "border-width": 0,
          "overlay-padding": 6,
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 2,
          "border-color": "#58a6ff",
        },
      },
      // Projection nodes — diamond shape with amber color
      {
        selector: 'node[entity_type = "projection"]',
        style: {
          shape: "diamond",
          "background-color": "#f0b429",
          "border-width": 1,
          "border-color": "#6e4a00",
          color: "#f0b429",
        },
      },
      // Stale projection nodes get a warning indicator
      {
        selector: 'node[entity_type = "projection"][?stale]',
        style: {
          "background-color": "#e67e22",
          "border-width": 2,
          "border-color": "#f0b429",
          "border-style": "dashed",
        },
      },
      {
        selector: "edge",
        style: {
          width: 1.5,
          "line-color": (ele) => edgeColor(ele.data("relation_type") as string),
          "target-arrow-color": (ele) =>
            edgeColor(ele.data("relation_type") as string),
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "line-style": (ele) =>
            edgeLineStyle(ele.data("edge_kind") as string) as
              | "solid"
              | "dashed"
              | "dotted",
          opacity: 0.7,
          "overlay-padding": 4,
        },
      },
      {
        selector: "edge:selected",
        style: {
          width: 2.5,
          opacity: 1,
        },
      },
      // Hover: highlight connected elements, dim everything else
      {
        selector: ".dimmed",
        style: {
          opacity: 0.1,
        },
      },
      {
        selector: ".highlighted",
        style: {
          opacity: 1,
        },
      },
      // Search pulse highlight
      {
        selector: ".pulse",
        style: {
          "border-width": 4,
          "border-color": "#58a6ff",
          "border-opacity": 1,
        },
      },
      // Decay overlay risk classes
      {
        selector: ".risk-critical",
        style: {
          "background-color": "#c0392b",
          color: "#ffffff",
        },
      },
      {
        selector: ".risk-elevated",
        style: {
          "background-color": "#e67e22",
          color: "#ffffff",
        },
      },
      {
        selector: ".risk-stale",
        style: {
          "background-color": "#f1c40f",
          color: "#333333",
        },
      },
      {
        selector: ".risk-dormant",
        style: {
          "background-color": "#7f8c8d",
          "border-style": "dashed",
          "border-width": 2,
          "border-color": "#bdc3c7",
        },
      },
      {
        selector: ".risk-orphaned",
        style: {
          "background-color": "#8e44ad",
          color: "#ffffff",
        },
      },
    ],
    layout: { name: "preset" },
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false,
    minZoom: 0.05,
    maxZoom: 5,
  });

  return cy;
}

// ── Layout ────────────────────────────────────────────────

export const COSE_LAYOUT_OPTIONS = {
  name: "cose",
  animate: true,
  animationDuration: 500,
  randomize: true,
  nodeRepulsion: () => 2048,
  idealEdgeLength: () => 80,
  edgeElasticity: () => 32,
  nestingFactor: 1.2,
  gravity: 1,
  numIter: 1000,
  initialTemp: 200,
  coolingFactor: 0.95,
  minTemp: 1,
  fit: true,
  padding: 40,
} as const;

export function runCoseLayout(cy: Core): void {
  cy.elements().not(":hidden").layout(COSE_LAYOUT_OPTIONS).run();
}

// ── Elements builder ──────────────────────────────────────

export interface GraphNode {
  id: string;
  canonical_name: string;
  entity_type: string;
  status: string;
  updated_at: string;
  source_type?: string;
  anchor_id?: string | null;
  kind?: string;
  stale?: boolean;
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
}

function shortLabel(canonicalName: string): string {
  const parts = canonicalName.split("/");
  if (parts.length <= 2) return canonicalName;
  return parts.slice(-2).join("/");
}

export function buildElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
): ElementDefinition[] {
  // Index node IDs for fast lookup — skip edges whose endpoints are missing
  const nodeIds = new Set(nodes.map((n) => n.id));

  const nodeEls: ElementDefinition[] = nodes.map((n) => ({
    group: "nodes" as const,
    data: {
      id: n.id,
      label: shortLabel(n.canonical_name),
      entity_type: n.entity_type,
      status: n.status,
      updated_at: n.updated_at,
      source_type: n.source_type,
      anchor_id: n.anchor_id,
      kind: n.kind,
      stale: n.stale,
    },
  }));

  const edgeEls: ElementDefinition[] = edges
    .filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id))
    .map((e) => ({
      group: "edges" as const,
      data: {
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        relation_type: e.relation_type,
        edge_kind: e.edge_kind,
        confidence: e.confidence,
        valid_from: e.valid_from,
        valid_until: e.valid_until,
      },
    }));

  return [...nodeEls, ...edgeEls];
}

// ── Hover interaction ─────────────────────────────────────

export function attachHoverHandlers(cy: Core): void {
  cy.on("mouseover", "node", (evt) => {
    const node = evt.target;
    const connected = node.closedNeighborhood();
    cy.elements().not(connected).addClass("dimmed");
    connected.addClass("highlighted");
  });

  cy.on("mouseout", "node", () => {
    cy.elements().removeClass("dimmed highlighted");
  });
}
