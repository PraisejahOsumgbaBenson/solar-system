import { daysSinceJ2000 } from "../physics/orbital";
import { PLANETS, planetById } from "../physics/planets";

/**
 * The JPL approximate elements table is calibrated for this window, so the
 * date picker and shared links stay inside it.
 */
export const MODEL_START_ISO = "1800-01-01";
export const MODEL_END_ISO = "2050-12-31";

const DAY_MS = 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

export const MODEL_START_DAY = daysSinceJ2000(
  new Date(Date.UTC(1800, 0, 1)),
);
export const MODEL_END_DAY = daysSinceJ2000(
  new Date(Date.UTC(2050, 11, 31)),
);

/** Bodies the keyboard can cycle through, in selector order. */
export const FOCUS_ORDER = ["sun", ...PLANETS.map((planet) => planet.id)];

export interface ViewState {
  /** Calendar date as YYYY-MM-DD, or null when the link has no date. */
  date: string | null;
  /** A body id, or null for the whole system view. */
  focus: string | null;
}

/**
 * Parse a YYYY-MM-DD date as UTC. Returns null for a malformed or impossible
 * date, so a bad shared link falls back to the current date.
 */
export function dayOffsetFromIso(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return daysSinceJ2000(date);
}

/** Calendar date for a day offset, as YYYY-MM-DD. */
export function isoDateFromDayOffset(dayOffset: number): string {
  return new Date(J2000_MS + dayOffset * DAY_MS).toISOString().slice(0, 10);
}

/** Keep a day offset inside the model's valid range. */
export function clampDayOffset(dayOffset: number): number {
  if (!Number.isFinite(dayOffset)) {
    return MODEL_START_DAY;
  }
  return Math.min(MODEL_END_DAY, Math.max(MODEL_START_DAY, dayOffset));
}

function normalizeFocus(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (value === "sun") {
    return value;
  }
  return planetById(value) ? value : null;
}

/**
 * Read the date and focus from a query string. Unknown bodies are ignored and
 * dates outside the model window are clamped to the nearest edge.
 */
export function parseViewState(search: string): ViewState {
  const params = new URLSearchParams(search);
  const rawDate = params.get("date");
  const rawFocus = params.get("focus");

  let date: string | null = null;
  if (rawDate) {
    const dayOffset = dayOffsetFromIso(rawDate);
    if (dayOffset !== null) {
      date = isoDateFromDayOffset(clampDayOffset(dayOffset));
    }
  }

  return { date, focus: normalizeFocus(rawFocus) };
}

/** Serialise a view as a query string, including the leading question mark. */
export function viewStateToSearch(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.date) {
    params.set("date", state.date);
  }
  if (state.focus) {
    params.set("focus", state.focus);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Move through the body list, wrapping at either end. */
export function cycleFocus(current: string | null, direction: 1 | -1): string {
  const currentIndex = current ? FOCUS_ORDER.indexOf(current) : -1;
  const start = currentIndex === -1 ? (direction > 0 ? -1 : 0) : currentIndex;
  const next = (start + direction + FOCUS_ORDER.length) % FOCUS_ORDER.length;
  return FOCUS_ORDER[next];
}
