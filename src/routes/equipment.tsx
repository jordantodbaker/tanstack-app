import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/equipment")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.equipment.l1Codes! }),
  component: () => <DisciplineRoute title="Equipment" cbsItems={Route.useLoaderData()} />,
});
