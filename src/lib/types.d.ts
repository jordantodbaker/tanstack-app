export interface Project {
  id: number;
  displayId: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FefRow = {
  id: string;
  name: string;
  description: string;
  shopField: string;
  weldGroupDescription: string;
  quantity: string;
  size: string;
  unit: string;
  metallurgyCode: string;
  boreSize: string;
  role: string;
  /** Selected CrewMix.id (as a string) when the row's labor rate came from a
   *  crew mix average; "" when the row uses Role + Schedule instead. */
  crewMixId: string;
  schedule: string;
  taskCode: string;
  laborHours: string;
  /** Per-row labor factor (hours per quantity unit). Empty falls back to the
   *  project's Basis page `estimateFactor` for display + labor-hours
   *  derivation. Only the dynamic disciplines surface this as an input;
   *  Piping computes its own factor from the taskCode/size lookup table. */
  laborFactor: string;
  laborRate: string;
  materialCost: string;
  equipment: string;
  notes: string;
  /** "true" when the user has ticked the Sub checkbox, otherwise "". */
  sub: string;
  /** Selected area's id (as a string), or "" when none. */
  area: string;

  // ── Reference / line-list attributes ────────────────────────────────────────
  projectPhase: string;
  drawingNumber: string;
  drawingRev: string;
  processUnit: string;
  /** Free-text area name (distinct from `area`, which references a defined Area). */
  areaName: string;
  systemName: string;
  tagNumber: string;

  // ── Spec & testing (piping/mechanical) ──────────────────────────────────────
  lineSpec: string;
  paintSpec: string;
  insulation: string;
  nde: string;
  pwht: string;
  hydro: string;
  heatTrace: string;

  // ── Location ────────────────────────────────────────────────────────────────
  agUg: string;
  elevation: string;

  // ── Dimensions (Structural Steel take-off) ──────────────────────────────────
  height: string;
  width: string;
  length: string;
  /** Number of shapes; Quantity is derived as shapeCount × length. */
  shapeCount: string;

  // ── Labor adjustments ───────────────────────────────────────────────────────
  siteFactor: string;
  feetAboveGrade: string;
  efficAdjust: string;
  /** Labor-factor adjustment (distinct from `laborFactor`, the hours-per-unit). */
  laborFactorAdj: string;
  elevAdder: string;
  weldAdder: string;
};

export type CbsOption = {
  displayCode: string;
  costCode?: string;
  name: string;
  uom: string;
  displayDescription: string | null;
  /** Whether this CBS item is flagged for sub-reporting on the source list. */
  subReporting?: boolean | null;
};

