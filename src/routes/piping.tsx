import { createFileRoute } from "@tanstack/react-router";
import {
  PipingDisciplinePage,
  type CbsOption,
  type FefRow,
} from "~/components/PipingTable";
import { fetchCbsItemsByL1Paged } from "~/utils/cbs";
import { fetchPipingGroups } from "~/utils/piping";

const PIPING_L1 = [
  "600",
  "631",
  "632",
  "633",
  "634",
  "635",
  "636",
  "637",
  "638",
  "639",
  "640",
  "641",
  "642",
  "643",
  "680",
  "690",
];

const PAGE_SIZE = 25;

export const Route = createFileRoute("/piping")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Math.max(0, Number(search.page ?? 0)),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ deps }) =>
    Promise.all([
      fetchCbsItemsByL1Paged({
        data: { l1Values: PIPING_L1, page: deps.page, pageSize: PAGE_SIZE },
      }),
      fetchPipingGroups(),
    ]).then(([cbsData, pipingGroups]) => ({ ...cbsData, pipingGroups })),
  component: PipingPage,
});

function PipingPage() {
  const { items, total, pipingGroups } = Route.useLoaderData();
  const { page } = Route.useSearch();
  const navigate = Route.useNavigate();

  const cbsOptions: CbsOption[] = items.map((item) => ({
    displayCode: item.displayCode,
    name: item.name,
    uom: item.uom,
    displayDescription: item.displayDescription ?? null,
  }));

  const rows: FefRow[] = items.map((item) => ({
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
    <PipingDisciplinePage
      title="Piping"
      initialRows={rows}
      cbsOptions={cbsOptions}
      pipingGroups={pipingGroups}
      serverPagination={{
        totalCount: total,
        pageIndex: page,
        pageSize: PAGE_SIZE,
        onPageChange: (newPage: number) =>
          navigate({ search: (prev) => ({ ...prev, page: newPage }) }),
      }}
    />
  );
}
