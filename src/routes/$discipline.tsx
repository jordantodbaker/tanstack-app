import { createFileRoute, notFound } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/$discipline")({
  loader: async ({ params }) => {
    const config = disciplineById[params.discipline];
    if (!config?.l1Codes) throw notFound();
    const cbsItems = await fetchCbsItemsByL1({ data: config.l1Codes });
    return { title: config.label, cbsItems };
  },
  component: DynamicDiscipline,
});

function DynamicDiscipline() {
  const { title, cbsItems } = Route.useLoaderData();
  return <DisciplineRoute title={title} cbsItems={cbsItems} />;
}
