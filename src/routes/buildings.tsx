import { createFileRoute } from "@tanstack/react-router";
import {
  DisciplinePage,
  type CbsOption,
  type FefRow,
} from "~/components/FefTable";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

export const Route = createFileRoute("/buildings")({
  loader: () =>
    fetchCbsItemsByL1({ data: ["400", "401", "402", "403", "407"] }),
  component: BuildingsPage,
});

function BuildingsPage() {
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
    <DisciplinePage
      title="Buildings"
      initialRows={rows}
      cbsOptions={cbsOptions}
    />
  );
}
