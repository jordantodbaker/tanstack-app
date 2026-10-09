import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { CbsTreeRow } from "~/utils/cbs";
import type { CbsBadge, CbsTreeNode } from "~/lib/cbs-tree";
import type { CbsExportView } from "~/lib/cbs-export";
import {
  CbsDictionaryBrowser,
  cbsFlagBadgesFor,
} from "~/components/Cbs/CbsDictionaryBrowser";

/**
 * The whole catalog as two collapsible datasets: a Code Book of original rows
 * and the full dictionary including the generated S/M rows. Admin → Master
 * CBS; project-scoped pages render a single `CbsDictionaryBrowser` instead.
 */

type Node = CbsTreeNode;

/** A collapsible section over one view of a dictionary. */
function CbsSection({
  title,
  description,
  items,
  badgesFor,
  sourceNote,
  emptyMessage,
  defaultOpen = false,
  exportView,
}: {
  title: string;
  description: string;
  items: CbsTreeRow[];
  badgesFor?: (node: Node) => readonly CbsBadge[];
  sourceNote: string;
  emptyMessage: string;
  defaultOpen?: boolean;
  exportView: CbsExportView;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <ChevronRight
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <p className="truncate text-xs text-slate-500">{description}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {items.length.toLocaleString()} rows
        </span>
      </button>
      {/* Mounted only while open, so a closed section never builds its tree. */}
      {open && (
        <div className="border-t border-slate-100">
          <CbsDictionaryBrowser
            items={items}
            badgesFor={badgesFor}
            sourceNote={sourceNote}
            emptyMessage={emptyMessage}
            exportView={exportView}
          />
        </div>
      )}
    </section>
  );
}

const MASTER_SOURCE_NOTE =
  "Source: the CBS Dictionary, in full — no project allow-list applied. Colours mirror the source workbook's outline levels.";
const MASTER_EMPTY = "No CBS items in the catalog.";

/**
 * The whole catalog as two collapsible datasets: a Code Book of original rows
 * and the full dictionary including the generated S/M rows. The Admin → Master
 * CBS page; project-scoped pages render a single `CbsDictionaryBrowser`.
 */
export function CbsDictionarySections({ items }: { items: CbsTreeRow[] }) {
  const originals = React.useMemo(
    () => items.filter((i) => i.rowType === "ORIGINAL"),
    [items],
  );

  return (
    <div className="flex flex-col gap-4">
      <CbsSection
        title="CBS Code Book"
        description="Every CBS row — original rows only. S / M mark a row's own Sub Code / Material Code."
        items={originals}
        badgesFor={cbsFlagBadgesFor}
        sourceNote={MASTER_SOURCE_NOTE}
        emptyMessage={MASTER_EMPTY}
        defaultOpen
        exportView="codeBook"
      />
      <CbsSection
        title="CBS Dictionary"
        description="The complete dictionary — every original row plus the generated S/M rows."
        items={items}
        sourceNote={MASTER_SOURCE_NOTE}
        emptyMessage={MASTER_EMPTY}
        defaultOpen
        exportView="dictionary"
      />
    </div>
  );
}
