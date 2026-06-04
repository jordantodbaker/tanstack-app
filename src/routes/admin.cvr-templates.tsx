import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { CvrTemplateDialog } from "~/components/Admin/CvrTemplateDialog";
import {
  AdminListPage,
  useAdminMutations,
} from "~/components/Admin/AdminListPage";
import {
  cvrTemplatesAdminQueryOptions,
  upsertCvrTemplate,
  deleteCvrTemplate,
  type CvrTemplateAdminItem,
  type UpsertCvrTemplateInput,
} from "~/utils/cvrTemplates";
import { disciplineById } from "~/config/disciplines";

// Admin gate lives on the parent /admin layout route.
export const Route = createFileRoute("/admin/cvr-templates")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(cvrTemplatesAdminQueryOptions());
  },
  component: AdminCvrTemplatesPage,
});

function AdminCvrTemplatesPage() {
  const { data: templates = [] } = useQuery(cvrTemplatesAdminQueryOptions());
  const { onSubmit, onDelete } = useAdminMutations<UpsertCvrTemplateInput>({
    entity: "cvrTemplates",
    upsertFn: upsertCvrTemplate,
    deleteFn: deleteCvrTemplate,
  });

  return (
    <AdminListPage
      icon={FileText}
      title="CVR Templates"
      subtitle='Reusable scaffolds for repeat scope changes. The Change Log dialog shows these in a "Start from template" picker when creating new CVRs.'
      action={
        <CvrTemplateDialog
          trigger={
            <Button>
              <Plus className="mr-1 size-4" />
              New Template
            </Button>
          }
          onSubmit={onSubmit}
        />
      }
      items={templates}
      emptyMessage="No CVR templates yet. Create the first one."
      columns={["Name", "Discipline", "Type / Risk", "Used"]}
      renderRow={(t) => (
        <Row
          key={t.id}
          t={t}
          onSubmit={onSubmit}
          onDelete={onDelete!}
        />
      )}
    />
  );
}

function Row({
  t,
  onSubmit,
  onDelete,
}: {
  t: CvrTemplateAdminItem;
  onSubmit: (input: UpsertCvrTemplateInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  const disciplineLabel =
    t.discipline === ""
      ? "Any"
      : (disciplineById[t.discipline]?.label ?? t.discipline);
  return (
    <CvrTemplateDialog
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-medium text-slate-800`}>
            <div>{t.name}</div>
            {t.templateDescription && (
              <div className="text-xs text-slate-500">
                {t.templateDescription}
              </div>
            )}
          </td>
          <td className={`${cellCls} text-slate-700 text-xs`}>
            {disciplineLabel}
          </td>
          <td className={`${cellCls} text-slate-700 text-xs`}>
            {t.type} / {t.riskLevel}
          </td>
          <td className={`${cellCls} text-slate-700 tabular-nums`}>
            {t.usageCount}
          </td>
        </tr>
      }
      initial={t}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  );
}
