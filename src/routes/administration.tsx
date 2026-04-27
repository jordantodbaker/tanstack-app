import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage, type FefRow } from "~/components/FefTable";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/administration")({
  loader: () => fetchCbsItemsByL1({ data: ["010", "012"] }),
  component: AdministrationPage,
});

function AdministrationPage() {
  const cbsItems = Route.useLoaderData();

  const rows: FefRow[] = cbsItems.map((item) => ({
    id: item.displayCode,
    description: item.name ?? "",
    location: "",
    quantity: "",
    unit: item.uom,
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
  }));

  return (
    <DisciplinePage title="Administration & Home Office" initialRows={rows} />
  );
}
