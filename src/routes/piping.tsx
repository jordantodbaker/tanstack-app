import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PipingDisciplinePage } from "~/components/PipingTable";
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
import { getProjectIdFromCookie } from "~/utils/projectCookie";
import { toCbsOption } from "~/lib/fef-helpers";

const PIPING_L1 = disciplineById.piping.l1Codes!;
const PIPING_CRAFT_L1 = PIPING_L1.filter(
  (code) => !code.endsWith("01") && !code.endsWith("31"),
);
const SUPPORT_LABOR_L1 = ["602", "632"];
const PROJECT_STORAGE_KEY = "selectedProjectId";

async function readProjectIdForLoader(): Promise<number | null> {
  if (typeof window === "undefined") {
    return await getProjectIdFromCookie();
  }
  const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

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
  return (
    <main className="flex flex-1 items-center justify-center p-12">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="size-8 animate-spin" />
        <span className="text-sm">Loading Piping…</span>
      </div>
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
      filteredSupportLaborItems.map((item) => ({
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
      })),
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
      laborKey={PIPING_L1[0]?.[0]}
    />
  );
}
