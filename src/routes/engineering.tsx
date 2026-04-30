import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/engineering")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.engineering.l1Codes! }),
  component: () => <DisciplineRoute title="Engineering" cbsItems={Route.useLoaderData()} />,
});
