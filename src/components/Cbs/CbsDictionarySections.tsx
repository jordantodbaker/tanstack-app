import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { CbsTreeRow } from "~/utils/cbs";
import {
  cbsIsActive,
  cbsIsBackbone,
  type CbsBadge,
  type CbsCostTypeKey,
  type CbsCostTypeMatch,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
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
  costTypeMatch,
  showRowTypeCounts,
  exportView,
  focusCode = null,
}: {
  title: string;
  description: string;
  items: CbsTreeRow[];
  badgesFor?: (
    node: Node,
    only: Record<CbsCostTypeKey, boolean>,
  ) => readonly CbsBadge[];
  sourceNote: string;
  emptyMessage: string;
  defaultOpen?: boolean;
  /** How this list reads a cost-type filter — see `CbsCostTypeMatch`. */
  costTypeMatch?: CbsCostTypeMatch;
  /** Off for the accounts list, where the breakdown is always "0 sub · 0 material". */
  showRowTypeCounts?: boolean;
  exportView: CbsExportView;
  focusCode?: string | null;
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
        badgesFor={badgesFor}
        sourceNote={sourceNote}
        emptyMessage={emptyMessage}
        costTypeMatch={costTypeMatch}
        showRowTypeCounts={showRowTypeCounts}
        exportView={exportView}
        focusCode={focusCode}
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
 * The whole catalog as two collapsible datasets: a Code Book of original rows
 * and the full dictionary including the generated S/M rows. The Admin → Master
 * CBS page; project-scoped pages render a single `CbsDictionaryBrowser`.
 */
export function CbsDictionarySections({
  items,
  focusCode = null,
}: {
  items: CbsTreeRow[];
  /** A display code to open on arrival — the `?code=` deep link. */
  focusCode?: string | null;
}) {
  // One row per account: the "-0" backbone only. Its L / S / M / E / O
  // variants are the same account priced a different way, and the badges
  // already say which of them exist, so listing them again doubles the tree
  // for no new information.
  //
  // Retired accounts are dropped too. This is the list people pick codes from,
  // and the Dictionary below is the one place that still shows everything, so
  // nothing becomes unfindable by being hidden here.
  const accounts = React.useMemo(
    () => items.filter((r) => cbsIsBackbone(r) && cbsIsActive(r.status)),
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
        description="One row per active account — the codes ending in 0. L / S / M / E / O mark which cost types that account carries. Retired codes are listed in the CBS Dictionary below."
        items={accounts}
        badgesFor={cbsFlagBadgesFor}
        sourceNote={MASTER_SOURCE_NOTE}
        emptyMessage={MASTER_EMPTY}
        showRowTypeCounts={false}
        defaultOpen
        exportView="codeBook"
        focusCode={inAccounts ? focusCode : null}
      />
      <CbsSection
        title="CBS Dictionary"
        description="Every row in the CBS, each cost type on its own line — the accounts above plus their L / S / M / E / O variants, and retired codes too."
        items={items}
        sourceNote={MASTER_SOURCE_NOTE}
        emptyMessage={MASTER_EMPTY}
        defaultOpen
        costTypeMatch="code"
        exportView="dictionary"
        focusCode={inDictionary ? focusCode : null}
      />
    </div>
  );
}
