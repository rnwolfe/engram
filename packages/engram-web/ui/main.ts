/**
 * main.ts — UI entry point.
 *
 * Fetches /api/graph, initialises cytoscape, wires up toolbar buttons,
 * and connects node/edge tap events to the detail panel.
 */

import cytoscape from "cytoscape";
import { buildStyles, ENTITY_TYPE_COLORS } from "./graph.js";
import { closePanel, openEdgePanel, openEntityPanel } from "./panels.js";

interface GraphNode {
  id: string;
  canonical_name: string;
  entity_type: string;
  status: string;
  updated_at: string;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { entity_count: number; edge_count: number };
}

async function loadGraph(): Promise<GraphResponse> {
  const res = await fetch("/api/graph");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<GraphResponse>;
}

function buildLegend(data: GraphResponse): void {
  const legendEl = document.getElementById("legend-items");
  if (!legendEl) return;

  const types = [...new Set(data.nodes.map((n) => n.entity_type))].sort();
  legendEl.innerHTML = types
    .map((t) => {
      const color =
        ENTITY_TYPE_COLORS[t as keyof typeof ENTITY_TYPE_COLORS] ?? "#8b949e";
      return `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${t}</div>`;
    })
    .join("");
}

function updateStats(stats: {
  entity_count: number;
  edge_count: number;
}): void {
  const el = document.getElementById("stats-display");
  if (el)
    el.textContent = `${stats.entity_count} entities · ${stats.edge_count} edges`;
}

async function main(): Promise<void> {
  let data: GraphResponse;
  try {
    data = await loadGraph();
  } catch (err) {
    const el = document.getElementById("stats-display");
    if (el) {
      el.textContent = `Error loading graph: ${err instanceof Error ? err.message : String(err)}`;
      el.className = "error";
    }
    return;
  }

  updateStats(data.stats);
  buildLegend(data);

  const elements = [
    ...data.nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.canonical_name,
        entity_type: n.entity_type,
        status: n.status,
      },
    })),
    ...data.edges.map((e) => ({
      data: {
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        relation_type: e.relation_type,
        edge_kind: e.edge_kind,
        confidence: e.confidence,
      },
    })),
  ];

  const cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    style: buildStyles(),
    layout: {
      name: "cose",
      animate: false,
      idealEdgeLength: 80,
      nodeOverlap: 20,
      refresh: 20,
      fit: true,
      padding: 30,
      randomize: false,
      componentSpacing: 100,
      nodeRepulsion: 400000,
      edgeElasticity: 100,
      nestingFactor: 5,
      gravity: 80,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1.0,
    } as cytoscape.LayoutOptions,
    minZoom: 0.05,
    maxZoom: 5,
  });

  // Toolbar buttons
  const btnZoomFit = document.getElementById("btn-zoom-fit");
  if (btnZoomFit) btnZoomFit.addEventListener("click", () => cy.fit());

  const btnReset = document.getElementById("btn-reset-layout");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      cy.layout({
        name: "cose",
        animate: false,
      } as cytoscape.LayoutOptions).run();
    });
  }

  // Hover: highlight node + incident edges, dim everything else
  cy.on("mouseover", "node", (evt) => {
    const node = evt.target as cytoscape.NodeSingular;
    cy.elements().addClass("dimmed");
    node.removeClass("dimmed").addClass("highlighted");
    node.connectedEdges().removeClass("dimmed").addClass("highlighted");
    node.connectedEdges().connectedNodes().removeClass("dimmed");
  });

  cy.on("mouseout", "node", () => {
    cy.elements().removeClass("dimmed").removeClass("highlighted");
  });

  // Double-click on background → zoom to fit
  cy.on("dblclick", (evt) => {
    if (evt.target === cy) cy.fit();
  });

  // Tap a node → open entity panel
  cy.on("tap", "node", (evt) => {
    const node = evt.target as cytoscape.NodeSingular;
    openEntityPanel(node.id());
  });

  // Tap an edge → open edge panel
  cy.on("tap", "edge", (evt) => {
    const edge = evt.target as cytoscape.EdgeSingular;
    openEdgePanel(edge.id());
  });

  // Tap background → close panel
  cy.on("tap", (evt) => {
    if (evt.target === cy) closePanel();
  });

  // Escape key → close panel
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  // Panel close button
  const closeBtn = document.getElementById("panel-close");
  if (closeBtn) closeBtn.addEventListener("click", () => closePanel());
}

main();
