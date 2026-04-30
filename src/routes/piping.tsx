import { createFileRoute } from "@tanstack/react-router";
import { PipingDisciplinePage } from "~/components/PipingTable";
import type { CbsOption } from "~/lib/types";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1, fetchCbsItemsByL1Paged } from "~/utils/cbs";
import { fetchPipingGroups } from "~/utils/piping";
import { fetchRoleOptions, fetchScheduleOptions, fetchRoleRates } from "~/utils/roles";

const PIPING_L1 = [
  "600",
  "631",
  "632",
  "633",
  "634",
  "635",
  "636",
  "637",
  "638",
  "639",
  "640",
  "641",
  "642",
  "643",
  "680",
  "690",
];

const PAGE_SIZE = 25;

export const Route = createFileRoute("/piping")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Math.max(0, Number(search.page ?? 0)),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ deps }) =>
    Promise.all([
      fetchCbsItemsByL1Paged({
        data: { l1Values: PIPING_L1, page: deps.page, pageSize: PAGE_SIZE },
      }),
      fetchPipingGroups(),
      fetchCbsItemsByL1({ data: ["602", "632"] }),
      fetchRoleOptions(),
      fetchScheduleOptions(),
      fetchRoleRates(),
    ]).then(([cbsData, pipingGroups, supportLaborItems, roleOptions, scheduleOptions, roleRates]) => ({
      ...cbsData,
      pipingGroups,
      supportLaborItems,
      roleOptions,
      scheduleOptions,
      roleRates,
    })),
  component: PipingPage,
});

function PipingPage() {
  const { items, total, pipingGroups, supportLaborItems, roleOptions, scheduleOptions, roleRates } =
    Route.useLoaderData();
  const { page } = Route.useSearch();
  const navigate = Route.useNavigate();

  const cbsOptions: CbsOption[] = items.map((item) => ({
    displayCode: item.displayCode,
    name: item.name,
    uom: item.uom,
    displayDescription: item.displayDescription ?? null,
  }));

  const supportLaborRows = supportLaborItems.map((item) => ({
    id: item.displayCode,
    description: item.name ?? "",
    shopField: "",
    weldGroupDescription: "",
    quantity: "",
    size: "",
    unit: item.uom,
    metallurgyCode: "",
    boreSize: "",
    role: "",
    schedule: "",
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
  }));

  return (
    <PipingDisciplinePage
      title="Piping"
      icon={disciplineById.piping.icon}
      cbsOptions={cbsOptions}
      pipingGroups={pipingGroups}
      supportLaborInitialRows={supportLaborRows}
      roleOptions={roleOptions}
      scheduleOptions={scheduleOptions}
      roleRates={roleRates}
      serverPagination={{
        totalCount: total,
        pageIndex: page,
        pageSize: PAGE_SIZE,
        onPageChange: (newPage: number) =>
          navigate({ search: (prev) => ({ ...prev, page: newPage }) }),
      }}
    />
  );
}
