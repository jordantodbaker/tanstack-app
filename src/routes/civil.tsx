import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/civil")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.civil.l1Codes! }),
  component: () => <DisciplineRoute title="Civil" cbsItems={Route.useLoaderData()} />,
});
