import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  changeLogQueryOptions,
  type ChangeLogDetail,
} from "~/utils/changelog";
import { projectsQueryOptions } from "~/utils/projects";
import { STATUS_LABELS, TYPE_LABELS } from "~/utils/changelogLabels";
import { QueryError } from "~/components/ui/list-page";
import {
  PrintablePageShell,
  Section,
  KvGrid,
  SignatureBlock,
  formatDate,
} from "~/components/PrintablePageShell";
import { formatCurrency } from "~/lib/formatting";
import { CVR_COST_TYPE_LABELS, lineItemTotal } from "~/utils/cvrLineItems";
import { disciplineById } from "~/config/disciplines";

export const Route = createLazyFileRoute("/cvr-print/$id")({
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
    <PrintablePageShell
      recordTitle="Change Variation Request"
      recordNumber={cvr.cvrNumber || `CVR #${cvr.id}`}
      statusLabel={STATUS_LABELS[cvr.status]}
      project={project}
      backTo="/changelog"
      backLabel="Back to Change Log"
      footerKind="CVR"
      footerId={cvr.id}
    >
      <PrintableCvrBody cvr={cvr} />
    </PrintablePageShell>
  );
}

function PrintableCvrBody({ cvr }: { cvr: ChangeLogDetail }) {
  const disciplineLabel =
    disciplineById[cvr.discipline]?.label ?? cvr.discipline ?? "—";

  return (
    <>
      <section className="mb-5">
        <h1 className="text-lg font-bold text-slate-800 mb-1">{cvr.title}</h1>
        {cvr.description && (
          <p className="whitespace-pre-wrap text-slate-700">
            {cvr.description}
          </p>
        )}
      </section>

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

      {cvr.lineItems.length > 0 && (
        <Section title="Cost buildup">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-300">
                <th className="py-1 pr-2">Description</th>
                <th className="py-1 px-2">CBS item</th>
                <th className="py-1 px-2">Cost type</th>
                <th className="py-1 px-2 text-right">Qty</th>
                <th className="py-1 px-2">Unit</th>
                <th className="py-1 px-2 text-right">Unit rate</th>
                <th className="py-1 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {cvr.lineItems.map((li) => (
                <tr key={li.id ?? li.position} className="border-b border-slate-100">
                  <td className="py-1 pr-2 text-slate-700">
                    {li.description || "—"}
                  </td>
                  <td className="py-1 px-2 font-mono text-xs text-slate-700">
                    {li.cbsCode || "—"}
                  </td>
                  <td className="py-1 px-2 text-slate-700">
                    {CVR_COST_TYPE_LABELS[li.costType]}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-slate-700">
                    {li.quantity}
                  </td>
                  <td className="py-1 px-2 text-slate-700">{li.unit || "—"}</td>
                  <td className="py-1 px-2 text-right tabular-nums text-slate-700">
                    {formatCurrency(li.unitRate)}
                  </td>
                  <td className="py-1 pl-2 text-right tabular-nums text-slate-800">
                    {formatCurrency(lineItemTotal(li))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold border-t border-slate-300">
                <td className="py-1 pr-2 text-slate-700" colSpan={6}>
                  Total cost impact
                </td>
                <td className="py-1 pl-2 text-right tabular-nums text-slate-900">
                  {formatCurrency(cvr.costImpact)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Section>
      )}

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

      {cvr.cbsCodes.length > 0 && (
        <Section title="Affected CBS codes">
          <p className="font-mono text-sm text-slate-700">
            {cvr.cbsCodes.join(", ")}
          </p>
        </Section>
      )}

      <Section title="Dates">
        <KvGrid
          items={[
            ["Requested", formatDate(cvr.requestedAt)],
            ["Due", formatDate(cvr.dueDate)],
            ["Approved", formatDate(cvr.approvedAt)],
          ]}
        />
      </Section>

      {cvr.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-slate-700 text-sm">
            {cvr.notes}
          </p>
        </Section>
      )}

      <Section title="Signatures">
        <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-6 mt-2">
          <SignatureBlock label="Originator" name={cvr.originator} />
          <SignatureBlock
            label="Internal approver"
            name={cvr.approver}
            date={cvr.approvedAt}
          />
          <SignatureBlock label="Owner representative" name="" />
        </div>
      </Section>
    </>
  );
}
