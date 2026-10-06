/**
 * The CBS Dictionary expansion rule, kept free of any workbook or database
 * I/O so it can be unit-tested directly. The workbook loader
 * (`prisma/master-cbs.ts`) parses rows into `MasterCbsItem`s and hands them
 * here; the seed and the live-DB re-import store the result in `CbsItem`.
 *
 * For each original row with Sub Code = YES a "SUB" twin is generated whose
 * cost type (the trailing code segment) is `S`; for Material Code = YES, a
 * "MATERIAL" twin with type `M`. A twin is skipped when that code already
 * exists. Generated rows copy the original, suffix the name ("… Subcontracts"
 * / "… Materials"), set the G/L (5200 / 5100) and record `generatedFrom` —
 * the same shape as the "CBS S-M Generated" dictionary sheet.
 */
import { parseCbsDisplayCode, type CbsRowType } from "./cbs-tree";

export type { CbsRowType };

/** One dictionary row as stored in `CbsItem` (minus the generated id). */
export type MasterCbsItem = {
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
  rowType: CbsRowType;
  generatedFrom: string | null;
};

const SUB_GL = "5200";
const MATERIAL_GL = "5100";

/** "Civil" + "Materials" → "Civil Materials"; "Shop Materials" stays as is. */
function suffixName(name: string, suffix: string): string {
  const base = name.trim();
  if (!base) return suffix;
  if (base.toLowerCase().endsWith(suffix.toLowerCase())) return base;
  return `${base} ${suffix}`;
}

/** Swap the trailing cost-type segment: "601-05-0000-00-0" + "S" → "…-S". */
export function withCostType(displayCode: string, type: string): string {
  return `${displayCode.slice(0, 15)}${type}`;
}

function generateTwin(
  original: MasterCbsItem,
  type: "S" | "M",
): MasterCbsItem {
  const displayCode = withCostType(original.displayCode, type);
  const name = suffixName(
    original.name,
    type === "S" ? "Subcontracts" : "Materials",
  );
  return {
    ...original,
    ...parseCbsDisplayCode(displayCode),
    name,
    displayCode,
    costCode: displayCode.replace(/-/g, ""),
    gl: type === "S" ? SUB_GL : MATERIAL_GL,
    displayDescription: `${displayCode}:  ${name}`,
    rowType: type === "S" ? "SUB" : "MATERIAL",
    generatedFrom: original.displayCode,
  };
}

export type CbsDictionaryExpansion = {
  items: MasterCbsItem[];
  generatedSub: number;
  generatedMaterial: number;
  skippedExistingSub: number;
  skippedExistingMaterial: number;
};

/**
 * Expands original rows into the dictionary: each original is followed by its
 * generated S and M twins (skipped when that code already exists).
 */
export function expandCbsDictionary(
  originals: MasterCbsItem[],
): CbsDictionaryExpansion {
  const existing = new Set(originals.map((o) => o.displayCode));
  const items: MasterCbsItem[] = [];
  const stats = {
    generatedSub: 0,
    generatedMaterial: 0,
    skippedExistingSub: 0,
    skippedExistingMaterial: 0,
  };
  for (const o of originals) {
    items.push(o);
    if (o.subReporting === true) {
      const twin = generateTwin(o, "S");
      if (existing.has(twin.displayCode)) stats.skippedExistingSub++;
      else {
        existing.add(twin.displayCode);
        items.push(twin);
        stats.generatedSub++;
      }
    }
    if (o.materialCode === true) {
      const twin = generateTwin(o, "M");
      if (existing.has(twin.displayCode)) stats.skippedExistingMaterial++;
      else {
        existing.add(twin.displayCode);
        items.push(twin);
        stats.generatedMaterial++;
      }
    }
  }
  return { items, ...stats };
}
