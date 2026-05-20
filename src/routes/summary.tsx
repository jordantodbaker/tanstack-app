import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";
import {
  disciplines,
  SUMMARY_DISCIPLINES,
  type DisciplineConfig,
} from "~/config/disciplines";
import { formatMoney } from "~/lib/formatting";
import { useSelectedProject } from "~/lib/selected-project";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import { readProjectIdForLoader } from "~/utils/projectCookie";

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

export const Route = createFileRoute("/summary")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    if (projectId !== null) {
      await context.queryClient.ensureQueryData(
        projectFefRowTotalsQueryOptions(projectId),
      );
    }
  },
  component: SummaryPage,
});

type SummaryRow = {
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

function parseMoney(s: string): number {
  return parseFloat(s.replace(/,/g, ""));
}

function totalCost(row: SummaryRow): string {
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

const columns: {
  key: keyof SummaryRow | "totalCost";
  header: string;
  width?: string;
  currency?: boolean;
}[] = [
  { key: "description", header: "Description", width: "w-48" },
  { key: "qty", header: "QTY", width: "w-20" },
  { key: "uom", header: "UOM", width: "w-20" },
  { key: "unitRate", header: "Unit Rate", width: "w-24" },
  { key: "hrs", header: "HRS", width: "w-20" },
  { key: "rate", header: "Rate", width: "w-20", currency: true },
  { key: "totalLabor", header: "Total Labor $", width: "w-28", currency: true },
  { key: "material", header: "Material $", width: "w-24", currency: true },
  { key: "sub", header: "Sub $", width: "w-20", currency: true },
  { key: "equip", header: "Equip $", width: "w-20", currency: true },
  { key: "other", header: "Other $", width: "w-20", currency: true },
  { key: "totalCost", header: "Total Cost $", width: "w-28", currency: true },
];

function SummaryTable({
  rows,
  invalidByDiscipline,
}: {
  rows: SummaryRow[];
  /** Map of discipline-id → invalid-Take-Off-row count, used to render the
   *  "errors" link in each row's description cell. Omit for tables (e.g.
   *  Indirects) where no row corresponds to a Take-Off-bearing discipline. */
  invalidByDiscipline?: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-300">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.width} px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 whitespace-nowrap`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const invalidCount = row.disciplineId
              ? (invalidByDiscipline?.[row.disciplineId] ?? 0)
              : 0;
            return (
            <tr key={row.description} className="border-b border-gray-200">
              {columns.map((col) => {
                if (col.key === "description") {
                  return (
                    <td
                      key={col.key}
                      className="px-3 py-1.5 border border-gray-200 font-medium text-gray-800 whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        <span>{row.description}</span>
                        {invalidCount > 0 && row.disciplineTo && (
                          <Link
                            to={row.disciplineTo}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                            title={`${invalidCount} invalid Take Off row${invalidCount === 1 ? "" : "s"} — open the sheet`}
                          >
                            <AlertTriangle size={12} />
                            <span>
                              {invalidCount} error
                              {invalidCount === 1 ? "" : "s"}
                            </span>
                          </Link>
                        )}
                      </div>
                    </td>
                  );
                }
                const value =
                  col.key === "totalCost"
                    ? totalCost(row)
                    : row[col.key as keyof Omit<SummaryRow, "description">];
                const display = col.currency && value ? `$${value}` : value;
                return (
                  <td
                    key={col.key}
                    className="px-3 py-1.5 border border-gray-200 text-right text-slate-500 bg-slate-100"
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryPage() {
  const { projectId } = useSelectedProject();
  const { data: dbTotals } = useQuery(
    projectFefRowTotalsQueryOptions(projectId),
  );

  const disciplineRows: SummaryRow[] = SUMMARY_DISCIPLINES.map(
    ({ label, uom, digit }) => {
      const materialTotal =
        digit !== null ? (dbTotals?.materialsByDigit[digit] ?? 0) : 0;
      const laborTotal =
        digit !== null ? (dbTotals?.laborByDigit[digit] ?? 0) : 0;
      const laborHours =
        digit !== null ? (dbTotals?.laborHoursByDigit[digit] ?? 0) : 0;
      const quantity =
        digit !== null ? (dbTotals?.quantityByDigit[digit] ?? 0) : 0;
      const unitRate =
        quantity > 0 && laborHours > 0 ? laborHours / quantity : 0;
      const rate = laborHours > 0 && laborTotal > 0 ? laborTotal / laborHours : 0;
      // Rows like "Structural Steel Shop" / "Piping Shop" have no underlying
      // discipline, so neither id nor route are set and no link renders.
      const matched = disciplineBySummaryLabel[label];
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
        disciplineId: matched?.id,
        disciplineTo: matched?.to,
      };
    },
  );

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

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Summary</h1>
      <Accordion type="multiple" defaultValue={["disciplines", "indirects"]}>
        <AccordionItem value="disciplines">
          <AccordionTrigger>Disciplines</AccordionTrigger>
          <AccordionContent>
            <SummaryTable
              rows={disciplineRows}
              invalidByDiscipline={dbTotals?.invalidByDiscipline}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="indirects">
          <AccordionTrigger>Indirects</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={indirectRows} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  );
}
