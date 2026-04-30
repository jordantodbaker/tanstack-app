import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/demolition")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.demolition.l1Codes! }),
  component: () => <DisciplineRoute title="Demolition" cbsItems={Route.useLoaderData()} />,
});
