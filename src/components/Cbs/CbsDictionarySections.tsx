import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { CbsTreeRow } from "~/utils/cbs";
import { cbsIsActive } from "~/lib/cbs-tree";
import type { CbsExportView } from "~/lib/cbs-export";
import { CbsDictionaryBrowser } from "~/components/Cbs/CbsDictionaryBrowser";

/**
 * The whole catalog as two collapsible datasets: the active Cost Accounts and
 * the full dictionary with every status. Admin → Master CBS; project-scoped
 * pages render a single `CbsDictionaryBrowser` instead.
 */

/** A collapsible section over one view of a dictionary. */
function CbsSection({
  title,
  description,
  items,
  sourceNote,
  emptyMessage,
  defaultOpen = false,
  exportView,
  focusCode = null,
  statusFilter = false,
  dictionaryFilters = false,
}: {
  title: string;
  description: string;
  items: CbsTreeRow[];
  sourceNote: string;
  emptyMessage: string;
  defaultOpen?: boolean;
  exportView: CbsExportView;
  focusCode?: string | null;
  /** Offer the Status filter — see `CbsDictionaryBrowser`. */
  statusFilter?: boolean;
  /** Offer the Row Type and Material Type filters — the Dictionary's own. */
  dictionaryFilters?: boolean;
}) {
  return (
    <CbsSectionShell
      title={title}
      description={description}
      badge={`${items.length.toLocaleString()} rows`}
      defaultOpen={defaultOpen}
    >
      <CbsDictionaryBrowser
        items={items}
        sourceNote={sourceNote}
        emptyMessage={emptyMessage}
        exportView={exportView}
        focusCode={focusCode}
        statusFilter={statusFilter}
        rowTypeFilter={dictionaryFilters}
        materialTypeFilter={dictionaryFilters}
      />
    </CbsSectionShell>
  );
}

/**
 * The collapsible chrome this page's sections share — header, chevron, count
 * pill — with the body mounted only while open, so a closed section never
 * builds its tree.
 */
function CbsSectionShell({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  badge: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
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
          {badge}
        </span>
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </section>
  );
}

const MASTER_SOURCE_NOTE =
  "Source: the CBS Dictionary, in full — no project allow-list applied. Colors mirror the source workbook's outline levels.";
const MASTER_EMPTY = "No CBS items in the catalog.";

/**
 * The whole catalog as two collapsible datasets: the active Cost Accounts and
 * the full dictionary with every status. The Admin → Master CBS page;
 * project-scoped pages render a single `CbsDictionaryBrowser`.
 */
export function CbsDictionarySections({
  items,
  focusCode = null,
}: {
  items: CbsTreeRow[];
  /** A display code to open on arrival — the `?code=` deep link. */
  focusCode?: string | null;
}) {
  // The same rows as the Dictionary below — every cost line, generated S / M
  // rows included — minus anything Inactive or Retired. This is the list
  // people pick codes from, and the Dictionary is the one place that still
  // shows everything, so nothing becomes unfindable by being hidden here.
  const accounts = React.useMemo(
    () => items.filter((r) => cbsIsActive(r.status)),
    [items],
  );

  // Both sections are open already, so this decides which one FOLLOWS the
  // deep link. Handing it to both would scroll two trees and select the row
  // twice; Cost Accounts wins when both hold the code, since it is the
  // shorter list and the one people work from.
  const inAccounts =
    focusCode !== null && accounts.some((r) => r.displayCode === focusCode);
  const inDictionary =
    focusCode !== null &&
    !inAccounts &&
    items.some((r) => r.displayCode === focusCode);

  return (
    <div className="flex flex-col gap-4">
      <CbsSection
        title="Cost Accounts"
        description="Every active code, each cost type on its own line. Inactive and retired codes are listed in the CBS Dictionary below."
        items={accounts}
        sourceNote={MASTER_SOURCE_NOTE}
        emptyMessage={MASTER_EMPTY}
        defaultOpen
        exportView="codeBook"
        focusCode={inAccounts ? focusCode : null}
      />
      <CbsSection
        title="CBS Dictionary"
        description="Every row in the CBS, each cost type on its own line — active, inactive and retired, with a Status filter to narrow them."
        items={items}
        sourceNote={MASTER_SOURCE_NOTE}
        emptyMessage={MASTER_EMPTY}
        defaultOpen
        exportView="dictionary"
        focusCode={inDictionary ? focusCode : null}
        statusFilter
        dictionaryFilters
      />
    </div>
  );
}
