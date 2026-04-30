import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/electric")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.electric.l1Codes! }),
  component: () => <DisciplineRoute title="Electric" cbsItems={Route.useLoaderData()} />,
});
