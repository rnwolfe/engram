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

function buildLegend(): void {
  const legend = document.getElementById("legend-items");
  if (!legend) return;

  for (const [type, color] of Object.entries(NODE_COLORS)) {
    if (type === "default") continue;
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-dot" style="background:${color}"></span>
      <span>${type}</span>
    `;
    legend.appendChild(item);
  }
}

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

    // Init filter sidebar and search
    initFilters(cy, data);
    initSearch(cy, openEntityPanel);

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
