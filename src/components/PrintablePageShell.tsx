import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { ProjectOption } from "~/utils/projects";

/**
 * Shared chrome for the printable CVR / FCO / RFI routes. Owns the toolbar,
 * the `<article>` wrapper with the print stylesheet hooks, the company-
 * letterhead header, and the footer. The per-record body lives in
 * `children` and stays in each route file, since each record has its own
 * section layout.
 *
 * Sibling exports (`Section`, `KvGrid`, `SignatureBlock`, `formatDate`) are
 * the small presentation helpers each print page used to duplicate.
 */

export function PrintablePageShell({
  /** Display name of the document type — "Change Variation Request", etc. */
  recordTitle,
  /** Short record id surfaced under the title — e.g. "CVR-001" or "RFI #42". */
  recordNumber,
  /** Pre-resolved status label (each entity has its own labels map). */
  statusLabel,
  /** Project header block; usually resolved via `projectsQueryOptions`. */
  project,
  /** Path of the back link in the on-screen toolbar. Typed to known routes. */
  backTo,
  backLabel,
  /** Footer entity kind — "CVR" / "FCO" / "RFI" — paired with `footerId`. */
  footerKind,
  footerId,
  children,
}: {
  recordTitle: string;
  recordNumber: string;
  statusLabel: string;
  project: ProjectOption | undefined;
  backTo: "/changelog" | "/fco-log" | "/rfis";
  backLabel: string;
  footerKind: string;
  footerId: number;
  children: React.ReactNode;
}) {
  return (
    <main className="max-w-4xl mx-auto p-6 print:p-0 print:max-w-none">
      {/* Toolbar — visible on screen, hidden when printing */}
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>
        <Button onClick={() => window.print()} size="sm">
          <Printer className="size-3.5 mr-1" />
          Print / Save as PDF
        </Button>
      </div>

      <article
        className="bg-white border border-slate-200 rounded-lg p-8 print:border-0 print:rounded-none print:p-0 print:shadow-none"
        // Tighter line-height + smaller default size for the printed page so
        // a typical record fits on one letter-sized page.
        style={{ fontSize: "11pt", lineHeight: 1.4 }}
      >
        <header className="border-b-2 border-slate-800 pb-3 mb-5">
          <div className="flex items-start justify-between">
            <div>
              <img
                src="/logo.png"
                alt=""
                className="h-10 mb-2"
                // SSR / missing-file safety: hide on error rather than show the
                // broken-image glyph in the printed PDF.
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              {project && (
                <div className="text-sm text-slate-700">
                  <div className="font-semibold">{project.name}</div>
                  {project.description && (
                    <div className="text-xs text-slate-500">
                      {project.description}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xl font-bold uppercase tracking-wide text-slate-800">
                {recordTitle}
              </div>
              <div className="mt-1 text-sm font-mono text-slate-700">
                {recordNumber}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Status:{" "}
                <span className="font-semibold uppercase text-slate-800">
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
        </header>

        {children}

        <footer className="mt-8 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
          <span>
            Generated {new Date().toLocaleString()} · {footerKind} id{" "}
            {footerId}
          </span>
          <span>Page 1</span>
        </footer>
      </article>
    </main>
  );
}

/**
 * Titled section in a printable page. `print:break-inside-avoid` keeps each
 * section from being split across pages when the browser paginates.
 */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 print:break-inside-avoid">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5 border-b border-slate-200 pb-0.5">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Compact label/value grid used inside Sections for metadata. */
export function KvGrid({
  items,
}: {
  items: Array<[string, React.ReactNode]>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k}>
          <div className="text-xs text-slate-500">{k}</div>
          <div className="text-slate-800 font-medium">{v}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Single signature block — name on a printed-underline, role label + date
 * line below. Pre-filled `date` is rendered; otherwise leaves a blank line.
 */
export function SignatureBlock({
  label,
  name,
  date,
}: {
  label: string;
  name: string;
  date?: string | null;
}) {
  return (
    <div>
      <div className="border-b border-slate-700 h-10 flex items-end pb-0.5">
        <span className="text-sm font-medium text-slate-800">
          {name || " "}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span className="uppercase tracking-wide">{label}</span>
        <span>{date ? `Date: ${formatDate(date)}` : "Date: ____________"}</span>
      </div>
    </div>
  );
}

/** "2026-05-21T..." → "May 21, 2026". Null/invalid → "—". */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
