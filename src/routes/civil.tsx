import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage, type CbsOption, type FefRow } from "~/components/FefTable";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/civil")({
  loader: () =>
    fetchCbsItemsByL1({
      data: ["100", "101", "102", "103", "131", "132", "133", "134", "135", "136", "137"],
    }),
  component: CivilPage,
});

function CivilPage() {
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
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
  }));

  return (
    <DisciplinePage title="Civil" initialRows={rows} cbsOptions={cbsOptions} />
  );
}
