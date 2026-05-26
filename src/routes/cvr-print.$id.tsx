import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import {
  changeLogQueryOptions,
  type ChangeLogItem,
} from "~/utils/changelog";
import { projectsQueryOptions, type ProjectOption } from "~/utils/projects";
import {
  STATUS_LABELS,
  TYPE_LABELS,
} from "~/utils/changelogLabels";
import { Button } from "~/components/ui/button";
import { QueryError } from "~/components/ui/list-page";
import { formatCurrency } from "~/lib/formatting";
import { disciplineById } from "~/config/disciplines";

/**
 * Printable single-CVR detail view. The user lands here from the dialog's
 * "Print / Save as PDF" link, opens the browser print dialog (button at
 * top, or Ctrl/Cmd+P), and saves the result as a PDF for owner signoff.
 *
 * On-screen we show the CVR inside the regular app chrome with a "Print"
 * button and a back link; the `@media print` rules in `app.css` hide the
 * header / sidebar / toolbar so the printed PDF contains only the document
 * itself with company-letterhead-style framing.
 */
export const Route = createFileRoute("/cvr-print/$id")({
  loader: async ({ context, params }) => {
    const id = Number.parseInt(params.id, 10);
    if (Number.isFinite(id)) {
      await context.queryClient
        .ensureQueryData(changeLogQueryOptions(id))
        .catch(() => null);
    }
  },
  component: PrintableCvrPage,
});

function PrintableCvrPage() {
  const params = Route.useParams();
  const id = Number.parseInt(params.id, 10);
  const {
    data: cvr,
    isPending,
    isError,
    error,
  } = useQuery(changeLogQueryOptions(Number.isFinite(id) ? id : null));
  const { data: projects = [] } = useQuery(projectsQueryOptions());

  if (!Number.isFinite(id)) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="text-sm text-red-700">Invalid CVR id.</p>
      </main>
    );
  }
  if (isError) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <QueryError error={error} label="CVR" />
      </main>
    );
  }
  if (isPending || !cvr) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="text-sm text-slate-500">Loading CVR…</p>
      </main>
    );
  }
  const project = projects.find((p) => p.id === cvr.projectId);

  return (
    <main className="max-w-4xl mx-auto p-6 print:p-0 print:max-w-none">
      {/* Toolbar — visible on screen, hidden when printing */}
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/changelog"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          Back to Change Log
        </Link>
        <Button onClick={() => window.print()} size="sm">
          <Printer className="size-3.5 mr-1" />
          Print / Save as PDF
        </Button>
      </div>

      <PrintableCvr cvr={cvr} project={project} />
    </main>
  );
}

function PrintableCvr({
  cvr,
  project,
}: {
  cvr: ChangeLogItem;
  project: ProjectOption | undefined;
}) {
  const disciplineLabel =
    disciplineById[cvr.discipline]?.label ?? cvr.discipline ?? "—";

  return (
    <article
      className="bg-white border border-slate-200 rounded-lg p-8 print:border-0 print:rounded-none print:p-0 print:shadow-none"
      // Tighter line-height + smaller default size for the printed page so
      // a typical CVR fits on one letter-sized page.
      style={{ fontSize: "11pt", lineHeight: 1.4 }}
    >
      {/* Document header */}
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
              Change Variation Request
            </div>
            <div className="mt-1 text-sm font-mono text-slate-700">
              {cvr.cvrNumber || `CVR #${cvr.id}`}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Status:{" "}
              <span className="font-semibold uppercase text-slate-800">
                {STATUS_LABELS[cvr.status]}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Identifying metadata */}
      <section className="mb-5">
        <h1 className="text-lg font-bold text-slate-800 mb-1">{cvr.title}</h1>
        {cvr.description && (
          <p className="whitespace-pre-wrap text-slate-700">
            {cvr.description}
          </p>
        )}
      </section>

      {/* Commercial impact */}
      <Section title="Commercial impact">
        <KvGrid
          items={[
            [
              "Cost impact",
              <span
                className={cvr.costImpact < 0 ? "text-red-700" : undefined}
                key="cost"
              >
                {formatCurrency(cvr.costImpact)}
              </span>,
            ],
            [
              "Schedule impact",
              cvr.scheduleDaysImpact !== 0
                ? `${cvr.scheduleDaysImpact > 0 ? "+" : ""}${cvr.scheduleDaysImpact} days`
                : "—",
            ],
            [
              "Labor hours",
              cvr.laborHoursImpact !== 0
                ? `${cvr.laborHoursImpact} hrs`
                : "—",
            ],
          ]}
        />
      </Section>

      {/* Classification */}
      <Section title="Classification">
        <KvGrid
          items={[
            ["Type", TYPE_LABELS[cvr.type]],
            ["Discipline", disciplineLabel],
            ["Risk level", cvr.riskLevel],
            ["Reason code", cvr.reasonCode || "—"],
          ]}
        />
      </Section>

      {/* Affected CBS codes */}
      {cvr.cbsCodes.length > 0 && (
        <Section title="Affected CBS codes">
          <p className="font-mono text-sm text-slate-700">
            {cvr.cbsCodes.join(", ")}
          </p>
        </Section>
      )}

      {/* Dates */}
      <Section title="Dates">
        <KvGrid
          items={[
            ["Requested", formatDate(cvr.requestedAt)],
            ["Due", formatDate(cvr.dueDate)],
            ["Approved", formatDate(cvr.approvedAt)],
          ]}
        />
      </Section>

      {/* Notes */}
      {cvr.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-slate-700 text-sm">
            {cvr.notes}
          </p>
        </Section>
      )}

      {/* Signature blocks */}
      <Section title="Signatures">
        <div className="grid grid-cols-3 gap-6 mt-2">
          <SignatureBlock label="Originator" name={cvr.originator} />
          <SignatureBlock
            label="Internal approver"
            name={cvr.approver}
            date={cvr.approvedAt}
          />
          <SignatureBlock label="Owner representative" name="" />
        </div>
      </Section>

      {/* Footer */}
      <footer className="mt-8 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
        <span>
          Generated {new Date().toLocaleString()} · CVR id {cvr.id}
        </span>
        <span>Page 1</span>
      </footer>
    </article>
  );
}

function Section({
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

function KvGrid({ items }: { items: Array<[string, React.ReactNode]> }) {
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

function SignatureBlock({
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
          {name || " "}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span className="uppercase tracking-wide">{label}</span>
        <span>{date ? `Date: ${formatDate(date)}` : "Date: ____________"}</span>
      </div>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
