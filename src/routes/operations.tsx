import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/operations")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.operations.l1Codes! }),
  component: () => <DisciplineRoute title="Operations" cbsItems={Route.useLoaderData()} />,
});
