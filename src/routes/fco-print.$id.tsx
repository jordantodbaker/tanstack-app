import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fcoQueryOptions, type FcoItem } from "~/utils/fcoLog";
import {
  FCO_STATUS_LABELS,
  FCO_ORIGIN_LABELS,
  FCO_PRIORITY_LABELS,
} from "~/utils/fcoLogLabels";
import { projectsQueryOptions } from "~/utils/projects";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { formatAreaLabel } from "~/utils/areaLabels";
import { QueryError } from "~/components/ui/list-page";
import {
  PrintablePageShell,
  Section,
  KvGrid,
  SignatureBlock,
  formatDate,
} from "~/components/PrintablePageShell";
import { formatCurrency } from "~/lib/formatting";
import { disciplineById } from "~/config/disciplines";

/**
 * Printable single-FCO detail view. Mirrors `/cvr-print/$id` — the user
 * lands here from the FCO dialog's "Print / PDF" link, opens the browser
 * print dialog, and saves the result as a PDF for field signoff or the
 * owner's project file.
 *
 * Sections are FCO-specific (priority instead of risk level, origin type
 * instead of change type, field/initiator signatures instead of an internal
 * approver) but the framing matches the CVR layout so printed packets read
 * consistently.
 */
export const Route = createFileRoute("/fco-print/$id")({
  loader: async ({ context, params }) => {
    const id = Number.parseInt(params.id, 10);
    if (Number.isFinite(id)) {
      await context.queryClient
        .ensureQueryData(fcoQueryOptions(id))
        .catch(() => null);
    }
  },
  component: PrintableFcoPage,
});

function PrintableFcoPage() {
  const params = Route.useParams();
  const id = Number.parseInt(params.id, 10);
  const {
    data: fco,
    isPending,
    isError,
    error,
  } = useQuery(fcoQueryOptions(Number.isFinite(id) ? id : null));
  const { data: projects = [] } = useQuery(projectsQueryOptions());
  // Areas are only useful once we know the project; the query is disabled
  // until then. Resolving the area id to a "displayId — name" string keeps
  // the printed packet readable.
  const { data: areas = [] } = useQuery(
    areasByProjectQueryOptions(fco?.projectId ?? null),
  );

  if (!Number.isFinite(id)) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="text-sm text-red-700">Invalid FCO id.</p>
      </main>
    );
  }
  if (isError) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <QueryError error={error} label="FCO" />
      </main>
    );
  }
  if (isPending || !fco) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="text-sm text-slate-500">Loading FCO…</p>
      </main>
    );
  }
  const project = projects.find((p) => p.id === fco.projectId);
  const areaLabel = formatAreaLabel(fco.locationArea, areas);

  return (
    <PrintablePageShell
      recordTitle="Field Change Order"
      recordNumber={fco.fcoNumber || `FCO #${fco.id}`}
      statusLabel={FCO_STATUS_LABELS[fco.status]}
      project={project}
      backTo="/fco-log"
      backLabel="Back to FCO Log"
      footerKind="FCO"
      footerId={fco.id}
    >
      <PrintableFcoBody fco={fco} areaLabel={areaLabel} />
    </PrintablePageShell>
  );
}

function PrintableFcoBody({
  fco,
  areaLabel,
}: {
  fco: FcoItem;
  areaLabel: string;
}) {
  const disciplineLabel =
    disciplineById[fco.discipline]?.label ?? fco.discipline ?? "—";

  return (
    <>
      <section className="mb-5">
        <h1 className="text-lg font-bold text-slate-800 mb-1">{fco.title}</h1>
        {fco.description && (
          <p className="whitespace-pre-wrap text-slate-700">
            {fco.description}
          </p>
        )}
      </section>

      {/* Work-stopped is the single most urgent signal on an FCO — call it
          out at the top of the printed packet so an approver can't miss it. */}
      {fco.workStopped && (
        <div className="mb-5 rounded border-2 border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-red-800">
          Work stopped — field crew awaiting resolution
        </div>
      )}

      <Section title="Impact">
        <KvGrid
          items={[
            [
              "Estimated cost",
              <span
                className={fco.estimatedCost < 0 ? "text-red-700" : undefined}
                key="cost"
              >
                {formatCurrency(fco.estimatedCost)}
              </span>,
            ],
            [
              "Estimated hours",
              fco.estimatedHours !== 0 ? `${fco.estimatedHours} hrs` : "—",
            ],
            ["Work stopped", fco.workStopped ? "Yes" : "No"],
          ]}
        />
      </Section>

      <Section title="Classification">
        <KvGrid
          items={[
            ["Origin", FCO_ORIGIN_LABELS[fco.originType]],
            ["Priority", FCO_PRIORITY_LABELS[fco.priority]],
            ["Discipline", disciplineLabel],
            ["Area", areaLabel || "—"],
          ]}
        />
      </Section>

      {(fco.drawingRefs.length > 0 || fco.rfiNumbers.length > 0) && (
        <Section title="Field references">
          <KvGrid
            items={[
              ["Drawings", fco.drawingRefs.join(", ") || "—"],
              ["RFIs", fco.rfiNumbers.join(", ") || "—"],
            ]}
          />
        </Section>
      )}

      {fco.cbsCodes.length > 0 && (
        <Section title="Affected CBS codes">
          <p className="font-mono text-sm text-slate-700">
            {fco.cbsCodes.join(", ")}
          </p>
        </Section>
      )}

      {fco.reasonNarrative && (
        <Section title="Reason narrative">
          <p className="whitespace-pre-wrap text-slate-700 text-sm">
            {fco.reasonNarrative}
          </p>
        </Section>
      )}

      {fco.resolution && (
        <Section title="Resolution">
          <p className="whitespace-pre-wrap text-slate-700 text-sm">
            {fco.resolution}
          </p>
        </Section>
      )}

      <Section title="Dates">
        <KvGrid
          items={[
            ["Initiated", formatDate(fco.initiatedAt)],
            ["Needed by", formatDate(fco.neededBy)],
            ["Closed", formatDate(fco.closedAt)],
          ]}
        />
      </Section>

      {fco.linkedCvrId && (
        <Section title="Linked CVR">
          <p className="text-sm text-slate-700">
            {fco.linkedCvrNumber || `CVR #${fco.linkedCvrId}`}
            {fco.linkedCvrTitle ? ` — ${fco.linkedCvrTitle}` : ""}
          </p>
        </Section>
      )}

      {fco.linkedRfiId && (
        <Section title="Promoted from RFI">
          <p className="text-sm text-slate-700">
            {fco.linkedRfiNumber || `RFI #${fco.linkedRfiId}`}
            {fco.linkedRfiSubject ? ` — ${fco.linkedRfiSubject}` : ""}
          </p>
        </Section>
      )}

      {fco.photosUrl && (
        <Section title="External link">
          <p className="text-sm text-slate-700 break-all">{fco.photosUrl}</p>
        </Section>
      )}

      {fco.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-slate-700 text-sm">
            {fco.notes}
          </p>
        </Section>
      )}

      <Section title="Signatures">
        <div className="grid grid-cols-3 gap-6 mt-2">
          <SignatureBlock label="Initiated by" name={fco.initiatedBy} />
          <SignatureBlock label="Field contact" name={fco.fieldContact} />
          <SignatureBlock label="Closed by" name="" date={fco.closedAt} />
        </div>
      </Section>
    </>
  );
}
