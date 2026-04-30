import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage, type CbsOption, type FefRow } from "~/components/FefTable";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/steel")({
  loader: () =>
    fetchCbsItemsByL1({
      data: ["300", "301", "302", "303", "330", "331", "332", "333", "390", "391"],
    }),
  component: SteelPage,
});

function SteelPage() {
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
    shopField: "",
    weldGroupDescription: "",
    quantity: "",
    size: "",
    unit: item.uom,
    metallurgyCode: "",
    boreSize: "",
    role: "",
    schedule: "",
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
  }));

  return (
    <DisciplinePage
      title="Structural Steel"
      initialRows={rows}
      cbsOptions={cbsOptions}
    />
  );
}
