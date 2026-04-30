import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/buildings")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.buildings.l1Codes! }),
  component: () => <DisciplineRoute title="Buildings" cbsItems={Route.useLoaderData()} />,
});
