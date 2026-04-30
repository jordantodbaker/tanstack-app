import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/steel")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.steel.l1Codes! }),
  component: () => <DisciplineRoute title="Structural Steel" cbsItems={Route.useLoaderData()} />,
});
