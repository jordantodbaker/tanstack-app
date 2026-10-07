import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import {
  cbsItemDetailQueryOptions,
  type CbsItemDetail,
  type CbsTreeRow,
} from "~/utils/cbs";
import type { CbsTreeNode } from "~/lib/cbs-tree";
import { cbsColorForLevel, type CbsLevelColor } from "~/config/cbs-level-colors";

/**
 * The right-hand detail pane for a selected CBS row: every workbook column it
 * has a value for, in the workbook's own order.
 *
 * Shared by the Setup allow-list editor and the two dictionary pages, which all
 * render the same slim tree row and so can't show this from what they already
 * hold — the full column set is fetched per selected row and cached for the
 * session (`cbsItemDetailQueryOptions`).
 */

/** Detail rows in the workbook's column order. */
const DETAIL_FIELDS: {
  label: string;
  get: (i: CbsItemDetail) => string | null | undefined;
}[] = [
  { label: "UOM", get: (i) => i.uom },
  { label: "Sub Code", get: (i) => yesNo(i.subReporting) },
  { label: "Material Code", get: (i) => yesNo(i.materialCode) },
  { label: "Material Type", get: (i) => i.materialType },
  { label: "Cost Center", get: (i) => i.costCenter },
  { label: "Cost Classification", get: (i) => i.costClassification },
  { label: "Status", get: (i) => i.status },
  { label: "Account Description", get: (i) => i.accountDescription },
  { label: "L2 Description", get: (i) => i.l2Description },
  { label: "Core", get: (i) => i.core },
  { label: "Core Extension", get: (i) => i.coreExtension },
  { label: "WBS", get: (i) => i.wbs },
  { label: "P6 Cost Account (L1-4)", get: (i) => i.p6CostAccount },
  { label: "G/L", get: (i) => i.gl },
  { label: "Discipline", get: (i) => i.discipline },
  { label: "Cost Code", get: (i) => i.costCode },
  { label: "Description", get: (i) => i.description },
  { label: "Notes", get: (i) => i.notes },
  { label: "Generated From", get: (i) => i.generatedFrom },
  { label: "Row Type", get: (i) => rowTypeLabel(i.rowType) },
];

function yesNo(v: boolean | null): string | null {
  if (v === true) return "YES";
  if (v === false) return "NO";
  return null;
}

export function rowTypeLabel(rowType: CbsTreeRow["rowType"]): string {
  if (rowType === "SUB") return "Generated - Sub Code";
  if (rowType === "MATERIAL") return "Generated - Material Code";
  return "Original";
}

function DetailBody({
  node,
  color,
  onClose,
}: {
  node: CbsTreeNode;
  color: CbsLevelColor;
  onClose: () => void;
}) {
  const { item } = node;
  const detail = useQuery(cbsItemDetailQueryOptions(item.id));
  const rows = detail.data
    ? DETAIL_FIELDS.map((f) => ({ label: f.label, value: f.get(detail.data) }))
        .filter((r): r is { label: string; value: string } => !!r.value)
    : [];

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-start justify-between gap-2 rounded-t-lg px-4 py-3"
        style={{ backgroundColor: color.fill, color: color.text }}
      >
        <div className="min-w-0">
          <div className="font-mono text-xs tabular-nums opacity-80">
            {item.displayCode}
          </div>
          <div className="text-sm font-semibold break-words">{item.name}</div>
          <div className="mt-0.5 text-[11px] opacity-70">
            Level {node.level} · {rowTypeLabel(item.rowType)}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="shrink-0 rounded p-0.5 hover:bg-black/10"
        >
          <X size={15} />
        </button>
      </div>
      {detail.isPending ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> Loading detail…
        </div>
      ) : detail.isError ? (
        <p className="px-4 py-6 text-sm text-red-600">
          Failed to load this row's detail.
        </p>
      ) : (
        <dl className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-4 py-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[9rem_1fr] gap-2 py-1.5">
              <dt className="text-xs font-medium text-slate-500">{r.label}</dt>
              <dd className="break-words text-slate-800">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * The detail pane and its empty state as one bordered aside, so both callers
 * place it the same way. Hidden below `lg`, where there is no room beside the
 * tree. Keyed on the selected row so switching rows remounts the body and
 * cannot show the previous row's fields under a new header.
 */
export function CbsDetailPanel({
  selected,
  onClose,
}: {
  selected: CbsTreeNode | null;
  onClose: () => void;
}) {
  return (
    <aside className="hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:block lg:self-start">
      {selected ? (
        <DetailBody
          key={selected.pathKey}
          node={selected}
          color={cbsColorForLevel(selected.level)}
          onClose={onClose}
        />
      ) : (
        <p className="p-6 text-sm text-slate-500">
          Select a row to see its full CBS detail (UOM, cost code, account,
          discipline, description, and more).
        </p>
      )}
    </aside>
  );
}
