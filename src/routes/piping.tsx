import { createFileRoute } from "@tanstack/react-router";
import {
  DisciplinePage,
  type CbsOption,
  type FefRow,
} from "~/components/FefTable";
import { fetchCbsItemsByL1Paged } from "~/utils/cbs";

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
    fetchCbsItemsByL1Paged({
      data: { l1Values: PIPING_L1, page: deps.page, pageSize: PAGE_SIZE },
    }),
  component: PipingPage,
});

function PipingPage() {
  const { items, total } = Route.useLoaderData();
  const { page } = Route.useSearch();
  const navigate = Route.useNavigate();

  console.log("Items: ", items);

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
    quantity: "",
    unit: item.uom,
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
  }));

  console.log("Rows: ", rows);

  return (
    <DisciplinePage
      title="Piping"
      initialRows={rows}
      cbsOptions={cbsOptions}
      serverPagination={{
        totalCount: total,
        pageIndex: page,
        pageSize: PAGE_SIZE,
        onPageChange: (newPage) =>
          navigate({ search: (prev) => ({ ...prev, page: newPage }) }),
      }}
    />
  );
}
