import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rfiQueryOptions, type RfiItem } from "~/utils/rfis";
import {
  RFI_PRIORITY_LABELS,
  RFI_STATUS_LABELS,
} from "~/utils/rfiLabels";
import { projectsQueryOptions } from "~/utils/projects";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { formatAreaLabel } from "~/utils/areaLabels";
import {
  PrintablePageShell,
  PrintRecordGuard,
  Section,
  KvGrid,
  SignatureBlock,
  formatDate,
} from "~/components/PrintablePageShell";
import { disciplineById } from "~/config/disciplines";

export const Route = createLazyFileRoute("/rfi-print/$id")({
  component: PrintableRfiPage,
});

function PrintableRfiPage() {
  const params = Route.useParams();
  const id = Number.parseInt(params.id, 10);
  const {
    data: rfi,
    isPending,
    isError,
    error,
  } = useQuery(rfiQueryOptions(Number.isFinite(id) ? id : null));
  const { data: projects = [] } = useQuery(projectsQueryOptions());
  const { data: areas = [] } = useQuery(
    areasByProjectQueryOptions(rfi?.projectId ?? null),
  );

  return (
    <PrintRecordGuard
      id={id}
      label="RFI"
      isPending={isPending}
      isError={isError}
      error={error}
      data={rfi}
    >
      {(rfi) => (
        <PrintablePageShell
          recordTitle="Request for Information"
          recordNumber={rfi.rfiNumber || `RFI #${rfi.id}`}
          statusLabel={RFI_STATUS_LABELS[rfi.status]}
          project={projects.find((p) => p.id === rfi.projectId)}
          backTo="/rfis"
          backLabel="Back to RFIs"
          footerKind="RFI"
          footerId={rfi.id}
        >
          <PrintableRfiBody
            rfi={rfi}
            areaLabel={formatAreaLabel(rfi.locationArea, areas)}
          />
        </PrintablePageShell>
      )}
    </PrintRecordGuard>
  );
}

function PrintableRfiBody({
  rfi,
  areaLabel,
}: {
  rfi: RfiItem;
  areaLabel: string;
}) {
  const disciplineLabel =
    disciplineById[rfi.discipline]?.label ?? rfi.discipline ?? "—";

  return (
    <>
      <section className="mb-5">
        <h1 className="text-lg font-bold text-slate-800 mb-1">{rfi.subject}</h1>
      </section>

      <Section title="Classification">
        <KvGrid
          items={[
            ["Priority", RFI_PRIORITY_LABELS[rfi.priority]],
            ["Discipline", disciplineLabel],
            ["Area", areaLabel || "—"],
            [
              "Suspects impact",
              rfi.suspectsCostImpact || rfi.suspectsScheduleImpact
                ? [
                    rfi.suspectsCostImpact ? "Cost" : null,
                    rfi.suspectsScheduleImpact ? "Schedule" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : "—",
            ],
          ]}
        />
      </Section>

      {(rfi.drawingRefs.length > 0 || rfi.specRefs.length > 0) && (
        <Section title="References">
          <KvGrid
            items={[
              ["Drawings", rfi.drawingRefs.join(", ") || "—"],
              ["Specs", rfi.specRefs.join(", ") || "—"],
            ]}
          />
        </Section>
      )}

      {rfi.cbsCodes.length > 0 && (
        <Section title="Affected CBS codes">
          <p className="font-mono text-sm text-slate-700">
            {rfi.cbsCodes.join(", ")}
          </p>
        </Section>
      )}

      <Section title="Question">
        <p className="whitespace-pre-wrap text-slate-700 text-sm">
          {rfi.question || "—"}
        </p>
      </Section>

      <Section title="Response">
        {rfi.response ? (
          <p className="whitespace-pre-wrap text-slate-700 text-sm">
            {rfi.response}
          </p>
        ) : (
          <p className="text-sm italic text-slate-400">No response recorded.</p>
        )}
      </Section>

      <Section title="Dates">
        <KvGrid
          items={[
            ["Initiated", formatDate(rfi.initiatedAt)],
            ["Due", formatDate(rfi.dueDate)],
            ["Answered", formatDate(rfi.answeredAt)],
            ["Closed", formatDate(rfi.closedAt)],
          ]}
        />
      </Section>

      {rfi.linkedFcos.length > 0 && (
        <Section title="Promoted to FCO">
          <ul className="text-sm text-slate-700 list-disc pl-5">
            {rfi.linkedFcos.map((f) => (
              <li key={f.id}>
                <span className="font-mono">
                  {f.fcoNumber || `FCO #${f.id}`}
                </span>
                {f.title && <span> — {f.title}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Signatures">
        <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-6 mt-2">
          <SignatureBlock label="Originator" name={rfi.initiatedBy} />
          <SignatureBlock
            label="Responder"
            name={rfi.answeredBy}
            date={rfi.answeredAt}
          />
        </div>
      </Section>
    </>
  );
}
