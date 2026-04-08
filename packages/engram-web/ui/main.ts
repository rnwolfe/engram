/**
 * main.ts — UI entry point.
 *
 * Fetches /api/graph, initialises cytoscape, wires up toolbar buttons,
 * and connects node/edge tap events to the detail panel.
 */

import {
  attachHoverHandlers,
  buildElements,
  initCytoscape,
  NODE_COLORS,
  runCoseLayout,
} from "./graph.js";
import {
  closePanel,
  openEdgePanel,
  openEntityPanel,
  setCytoscapeInstance,
} from "./panels.js";
import { initTimeSlider } from "./time-slider.js";

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

async function applyGraphSnapshot(
  cy: cytoscape.Core,
  validAt: string | null,
): Promise<void> {
  const url = validAt
    ? `/api/graph?valid_at=${encodeURIComponent(validAt)}`
    : "/api/graph";
  const res = await fetch(url);
  if (!res.ok) return;
  const data = (await res.json()) as GraphResponse;

  const existingNodeIds = new Set(cy.nodes().map((n) => n.id()));
  const newNodeIds = new Set(data.nodes.map((n) => n.id));

  // Remove nodes (and their incident edges) not in new snapshot
  cy.nodes()
    .filter((n) => !newNodeIds.has(n.id()))
    .remove();

  // Add nodes that weren't present before
  const newNodes = data.nodes.filter((n) => !existingNodeIds.has(n.id));
  if (newNodes.length > 0) cy.add(buildElements(newNodes, []));

  // Remove edges not in new snapshot — fade out first, then remove
  const newEdgeIds = new Set(data.edges.map((e) => e.id));
  const toRemoveEdges = cy.edges().filter((e) => !newEdgeIds.has(e.id()));
  if (toRemoveEdges.length > 0) {
    toRemoveEdges.animate(
      { style: { opacity: 0 } },
      { duration: 150, complete: () => toRemoveEdges.remove() },
    );
  }

  // Add edges that weren't present before — start invisible and fade in
  const existingEdgeIds = new Set(cy.edges().map((e) => e.id()));
  const toAddEdges = data.edges.filter((e) => !existingEdgeIds.has(e.id));
  if (toAddEdges.length > 0) {
    const added = cy.add(buildElements([], toAddEdges));
    added.style({ opacity: 0 });
    added.animate({ style: { opacity: 1 } }, { duration: 200 });
  }

  // Do NOT re-run layout — keep node positions stable
}

function buildLegend(data: GraphResponse): void {
  const legendEl = document.getElementById("legend-items");
  if (!legendEl) return;

  const types = [...new Set(data.nodes.map((n) => n.entity_type))].sort();
  legendEl.innerHTML = types
    .map((t) => {
      const color = NODE_COLORS[t as keyof typeof NODE_COLORS] ?? "#8b949e";
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

  const container = document.getElementById("cy");
  if (!container) return;
  const cy = initCytoscape(container);
  cy.add(buildElements(data.nodes, data.edges));
  runCoseLayout(cy);

  // Register cytoscape instance for panel navigation
  setCytoscapeInstance(cy);

  // Temporal time slider
  initTimeSlider(cy, (validAt) => applyGraphSnapshot(cy, validAt));

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
  attachHoverHandlers(cy);

  // Double-click on background → zoom to fit
  cy.on("dblclick", (evt) => {
    if (evt.target === cy) cy.fit();
  });

  // Tap a node → open entity panel
  cy.on("tap", "node", (evt) => {
    openEntityPanel(evt.target.id() as string);
  });

  // Tap an edge → open edge panel
  cy.on("tap", "edge", (evt) => {
    openEdgePanel(evt.target.id() as string);
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
