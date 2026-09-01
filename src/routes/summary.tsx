import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "~/components/ui/button";
import { downloadCsv, rowsToCsv, todayStamp } from "~/lib/csv-export";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";
import { useSelectedVersion } from "~/lib/selected-version";
import { projectFefRowTotalsQueryOptions } from "~/utils/projectTotals";
import { SnapshotsSection } from "~/components/SnapshotsSection";
import { BudgetSection } from "~/components/BudgetSection";
import {
  buildSummaryRows,
  toSummaryExportRows,
  totalCost,
  ESTIMATE_CSV_COLUMNS,
  type SummaryRow,
} from "~/lib/summary-rows";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { resolveVersionIdForLoader } from "~/utils/versionCookie";

export const Route = createFileRoute("/summary")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    const versionId = await resolveVersionIdForLoader(projectId);
    if (versionId !== null) {
      await tryPrefetchProjectQuery(
        context.queryClient.ensureQueryData(
          projectFefRowTotalsQueryOptions(versionId),
        ),
      );
    }
  },
  component: SummaryPage,
});

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
            // A row may stand for more than one sheet ("Concrete & Grout"), so
            // count every discipline it reports for.
            const invalidCount = [
              ...(row.disciplineId ? [row.disciplineId] : []),
              ...(row.alsoCovers ?? []),
            ].reduce((n, id) => n + (invalidByDiscipline?.[id] ?? 0), 0);
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
  const { versionId } = useSelectedVersion();
  const { data: dbTotals } = useQuery(
    projectFefRowTotalsQueryOptions(versionId),
  );

  const sections = buildSummaryRows(dbTotals);

  function handleExportCsv() {
    downloadCsv(
      `estimate-summary-${todayStamp()}.csv`,
      rowsToCsv(toSummaryExportRows(sections), ESTIMATE_CSV_COLUMNS),
    );
  }

  return (
    <main className="p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Summary</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={!dbTotals}
        >
          <Download className="mr-1 size-4" />
          Export CSV
        </Button>
      </div>
      <Accordion
        type="multiple"
        defaultValue={[
          "disciplines",
          "indirects",
          "admin-home-office",
          "engineering-design",
          "tic-before-contingency",
        ]}
      >
        <AccordionItem value="disciplines">
          <AccordionTrigger>Disciplines</AccordionTrigger>
          <AccordionContent>
            <SummaryTable
              rows={sections.disciplines}
              invalidByDiscipline={dbTotals?.invalidByDiscipline}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="indirects">
          <AccordionTrigger>Indirects</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={sections.indirects} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="admin-home-office">
          <AccordionTrigger>Administration &amp; Home Office</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={sections.adminHomeOffice} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="engineering-design">
          <AccordionTrigger>Engineering & Design</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={sections.engineering} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="tic-before-contingency">
          <AccordionTrigger>TIC Before Contingency</AccordionTrigger>
          <AccordionContent>
            <SummaryTable rows={sections.tic} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <BudgetSection />
      <SnapshotsSection />
    </main>
  );
}
