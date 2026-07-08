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
  type CrewMixAdminItem,
  type UpsertCrewMixInput,
} from "~/utils/crewMixes";
import { rolesAdminQueryOptions } from "~/utils/roles";
import { schedulesQueryOptions } from "~/utils/schedules";
import { crewMixAverageRate, type RoleRateRow } from "~/lib/crew-mix-rate";

// Admin role gate lives on the parent `/admin` layout route.
export const Route = createFileRoute("/admin/crew-mixes")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(crewMixesAdminQueryOptions()),
      context.queryClient.ensureQueryData(rolesAdminQueryOptions()),
      context.queryClient.ensureQueryData(schedulesQueryOptions()),
    ]);
  },
  component: AdminCrewMixesPage,
});

function AdminCrewMixesPage() {
  const { data: mixes = [] } = useQuery(crewMixesAdminQueryOptions());
  const { data: roles = [] } = useQuery(rolesAdminQueryOptions());
  const { onSubmit, onDelete } = useAdminMutations<UpsertCrewMixInput>({
    entity: "crewMixes",
    upsertFn: upsertCrewMix,
    deleteFn: deleteCrewMix,
  });

  const roleRateRows: RoleRateRow[] = roles.flatMap((r) =>
    r.rates.map((rt) => ({
      roleName: r.name,
      schedule: rt.schedule,
      rate: rt.rate,
    })),
  );

  return (
    <AdminListPage
      icon={Users2}
      title="Crew Mixes"
      subtitle={`A set of roles plus one schedule. When the Take Off sheet is in "Use Crew Mix" mode, the row labor rate snaps to the average of the member roles' rates at that schedule.`}
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
      columns={["Name", "Schedule", "Roles", "Rate"]}
      renderRow={(mix) => (
        <CrewMixRow
          key={mix.id}
          mix={mix}
          roleRateRows={roleRateRows}
          onSubmit={onSubmit}
          onDelete={onDelete!}
        />
      )}
    />
  );
}

function CrewMixRow({
  mix,
  roleRateRows,
  onSubmit,
  onDelete,
}: {
  mix: CrewMixAdminItem;
  roleRateRows: RoleRateRow[];
  onSubmit: (input: UpsertCrewMixInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  const avg = crewMixAverageRate(
    mix.members.map((m) => ({ roleName: m.roleName, count: m.count })),
    mix.schedule,
    roleRateRows,
  );
  return (
    <CrewMixDialog
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-medium text-slate-800`}>
            {mix.name}
          </td>
          <td className={`${cellCls} text-slate-700 font-mono text-xs`}>
            {mix.schedule === "" ? (
              <span className="text-amber-600">— (none)</span>
            ) : (
              mix.schedule
            )}
          </td>
          <td className={`${cellCls} text-slate-700 text-xs`}>
            {mix.members.length === 0 ? (
              <span className="text-amber-600">— (no roles)</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {mix.members.map((m) => (
                  <span
                    key={m.roleId}
                    className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-slate-700"
                  >
                    {m.roleName}
                    {m.count > 1 && (
                      <span className="ml-1 text-slate-400">×{m.count}</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </td>
          <td className={`${cellCls} text-slate-700`}>
            {mix.schedule === "" || avg === 0 ? "—" : `$${avg.toFixed(2)}`}
          </td>
        </tr>
      }
      initial={mix}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  );
}
