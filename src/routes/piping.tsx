import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PipingDisciplinePage } from "~/components/PipingTable";
import type { CbsOption } from "~/lib/types";
import { disciplineById } from "~/config/disciplines";
import {
  fetchCbsItemsByL1,
  cbsItemsByL1PagedQueryOptions,
} from "~/utils/cbs";
import {
  fetchPipingGroups,
  fetchPipingFactorCodes,
  fetchPipingFactors,
} from "~/utils/piping";
import { fetchRoleOptions, fetchScheduleOptions, fetchRoleRates } from "~/utils/roles";
import { useSelectedProject } from "~/lib/selected-project";
import { allowedFefCbsItemIdsQueryOptions } from "~/utils/setup";

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
  loader: () =>
    Promise.all([
      fetchPipingGroups(),
      fetchCbsItemsByL1({ data: ["602", "632"] }),
      fetchRoleOptions(),
      fetchScheduleOptions(),
      fetchRoleRates(),
      fetchPipingFactorCodes(),
      fetchPipingFactors(),
    ]).then(([pipingGroups, supportLaborItems, roleOptions, scheduleOptions, roleRates, taskCodeOptions, pipingFactors]) => ({
      pipingGroups,
      supportLaborItems,
      roleOptions,
      scheduleOptions,
      roleRates,
      taskCodeOptions,
      pipingFactors,
    })),
  component: PipingPage,
});

function PipingPage() {
  const { pipingGroups, supportLaborItems, roleOptions, scheduleOptions, roleRates, taskCodeOptions, pipingFactors } =
    Route.useLoaderData();
  const { page } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { projectId } = useSelectedProject();
  const { data: cbsData } = useQuery(
    cbsItemsByL1PagedQueryOptions({
      l1Values: PIPING_L1,
      page,
      pageSize: PAGE_SIZE,
      projectId,
    }),
  );
  const items = cbsData?.items ?? [];
  const total = cbsData?.total ?? 0;
  const { data: allowedIds } = useQuery({
    ...allowedFefCbsItemIdsQueryOptions(projectId ?? 0),
    enabled: projectId !== null,
  });
  const allowedIdSet = React.useMemo(
    () => new Set(allowedIds ?? []),
    [allowedIds],
  );

  const filteredSupportLaborItems =
    projectId === null
      ? supportLaborItems
      : supportLaborItems.filter((item) => allowedIdSet.has(item.id));

  const cbsOptions: CbsOption[] = items.map((item) => ({
    displayCode: item.displayCode,
    name: item.name,
    uom: item.uom,
    displayDescription: item.displayDescription ?? null,
  }));

  const supportLaborRows = filteredSupportLaborItems.map((item) => ({
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
    taskCode: "",
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
      taskCodeOptions={taskCodeOptions}
      pipingFactors={pipingFactors}
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
