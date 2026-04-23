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
import { initDecayOverlay } from "./overlay.js";
import {
  closePanel,
  openEdgePanel,
  openEntityPanel,
  openProjectionPanel,
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
  const el = document.getElementById("stats-display");
  if (el) {
    el.textContent = `${entityCount} entities · ${edgeCount} edges`;
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
    source_type?: string;
    anchor_id?: string | null;
    kind?: string;
    stale?: boolean;
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
      // Projections use a diamond shape indicator
      const dotClass = t === "projection" ? "legend-dot diamond" : "legend-dot";
      return `<div class="legend-item"><span class="${dotClass}" style="background:${color}"></span>${t}</div>`;
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

    // Tap handlers — route projection nodes to their own panel
    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      const entityType = node.data("entity_type") as string;
      if (entityType === "projection") {
        openProjectionPanel({
          id: node.id() as string,
          canonical_name: node.data("label") as string,
          anchor_id: node.data("anchor_id") as string | null | undefined,
          kind: node.data("kind") as string | undefined,
          stale: node.data("stale") as boolean | undefined,
          updated_at: node.data("updated_at") as string,
        });
      } else {
        openEntityPanel(node.id() as string);
      }
    });
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

    updateStatsBar(data.stats.entity_count, data.stats.edge_count);
    buildLegend(data);

    // Init filters first so defaults are applied before layout
    initFilters(cy, data, () => runCoseLayout(cy));
    runCoseLayout(cy);
    initSearch(cy, openEntityPanel);
    initTimeSlider(cy, (validAt) => applyGraphSnapshot(cy, validAt));
    initDecayOverlay(cy);

    hideLoading();
  } catch (err) {
    hideLoading();
    showError(err instanceof Error ? err.message : String(err));
  }
}

// ── Help modal ────────────────────────────────────────────

function openHelpModal(): void {
  const modal = document.getElementById("help-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeHelpModal(): void {
  const modal = document.getElementById("help-modal");
  if (modal) modal.classList.add("hidden");
}

function isHelpModalOpen(): boolean {
  const modal = document.getElementById("help-modal");
  return modal ? !modal.classList.contains("hidden") : false;
}

// ── Toolbar ───────────────────────────────────────────────

function wireSidebarToggle(): void {
  const sidebar = document.getElementById("filter-sidebar");
  const toggleBtn = document.getElementById("btn-sidebar-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (!sidebar || !toggleBtn) return;

  const isMobile = () => window.innerWidth <= 768;

  function openSidebar(): void {
    sidebar!.classList.add("sidebar-open");
    sidebar!.classList.remove("collapsed");
    backdrop?.classList.remove("hidden");
    toggleBtn!.setAttribute("aria-expanded", "true");
  }

  function closeSidebar(): void {
    if (isMobile()) {
      sidebar!.classList.remove("sidebar-open");
      backdrop?.classList.add("hidden");
    } else {
      sidebar!.classList.add("collapsed");
    }
    toggleBtn!.setAttribute("aria-expanded", "false");
  }

  function isSidebarVisible(): boolean {
    if (isMobile()) return sidebar!.classList.contains("sidebar-open");
    return !sidebar!.classList.contains("collapsed");
  }

  toggleBtn.addEventListener("click", () => {
    if (isSidebarVisible()) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  // Backdrop tap closes sidebar on mobile
  backdrop?.addEventListener("click", () => closeSidebar());

  // On mobile, start with sidebar closed
  if (isMobile()) {
    sidebar.classList.remove("sidebar-open");
    toggleBtn.setAttribute("aria-expanded", "false");
  }
}

function wireToolbar(): void {
  wireSidebarToggle();

  const fitBtn = document.getElementById("btn-fit");
  const resetBtn = document.getElementById("btn-reset-layout");
  const helpBtn = document.getElementById("btn-help");
  const helpClose = document.getElementById("help-close");

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

  if (helpBtn) {
    helpBtn.addEventListener("click", () => openHelpModal());
  }

  if (helpClose) {
    helpClose.addEventListener("click", () => closeHelpModal());
  }

  // Close modal on backdrop click
  const modal = document.getElementById("help-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeHelpModal();
    });
  }
}

// ── Global keyboard shortcuts ─────────────────────────────

function wireKeyboardShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    const isInput = tag === "INPUT" || tag === "TEXTAREA";

    // ? → toggle help modal (always active)
    if (e.key === "?" && !isInput) {
      e.preventDefault();
      if (isHelpModalOpen()) {
        closeHelpModal();
      } else {
        openHelpModal();
      }
      return;
    }

    // Escape → close help modal if open (panel escape handled elsewhere)
    if (e.key === "Escape") {
      if (isHelpModalOpen()) {
        closeHelpModal();
        return;
      }
    }

    // Skip remaining shortcuts when focus is in an input
    if (isInput) return;

    // f → zoom to fit
    if (e.key === "f") {
      e.preventDefault();
      cy?.fit();
      return;
    }

    // r → reset layout
    if (e.key === "r") {
      e.preventDefault();
      if (cy) runCoseLayout(cy);
      return;
    }

    // n → jump to now
    if (e.key === "n") {
      e.preventDefault();
      document.getElementById("btn-now")?.click();
      return;
    }

    // o → toggle decay overlay
    if (e.key === "o") {
      e.preventDefault();
      document.getElementById("btn-decay-overlay")?.click();
      return;
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  wireToolbar();
  wireKeyboardShortcuts();
  init();
});
