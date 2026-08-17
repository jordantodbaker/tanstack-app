import { formatMoney } from "~/lib/formatting";
import type { CsvColumn } from "~/lib/csv-export";
import type { ProjectFefRowTotals } from "~/utils/projectTotals";
import {
  disciplines,
  disciplineById,
  SUMMARY_DISCIPLINES,
  type DisciplineConfig,
} from "~/config/disciplines";

export type SummaryRow = {
  description: string;
  qty: string;
  uom: string;
  unitRate: string;
  hrs: string;
  rate: string;
  totalLabor: string;
  material: string;
  sub: string;
  equip: string;
  other: string;
  /** Discipline id used to look up invalid-row counts and route. Omitted
   *  for rows that don't correspond to a take-off-bearing discipline (e.g.
   *  the Shop variants and the Indirects rows). */
  disciplineId?: string;
  /** Target route for the "errors" link — the discipline's take-off page. */
  disciplineTo?: string;
};

/**
 * Map from a Summary-table discipline label (e.g. "Electrical") back to the
 * full discipline config. Only includes disciplines with a route (`to`) and
 * an L1-code bucket — the routable ones the Take Off sheet exists for.
 * Matches on `summaryLabel ?? label` so renamed-for-summary disciplines like
 * Electric/Electrical resolve correctly.
 */
const disciplineBySummaryLabel: Record<string, DisciplineConfig> =
  Object.fromEntries(
    disciplines
      .filter((d) => d.to && d.l1Codes && d.l1Codes.length > 0)
      .map((d) => [d.summaryLabel ?? d.label, d]),
  );

const INDIRECTS = [
  "Haskell Field Staff",
  "Supervision",
  "Office Staff",
  "Craft Support Labor",
  "Construction Equipment",
  "Haskell Owned",
  "3rd Party",
  "Facilities",
  "Heavy Haul / Crane",
  "Survey & NDE Services",
  "Training & Testing",
  "Mobilize / Demobilize",
  "Other Services",
];

// Administration & Home Office rows. "Home Office Construction Support" sums
// all of L1 012 (via the `byL1` bucket). The remaining rows are the L2 sub-
// accounts of L1 013 ("Project Costs") and sum at that level + their children
// (via the `byL1L2` bucket, keyed by the de-dashed 5-char L1+L2 prefix).
const SUMMARY_ADMIN_HOME_OFFICE: {
  label: string;
  uom: string;
  /** Sum the whole L1 division (3-char). */
  l1?: string;
  /** Sum one L2 sub-account (5-char de-dashed L1+L2, e.g. "01310"). */
  l1l2?: string;
}[] = [
  { label: "Home Office Construction Support", uom: "HR", l1: "012" },
  { label: "Bonds", uom: "LS", l1l2: "01310" },
  { label: "Insurance", uom: "LS", l1l2: "01320" },
  { label: "Finance Charges", uom: "LS", l1l2: "01330" },
  { label: "Taxes", uom: "LS", l1l2: "01340" },
  { label: "Permitting", uom: "LS", l1l2: "01350" },
  { label: "Licenses", uom: "LS", l1l2: "01360" },
];

// Each Engineering & Design row is a parent CBS item (L1 code) under the
// Engineering discipline. Values are summarized from the Engineering Field
// Estimate by L1 bucket (`…ByL1`), the same way the Disciplines section rolls
// up by digit. `020` is the section parent itself, so it isn't a row.
const SUMMARY_ENGINEERING: { label: string; uom: string; l1: string }[] = [
  { label: "Engineering Support", uom: "HR", l1: "022" },
  { label: "Engineering (Combined / Cross Phase)", uom: "HR", l1: "023" },
  { label: "Concept Design / Feasibility (Class 5-4)", uom: "HR", l1: "024" },
  { label: "Preliminary Design - FEED (Class 4-3)", uom: "HR", l1: "025" },
  { label: "Detailed Engineering (Class 2-1)", uom: "HR", l1: "026" },
  { label: "Construction Support", uom: "HR", l1: "027" },
  { label: "Commissioning & Startup Support", uom: "HR", l1: "028" },
];

const TIC_BEFORE_CONTINGENCY = ["Bond", "Insurance", "B&O Tax", "Contingency"];

/** Grout's L1 (parent CBS) codes — digit "2", broken out from Concrete. */
const GROUT_L1_CODES = ["290", "291", "292", "293"];

const emptyRow = (): Omit<SummaryRow, "description"> => ({
  qty: "",
  uom: "",
  unitRate: "",
  hrs: "",
  rate: "",
  totalLabor: "",
  material: "",
  sub: "",
  equip: "",
  other: "",
});

function makeRows(descriptions: string[]): SummaryRow[] {
  return descriptions.map((d) => ({ description: d, ...emptyRow() }));
}

/** Build one Disciplines-section row from raw aggregate totals (digit- or L1-
 *  sourced). Derives the unit-rate and rate the same way for every row. */
function buildSummaryRow(
  label: string,
  uom: string,
  totals: { material: number; labor: number; hours: number; quantity: number },
  matched?: { id?: string; to?: string },
): SummaryRow {
  const { material, labor, hours, quantity } = totals;
  const unitRate = quantity > 0 && hours > 0 ? hours / quantity : 0;
  const rate = hours > 0 && labor > 0 ? labor / hours : 0;
  return {
    description: label,
    ...emptyRow(),
    uom,
    qty: quantity > 0 ? formatMoney(quantity) : "",
    unitRate: unitRate > 0 ? formatMoney(unitRate) : "",
    hrs: hours > 0 ? formatMoney(hours) : "",
    rate: rate > 0 ? formatMoney(rate) : "",
    material: material > 0 ? formatMoney(material) : "",
    totalLabor: labor > 0 ? formatMoney(labor) : "",
    disciplineId: matched?.id,
    disciplineTo: matched?.to,
  };
}

const sumL1 = (
  map: Record<string, number> | undefined,
  codes: string[],
): number => codes.reduce((acc, c) => acc + (map?.[c] ?? 0), 0);

export function parseMoney(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

export function totalCost(row: SummaryRow): string {
  const values = [
    parseMoney(row.totalLabor),
    parseMoney(row.material),
    parseMoney(row.sub),
    parseMoney(row.equip),
    parseMoney(row.other),
  ];
  if (values.every(isNaN)) return "";
  const sum = values.reduce((acc, v) => acc + (isNaN(v) ? 0 : v), 0);
  return sum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Display cells hold formatted strings ("1,234.56"); parse back to a number
 *  so Excel treats the column as numeric (sortable/summable), "" for blanks. */
function numOrBlank(s: string): number | "" {
  if (!s) return "";
  const n = parseMoney(s);
  return Number.isNaN(n) ? "" : n;
}

/** The five Summary sections, each a list of display rows. */
export type SummarySections = {
  disciplines: SummaryRow[];
  indirects: SummaryRow[];
  adminHomeOffice: SummaryRow[];
  engineering: SummaryRow[];
  tic: SummaryRow[];
};

/**
 * Roll the project's aggregate estimate totals into the Summary page's five
 * sections. Pure — a function of `dbTotals` alone (undefined before the totals
 * load, in which case every bucket reads 0). This is where the load-bearing
 * carve-outs live: Grout (29X) is summed from L1 buckets and subtracted from
 * Concrete's digit-2 totals so it isn't double-counted, and Craft Support Labor
 * overrides the Indirects row from its own dedicated totals.
 */
export function buildSummaryRows(
  dbTotals: ProjectFefRowTotals | undefined,
): SummarySections {
  // Grout (29X) shares leading digit "2" with Concrete, so it can't be a digit
  // bucket — roll it up from the L1 buckets instead and carve it out of the
  // Concrete digit-2 totals so it isn't double-counted.
  const groutTotals = {
    material: sumL1(dbTotals?.materialsByL1, GROUT_L1_CODES),
    labor: sumL1(dbTotals?.laborByL1, GROUT_L1_CODES),
    hours: sumL1(dbTotals?.laborHoursByL1, GROUT_L1_CODES),
    quantity: sumL1(dbTotals?.quantityByL1, GROUT_L1_CODES),
  };

  const disciplineRows: SummaryRow[] = [];
  for (const { label, uom, digit } of SUMMARY_DISCIPLINES) {
    let material = digit !== null ? (dbTotals?.materialsByDigit[digit] ?? 0) : 0;
    let labor = digit !== null ? (dbTotals?.laborByDigit[digit] ?? 0) : 0;
    let hours = digit !== null ? (dbTotals?.laborHoursByDigit[digit] ?? 0) : 0;
    let quantity = digit !== null ? (dbTotals?.quantityByDigit[digit] ?? 0) : 0;
    if (digit === "2") {
      material -= groutTotals.material;
      labor -= groutTotals.labor;
      hours -= groutTotals.hours;
      quantity -= groutTotals.quantity;
    }
    // Rows like "Structural Steel Shop" / "Piping Shop" have no underlying
    // discipline, so neither id nor route are set and no link renders.
    disciplineRows.push(
      buildSummaryRow(
        label,
        uom,
        { material, labor, hours, quantity },
        disciplineBySummaryLabel[label],
      ),
    );
    // Insert the Grout row immediately after Concrete.
    if (digit === "2") {
      disciplineRows.push(
        buildSummaryRow("Grout", "HR", groutTotals, disciplineById["grout"]),
      );
    }
  }

  const craftSupportTotal = dbTotals?.craftSupportLabor ?? 0;
  const craftSupportHours = dbTotals?.craftSupportLaborHours ?? 0;
  const craftSupportRate =
    craftSupportHours > 0 && craftSupportTotal > 0
      ? craftSupportTotal / craftSupportHours
      : 0;
  const indirectRows: SummaryRow[] = makeRows(INDIRECTS).map((row) => {
    if (
      row.description === "Craft Support Labor" &&
      (craftSupportTotal > 0 || craftSupportHours > 0)
    ) {
      return {
        ...row,
        hrs: craftSupportHours > 0 ? formatMoney(craftSupportHours) : "",
        rate: craftSupportRate > 0 ? formatMoney(craftSupportRate) : "",
        totalLabor:
          craftSupportTotal > 0 ? formatMoney(craftSupportTotal) : "",
      };
    }
    return row;
  });

  const engineeringRows: SummaryRow[] = SUMMARY_ENGINEERING.map(
    ({ label, uom, l1 }) => {
      const materialTotal = dbTotals?.materialsByL1[l1] ?? 0;
      const laborTotal = dbTotals?.laborByL1[l1] ?? 0;
      const laborHours = dbTotals?.laborHoursByL1[l1] ?? 0;
      const quantity = dbTotals?.quantityByL1[l1] ?? 0;
      const unitRate =
        quantity > 0 && laborHours > 0 ? laborHours / quantity : 0;
      const rate =
        laborHours > 0 && laborTotal > 0 ? laborTotal / laborHours : 0;
      return {
        description: label,
        ...emptyRow(),
        uom,
        qty: quantity > 0 ? formatMoney(quantity) : "",
        unitRate: unitRate > 0 ? formatMoney(unitRate) : "",
        hrs: laborHours > 0 ? formatMoney(laborHours) : "",
        rate: rate > 0 ? formatMoney(rate) : "",
        material: materialTotal > 0 ? formatMoney(materialTotal) : "",
        totalLabor: laborTotal > 0 ? formatMoney(laborTotal) : "",
      };
    },
  );

  const adminHomeOfficeRows: SummaryRow[] = SUMMARY_ADMIN_HOME_OFFICE.map(
    ({ label, uom, l1, l1l2 }) => {
      const totals = l1
        ? {
            material: dbTotals?.materialsByL1[l1] ?? 0,
            labor: dbTotals?.laborByL1[l1] ?? 0,
            hours: dbTotals?.laborHoursByL1[l1] ?? 0,
            quantity: dbTotals?.quantityByL1[l1] ?? 0,
          }
        : {
            material: dbTotals?.materialsByL1L2[l1l2 ?? ""] ?? 0,
            labor: dbTotals?.laborByL1L2[l1l2 ?? ""] ?? 0,
            hours: dbTotals?.laborHoursByL1L2[l1l2 ?? ""] ?? 0,
            quantity: dbTotals?.quantityByL1L2[l1l2 ?? ""] ?? 0,
          };
      return buildSummaryRow(label, uom, totals);
    },
  );

  const ticRows = makeRows(TIC_BEFORE_CONTINGENCY);

  return {
    disciplines: disciplineRows,
    indirects: indirectRows,
    adminHomeOffice: adminHomeOfficeRows,
    engineering: engineeringRows,
    tic: ticRows,
  };
}

/** A summary row tagged with the section it came from, for the CSV export. */
export type SummaryExportRow = { section: string; row: SummaryRow };

/** Section display names + order for the CSV export. */
const CSV_SECTIONS: { key: keyof SummarySections; name: string }[] = [
  { key: "disciplines", name: "Disciplines" },
  { key: "indirects", name: "Indirects" },
  { key: "adminHomeOffice", name: "Administration & Home Office" },
  { key: "engineering", name: "Engineering & Design" },
  { key: "tic", name: "TIC Before Contingency" },
];

/** Flatten the sections into section-tagged rows in display order for CSV. */
export function toSummaryExportRows(
  sections: SummarySections,
): SummaryExportRow[] {
  return CSV_SECTIONS.flatMap(({ key, name }) =>
    sections[key].map((row) => ({ section: name, row })),
  );
}

/** Estimate-summary CSV columns — mirror the on-screen table plus a leading
 *  Section column, with the money/quantity cells emitted as numbers. */
export const ESTIMATE_CSV_COLUMNS: CsvColumn<SummaryExportRow>[] = [
  { header: "Section", get: (r) => r.section },
  { header: "Description", get: (r) => r.row.description },
  { header: "QTY", get: (r) => numOrBlank(r.row.qty) },
  { header: "UOM", get: (r) => r.row.uom },
  { header: "Unit Rate", get: (r) => numOrBlank(r.row.unitRate) },
  { header: "HRS", get: (r) => numOrBlank(r.row.hrs) },
  { header: "Rate", get: (r) => numOrBlank(r.row.rate) },
  { header: "Total Labor", get: (r) => numOrBlank(r.row.totalLabor) },
  { header: "Material", get: (r) => numOrBlank(r.row.material) },
  { header: "Sub", get: (r) => numOrBlank(r.row.sub) },
  { header: "Equip", get: (r) => numOrBlank(r.row.equip) },
  { header: "Other", get: (r) => numOrBlank(r.row.other) },
  { header: "Total Cost", get: (r) => numOrBlank(totalCost(r.row)) },
];
