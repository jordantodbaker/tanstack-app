import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PipingDisciplinePage } from "~/components/PipingTable";
import type { CbsOption } from "~/lib/types";
import { disciplineById } from "~/config/disciplines";
import {
  fetchCbsItemsByL1,
  cbsItemsByL1FilteredQueryOptions,
} from "~/utils/cbs";
import {
  fetchPipingGroups,
  fetchPipingFactorCodes,
  fetchPipingFactors,
} from "~/utils/piping";
import { fetchRoleOptions, fetchScheduleOptions, fetchRoleRates } from "~/utils/roles";
import { useSelectedProject } from "~/lib/selected-project";
import { allowedFefCbsItemIdsQueryOptions } from "~/utils/setup";
import { toCbsOption } from "~/lib/fef-helpers";

const PIPING_L1 = disciplineById.piping.l1Codes!;
const PIPING_CRAFT_L1 = PIPING_L1.filter(
  (code) => !code.endsWith("01") && !code.endsWith("31"),
);

export const Route = createFileRoute("/piping")({
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
  const { projectId } = useSelectedProject();
  const { data: items = [] } = useQuery(
    cbsItemsByL1FilteredQueryOptions({
      l1Values: PIPING_CRAFT_L1,
      projectId,
    }),
  );
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

  const cbsOptions: CbsOption[] = items.map(toCbsOption);

  const supportLaborRows = filteredSupportLaborItems.map((item) => ({
    id: item.displayCode,
    name: item.name ?? "",
    description: "",
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
      laborKey={PIPING_L1[0]?.[0]}
    />
  );
}
