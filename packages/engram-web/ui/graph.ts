/**
 * graph.ts — Cytoscape style rules.
 *
 * Nodes: colored by entity_type.
 * Edges: colored by relation_type, line-style by edge_kind (solid/dashed/dotted).
 */

import type cytoscape from "cytoscape";

export const ENTITY_TYPE_COLORS: Record<string, string> = {
  file: "#58a6ff",
  module: "#3fb950",
  person: "#d2a8ff",
  decision: "#ffa657",
  service: "#79c0ff",
  concept: "#f0883e",
};

const DEFAULT_NODE_COLOR = "#8b949e";
const DEFAULT_EDGE_COLOR = "#30363d";

function nodeColor(entityType: string): string {
  return ENTITY_TYPE_COLORS[entityType] ?? DEFAULT_NODE_COLOR;
}

export function buildStyles(): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: "node",
      style: {
        "background-color": (ele: cytoscape.NodeSingular) =>
          nodeColor(ele.data("entity_type")),
        label: "data(label)",
        color: "#c9d1d9",
        "font-size": 10,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 4,
        "text-outline-color": "#0d1117",
        "text-outline-width": 2,
        width: (ele: cytoscape.NodeSingular) =>
          Math.max(16, Math.min(40, 16 + ele.degree(false) * 2)),
        height: (ele: cytoscape.NodeSingular) =>
          Math.max(16, Math.min(40, 16 + ele.degree(false) * 2)),
        "border-width": 1,
        "border-color": "#30363d",
      },
    },
    {
      selector: "edge",
      style: {
        "line-color": DEFAULT_EDGE_COLOR,
        "target-arrow-color": DEFAULT_EDGE_COLOR,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        width: 1.5,
        opacity: 0.7,
        "line-style": (ele: cytoscape.EdgeSingular) => {
          const kind = ele.data("edge_kind");
          if (kind === "inferred") return "dashed";
          if (kind === "asserted") return "dotted";
          return "solid";
        },
      },
    },
    {
      selector: "node.highlighted",
      style: {
        "border-width": 3,
        "border-color": "#ffffff",
        opacity: 1,
      },
    },
    {
      selector: "edge.highlighted",
      style: {
        "line-color": "#ffffff",
        "target-arrow-color": "#ffffff",
        opacity: 1,
        width: 2.5,
      },
    },
    {
      selector: ".dimmed",
      style: {
        opacity: 0.15,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#58a6ff",
      },
    },
  ];
}
