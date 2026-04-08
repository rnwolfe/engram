/**
 * main.ts — entry point for the engram graph visualization UI.
 *
 * Fetches /api/graph, initializes cytoscape, and wires up toolbar controls.
 */

import type { Core } from "cytoscape";
import { initFilters } from "./filters.js";
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
import { initSearch } from "./search.js";
import { initTimeSlider } from "./time-slider.js";

// ── State ─────────────────────────────────────────────────

let cy: Core | null = null;

// ── DOM helpers ───────────────────────────────────────────

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

function showLoading(msg: string): void {
  const el = $("loading");
  el.classList.remove("hidden");
  const text = el.querySelector("p");
  if (text) text.textContent = msg;
}

function hideLoading(): void {
  $("loading").classList.add("hidden");
}

function showError(msg: string): void {
  const banner = $("error-banner");
  banner.textContent = msg;
  banner.classList.add("visible");
}

// ── Stats bar ─────────────────────────────────────────────

function updateStatsBar(entityCount: number, edgeCount: number): void {
  const entitiesEl = document.getElementById("stat-entities");
  const edgesEl = document.getElementById("stat-edges");
  if (entitiesEl) {
    entitiesEl.innerHTML = `<span class="stat-value">${entityCount}</span> entities`;
  }
  if (edgesEl) {
    edgesEl.innerHTML = `<span class="stat-value">${edgeCount}</span> edges`;
  }
}

// ── Legend ─────────────────────────────────────────────────

// ── Data fetching ─────────────────────────────────────────

interface GraphResponse {
  nodes: Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
    status: string;
    updated_at: string;
  }>;
  edges: Array<{
    id: string;
    source_id: string;
    target_id: string;
    relation_type: string;
    edge_kind: string;
    confidence: number;
    valid_from: string | null;
    valid_until: string | null;
  }>;
  stats: {
    entity_count: number;
    edge_count: number;
  };
}

async function fetchGraph(): Promise<GraphResponse> {
  const res = await fetch("/api/graph");
  if (!res.ok) {
    throw new Error(`Failed to load graph: HTTP ${res.status}`);
  }
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

  cy.nodes()
    .filter((n) => !newNodeIds.has(n.id()))
    .remove();

  const newNodes = data.nodes.filter((n) => !existingNodeIds.has(n.id));
  if (newNodes.length > 0) cy.add(buildElements(newNodes, []));

  const newEdgeIds = new Set(data.edges.map((e) => e.id));
  const toRemoveEdges = cy.edges().filter((e) => !newEdgeIds.has(e.id()));
  if (toRemoveEdges.length > 0) {
    toRemoveEdges.animate(
      { style: { opacity: 0 } },
      { duration: 150, complete: () => toRemoveEdges.remove() },
    );
  }

  const existingEdgeIds = new Set(cy.edges().map((e) => e.id()));
  const toAddEdges = data.edges.filter((e) => !existingEdgeIds.has(e.id));
  if (toAddEdges.length > 0) {
    const added = cy.add(buildElements([], toAddEdges));
    added.style({ opacity: 0 });
    added.animate({ style: { opacity: 1 } }, { duration: 200 });
  }
}

function buildLegend(data?: GraphResponse): void {
  const legendEl = document.getElementById("legend-items");
  if (!legendEl) return;

  const types = data
    ? [...new Set(data.nodes.map((n) => n.entity_type))].sort()
    : Object.keys(NODE_COLORS).filter((k) => k !== "default");
  legendEl.innerHTML = types
    .map((t) => {
      const color = NODE_COLORS[t as keyof typeof NODE_COLORS] ?? "#8b949e";
      return `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${t}</div>`;
    })
    .join("");
}

// ── Init ──────────────────────────────────────────────────

async function init(): Promise<void> {
  showLoading("Loading graph data…");

  try {
    const data = await fetchGraph();

    showLoading("Rendering graph…");

    const container = document.getElementById("cy");
    if (!container) throw new Error("Canvas container #cy not found");

    cy = initCytoscape(container);

    const elements = buildElements(data.nodes, data.edges);
    cy.add(elements);

    setCytoscapeInstance(cy);
    attachHoverHandlers(cy);

    // Tap handlers
    cy.on("tap", "node", (evt) => openEntityPanel(evt.target.id() as string));
    cy.on("tap", "edge", (evt) => openEdgePanel(evt.target.id() as string));
    cy.on("tap", (evt) => {
      if (evt.target === cy) closePanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });
    const closeBtn = document.getElementById("panel-close");
    if (closeBtn) closeBtn.addEventListener("click", () => closePanel());

    // Double-tap on empty canvas → fit
    cy.on("dbltap", (evt) => {
      if (evt.target === cy) cy?.fit();
    });

    runCoseLayout(cy);
    updateStatsBar(data.stats.entity_count, data.stats.edge_count);
    buildLegend();

    // Init filter sidebar, search, and time slider
    initFilters(cy, data);
    initSearch(cy, openEntityPanel);
    initTimeSlider(cy, (validAt) => applyGraphSnapshot(cy, validAt));

    hideLoading();
  } catch (err) {
    hideLoading();
    showError(err instanceof Error ? err.message : String(err));
  }
}

// ── Toolbar ───────────────────────────────────────────────

function wireToolbar(): void {
  const fitBtn = document.getElementById("btn-fit");
  const resetBtn = document.getElementById("btn-reset-layout");

  if (fitBtn) {
    fitBtn.addEventListener("click", () => {
      cy?.fit();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (cy) {
        runCoseLayout(cy);
      }
    });
  }
}

// ── Bootstrap ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  wireToolbar();
  init();
});
