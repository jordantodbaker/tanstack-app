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
import { crewMixDataQueryOptions } from "~/utils/crewMixes";
import { useSelectedProject } from "~/lib/selected-project";
import {
  allowedFefCbsItemIdsQueryOptions,
} from "~/utils/setup";
import { fefRowsQueryOptions } from "~/utils/fefRows";
import {
  readProjectIdForLoader,
  tryPrefetchProjectQuery,
} from "~/utils/projectCookie";
import { resolveVersionIdForLoader } from "~/utils/versionCookie";
import { makeFefRow, toCbsOption } from "~/lib/fef-helpers";

const PIPING_L1 = disciplineById.piping.l1Codes!;
const PIPING_CRAFT_L1 = PIPING_L1.filter(
  (code) => !code.endsWith("01") && !code.endsWith("31"),
);
const SUPPORT_LABOR_L1 = ["602", "632"];

// Stable empty array for query fallbacks. Using one shared reference (instead of
// a fresh `[]`/`?? []` each render) keeps the piping meta references stable while
// queries stream in on a cold cache — without it, every query that resolves at a
// different time churns `metaRev`/option lists and re-renders the whole grid,
// which on cold load compounded until React hit "Maximum update depth exceeded".
const EMPTY: never[] = [];

export const Route = createFileRoute("/piping")({
  loader: async ({ context }) => {
    const projectId = await readProjectIdForLoader();
    const versionId = await resolveVersionIdForLoader(projectId);

    // Field-Estimate-only data — start fetching but don't block first paint.
    // useQuery on the client picks these up when they stream in.
    context.queryClient.prefetchQuery(
      cbsItemsByL1QueryOptions(SUPPORT_LABOR_L1),
    );
    if (versionId !== null) {
      context.queryClient.prefetchQuery(
        fefRowsQueryOptions({
          versionId,
          discipline: "piping",
          section: "SUPPORT_LABOR",
        }),
      );
    }
    if (projectId !== null) {
      context.queryClient.prefetchQuery(
        allowedFefCbsItemIdsQueryOptions(projectId),
      );
    }

    // Take-Off-critical data — block until ready so SSR HTML has Take Off rows.
    const critical: Promise<unknown>[] = [
      context.queryClient.ensureQueryData(pipingGroupsQueryOptions()),
      context.queryClient.ensureQueryData(roleDataQueryOptions("piping")),
      context.queryClient.ensureQueryData(crewMixDataQueryOptions()),
      context.queryClient.ensureQueryData(pipingFactorDataQueryOptions()),
    ];
    if (versionId !== null) {
      // Version/project-scoped prefetches are best-effort: a stale cookie the
      // user no longer has access to throws server-side; the page still
      // renders and ProjectGuard surfaces the not-assigned state.
      critical.push(
        tryPrefetchProjectQuery(
          context.queryClient.ensureQueryData(
            fefRowsQueryOptions({
              versionId,
              discipline: "piping",
              section: "TAKE_OFF",
            }),
          ),
        ),
      );
    }
    await Promise.all(critical);

    // Name-dropdown options: the large piping CBS catalog. Not needed for the
    // rows to render (they already carry their CBS code/name) — only to populate
    // the Name picker — so stream it in via useQuery instead of blocking first
    // paint. `prefetchQuery` never rejects, so no access-error guard is needed.
    if (projectId !== null) {
      context.queryClient.prefetchQuery(
        cbsItemsByL1FilteredQueryOptions({
          l1Values: PIPING_CRAFT_L1,
          projectId,
        }),
      );
    }
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

  const { data: pipingGroups = EMPTY } = useQuery(pipingGroupsQueryOptions());
  const { data: supportLaborItems = EMPTY } = useQuery(
    cbsItemsByL1QueryOptions(SUPPORT_LABOR_L1),
  );
  const { data: roleData } = useQuery(roleDataQueryOptions("piping"));
  const { data: crewMixOptions = EMPTY } = useQuery(crewMixDataQueryOptions());
  const { data: pipingFactorData } = useQuery(pipingFactorDataQueryOptions());

  const { data: items = EMPTY } = useQuery(
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
    () => new Set(allowedIds ?? EMPTY),
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
      roleOptions={roleData?.roleOptions ?? EMPTY}
      scheduleOptions={roleData?.scheduleOptions ?? EMPTY}
      roleRates={roleData?.roleRates ?? EMPTY}
      crewMixOptions={crewMixOptions}
      taskCodeOptions={pipingFactorData?.taskCodeOptions ?? EMPTY}
      pipingFactors={pipingFactorData?.pipingFactors ?? EMPTY}
    />
  );
}
