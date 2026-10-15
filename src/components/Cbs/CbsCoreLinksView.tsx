import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { cbsCoreLinksQueryOptions } from "~/utils/cbs-core";
import { disciplineById } from "~/config/disciplines";
import type { CoreLinkModel, CoreTarget } from "~/lib/cbs-core-links";

/**
 * Core Code Roll-up — the CBS read down its second axis.
 *
 * A CBS code says where a cost sits; a Core code says what kind of cost it is,
 * by naming the account in 050 Field Indirects it belongs with. Civil's field
 * staff, Concrete's and Piping's all point at 052-00 "Field Staff", so the
 * same estimate rolls up two ways: by discipline, and by core account.
 *
 * The grid is the point. One row per core account, one column per discipline,
 * and a dot where a discipline has nothing pointing at that account — because
 * the coding is a work in progress and the holes are what you need to see. The
 * numbers are links, not money: this view is about structure, not cost.
 */

const label = (id: string) => disciplineById[id]?.label ?? id;
/**
 * Column headings have to be narrow; the full name is on the cell's title.
 * Four characters rather than three, because three collides CONcrete with
 * CONtingency — the one pair that would quietly mislead.
 */
const shortLabel = (id: string) => label(id).slice(0, 4).toUpperCase();

/** Cell shading by how many items a discipline has pointing at an account. */
function cellClass(n: number): string {
  if (n === 0) return "text-slate-300";
  if (n >= 5) return "bg-sky-600 text-white font-semibold";
  if (n >= 3) return "bg-sky-400 text-white";
  if (n === 2) return "bg-sky-200 text-sky-900";
  return "bg-sky-50 text-sky-800";
}

function CoverageBars({ coverage }: { coverage: CoreLinkModel["coverage"] }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {coverage.map((c) => {
        const pct = c.total === 0 ? 0 : Math.round((c.coded / c.total) * 100);
        return (
          <div key={c.discipline} className="flex items-center gap-2 text-xs">
            <span className="w-32 shrink-0 truncate text-slate-600">
              {label(c.discipline)}
            </span>
            <span
              className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={`${pct}% core-coded`}
            >
              <span
                className={`block h-full rounded-full ${pct === 0 ? "" : pct < 25 ? "bg-rose-400" : pct < 75 ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-slate-500">
              {pct}%
            </span>
            <span className="truncate text-slate-400 tabular-nums">
              {c.coded.toLocaleString()} / {c.total.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The items feeding one core account, grouped by the discipline they sit in. */
function TargetItems({ target }: { target: CoreTarget }) {
  const groups = React.useMemo(() => {
    const out = new Map<string, typeof target.items>();
    for (const item of target.items) {
      const list = out.get(item.discipline) ?? [];
      list.push(item);
      out.set(item.discipline, list);
    }
    return [...out];
  }, [target]);

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-3 bg-slate-50 px-4 py-3 md:grid-cols-2 xl:grid-cols-3">
      {groups.map(([discipline, items]) => (
        <div key={discipline}>
          <div className="mb-1 text-xs font-semibold text-slate-700">
            {label(discipline)}
          </div>
          <ul className="space-y-0.5">
            {items.map((i) => (
              <li key={i.displayCode} className="flex gap-2 text-xs">
                <code className="shrink-0 font-mono text-slate-500">
                  {i.displayCode}
                </code>
                <span className="truncate text-slate-700">{i.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Matrix({ model }: { model: CoreLinkModel }) {
  const [openCode, setOpenCode] = React.useState<string | null>(null);
  const [crossOnly, setCrossOnly] = React.useState(true);

  const rows = React.useMemo(
    () =>
      crossOnly
        ? model.targets.filter((t) => t.disciplineCount > 1)
        : model.targets,
    [model.targets, crossOnly],
  );

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 text-slate-600">
          <input
            type="checkbox"
            checked={crossOnly}
            onChange={(e) => setCrossOnly(e.target.checked)}
          />
          Only accounts linked from more than one discipline
        </label>
        <span className="text-slate-400">
          showing {rows.length.toLocaleString()} of{" "}
          {model.targets.length.toLocaleString()} core accounts
        </span>
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700">
                Core account
              </th>
              {model.disciplines.map((d) => (
                <th
                  key={d}
                  title={label(d)}
                  className="px-1 py-2 text-center font-medium text-slate-500"
                >
                  {shortLabel(d)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold text-slate-700">
                Items
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const open = openCode === t.code;
              return (
                <React.Fragment key={t.code}>
                  <tr
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setOpenCode(open ? null : t.code)}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-xs bg-white px-3 py-1.5 text-left font-normal"
                    >
                      <span className="flex items-center gap-1.5">
                        <ChevronRight
                          size={13}
                          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                        />
                        <code className="shrink-0 font-mono text-slate-500">
                          {t.code}
                        </code>
                        <span className="truncate text-slate-800">
                          {t.name}
                        </span>
                      </span>
                    </th>
                    {model.disciplines.map((d) => {
                      const n = t.counts[d] ?? 0;
                      return (
                        <td
                          key={d}
                          title={`${label(d)} → ${t.name}: ${n} item${n === 1 ? "" : "s"}`}
                          className={`px-1 py-1.5 text-center tabular-nums ${cellClass(n)}`}
                        >
                          {n === 0 ? "·" : n}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-700">
                      {t.total}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td
                        colSpan={model.disciplines.length + 2}
                        className="p-0"
                      >
                        <TargetItems target={t} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Problems({ problems }: { problems: CoreLinkModel["problems"] }) {
  const [open, setOpen] = React.useState(false);
  if (problems.length === 0) return null;
  const rows = problems.reduce((n, p) => n + p.count, 0);

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-amber-900"
      >
        <ChevronRight
          size={13}
          className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {rows.toLocaleString()} rows carry a Core code that resolves to nothing
        <span className="font-normal text-amber-700">
          ({problems.length} distinct values)
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {problems.slice(0, 40).map((p) => (
            <li key={p.raw} className="flex flex-wrap gap-x-2 text-xs">
              <code className="font-mono text-amber-900">{p.raw}</code>
              <span className="text-amber-700">
                {p.count.toLocaleString()} row{p.count === 1 ? "" : "s"} —
                {p.reason === "ambiguous"
                  ? ` matches both ${p.candidates.join(" and ")}`
                  : " no such account"}
              </span>
              <span className="text-amber-600/80">e.g. {p.sample[0]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CoreLinksBody() {
  const query = useQuery(cbsCoreLinksQueryOptions());

  if (query.isPending) {
    return <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>;
  }
  if (query.isError) {
    return (
      <div className="px-4 py-6 text-sm text-red-600">
        Failed to load the Core code roll-up.
      </div>
    );
  }
  const model = query.data;

  return (
    <div className="px-4 pb-4 pt-3 md:px-5">
      <p className="mb-3 max-w-4xl text-xs text-slate-500">
        A CBS code says <strong>where</strong> a cost sits; a Core code says{" "}
        <strong>what kind</strong> of cost it is, by pointing at the account in
        050 Field Indirects it belongs with. Each row below is one of those
        accounts, each column a discipline, and each number how many of that
        discipline&rsquo;s codes point at it — so a row reads as &ldquo;every
        discipline&rsquo;s field staff, gathered&rdquo;. A{" "}
        <span className="font-mono">·</span> is a discipline that has not been
        core-coded for that account yet.
      </p>

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
        <span>
          <strong className="tabular-nums">
            {model.totals.coded.toLocaleString()}
          </strong>{" "}
          of {model.totals.rows.toLocaleString()} CBS rows core-coded
        </span>
        <span>
          <strong className="tabular-nums">{model.totals.targets}</strong> core
          accounts
        </span>
        <span>
          <strong className="tabular-nums">
            {model.totals.crossDiscipline}
          </strong>{" "}
          of them pull from more than one discipline
        </span>
      </div>

      <Matrix model={model} />
      <Problems problems={model.problems} />

      <h3 className="mb-2 mt-5 text-xs font-semibold text-slate-700">
        Core coding coverage by discipline
      </h3>
      <CoverageBars coverage={model.coverage} />
    </div>
  );
}

/** The whole roll-up as a page of its own — see `admin.core-codes.tsx`. */
export function CbsCoreLinksView() {
  return <CoreLinksBody />;
}
