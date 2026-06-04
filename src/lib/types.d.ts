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

