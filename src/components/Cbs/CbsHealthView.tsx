import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Info,
} from "lucide-react";
import {
  cbsHealthQueryOptions,
  exportCbsHealthCheck,
} from "~/utils/cbs-insights";
import { Button } from "~/components/ui/button";
import { useXlsxExport } from "~/lib/use-xlsx-export";
import { healthHeadline, type HealthCheck } from "~/lib/cbs-health";

/**
 * CBS Health — the checks the import prints once and then forgets.
 *
 * Every defect this page reports has been found at least once by running a
 * script and reading its output. The sharpest is the duplicate display code:
 * the import keeps one row and drops the rest, so an account sits in the
 * workbook and exists nowhere in the app, with nothing anywhere saying so.
 *
 * A passing check is shown too, collapsed and gray. "Nothing reported" and
 * "never asked" are different things, and the page should not blur them.
 */

const TONE = {
  error: {
    icon: AlertTriangle,
    badge: "bg-rose-100 text-rose-900",
    border: "border-rose-200",
    iconColor: "text-rose-600",
  },
  warning: {
    icon: AlertTriangle,
    badge: "bg-amber-100 text-amber-900",
    border: "border-amber-200",
    iconColor: "text-amber-600",
  },
  info: {
    icon: Info,
    badge: "bg-sky-100 text-sky-900",
    border: "border-sky-200",
    iconColor: "text-sky-600",
  },
} as const;

/**
 * "Export Excel" for one check — the findings as a flat worklist.
 *
 * The server rebuilds the file from its own cached report rather than taking
 * the rows from here, so a tab left open overnight cannot export findings that
 * have since been fixed.
 */
function ExportHealthCheckButton({ check }: { check: HealthCheck }) {
  const { busy, failed, start } = useXlsxExport(
    () => exportCbsHealthCheck({ data: { id: check.id } }),
    { export: "cbs-health", id: check.id },
  );

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      className="h-6 px-2 text-xs"
      title={
        failed
          ? "The export failed — try again"
          : `Export all ${check.count.toLocaleString()} rows to Excel`
      }
      onClick={start}
    >
      <FileSpreadsheet size={12} className="mr-1" />
      {busy ? "Exporting…" : failed ? "Failed — retry" : "Export Excel"}
    </Button>
  );
}

/** How many rows show before "Show all". Enough to recognize the pattern. */
const PREVIEW = 10;

/**
 * The affected rows, as a table rather than a sample.
 *
 * Long lists scroll inside a fixed box instead of pushing the next check off
 * the page — 5,000 findings inline would make the rest of the report
 * unreachable.
 */
function FindingsTable({ check }: { check: HealthCheck }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? check.findings : check.findings.slice(0, PREVIEW);
  const hidden = check.findings.length - shown.length;
  const clipped = check.count - check.findings.length;

  return (
    <>
      <div
        className={`mt-2 overflow-auto rounded border border-slate-200 bg-white ${all ? "max-h-96" : ""}`}
      >
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              {/* First, because this list is worked down in the spreadsheet. */}
              <th
                className="px-2 py-1 text-right font-semibold text-slate-600"
                title="Row in the unexpanded Master CBS"
              >
                Row
              </th>
              <th className="px-2 py-1 text-left font-semibold text-slate-600">
                Display Code
              </th>
              <th className="px-2 py-1 text-left font-semibold text-slate-600">
                Name
              </th>
              <th className="px-2 py-1 text-left font-semibold text-slate-600">
                Issue
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f, i) => (
              <tr
                key={`${f.code}-${f.detail}-${i}`}
                className="border-t border-slate-100"
              >
                <td className="whitespace-nowrap px-2 py-1 text-right font-mono tabular-nums text-slate-700">
                  {f.masterRow ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-1 font-mono text-slate-700">
                  {f.code}
                </td>
                <td className="px-2 py-1 text-slate-700">{f.name}</td>
                <td className="px-2 py-1 text-slate-500">{f.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            Show all {check.findings.length.toLocaleString()}
          </button>
        )}
        {all && check.findings.length > PREVIEW && (
          <button
            type="button"
            onClick={() => setAll(false)}
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            Show fewer
          </button>
        )}
        <ExportHealthCheckButton check={check} />
        {clipped > 0 && (
          <span className="text-xs text-slate-400">
            {clipped.toLocaleString()} more in the export only
          </span>
        )}
      </div>
    </>
  );
}

function CheckCard({ check }: { check: HealthCheck }) {
  const clean = check.count === 0;
  const [open, setOpen] = React.useState(!clean && check.severity === "error");
  const tone = TONE[check.severity];
  const Icon = clean ? CheckCircle2 : tone.icon;

  return (
    <div
      className={`overflow-hidden rounded-lg border ${clean ? "border-slate-200" : tone.border}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left ${clean ? "bg-white hover:bg-slate-50" : "bg-white hover:bg-slate-50"}`}
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Icon
          size={15}
          className={`shrink-0 ${clean ? "text-emerald-500" : tone.iconColor}`}
        />
        <span
          className={`text-sm font-semibold ${clean ? "text-slate-500" : "text-slate-800"}`}
        >
          {check.title}
        </span>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${clean ? "bg-slate-100 text-slate-500" : tone.badge}`}
        >
          {clean ? "clear" : check.count.toLocaleString()}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2.5">
          <p className="text-xs text-slate-700">{check.summary}</p>
          {check.action && (
            <p className="mt-1.5 text-xs text-slate-600">
              <strong className="text-slate-700">What to do:</strong>{" "}
              {check.action}
            </p>
          )}
          {check.findings.length > 0 && <FindingsTable check={check} />}
        </div>
      )}
    </div>
  );
}

export function CbsHealthView() {
  const query = useQuery(cbsHealthQueryOptions());

  if (query.isPending) {
    return (
      <div className="px-4 py-6 text-sm text-slate-500">
        Reading the workbook and the catalog…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="px-4 py-6 text-sm text-red-600">
        Failed to run the CBS health checks.
      </div>
    );
  }
  const report = query.data;
  const failing = report.checks.filter((c) => c.count > 0).length;

  return (
    <div className="px-4 pb-4 pt-3 md:px-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600">
        <span
          className={`font-semibold ${failing === 0 ? "text-emerald-700" : "text-slate-800"}`}
        >
          {healthHeadline(report.checks)}
        </span>
        <span className="text-slate-400">
          {report.workbookRows === null
            ? "CBS.xlsx not on this server — workbook checks skipped"
            : `${report.workbookRows.toLocaleString()} rows in CBS.xlsx`}{" "}
          · {report.databaseRows.toLocaleString()} in the database
        </span>
      </div>

      <div className="space-y-2">
        {report.checks.map((c) => (
          <CheckCard key={c.id} check={c} />
        ))}
      </div>
    </div>
  );
}
