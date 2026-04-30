import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage, type CbsOption, type FefRow } from "~/components/FefTable";
import { fetchCbsItemsByL1EndsWith } from "~/utils/cbs";

export const Route = createFileRoute("/materials")({
  loader: () => fetchCbsItemsByL1EndsWith({ data: "01" }),
  component: MaterialsPage,
});

function MaterialsPage() {
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
      title="Materials"
      initialRows={rows}
      cbsOptions={cbsOptions}
    />
  );
}
