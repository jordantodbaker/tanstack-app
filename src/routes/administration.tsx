import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage, type CbsOption, type FefRow } from "~/components/FefTable";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/administration")({
  loader: () => fetchCbsItemsByL1({ data: ["010", "012"] }),
  component: AdministrationPage,
});

function AdministrationPage() {
  const cbsItems = Route.useLoaderData();

  const cbsOptions: CbsOption[] = cbsItems.map((item) => ({
    displayCode: item.displayCode,
    name: item.name,
    uom: item.uom,
    displayDescription: item.displayDescription ?? null,
  }));

  const rows: FefRow[] = cbsItems.map((item) => ({
    id: item.displayCode,
    description: item.name ?? "",
    location: "",
    weldGroupDescription: "",
    quantity: "",
    unit: item.uom,
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
  }));

  return (
    <DisciplinePage
      title="Administration & Home Office"
      initialRows={rows}
      cbsOptions={cbsOptions}
    />
  );
}
