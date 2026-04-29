import { createFileRoute } from "@tanstack/react-router";
import { DisciplinePage, type CbsOption, type FefRow } from "~/components/FefTable";
import { fetchCbsItemsByL1 } from "~/utils/cbs";

const PIPING_L1 = [
  "600", "601", "602", "603", "604", "605",
  "606", "607", "608", "609", "610", "611",
  "612", "613", "681", "691",
];

export const Route = createFileRoute("/piping")({
  loader: () => fetchCbsItemsByL1({ data: PIPING_L1 }),
  component: PipingPage,
});

function PipingPage() {
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
      title="Piping"
      initialRows={rows}
      cbsOptions={cbsOptions}
    />
  );
}
