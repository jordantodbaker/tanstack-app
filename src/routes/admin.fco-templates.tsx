import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HardHat, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { FcoTemplateDialog } from "~/components/Admin/FcoTemplateDialog";
import {
  AdminListPage,
  useAdminMutations,
} from "~/components/Admin/AdminListPage";
import {
  fcoTemplatesAdminQueryOptions,
  upsertFcoTemplate,
  deleteFcoTemplate,
  type FcoTemplateAdminItem,
  type UpsertFcoTemplateInput,
} from "~/utils/fcoTemplates";
import { disciplineById } from "~/config/disciplines";

export const Route = createFileRoute("/admin/fco-templates")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(fcoTemplatesAdminQueryOptions());
  },
  component: AdminFcoTemplatesPage,
});

function AdminFcoTemplatesPage() {
  const { data: templates = [] } = useQuery(fcoTemplatesAdminQueryOptions());
  const { onSubmit, onDelete } = useAdminMutations<UpsertFcoTemplateInput>({
    entity: "fcoTemplates",
    upsertFn: upsertFcoTemplate,
    deleteFn: deleteFcoTemplate,
  });

  return (
    <AdminListPage
      icon={HardHat}
      title="FCO Templates"
      subtitle='Reusable scaffolds for repeat field changes. The FCO Log dialog shows these in a "Start from template" picker when creating new FCOs.'
      action={
        <FcoTemplateDialog
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
      emptyMessage="No FCO templates yet. Create the first one."
      columns={["Name", "Discipline", "Origin / Priority", "Used"]}
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
  t: FcoTemplateAdminItem;
  onSubmit: (input: UpsertFcoTemplateInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  const disciplineLabel =
    t.discipline === ""
      ? "Any"
      : (disciplineById[t.discipline]?.label ?? t.discipline);
  return (
    <FcoTemplateDialog
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
            {t.originType} / {t.priority}
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
