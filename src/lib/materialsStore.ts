import type { FefRow } from "./types";

// In-memory cache of materials section row data, keyed by L1 code. Lets the
// Materials page preserve unsaved row state across accordion expand/collapse
// within a single session.
const rowsBySection: Map<string, FefRow[]> = new Map();

export function getMaterialsSectionRows(l1: string): FefRow[] | undefined {
  return rowsBySection.get(l1);
}

export function setMaterialsSectionRows(l1: string, rows: FefRow[]): void {
  rowsBySection.set(l1, rows);
}
