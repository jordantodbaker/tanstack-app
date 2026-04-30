import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/administration")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById.administration.l1Codes! }),
  component: () => <DisciplineRoute title="Administration & Home Office" cbsItems={Route.useLoaderData()} />,
});
