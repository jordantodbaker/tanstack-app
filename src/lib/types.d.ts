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
  schedule: string;
  taskCode: string;
  laborHours: string;
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

