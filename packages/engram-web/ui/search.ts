/**
 * search.ts — search input in header, 150ms debounce, calls /api/search.
 *
 * On select: pan+zoom to node + pulse highlight + openEntityPanel(id).
 * "/" key focuses search. "Escape" closes dropdown.
 * If result is hidden by filters, shows a toast.
 */

import type { Core } from "cytoscape";

interface SearchResultItem {
  id: string;
  canonical_name: string;
  entity_type: string;
  score: number;
}

interface SearchResponse {
  results: SearchResultItem[];
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentResults: SearchResultItem[] = [];

/**
 * Show a temporary toast notification.
 */
function showToast(message: string): void {
  let toast = document.getElementById("search-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "search-toast";
    toast.className = "search-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("visible");

  setTimeout(() => {
    if (toast) toast.classList.remove("visible");
  }, 3000);
}

/**
 * Close the search dropdown.
 */
function closeDropdown(): void {
  const dropdown = document.getElementById("search-dropdown");
  if (dropdown) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
  }
}

/**
 * Navigate to a search result: pan+zoom in cytoscape, pulse highlight, open entity panel.
 */
function navigateToResult(
  cy: Core,
  result: SearchResultItem,
  openEntityPanel: (id: string) => void,
): void {
  closeDropdown();

  const node = cy.getElementById(result.id);
  if (!node || node.length === 0) {
    showToast("Filtered out — clear filters to see this entity");
    return;
  }

  // Check if node is hidden (filtered out)
  if (node.hidden()) {
    showToast("Filtered out — clear filters to see this entity");
    return;
  }

  // Pan and zoom to the node
  cy.animate({
    fit: {
      eles: node,
      padding: 100,
    },
    duration: 400,
  });

  // Pulse highlight: add class, remove after animation
  node.addClass("pulse");
  setTimeout(() => {
    node.removeClass("pulse");
  }, 1200);

  // Open the entity panel
  openEntityPanel(result.id);
}

/**
 * Render the search dropdown with results.
 */
function renderDropdown(
  results: SearchResultItem[],
  cy: Core,
  openEntityPanel: (id: string) => void,
): void {
  const dropdown = document.getElementById("search-dropdown");
  if (!dropdown) return;

  if (results.length === 0) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    return;
  }

  dropdown.innerHTML = "";
  dropdown.classList.remove("hidden");

  for (const result of results) {
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.dataset.id = result.id;

    const nameSpan = document.createElement("span");
    nameSpan.className = "search-result-name";
    nameSpan.textContent = result.canonical_name;

    const typeSpan = document.createElement("span");
    typeSpan.className = "search-result-type";
    typeSpan.textContent = result.entity_type;

    item.appendChild(nameSpan);
    item.appendChild(typeSpan);

    item.addEventListener("click", () => {
      navigateToResult(cy, result, openEntityPanel);
    });

    dropdown.appendChild(item);
  }
}

/**
 * Fetch search results from /api/search.
 */
async function fetchResults(query: string): Promise<SearchResultItem[]> {
  if (!query.trim()) return [];

  const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];

  const data = (await res.json()) as SearchResponse;
  return data.results ?? [];
}

/**
 * Initialize the search input and dropdown.
 */
export function initSearch(
  cy: Core,
  openEntityPanel: (id: string) => void,
): void {
  const input = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  const dropdown = document.getElementById("search-dropdown");

  if (!input || !dropdown) return;

  // Input handler with 150ms debounce
  input.addEventListener("input", () => {
    const query = input.value;

    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    if (!query.trim()) {
      closeDropdown();
      return;
    }

    debounceTimer = setTimeout(async () => {
      currentResults = await fetchResults(query);
      renderDropdown(currentResults, cy, openEntityPanel);
    }, 150);
  });

  // Enter key: navigate to first result
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && currentResults.length > 0) {
      navigateToResult(cy, currentResults[0], openEntityPanel);
    } else if (e.key === "Escape") {
      closeDropdown();
      input.blur();
    }
  });

  // "/" key: focus search input (when not in an input)
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (
      e.key === "/" &&
      document.activeElement !== input &&
      !(document.activeElement instanceof HTMLInputElement) &&
      !(document.activeElement instanceof HTMLTextAreaElement)
    ) {
      e.preventDefault();
      input.focus();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as Node;
    if (!input.contains(target) && !dropdown.contains(target)) {
      closeDropdown();
    }
  });
}
