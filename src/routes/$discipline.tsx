import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { cbsItemsByL1FilteredQueryOptions } from "~/utils/cbs";
import { useSelectedProject } from "~/lib/selected-project";
import { EMPTY_ARRAY } from "~/lib/fef-helpers";
import { readProjectIdForLoader } from "~/utils/projectCookie";
import { resolveVersionIdForLoader } from "~/utils/versionCookie";
import { prefetchDisciplineLoaderData } from "~/utils/disciplineLoader";

export const Route = createFileRoute("/$discipline")({
  loader: async ({ params, context }) => {
    const config = disciplineById[params.discipline];
    if (!config?.l1Codes) throw notFound();

    const projectId = await readProjectIdForLoader();
    const versionId = await resolveVersionIdForLoader(projectId);

    // Name-dropdown options (the discipline's CBS codes this project may use,
    // hundreds of rows) — stream in via useQuery instead of blocking first
    // paint. The take-off rows already carry their CBS code/name; only the
    // Name picker + Support Labor seed need the catalog, and they populate a
    // moment later. Filtered to the project's grants on the server: the whole
    // block can run to thousands of codes (engineering, 3,000+) when a project
    // holds a fraction of them. Setup invalidates this when grants change.
    context.queryClient.prefetchQuery(
      cbsItemsByL1FilteredQueryOptions({
        l1Values: config.l1Codes,
        projectId,
      }),
    );

    // Role/crew-mix data + the take-off rows themselves stay blocking so the
    // grid's row data and labor-rate cells are present on first paint.
    await prefetchDisciplineLoaderData(
      context.queryClient,
      config.id,
      projectId,
      versionId,
    );

    return {
      title: config.label,
      disciplineId: config.id,
      l1Codes: config.l1Codes,
    };
  },
  component: DynamicDiscipline,
});

function DynamicDiscipline() {
  const { title, disciplineId, l1Codes } = Route.useLoaderData();
  const { projectId } = useSelectedProject();
  const { data: cbsItems = EMPTY_ARRAY } = useQuery(
    cbsItemsByL1FilteredQueryOptions({ l1Values: l1Codes, projectId }),
  );
  return (
    <DisciplineRoute
      title={title}
      disciplineId={disciplineId}
      cbsItems={cbsItems}
    />
  );
}
