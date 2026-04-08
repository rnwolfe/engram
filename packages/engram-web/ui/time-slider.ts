/**
 * time-slider.ts — Temporal scrubbing widget for the graph visualization.
 *
 * Fetches /api/temporal-bounds on init to discover the graph's time range.
 * Renders a bottom-docked range input; debounces input events at 150ms.
 * Calls onTimeChange(isoString) when user scrubs, or onTimeChange(null) for "Now".
 */

import type { Core } from "cytoscape";

interface TemporalBounds {
  min_valid_from: string | null;
  max_valid_until: string | null;
}

const DEBOUNCE_MS = 150;
const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = 30 * MS_PER_DAY;

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function initTimeSlider(
  _cy: Core,
  onTimeChange: (validAt: string | null) => void,
): void {
  const container = document.getElementById("time-slider-container");
  const slider = document.getElementById(
    "time-slider",
  ) as HTMLInputElement | null;
  const label = document.getElementById("time-label");
  const btnNow = document.getElementById("btn-now");

  if (!container || !slider || !label || !btnNow) return;

  // Fetch bounds to calibrate the slider
  fetch("/api/temporal-bounds")
    .then((r) => r.json() as Promise<TemporalBounds>)
    .then((bounds) => {
      if (!bounds.min_valid_from) {
        // No temporal data — hide the slider
        container.style.display = "none";
        return;
      }

      const minMs = new Date(bounds.min_valid_from).getTime();
      // If max_valid_until is null, treat "now" as the upper bound
      const maxMs = bounds.max_valid_until
        ? new Date(bounds.max_valid_until).getTime()
        : Date.now();

      slider.min = String(minMs);
      slider.max = String(maxMs);
      slider.value = String(maxMs);
      label.textContent = "Now";
      container.style.display = "flex";

      const debouncedChange = debounce((valueMs: number) => {
        const iso = new Date(valueMs).toISOString();
        onTimeChange(iso);
      }, DEBOUNCE_MS);

      slider.addEventListener("input", () => {
        const ms = Number(slider.value);
        label.textContent = formatDate(ms);
        debouncedChange(ms);
      });

      slider.addEventListener("keydown", (e: KeyboardEvent) => {
        const current = Number(slider.value);
        let next: number | null = null;

        if (e.key === "ArrowRight") {
          next = e.shiftKey ? current + MS_PER_MONTH : current + MS_PER_DAY;
        } else if (e.key === "ArrowLeft") {
          next = e.shiftKey ? current - MS_PER_MONTH : current - MS_PER_DAY;
        }

        if (next !== null) {
          e.preventDefault();
          next = Math.max(minMs, Math.min(maxMs, next));
          slider.value = String(next);
          label.textContent = formatDate(next);
          debouncedChange(next);
        }
      });

      btnNow.addEventListener("click", () => {
        slider.value = String(maxMs);
        label.textContent = "Now";
        onTimeChange(null);
      });
    })
    .catch(() => {
      // On error, hide the slider gracefully
      container.style.display = "none";
    });
}
