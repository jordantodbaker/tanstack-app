/**
 * One row of the CBS Dictionary as the workbook loader produces it and the
 * import stores it in `CbsItem` (minus the generated id).
 *
 * Types only, and DB-free, so the change detection in `cbs-import-diff` can be
 * unit-tested without a database. The rows themselves come from
 * `prisma/cbs-workbook.ts`, which reads the expanded workbook `cbs:expand`
 * writes: one row per account and per cost type, already in the sheet, so
 * nothing is generated here any more.
 */
export type CbsDictionaryRow = {
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
  l6: string;
  name: string;
  displayCode: string;
  uom: string;
  subReporting: boolean | null;
  materialCode: boolean | null;
  laborCode: boolean | null;
  equipmentCode: boolean | null;
  otherCode: boolean | null;
  rentalCode: boolean | null;
  materialType: string | null;
  costCenter: string | null;
  costClassification: string | null;
  status: string | null;
  accountDescription: string;
  l2Description: string | null;
  core: string | null;
  coreExtension: string | null;
  wbs: string | null;
  p6CostAccount: string | null;
  gl: string | null;
  discipline: string | null;
  costCode: string;
  description: string | null;
  notes: string | null;
  displayDescription: string;
  /** The Original Row in the workbook this came from. */
  originalRow: number | null;
  /** This row's line in the CBS Expanded sheet. */
  expandedRow: number | null;
  /**
   * The workbook's "Original Row" flag: TRUE for an original row, FALSE for a
   * generated cost-type line; null when the workbook predates the column.
   */
  isOriginal: boolean | null;
};
