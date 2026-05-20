import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PipingDisciplinePage } from "~/components/PipingTable";
import { LoadMask } from "~/components/LoadMask";
import type { CbsOption } from "~/lib/types";
import { disciplineById } from "~/config/disciplines";
import {
  cbsItemsByL1QueryOptions,
  cbsItemsByL1FilteredQueryOptions,
} from "~/utils/cbs";
import {
  pipingGroupsQueryOptions,
  pipingFactorDataQueryOptions,
} from "~/utils/piping";
import { roleDataQueryOptions } from "~/utils/roles";
import { useSelectedProject } from "~/lib/selected-project";
import {
  allowedFefCbsItemIdsQueryOptions,
} from "~/utils/setup";
import { fefRowsQueryOptions } from "~/utils/fefRows";
import { readProjectIdForLoader } from "~/utils/projectCookie";
import { makeFefRow, toCbsOption } from "~/lib/fef-helpers";

const PIPING_L1 = disciplineById.piping.l1Codes!;
const PIPING_CRAFT_L1 = PIPING_L1.filter(
  (code) => !code.endsWith("01") && !code.endsWith("31"),
);
const SUPPORT_LABOR_L1 = ["602", "632"];

export const Route = createFileRoute("/piping")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();

    // Field-Estimate-only data — start fetching but don't block first paint.
    // useQuery on the client picks these up when they stream in.
    context.queryClient.prefetchQuery(
      cbsItemsByL1QueryOptions(SUPPORT_LABOR_L1),
    );
    if (projectId !== null) {
      context.queryClient.prefetchQuery(
        fefRowsQueryOptions({
          projectId,
          discipline: "piping",
          section: "SUPPORT_LABOR",
        }),
      );
      context.queryClient.prefetchQuery(
        allowedFefCbsItemIdsQueryOptions(projectId),
      );
    }

    // Take-Off-critical data — block until ready so SSR HTML has Take Off rows.
    const critical: Promise<unknown>[] = [
      context.queryClient.ensureQueryData(pipingGroupsQueryOptions()),
      context.queryClient.ensureQueryData(roleDataQueryOptions()),
      context.queryClient.ensureQueryData(pipingFactorDataQueryOptions()),
    ];
    if (projectId !== null) {
      critical.push(
        context.queryClient.ensureQueryData(
          fefRowsQueryOptions({
            projectId,
            discipline: "piping",
            section: "TAKE_OFF",
          }),
        ),
        context.queryClient.ensureQueryData(
          cbsItemsByL1FilteredQueryOptions({
            l1Values: PIPING_CRAFT_L1,
            projectId,
          }),
        ),
      );
    }
    await Promise.all(critical);
  },
  component: PipingPage,
  pendingComponent: PipingPending,
  pendingMs: 150,
});

function PipingPending() {
  // Match the DisciplineTabs wrapper shape and fill the visible area below the
  // 4rem header so the spinner appears at the same vertical position as the
  // post-load `<LoadMask />` that DisciplineTabs renders during hydration.
  return (
    <main className="relative p-3 md:p-4 min-h-[calc(100vh-4rem)]">
      <LoadMask label="Loading Piping…" />
    </main>
  );
}

function PipingPage() {
  const { projectId } = useSelectedProject();

  const { data: pipingGroups = [] } = useQuery(pipingGroupsQueryOptions());
  const { data: supportLaborItems = [] } = useQuery(
    cbsItemsByL1QueryOptions(SUPPORT_LABOR_L1),
  );
  const { data: roleData } = useQuery(roleDataQueryOptions());
  const { data: pipingFactorData } = useQuery(pipingFactorDataQueryOptions());

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

  const filteredSupportLaborItems = React.useMemo(
    () =>
      projectId === null
        ? supportLaborItems
        : supportLaborItems.filter((item) => allowedIdSet.has(item.id)),
    [projectId, supportLaborItems, allowedIdSet],
  );

  const cbsOptions: CbsOption[] = React.useMemo(
    () => items.map(toCbsOption),
    [items],
  );

  const supportLaborRows = React.useMemo(
    () =>
      filteredSupportLaborItems.map((item) =>
        makeFefRow({
          id: item.displayCode,
          name: item.name ?? "",
          unit: item.uom,
        }),
      ),
    [filteredSupportLaborItems],
  );

  return (
    <PipingDisciplinePage
      title="Piping"
      icon={disciplineById.piping.icon}
      cbsOptions={cbsOptions}
      pipingGroups={pipingGroups}
      supportLaborInitialRows={supportLaborRows}
      roleOptions={roleData?.roleOptions ?? []}
      scheduleOptions={roleData?.scheduleOptions ?? []}
      roleRates={roleData?.roleRates ?? []}
      taskCodeOptions={pipingFactorData?.taskCodeOptions ?? []}
      pipingFactors={pipingFactorData?.pipingFactors ?? []}
    />
  );
}
