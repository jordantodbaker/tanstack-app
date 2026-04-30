import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/contingency")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.contingency.l1Codes! }),
  component: () => <DisciplineRoute title="Contingency" cbsItems={Route.useLoaderData()} />,
});
