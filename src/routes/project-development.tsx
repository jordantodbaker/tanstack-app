import { createFileRoute } from "@tanstack/react-router";
import { DisciplineRoute } from "~/components/DisciplineRoute";
import { disciplineById } from "~/config/disciplines";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/project-development")({
  loader: () => fetchCbsItemsByL1({ data: disciplineById["project-development"].l1Codes! }),
  component: () => <DisciplineRoute title="Project Development" cbsItems={Route.useLoaderData()} />,
});
