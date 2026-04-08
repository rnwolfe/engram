/**
 * overlay.ts — Decay overlay for the graph visualization.
 *
 * Adds a "Decay overlay" toggle button to the toolbar. When active it fetches
 * /api/decay, applies risk-* CSS classes to matching Cytoscape nodes, and
 * shows a summary banner. Clicking a count in the banner filters the graph
 * to only nodes of that risk type.
 */

import type { Core } from "cytoscape";

// ── Types ─────────────────────────────────────────────────

type DecayStatus = "concentrated-risk" | "dormant" | "stale" | "orphaned";

interface DecayEntry {
  status: DecayStatus;
  score?: number;
  last_activity_days?: number;
}

interface DecayResponse {
  entries: Record<string, DecayEntry>;
  summary: {
    "concentrated-risk": number;
    dormant: number;
    stale: number;
    orphaned: number;
  };
}

// ── Constants ─────────────────────────────────────────────

const STATUS_TO_CLASS: Record<DecayStatus, string> = {
  "concentrated-risk": "risk-critical",
  dormant: "risk-dormant",
  stale: "risk-stale",
  orphaned: "risk-orphaned",
};

const ALL_RISK_CLASSES = Object.values(STATUS_TO_CLASS);

const STATUS_LABELS: Record<DecayStatus, string> = {
  "concentrated-risk": "concentrated-risk",
  dormant: "dormant",
  stale: "stale",
  orphaned: "orphaned",
};

// ── Overlay logic ─────────────────────────────────────────

let overlayActive = false;
let activeFilter: DecayStatus | null = null;

function clearRiskClasses(cy: Core): void {
  cy.nodes().removeClass(ALL_RISK_CLASSES.join(" "));
}

function applyDecayData(cy: Core, data: DecayResponse): void {
  clearRiskClasses(cy);

  for (const [entityId, entry] of Object.entries(data.entries)) {
    const node = cy.getElementById(entityId);
    if (node.length === 0) continue;
    const cls = STATUS_TO_CLASS[entry.status];
    if (cls) node.addClass(cls);
  }
}

function resetFilter(cy: Core): void {
  cy.elements().show();
  activeFilter = null;
}

function applyFilter(cy: Core, status: DecayStatus): void {
  const cls = STATUS_TO_CLASS[status];
  if (activeFilter === status) {
    // Toggle off — show all
    resetFilter(cy);
    updateSummaryActiveState(null);
    return;
  }
  cy.elements().hide();
  cy.nodes(`.${cls}`).show();
  // Show edges between visible nodes
  cy.edges().each((edge) => {
    if (edge.source().visible() && edge.target().visible()) {
      edge.show();
    }
  });
  activeFilter = status;
  updateSummaryActiveState(status);
}

// ── Summary banner ────────────────────────────────────────

function updateSummaryActiveState(active: DecayStatus | null): void {
  const banner = document.getElementById("decay-summary");
  if (!banner) return;

  banner.querySelectorAll("[data-status]").forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.classList.toggle("active", htmlEl.dataset.status === active);
  });
}

function renderSummary(cy: Core, summary: DecayResponse["summary"]): void {
  const banner = document.getElementById("decay-summary");
  if (!banner) return;

  const parts: { label: string; count: number; status: DecayStatus }[] = [
    {
      label: "concentrated-risk",
      count: summary["concentrated-risk"],
      status: "concentrated-risk",
    },
    { label: "dormant", count: summary.dormant, status: "dormant" },
    { label: "stale", count: summary.stale, status: "stale" },
    { label: "orphaned", count: summary.orphaned, status: "orphaned" },
  ].filter((p) => p.count > 0);

  if (parts.length === 0) {
    banner.textContent = "No decay detected.";
    banner.classList.remove("hidden");
    return;
  }

  banner.innerHTML = parts
    .map(
      (p) =>
        `<span class="decay-count ${STATUS_TO_CLASS[p.status]}" data-status="${p.status}" title="Filter to ${p.label} nodes">${p.count} ${STATUS_LABELS[p.status]}</span>`,
    )
    .join(", ");

  banner.classList.remove("hidden");

  // Wire click handlers
  banner.querySelectorAll("[data-status]").forEach((el) => {
    el.addEventListener("click", () => {
      const status = (el as HTMLElement).dataset.status as DecayStatus;
      applyFilter(cy, status);
    });
  });
}

function hideSummary(): void {
  const banner = document.getElementById("decay-summary");
  if (!banner) return;
  banner.classList.add("hidden");
  banner.innerHTML = "";
}

// ── Legend ────────────────────────────────────────────────

function showDecayLegend(): void {
  const legendItems = document.getElementById("legend-items");
  if (!legendItems) return;

  // Remove existing decay legend items to avoid duplication
  legendItems.querySelectorAll(".decay-legend-item").forEach((el) => {
    el.remove();
  });

  const items: { label: string; color: string }[] = [
    { label: "concentrated-risk", color: "#c0392b" },
    { label: "dormant", color: "#7f8c8d" },
    { label: "stale", color: "#f1c40f" },
    { label: "orphaned", color: "#8e44ad" },
  ];

  for (const { label, color } of items) {
    const div = document.createElement("div");
    div.className = "legend-item decay-legend-item";
    div.innerHTML = `<span class="legend-dot" style="background:${color}"></span><span>${label}</span>`;
    legendItems.appendChild(div);
  }
}

function hideDecayLegend(): void {
  document.querySelectorAll(".decay-legend-item").forEach((el) => {
    el.remove();
  });
}

// ── Toggle ────────────────────────────────────────────────

async function enableOverlay(cy: Core, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  btn.textContent = "Loading…";

  try {
    const res = await fetch("/api/decay");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as DecayResponse;

    applyDecayData(cy, data);
    renderSummary(cy, data.summary);
    showDecayLegend();

    overlayActive = true;
    btn.textContent = "Decay overlay (on)";
    btn.classList.add("active");
  } catch (err) {
    const banner = document.getElementById("decay-summary");
    if (banner) {
      banner.textContent = `Failed to load decay data: ${err instanceof Error ? err.message : String(err)}`;
      banner.classList.remove("hidden");
    }
    btn.textContent = "Decay overlay";
  } finally {
    btn.disabled = false;
  }
}

function disableOverlay(cy: Core, btn: HTMLButtonElement): void {
  clearRiskClasses(cy);
  resetFilter(cy);
  hideSummary();
  hideDecayLegend();

  overlayActive = false;
  btn.textContent = "Decay overlay";
  btn.classList.remove("active");
}

// ── Public init ───────────────────────────────────────────

export function initDecayOverlay(cy: Core): void {
  const btn = document.getElementById(
    "btn-decay-overlay",
  ) as HTMLButtonElement | null;
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (overlayActive) {
      disableOverlay(cy, btn);
    } else {
      void enableOverlay(cy, btn);
    }
  });
}
