import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { CbsTreeRow } from "~/utils/cbs";
import { isCbsLegacyCode } from "~/lib/cbs-tree";
import { CBS_VIEWS, type CbsCatalogView } from "~/lib/cbs-views";
import { CbsDictionaryBrowser } from "~/components/Cbs/CbsDictionaryBrowser";

/** A collapsible section over one view of the catalog. */
function CbsSection({
  view,
  items,
  badgeRows,
  focusCode,
}: {
  view: CbsCatalogView;
  items: CbsTreeRow[];
  /** How many rows the view lists. */
  badgeRows: number;
  focusCode: string | null;
}) {
  const { title, description } = CBS_VIEWS[view];
  return (
    <CbsSectionShell
      title={title}
      description={description}
      badge={`${badgeRows.toLocaleString()} rows`}
      defaultOpen
    >
      <CbsDictionaryBrowser view={view} items={items} focusCode={focusCode} />
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
  const accounts = React.useMemo(() => CBS_VIEWS.accounts.rows(items), [items]);

  // Both sections are open already, so this decides which one FOLLOWS the
  // deep link. Handing it to both would scroll two trees and select the row
  // twice; Cost Accounts wins when both hold the code, since it is the
  // shorter list and the one people work from.
  const inAccounts =
    focusCode !== null && accounts.some((r) => r.displayCode === focusCode);
  const inDictionary =
    focusCode !== null &&
    !inAccounts &&
    (isCbsLegacyCode(focusCode) ||
      items.some((r) => r.displayCode === focusCode));

  return (
    <div className="flex flex-col gap-4">
      <CbsSection
        view="accounts"
        items={items}
        badgeRows={accounts.length}
        focusCode={inAccounts ? focusCode : null}
      />
      <CbsSection
        view="dictionary"
        items={items}
        badgeRows={items.length}
        focusCode={inDictionary ? focusCode : null}
      />
    </div>
  );
}
