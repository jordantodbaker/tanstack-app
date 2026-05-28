import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HardHat, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { SubcontractorDialog } from "~/components/Admin/SubcontractorDialog";
import {
  AdminListPage,
  useAdminMutations,
} from "~/components/Admin/AdminListPage";
import {
  subcontractorsQueryOptions,
  upsertSubcontractor,
  deleteSubcontractor,
  type SubcontractorItem,
  type UpsertSubcontractorInput,
} from "~/utils/subcontractors";
import { disciplineById } from "~/config/disciplines";

// Admin role gate lives on the parent `/admin` layout route.
export const Route = createFileRoute("/admin/subcontractors")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(subcontractorsQueryOptions());
  },
  component: AdminSubcontractorsPage,
});

function AdminSubcontractorsPage() {
  const { data: subs = [] } = useQuery(subcontractorsQueryOptions());
  const { onSubmit, onDelete } = useAdminMutations<UpsertSubcontractorInput>({
    entity: "subcontractors",
    upsertFn: upsertSubcontractor,
    deleteFn: deleteSubcontractor,
  });

  return (
    <AdminListPage
      icon={HardHat}
      title="Subcontractors"
      subtitle="Manage subcontractor companies, the projects they're assigned to, and the disciplines they perform."
      containerClass="max-w-6xl"
      action={
        <SubcontractorDialog
          trigger={
            <Button>
              <Plus className="mr-1 size-4" />
              New Subcontractor
            </Button>
          }
          onSubmit={onSubmit}
        />
      }
      items={subs}
      emptyMessage="No subcontractors yet. Create the first one."
      columns={["ID", "Name", "Disciplines", "Projects"]}
      renderRow={(sub) => (
        <SubcontractorRow
          key={sub.id}
          sub={sub}
          onSubmit={onSubmit}
          onDelete={onDelete!}
        />
      )}
    />
  );
}

function SubcontractorRow({
  sub,
  onSubmit,
  onDelete,
}: {
  sub: SubcontractorItem;
  onSubmit: (input: UpsertSubcontractorInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  const disciplineLabels = sub.disciplines
    .map((id) => disciplineById[id]?.label ?? id)
    .sort();
  return (
    <SubcontractorDialog
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-mono text-xs text-slate-700`}>
            {sub.displayId}
          </td>
          <td className={`${cellCls} font-medium text-slate-800`}>
            {sub.name}
            {sub.description && (
              <div className="mt-0.5 text-xs text-slate-500 max-w-md truncate">
                {sub.description}
              </div>
            )}
          </td>
          <td className={`${cellCls} text-slate-700 text-xs`}>
            {disciplineLabels.length === 0 ? (
              <span className="text-slate-400">—</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {disciplineLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-slate-700"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </td>
          <td className={`${cellCls} text-slate-700 text-xs`}>
            {sub.projects.length === 0 ? (
              <span className="text-slate-400">—</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {sub.projects.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-800"
                    title={p.name}
                  >
                    {p.displayId}
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      }
      initial={sub}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  );
}
