import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users2, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { CrewMixDialog } from "~/components/Admin/CrewMixDialog";
import {
  AdminListPage,
  useAdminMutations,
} from "~/components/Admin/AdminListPage";
import {
  crewMixesAdminQueryOptions,
  upsertCrewMix,
  deleteCrewMix,
  crewMixAverageWage,
  type CrewMixAdminItem,
  type UpsertCrewMixInput,
} from "~/utils/crewMixes";

// Admin role gate lives on the parent `/admin` layout route.
export const Route = createFileRoute("/admin/crew-mixes")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(crewMixesAdminQueryOptions());
  },
  component: AdminCrewMixesPage,
});

function AdminCrewMixesPage() {
  const { data: mixes = [] } = useQuery(crewMixesAdminQueryOptions());
  const { onSubmit, onDelete } = useAdminMutations<UpsertCrewMixInput>({
    entity: "crewMixes",
    upsertFn: upsertCrewMix,
    deleteFn: deleteCrewMix,
  });

  return (
    <AdminListPage
      icon={Users2}
      title="Crew Mixes"
      subtitle='Bundles of job titles + wages. When the Take Off sheet is in "Use Crew Mix" mode, the row labor rate snaps to the average wage of the selected mix.'
      action={
        <CrewMixDialog
          trigger={
            <Button>
              <Plus className="mr-1 size-4" />
              New Crew Mix
            </Button>
          }
          onSubmit={onSubmit}
        />
      }
      items={mixes}
      emptyMessage="No crew mixes yet. Create the first one."
      columns={["Name", "Members", "Avg Wage"]}
      renderRow={(mix) => (
        <CrewMixRow
          key={mix.id}
          mix={mix}
          onSubmit={onSubmit}
          onDelete={onDelete!}
        />
      )}
    />
  );
}

function CrewMixRow({
  mix,
  onSubmit,
  onDelete,
}: {
  mix: CrewMixAdminItem;
  onSubmit: (input: UpsertCrewMixInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  const avg = crewMixAverageWage(mix.members);
  return (
    <CrewMixDialog
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-medium text-slate-800`}>
            {mix.name}
          </td>
          <td className={`${cellCls} text-slate-700 text-xs`}>
            {mix.members.length === 0 ? (
              <span className="text-amber-600">— (no members)</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {mix.members.map((m, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-slate-700"
                  >
                    {m.jobTitle} (${m.wage.toFixed(2)})
                  </span>
                ))}
              </div>
            )}
          </td>
          <td className={`${cellCls} text-slate-700`}>
            {mix.members.length === 0 ? "—" : `$${avg.toFixed(2)}`}
          </td>
        </tr>
      }
      initial={mix}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  );
}
