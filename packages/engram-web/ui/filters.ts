/**
 * filters.ts — left sidebar with filter controls for the graph visualization.
 */

import type { Core } from "cytoscape";

interface GraphData {
  nodes: Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
    status: string;
    updated_at: string;
    source_type?: string;
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

// Structural boilerplate types hidden by default to reduce hairball density
const DEFAULT_HIDDEN_ENTITY_TYPES = new Set(["symbol", "file", "module"]);
const DEFAULT_HIDDEN_RELATION_TYPES = new Set(["defined_in", "contains"]);

const activeFilters = {
  entityTypes: new Set<string>(),
  relationTypes: new Set<string>(),
  edgeKinds: new Set<string>(),
  sourceTypes: new Set<string>(),
  hideOrphans: false,
  minDegree: 0,
};

let cytoscapeInstance: Core | null = null;
let _reLayoutCallback: (() => void) | null = null;

export function applyFilters(): void {
  const cy = cytoscapeInstance;
  if (!cy) return;

  cy.elements().show();

  // Hide nodes by entity type
  cy.nodes().forEach((node) => {
    if (!activeFilters.entityTypes.has(node.data("entity_type") as string)) {
      node.hide();
    }
  });

  // Hide nodes by source type (nodes with no source_type always shown)
  if (activeFilters.sourceTypes.size > 0) {
    cy.nodes().forEach((node) => {
      if (node.hidden()) return;
      const st = node.data("source_type") as string | undefined;
      if (
        st !== undefined &&
        st !== null &&
        st !== "" &&
        !activeFilters.sourceTypes.has(st)
      ) {
        node.hide();
      }
    });
  }

  // Hide edges by relation type
  cy.edges().forEach((edge) => {
    if (
      !activeFilters.relationTypes.has(edge.data("relation_type") as string)
    ) {
      edge.hide();
    }
  });

  // Hide edges by edge kind
  cy.edges().forEach((edge) => {
    if (
      !edge.hidden() &&
      !activeFilters.edgeKinds.has(edge.data("edge_kind") as string)
    ) {
      edge.hide();
    }
  });

  // Cascade: hide edges whose endpoints are hidden
  cy.edges().forEach((edge) => {
    if (!edge.hidden() && (edge.source().hidden() || edge.target().hidden())) {
      edge.hide();
    }
  });

  // Min visible-degree filter
  if (activeFilters.minDegree > 0) {
    cy.nodes().forEach((node) => {
      if (!node.hidden()) {
        const visibleDegree = node
          .connectedEdges()
          .filter((e) => !e.hidden()).length;
        if (visibleDegree < activeFilters.minDegree) {
          node.hide();
        }
      }
    });
    // Cascade again after degree filter
    cy.edges().forEach((edge) => {
      if (
        !edge.hidden() &&
        (edge.source().hidden() || edge.target().hidden())
      ) {
        edge.hide();
      }
    });
  }

  // Hide orphans (nodes with no visible edges)
  if (activeFilters.hideOrphans) {
    cy.nodes().forEach((node) => {
      if (
        !node.hidden() &&
        node.connectedEdges().filter((e) => !e.hidden()).length === 0
      ) {
        node.hide();
      }
    });
  }
}

function buildCheckboxSection(
  container: HTMLElement,
  title: string,
  values: string[],
  activeSet: Set<string>,
  defaultHidden: Set<string>,
  onChange: () => void,
): void {
  const section = document.createElement("div");
  section.className = "filter-section";

  const heading = document.createElement("h4");
  heading.textContent = title;
  section.appendChild(heading);

  for (const value of values) {
    const isChecked = !defaultHidden.has(value);
    if (isChecked) activeSet.add(value);

    const label = document.createElement("label");
    label.className = "filter-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isChecked;
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

export function initFilters(
  cy: Core,
  data: GraphData,
  onReLayout: () => void,
): void {
  cytoscapeInstance = cy;
  _reLayoutCallback = onReLayout;

  // Reset state (handles time-slider re-inits)
  activeFilters.entityTypes.clear();
  activeFilters.relationTypes.clear();
  activeFilters.edgeKinds.clear();
  activeFilters.sourceTypes.clear();
  activeFilters.hideOrphans = false;
  activeFilters.minDegree = 0;

  const sidebar = document.getElementById("filter-sidebar");
  if (!sidebar) return;

  const entityTypes = [...new Set(data.nodes.map((n) => n.entity_type))].sort();
  const relationTypes = [
    ...new Set(data.edges.map((e) => e.relation_type)),
  ].sort();
  const edgeKinds = [...new Set(data.edges.map((e) => e.edge_kind))].sort();
  const sourceTypes = [
    ...new Set(
      data.nodes
        .map((n) => n.source_type)
        .filter((s): s is string => s !== undefined && s !== null && s !== ""),
    ),
  ].sort();

  sidebar.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Filters";
  sidebar.appendChild(title);

  if (entityTypes.length > 0) {
    buildCheckboxSection(
      sidebar,
      "Entity type",
      entityTypes,
      activeFilters.entityTypes,
      DEFAULT_HIDDEN_ENTITY_TYPES,
      applyFilters,
    );
  }

  if (relationTypes.length > 0) {
    buildCheckboxSection(
      sidebar,
      "Relation type",
      relationTypes,
      activeFilters.relationTypes,
      DEFAULT_HIDDEN_RELATION_TYPES,
      applyFilters,
    );
  }

  if (edgeKinds.length > 0) {
    buildCheckboxSection(
      sidebar,
      "Edge kind",
      edgeKinds,
      activeFilters.edgeKinds,
      new Set(),
      applyFilters,
    );
  }

  if (sourceTypes.length > 0) {
    buildCheckboxSection(
      sidebar,
      "Source type",
      sourceTypes,
      activeFilters.sourceTypes,
      new Set(),
      applyFilters,
    );
  }

  // Min degree slider
  const degreeSection = document.createElement("div");
  degreeSection.className = "filter-section";

  const degreeHeading = document.createElement("h4");
  degreeHeading.textContent = "Min connections";
  degreeSection.appendChild(degreeHeading);

  const degreeRow = document.createElement("div");
  degreeRow.className = "filter-degree-row";

  const degreeSlider = document.createElement("input");
  degreeSlider.type = "range";
  degreeSlider.min = "0";
  degreeSlider.max = "20";
  degreeSlider.value = "0";
  degreeSlider.className = "filter-degree-slider";

  const degreeValue = document.createElement("span");
  degreeValue.className = "filter-degree-value";
  degreeValue.textContent = "0";

  degreeSlider.addEventListener("input", () => {
    activeFilters.minDegree = Number.parseInt(degreeSlider.value, 10);
    degreeValue.textContent = degreeSlider.value;
    applyFilters();
  });

  degreeRow.appendChild(degreeSlider);
  degreeRow.appendChild(degreeValue);
  degreeSection.appendChild(degreeRow);
  sidebar.appendChild(degreeSection);

  // Hide orphans toggle
  const orphanSection = document.createElement("div");
  orphanSection.className = "filter-section";

  const orphanLabel = document.createElement("label");
  orphanLabel.className = "filter-label";

  const orphanCheckbox = document.createElement("input");
  orphanCheckbox.type = "checkbox";
  orphanCheckbox.checked = false;

  orphanCheckbox.addEventListener("change", () => {
    activeFilters.hideOrphans = orphanCheckbox.checked;
    applyFilters();
  });

  orphanLabel.appendChild(orphanCheckbox);
  orphanLabel.appendChild(document.createTextNode(" Hide orphans"));
  orphanSection.appendChild(orphanLabel);
  sidebar.appendChild(orphanSection);

  // Re-layout button
  const reLayoutSection = document.createElement("div");
  reLayoutSection.className = "filter-section";

  const reLayoutBtn = document.createElement("button");
  reLayoutBtn.textContent = "Re-layout";
  reLayoutBtn.className = "filter-relayout-btn";
  reLayoutBtn.addEventListener("click", () => onReLayout());
  reLayoutSection.appendChild(reLayoutBtn);
  sidebar.appendChild(reLayoutSection);

  // Apply defaults immediately so layout runs on the filtered graph
  applyFilters();
}
