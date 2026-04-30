import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/commissioning")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.commissioning.l1Codes! }),
  component: () => <DisciplineRoute title="Commissioning" cbsItems={Route.useLoaderData()} />,
});
