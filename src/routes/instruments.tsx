import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/instruments")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.instruments.l1Codes! }),
  component: () => <DisciplineRoute title="Instruments & Controls" cbsItems={Route.useLoaderData()} />,
});
