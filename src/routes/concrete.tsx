import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/concrete")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.concrete.l1Codes! }),
  component: () => <DisciplineRoute title="Concrete" cbsItems={Route.useLoaderData()} />,
});
