import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { cbsItemsByL1QueryOptions } from "~/utils/cbs";
import { readProjectIdForLoader } from "~/utils/projectCookie";
import { prefetchDisciplineLoaderData } from "~/utils/disciplineLoader";

export const Route = createFileRoute("/$discipline")({
  loader: async ({ params, context }) => {
    const config = disciplineById[params.discipline];
    if (!config?.l1Codes) throw notFound();

    const projectId = await readProjectIdForLoader();
    await Promise.all([
      context.queryClient.ensureQueryData(
        cbsItemsByL1QueryOptions(config.l1Codes),
      ),
      prefetchDisciplineLoaderData(
        context.queryClient,
        config.id,
        projectId,
      ),
    ]);

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
  const { data: cbsItems = [] } = useQuery(cbsItemsByL1QueryOptions(l1Codes));
  return (
    <DisciplineRoute
      title={title}
      disciplineId={disciplineId}
      cbsItems={cbsItems}
    />
  );
}
