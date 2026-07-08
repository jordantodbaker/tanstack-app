import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { ScheduleDialog } from "~/components/Admin/ScheduleDialog";
import {
  AdminListPage,
  useAdminMutations,
} from "~/components/Admin/AdminListPage";
import {
  schedulesQueryOptions,
  upsertSchedule,
  deleteSchedule,
  type ScheduleItem,
  type UpsertScheduleInput,
} from "~/utils/schedules";

// Admin role gate lives on the parent `/admin` layout route.
export const Route = createFileRoute("/admin/schedules")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(schedulesQueryOptions());
  },
  component: AdminSchedulesPage,
});

function AdminSchedulesPage() {
  const { data: schedules = [] } = useQuery(schedulesQueryOptions());
  const { onSubmit, onDelete } = useAdminMutations<UpsertScheduleInput>({
    entity: "schedules",
    upsertFn: upsertSchedule,
    deleteFn: deleteSchedule,
  });

  return (
    <AdminListPage
      icon={CalendarClock}
      title="Schedules"
      subtitle="Labor schedules (crew/shift codes). Each role carries a rate per schedule, and a crew mix is priced at one schedule."
      action={
        <ScheduleDialog
          trigger={
            <Button>
              <Plus className="mr-1 size-4" />
              New Schedule
            </Button>
          }
          onSubmit={onSubmit}
        />
      }
      items={schedules}
      emptyMessage="No schedules yet. Create the first one."
      columns={["Name"]}
      renderRow={(schedule) => (
        <ScheduleRow
          key={schedule.id}
          schedule={schedule}
          onSubmit={onSubmit}
          onDelete={onDelete!}
        />
      )}
    />
  );
}

function ScheduleRow({
  schedule,
  onSubmit,
  onDelete,
}: {
  schedule: ScheduleItem;
  onSubmit: (input: UpsertScheduleInput) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
}) {
  const cellCls = "px-3 py-2 border-b border-slate-100 align-top";
  return (
    <ScheduleDialog
      trigger={
        <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
          <td className={`${cellCls} font-mono text-sm font-medium text-slate-800`}>
            {schedule.name}
          </td>
        </tr>
      }
      initial={schedule}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  );
}
