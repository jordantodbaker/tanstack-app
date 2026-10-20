import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { projectCodeUsageQueryOptions } from "~/utils/cbs-insights";
import { disciplineById } from "~/config/disciplines";
import type { UsageDivision, UsageModel } from "~/lib/cbs-usage";

/**
 * Code Usage — the project's allow-list against what the estimate actually
 * books to.
 *
 * Setup grants generously, so the Project Cost Code List says what is
 * permitted and never what is used; a project can hold thousands of codes and
 * touch a few hundred. Each row here is a CBS division, shaded by how much of
 * what it was granted is doing any work, with the unused codes listed first
 * when you open it, because those are the ones that get revoked.
 */

const pct = (used: number, granted: number) =>
  granted === 0 ? 0 : Math.round((used / granted) * 100);

/** Cold means granted and untouched; warm means the grants are earning. */
function heatClass(p: number): string {
  if (p === 0) return "bg-slate-100 text-slate-500";
  if (p < 20) return "bg-rose-100 text-rose-900";
  if (p < 50) return "bg-amber-100 text-amber-900";
  if (p < 80) return "bg-lime-100 text-lime-900";
  return "bg-emerald-200 text-emerald-900";
}

function DivisionRow({ d }: { d: UsageDivision }) {
  const [open, setOpen] = React.useState(false);
  const p = pct(d.used, d.granted);
  const unused = d.granted - d.used;

  return (
    <>
      <tr
        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
        onClick={() => setOpen((o) => !o)}
      >
        <th scope="row" className="max-w-sm px-3 py-1.5 text-left font-normal">
          <span className="flex items-center gap-1.5">
            <ChevronRight
              size={13}
              className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            />
            <code className="shrink-0 font-mono text-slate-500">{d.l1}</code>
            <span className="truncate text-slate-800">{d.name}</span>
            {d.discipline && (
              <span className="shrink-0 text-slate-400">
                {disciplineById[d.discipline]?.label ?? d.discipline}
              </span>
            )}
          </span>
        </th>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
          {d.granted.toLocaleString()}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
          {d.used.toLocaleString()}
        </td>
        <td
          className={`px-3 py-1.5 text-right font-semibold tabular-nums ${unused > 0 ? "text-slate-800" : "text-slate-300"}`}
        >
          {unused.toLocaleString()}
        </td>
        <td className="px-2 py-1.5">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full ${p === 0 ? "" : p < 20 ? "bg-rose-400" : p < 50 ? "bg-amber-400" : p < 80 ? "bg-lime-500" : "bg-emerald-500"}`}
                style={{ width: `${p}%` }}
              />
            </span>
            <span
              className={`w-11 shrink-0 rounded px-1 text-right text-xs tabular-nums ${heatClass(p)}`}
            >
              {p}%
            </span>
          </span>
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {d.rows.toLocaleString()}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 bg-slate-50 px-10 py-3 md:grid-cols-2 xl:grid-cols-3">
              {d.items.map((i) => (
                <div key={i.displayCode} className="flex gap-2 text-xs">
                  <code className="shrink-0 font-mono text-slate-500">
                    {i.displayCode}
                  </code>
                  <span
                    className={`truncate ${i.rows === 0 ? "text-slate-400" : "text-slate-800"}`}
                  >
                    {i.name}
                  </span>
                  <span
                    className={`ml-auto shrink-0 tabular-nums ${i.rows === 0 ? "text-slate-300" : "text-emerald-700"}`}
                  >
                    {i.rows === 0 ? "unused" : `${i.rows}`}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UsageBody({ model }: { model: UsageModel }) {
  const [unusedOnly, setUnusedOnly] = React.useState(false);
  const divisions = React.useMemo(
    () =>
      unusedOnly
        ? model.divisions.filter((d) => d.granted - d.used > 0)
        : model.divisions,
    [model.divisions, unusedOnly],
  );
  const { granted, used, rows } = model.totals;

  return (
    <div className="px-4 pb-4 pt-3 md:px-5">
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
        <span>
          <strong className="tabular-nums">{granted.toLocaleString()}</strong>{" "}
          codes granted
        </span>
        <span>
          <strong className="tabular-nums">{used.toLocaleString()}</strong> used
          by the estimate ({pct(used, granted)}%)
        </span>
        <span>
          <strong className="tabular-nums">
            {(granted - used).toLocaleString()}
          </strong>{" "}
          granted and never used
        </span>
        <span className="text-slate-400">
          {rows.toLocaleString()} estimate rows, all versions
        </span>
      </div>

      {model.unknown.length > 0 && (
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="text-xs font-semibold text-sky-900">
            Read the percentages with care —{" "}
            {model.unknown.length.toLocaleString()} of the codes this estimate
            uses are not CBS dictionary codes at all.
          </p>
          <p className="mt-0.5 text-xs text-sky-800">
            The take-off pages build a code from an account plus the row&rsquo;s
            own attributes — metallurgy, bore size, fabricate/erect — so a
            piping row books to something like{" "}
            <code className="font-mono">604-MB-ST00-00-C</code>, which was never
            a dictionary row. Those rows cannot be matched to a granted code, so
            the utilization below counts only the codes that are shared between
            the estimate and the catalog. Treat it as a floor, not a verdict.
          </p>
        </div>
      )}

      <label className="mb-2 flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={unusedOnly}
          onChange={(e) => setUnusedOnly(e.target.checked)}
        />
        Only divisions with codes that have never been used
      </label>

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">
                Division
              </th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">
                Granted
              </th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">
                Used
              </th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">
                Unused
              </th>
              <th className="px-2 py-2 text-left font-semibold text-slate-700">
                Utilization
              </th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">
                Rows
              </th>
            </tr>
          </thead>
          <tbody>
            {divisions.map((d) => (
              <DivisionRow key={d.l1} d={d} />
            ))}
          </tbody>
        </table>
      </div>

      {model.ungranted.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">
            {model.ungranted.length} dictionary code
            {model.ungranted.length === 1 ? "" : "s"} used by the estimate but
            not granted to this project
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            These ARE real CBS codes, so this is an allow-list gap rather than a
            built code. One reaches an estimate by paste-from-Excel, or by being
            revoked after the rows were written. They still total, but nobody
            can pick them again.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {model.ungranted.slice(0, 12).map((u) => (
              <li key={u.displayCode} className="flex gap-2 text-xs">
                <code className="font-mono text-amber-900">
                  {u.displayCode}
                </code>
                <span className="text-amber-700">
                  {u.rows} row{u.rows === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CbsUsageView({ projectId }: { projectId: number }) {
  const query = useQuery(projectCodeUsageQueryOptions(projectId));
  if (query.isPending) {
    return <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>;
  }
  if (query.isError) {
    return (
      <div className="px-4 py-6 text-sm text-red-600">
        Failed to load code usage for this project.
      </div>
    );
  }
  if (query.data.totals.granted === 0) {
    return (
      <div className="px-4 py-6 text-sm text-slate-500">
        No cost codes are granted to this project yet — grant some on the Setup
        page and this page will show how much of the estimate uses them.
      </div>
    );
  }
  return <UsageBody model={query.data} />;
}
