/**
 * filters.ts — left sidebar with filter checkboxes for the graph visualization.
 *
 * Provides client-side filtering via cytoscape show/hide.
 * Filters: entity_type, relation_type, edge_kind, "hide orphans" toggle.
 */

import type { Core } from "cytoscape";

interface GraphData {
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
}

// Current filter state
const activeFilters = {
  entityTypes: new Set<string>(),
  relationTypes: new Set<string>(),
  edgeKinds: new Set<string>(),
  hideOrphans: false,
};

let cytoscapeInstance: Core | null = null;

/**
 * Apply current filter state to the cytoscape instance.
 * Shows/hides elements based on checked filters.
 */
function applyFilters(): void {
  const cy = cytoscapeInstance;
  if (!cy) return;

  // First show everything
  cy.elements().show();

  // Hide nodes whose entity_type is unchecked
  if (activeFilters.entityTypes.size > 0) {
    cy.nodes().forEach((node) => {
      const entityType = node.data("entity_type") as string;
      if (!activeFilters.entityTypes.has(entityType)) {
        node.hide();
      }
    });
  }

  // Hide edges whose relation_type is unchecked
  if (activeFilters.relationTypes.size > 0) {
    cy.edges().forEach((edge) => {
      const relationType = edge.data("relation_type") as string;
      if (!activeFilters.relationTypes.has(relationType)) {
        edge.hide();
      }
    });
  }

  // Hide edges whose edge_kind is unchecked
  if (activeFilters.edgeKinds.size > 0) {
    cy.edges().forEach((edge) => {
      const edgeKind = edge.data("edge_kind") as string;
      if (!activeFilters.edgeKinds.has(edgeKind)) {
        edge.hide();
      }
    });
  }

  // Hide orphan nodes (nodes with no visible edges)
  if (activeFilters.hideOrphans) {
    cy.nodes().forEach((node) => {
      if (!node.hidden()) {
        const visibleEdges = node.connectedEdges().filter((e) => !e.hidden());
        if (visibleEdges.length === 0) {
          node.hide();
        }
      }
    });
  }
}

/**
 * Build a section of checkboxes inside the sidebar.
 */
function buildCheckboxSection(
  container: HTMLElement,
  title: string,
  values: string[],
  activeSet: Set<string>,
  onChange: () => void,
): void {
  const section = document.createElement("div");
  section.className = "filter-section";

  const heading = document.createElement("h4");
  heading.textContent = title;
  section.appendChild(heading);

  for (const value of values) {
    activeSet.add(value);

    const label = document.createElement("label");
    label.className = "filter-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.value = value;

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        activeSet.add(value);
      } else {
        activeSet.delete(value);
      }
      onChange();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${value}`));
    section.appendChild(label);
  }

  container.appendChild(section);
}

/**
 * Initialize the filter sidebar.
 * Reads unique values from graph data and builds checkboxes.
 */
export function initFilters(cy: Core, data: GraphData): void {
  cytoscapeInstance = cy;

  const sidebar = document.getElementById("filter-sidebar");
  if (!sidebar) return;

  // Collect unique values
  const entityTypes = [...new Set(data.nodes.map((n) => n.entity_type))].sort();
  const relationTypes = [
    ...new Set(data.edges.map((e) => e.relation_type)),
  ].sort();
  const edgeKinds = [...new Set(data.edges.map((e) => e.edge_kind))].sort();

  sidebar.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Filters";
  sidebar.appendChild(title);

  // Entity type filters
  if (entityTypes.length > 0) {
    buildCheckboxSection(
      sidebar,
      "Entity type",
      entityTypes,
      activeFilters.entityTypes,
      applyFilters,
    );
  }

  // Relation type filters
  if (relationTypes.length > 0) {
    buildCheckboxSection(
      sidebar,
      "Relation type",
      relationTypes,
      activeFilters.relationTypes,
      applyFilters,
    );
  }

  // Edge kind filters
  if (edgeKinds.length > 0) {
    buildCheckboxSection(
      sidebar,
      "Edge kind",
      edgeKinds,
      activeFilters.edgeKinds,
      applyFilters,
    );
  }

  // Hide orphans toggle
  const orphanSection = document.createElement("div");
  orphanSection.className = "filter-section";

  const orphanLabel = document.createElement("label");
  orphanLabel.className = "filter-label";

  const orphanCheckbox = document.createElement("input");
  orphanCheckbox.type = "checkbox";
  orphanCheckbox.id = "filter-hide-orphans";
  orphanCheckbox.checked = false;

  orphanCheckbox.addEventListener("change", () => {
    activeFilters.hideOrphans = orphanCheckbox.checked;
    applyFilters();
  });

  orphanLabel.appendChild(orphanCheckbox);
  orphanLabel.appendChild(document.createTextNode(" Hide orphans"));
  orphanSection.appendChild(orphanLabel);
  sidebar.appendChild(orphanSection);
}
