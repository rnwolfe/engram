/**
 * panels.ts — right-hand collapsible detail sidebar.
 *
 * Exports:
 *   setCytoscapeInstance(cy)   → registers the cytoscape instance for graph navigation
 *   openEntityPanel(entityId)  → fetches /api/entities/:id, renders entity panel
 *   openEdgePanel(edgeId)      → fetches /api/edges/:id, renders edge panel
 *   closePanel()               → hides the panel
 */

type CytoscapeInstance = Record<string, (...args: unknown[]) => unknown>;

interface EvidenceSummary {
  episode_id: string;
  source_type?: string;
  source_ref?: string | null;
  created_at?: string;
  summary?: string | null;
  status?: string;
}

interface EntityDetail {
  id: string;
  canonical_name: string;
  entity_type: string;
  status: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  evidence: EvidenceSummary[];
}

interface EdgeDetail {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  fact: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  invalidated_at: string | null;
  owner_id: string | null;
  evidence: EvidenceSummary[];
}

interface EpisodeDetail {
  id: string;
  source_type: string;
  source_ref: string | null;
  content: string | null;
  status: string;
  timestamp: string;
  actor: string | null;
}

let _cy: CytoscapeInstance = null;

export function setCytoscapeInstance(cy: CytoscapeInstance): void {
  _cy = cy;
}

function navigateToNode(entityId: string): void {
  if (!_cy) return;
  const node = _cy.getElementById(entityId);
  if (!node || node.length === 0) return;
  node.select();
  _cy.animate({ fit: { eles: node, padding: 50 } }, { duration: 300 });
}

function getPanel(): HTMLElement | null {
  return document.getElementById("detail-panel");
}

function getContent(): HTMLElement | null {
  return document.getElementById("panel-content");
}

export function closePanel(): void {
  const panel = getPanel();
  if (panel) panel.classList.add("hidden");
}

function showPanel(html: string): void {
  const panel = getPanel();
  const content = getContent();
  if (!panel || !content) return;
  content.innerHTML = html;
  panel.classList.remove("hidden");
}

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}

async function fetchEpisode(episodeId: string): Promise<EpisodeDetail | null> {
  try {
    const res = await fetch(`/api/episodes/${encodeURIComponent(episodeId)}`);
    if (!res.ok) return null;
    return res.json() as Promise<EpisodeDetail>;
  } catch {
    return null;
  }
}

function renderEvidenceItem(ev: EvidenceSummary, index: number): string {
  if (ev.status === "redacted") {
    return `
    <div class="evidence-item evidence-item--redacted" data-episode-id="${esc(ev.episode_id)}">
      <div class="evidence-header">
        <span class="evidence-label">• [redacted]</span>
      </div>
    </div>`;
  }
  const label = ev.source_ref
    ? `${esc(ev.source_type)} · ${esc(ev.source_ref)}`
    : esc(ev.source_type);
  return `
    <div class="evidence-item" data-episode-id="${esc(ev.episode_id)}">
      <div class="evidence-header">
        <span class="evidence-label">• ${label}</span>
        <span class="evidence-date">${fmtDate(ev.created_at)}</span>
        <button class="evidence-expand-btn" data-index="${index}" data-episode-id="${esc(ev.episode_id)}" aria-expanded="false">▶ view raw</button>
      </div>
      ${ev.summary ? `<div class="evidence-summary">${esc(ev.summary)}</div>` : ""}
      <div class="evidence-raw hidden" id="evidence-raw-${index}"></div>
    </div>`;
}

function attachEvidenceHandlers(): void {
  document
    .querySelectorAll<HTMLButtonElement>(".evidence-expand-btn")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const index = btn.dataset.index ?? "";
        const episodeId = btn.dataset.episodeId ?? "";
        const rawEl = document.getElementById(`evidence-raw-${index}`);
        if (!rawEl) return;

        const isExpanded = btn.getAttribute("aria-expanded") === "true";
        if (isExpanded) {
          rawEl.classList.add("hidden");
          btn.setAttribute("aria-expanded", "false");
          btn.textContent = "▶ view raw";
          return;
        }

        btn.textContent = "Loading…";
        const ep = await fetchEpisode(episodeId);
        if (!ep) {
          rawEl.textContent = "[error loading episode]";
        } else if (ep.status === "redacted" || ep.content === null) {
          rawEl.textContent = "[redacted]";
        } else {
          rawEl.textContent = ep.content;
        }
        rawEl.classList.remove("hidden");
        btn.setAttribute("aria-expanded", "true");
        btn.textContent = "▼ hide raw";
      });
    });
}

function renderEntityPanel(
  entity: EntityDetail,
  outCount: number,
  inCount: number,
): string {
  const evidenceHtml = entity.evidence
    .map((ev, i) => renderEvidenceItem(ev, i))
    .join("");

  return `
    <div class="panel-section">
      <h2 class="panel-title">${esc(entity.canonical_name)}</h2>
      <div class="panel-meta">
        <span class="badge type-badge">${esc(entity.entity_type)}</span>
        <span class="badge status-badge">${esc(entity.status)}</span>
      </div>
      <div class="panel-timestamps">
        <span>Updated: ${fmtDate(entity.updated_at)}</span>
        <span>Created: ${fmtDate(entity.created_at)}</span>
      </div>
      <div class="panel-edge-counts">
        Edges: <strong>${outCount}</strong> out / <strong>${inCount}</strong> in
      </div>
    </div>
    <div class="panel-section">
      <h3 class="section-title">Evidence</h3>
      <hr class="section-divider" />
      <div class="evidence-list">
        ${evidenceHtml || "<p class='empty-state'>No evidence records.</p>"}
      </div>
    </div>`;
}

function renderEdgePanel(
  edge: EdgeDetail,
  sourceName: string,
  targetName: string,
): string {
  const evidenceHtml = edge.evidence
    .map((ev, i) => renderEvidenceItem(ev, i))
    .join("");

  const validUntil = edge.valid_until ? fmtDate(edge.valid_until) : "now";
  const invalidatedHtml = edge.invalidated_at
    ? `<div class="panel-invalidated">Invalidated: ${fmtDate(edge.invalidated_at)}</div>`
    : "";

  return `
    <div class="panel-section">
      <h2 class="panel-title">${esc(edge.relation_type)}</h2>
      <div class="panel-meta">
        <span class="badge kind-badge">${esc(edge.edge_kind)}</span>
        <span class="panel-confidence">conf: ${edge.confidence.toFixed(2)}</span>
      </div>
      <div class="panel-endpoints">
        <button class="entity-link" data-entity-id="${esc(edge.source_id)}">${esc(sourceName)}</button>
        <span class="arrow">→</span>
        <button class="entity-link" data-entity-id="${esc(edge.target_id)}">${esc(targetName)}</button>
      </div>
      <div class="panel-validity">
        Valid: ${fmtDate(edge.valid_from)} → ${validUntil}
      </div>
      ${invalidatedHtml}
    </div>
    <div class="panel-section">
      <h3 class="section-title">Evidence</h3>
      <hr class="section-divider" />
      <div class="evidence-list">
        ${evidenceHtml || "<p class='empty-state'>No evidence records.</p>"}
      </div>
    </div>`;
}

function attachEntityLinkHandlers(): void {
  document
    .querySelectorAll<HTMLButtonElement>(".entity-link")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const entityId = btn.dataset.entityId;
        if (entityId) {
          navigateToNode(entityId);
          openEntityPanel(entityId);
        }
      });
    });
}

export async function openEntityPanel(entityId: string): Promise<void> {
  showPanel('<div class="panel-loading">Loading…</div>');

  let entity: EntityDetail;
  try {
    const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}`);
    if (!res.ok) {
      showPanel(
        `<div class="panel-error">Entity not found (${res.status})</div>`,
      );
      return;
    }
    entity = (await res.json()) as EntityDetail;
  } catch (err) {
    showPanel(
      `<div class="panel-error">Error loading entity: ${err instanceof Error ? err.message : String(err)}</div>`,
    );
    return;
  }

  // Count edges from the cytoscape instance if available
  let outCount = 0;
  let inCount = 0;
  if (_cy) {
    const node = _cy.getElementById(entityId);
    if (node && node.length > 0) {
      outCount = node.outgoers("edge").length;
      inCount = node.incomers("edge").length;
    }
  }

  showPanel(renderEntityPanel(entity, outCount, inCount));
  attachEvidenceHandlers();
  attachEntityLinkHandlers();
}

export async function openEdgePanel(edgeId: string): Promise<void> {
  showPanel('<div class="panel-loading">Loading…</div>');

  let edge: EdgeDetail;
  try {
    const res = await fetch(`/api/edges/${encodeURIComponent(edgeId)}`);
    if (!res.ok) {
      showPanel(
        `<div class="panel-error">Edge not found (${res.status})</div>`,
      );
      return;
    }
    edge = (await res.json()) as EdgeDetail;
  } catch (err) {
    showPanel(
      `<div class="panel-error">Error loading edge: ${err instanceof Error ? err.message : String(err)}</div>`,
    );
    return;
  }

  // Resolve entity names
  const [sourceRes, targetRes] = await Promise.allSettled([
    fetch(`/api/entities/${encodeURIComponent(edge.source_id)}`),
    fetch(`/api/entities/${encodeURIComponent(edge.target_id)}`),
  ]);

  let sourceName = edge.source_id;
  let targetName = edge.target_id;

  if (sourceRes.status === "fulfilled" && sourceRes.value.ok) {
    const src = (await sourceRes.value.json()) as EntityDetail;
    sourceName = src.canonical_name;
  }
  if (targetRes.status === "fulfilled" && targetRes.value.ok) {
    const tgt = (await targetRes.value.json()) as EntityDetail;
    targetName = tgt.canonical_name;
  }

  showPanel(renderEdgePanel(edge, sourceName, targetName));
  attachEvidenceHandlers();
  attachEntityLinkHandlers();
}

// ── Projection panel ──────────────────────────────────────

interface ProjectionNodeData {
  id: string;
  canonical_name: string;
  anchor_id?: string | null;
  kind?: string;
  stale?: boolean;
  updated_at: string;
}

function renderProjectionPanel(data: ProjectionNodeData): string {
  const staleHtml = data.stale
    ? '<span class="badge stale-badge">stale</span>'
    : "";
  const anchorHtml = data.anchor_id
    ? `<div class="panel-timestamps"><span>Anchor: ${esc(data.anchor_id)}</span></div>`
    : "";
  return `
    <div class="panel-section">
      <h2 class="panel-title">${esc(data.canonical_name)}</h2>
      <div class="panel-meta">
        <span class="badge type-badge">projection</span>
        <span class="badge kind-badge">${esc(data.kind ?? "unknown")}</span>
        ${staleHtml}
      </div>
      ${anchorHtml}
      <div class="panel-timestamps">
        <span>Created: ${fmtDate(data.updated_at)}</span>
      </div>
    </div>`;
}

export function openProjectionPanel(data: ProjectionNodeData): void {
  showPanel(renderProjectionPanel(data));
}
