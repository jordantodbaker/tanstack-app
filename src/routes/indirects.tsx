import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/indirects")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.indirects.l1Codes! }),
  component: () => <DisciplineRoute title="Indirects" cbsItems={Route.useLoaderData()} />,
});
