import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  createColumnHelper,
  type ColumnFiltersState,
  type PaginationState,
} from "@tanstack/react-table";
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

export type FefRow = {
  id: string;
  description: string;
  shopField: string;
  weldGroupDescription: string;
  quantity: string;
  size: string;
  unit: string;
  metallurgyCode: string;
  boreSize: string;
  role: string;
  schedule: string;
  laborHours: string;
  laborRate: string;
  materialCost: string;
  equipment: string;
  notes: string;
};

export type CbsOption = {
  displayCode: string;
  name: string;
  uom: string;
  displayDescription: string | null;
};

const columnHelper = createColumnHelper<FefRow>();

function EditableCell({
  getValue,
  row,
  column,
  table,
}: {
  getValue: () => unknown;
  row: { index: number };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const initialValue = getValue() as string;
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onBlur = () => {
    table.options.meta?.updateData(row.index, column.id, value);
  };

  return (
    <input
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
    />
  );
}

function CbsSelectCell({
  row,
  table,
}: {
  getValue: () => unknown;
  row: { index: number; original: FefRow };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const currentDisplayCode = row.original.id;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = cbsOptions.find((o) => o.displayCode === e.target.value);
    if (selected) {
      table.options.meta?.updateRow?.(row.index, {
        id: selected.displayCode,
        description: selected.name,
        unit: selected.uom,
      });
    }
  };

  return (
    <select
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded bg-white"
      value={currentDisplayCode}
      onChange={handleChange}
    >
      <option value="">-- Select --</option>
      {cbsOptions.map((opt) => (
        <option key={opt.displayCode} value={opt.displayCode}>
          {opt.displayDescription ?? `${opt.displayCode}: ${opt.name}`}
        </option>
      ))}
    </select>
  );
}

function ColumnFilter({
  column,
  data,
}: {
  column: {
    id: string;
    getFilterValue: () => unknown;
    setFilterValue: (v: unknown) => void;
  };
  data: FefRow[];
}) {
  const value = (column.getFilterValue() ?? "") as string;
  const options = Array.from(
    new Set(data.map((row) => row[column.id as keyof FefRow])),
  ).sort();

  return (
    <select
      className="mt-1 w-full border border-gray-300 px-1 py-0.5 text-xs font-normal rounded focus:border-blue-400 focus:outline-none bg-white"
      value={value}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
    >
      <option value="">All</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

const columns = [
  columnHelper.accessor("id", { header: "ID", cell: EditableCell, size: 150 }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: CbsSelectCell,
    size: 300,
  }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("size", { header: "Size", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: EditableCell }),
  columnHelper.accessor("laborHours", {
    header: "Labor Hours",
    cell: EditableCell,
  }),
  columnHelper.accessor("laborRate", {
    header: "Labor Rate ($)",
    cell: EditableCell,
  }),
  columnHelper.accessor("materialCost", {
    header: "Material Cost ($)",
    cell: EditableCell,
  }),
  columnHelper.accessor("equipment", {
    header: "Equipment",
    cell: EditableCell,
  }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

const defaultRows: FefRow[] = [
  {
    id: "FEF-001",
    description: "Excavation - Site A",
    shopField: "",
    weldGroupDescription: "",
    quantity: "150",
    size: "4",
    unit: "CY",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "12",
    laborRate: "75",
    materialCost: "0",
    equipment: "Excavator",
    notes: "Soft soil",
  },
  {
    id: "FEF-002",
    description: "Concrete Footing",
    shopField: "",
    weldGroupDescription: "",
    quantity: "20",
    size: "6",
    unit: "CY",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "8",
    laborRate: "75",
    materialCost: "2400",
    equipment: "Mixer",
    notes: "3000 PSI mix",
  },
  {
    id: "FEF-003",
    description: "Steel Reinforcement",
    shopField: "",
    weldGroupDescription: "",
    quantity: "500",
    size: "6",
    unit: "LF",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "6",
    laborRate: "80",
    materialCost: "1800",
    equipment: "None",
    notes: "#4 rebar",
  },
  {
    id: "FEF-004",
    description: "Block Wall - 8in CMU",
    shopField: "",
    weldGroupDescription: "",
    quantity: "120",
    size: "6",
    unit: "SF",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "10",
    laborRate: "75",
    materialCost: "960",
    equipment: "None",
    notes: "Grouted cells",
  },
  {
    id: "FEF-005",
    description: "Waterproofing Membrane",
    shopField: "",
    weldGroupDescription: "",
    quantity: "200",
    size: "6",
    unit: "SF",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "4",
    laborRate: "70",
    materialCost: "600",
    equipment: "None",
    notes: "Below grade",
  },
  {
    id: "FEF-006",
    description: "Backfill & Compact",
    shopField: "",
    weldGroupDescription: "",
    quantity: "80",
    size: "6",
    unit: "CY",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "5",
    laborRate: "65",
    materialCost: "0",
    equipment: "Compactor",
    notes: "95% compaction",
  },
  {
    id: "FEF-007",
    description: "Electrical Conduit",
    shopField: "",
    weldGroupDescription: "",
    quantity: "300",
    size: "6",
    unit: "LF",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "9",
    laborRate: "90",
    materialCost: "1200",
    equipment: "None",
    notes: "2in PVC",
  },
  {
    id: "FEF-008",
    description: "Plumbing - Rough In",
    shopField: "",
    weldGroupDescription: "",
    quantity: "5",
    size: "6",
    unit: "EA",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "16",
    laborRate: "95",
    materialCost: "850",
    equipment: "None",
    notes: "PEX supply lines",
  },
  {
    id: "FEF-009",
    description: "Framing - Exterior Wall",
    shopField: "",
    weldGroupDescription: "",
    quantity: "400",
    size: "6",
    unit: "SF",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "14",
    laborRate: "75",
    materialCost: "3200",
    equipment: "None",
    notes: "2x6 @ 16 OC",
  },
  {
    id: "FEF-010",
    description: "Roofing - Underlayment",
    shopField: "",
    weldGroupDescription: "",
    quantity: "25",
    size: "6",
    unit: "SQ",
    metallurgyCode: "",
    boreSize: "MB",
    role: "",
    schedule: "",
    laborHours: "8",
    laborRate: "80",
    materialCost: "1500",
    equipment: "None",
    notes: "30lb felt paper",
  },
];

type TableState = {
  data: FefRow[];
  setData: React.Dispatch<React.SetStateAction<FefRow[]>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  cbsOptions?: CbsOption[];
};

function TableContent({
  data,
  setData,
  columnFilters,
  setColumnFilters,
  cbsOptions,
}: TableState) {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    state: { columnFilters, pagination },
    meta: {
      cbsOptions: cbsOptions ?? [],
      updateData: (rowIndex: number, columnId: string, value: string) => {
        setData((old) =>
          old.map((row, index) =>
            index === rowIndex ? { ...row, [columnId]: value } : row,
          ),
        );
      },
      updateRow: (rowIndex: number, updates: Record<string, string>) => {
        setData((old) =>
          old.map((row, index) =>
            index === rowIndex ? { ...row, ...updates } : row,
          ),
        );
      },
    },
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-gray-100">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  style={{ minWidth: header.column.getSize() }}
                  className="border border-gray-300 px-3 py-2 text-left font-semibold"
                >
                  <div className="flex flex-col gap-1">
                    <span className="whitespace-nowrap">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </span>
                    <ColumnFilter column={header.column} data={data} />
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{ minWidth: cell.column.getSize() }}
                  className="border border-gray-300"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {"<<"}
          </button>
          <button
            className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {"<"}
          </button>
          <button
            className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {">"}
          </button>
          <button
            className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
          >
            {">>"}
          </button>
        </div>
        <span>
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()} &mdash;{" "}
          {table.getFilteredRowModel().rows.length} rows
        </span>
      </div>
    </div>
  );
}

function useTableState(initialRows?: FefRow[], cbsOptions?: CbsOption[]) {
  const [data, setData] = React.useState<FefRow[]>(initialRows ?? defaultRows);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  React.useEffect(() => {
    if (initialRows !== undefined) setData(initialRows);
  }, [initialRows]);
  return { data, setData, columnFilters, setColumnFilters, cbsOptions };
}

export function FefTable({ title }: { title: string }) {
  const state = useTableState();
  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <TableContent {...state} />
    </main>
  );
}

const tabTriggerClass =
  "rounded-none border-b-2 border-transparent bg-transparent px-5 py-2.5 text-sm font-medium text-slate-500 shadow-none transition-colors hover:text-slate-800 data-active:border-red-700 data-active:text-red-800 data-active:bg-transparent";

export function DisciplinePage({
  title,
  initialRows,
  cbsOptions,
}: {
  title?: string;
  initialRows?: FefRow[];
  cbsOptions?: CbsOption[];
}) {
  const estimateState = useTableState(initialRows, cbsOptions);
  const takeoffState = useTableState(undefined, cbsOptions);

  const tabs = (
    <Tabs defaultValue="estimate" className="w-full">
      <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0 h-auto gap-0">
        <TabsTrigger value="estimate" className={tabTriggerClass}>
          Field Estimate
        </TabsTrigger>
        <TabsTrigger value="takeoff" className={tabTriggerClass}>
          Take Off
        </TabsTrigger>
      </TabsList>
      <TabsContent value="estimate" className="mt-4">
        <TableContent {...estimateState} />
      </TabsContent>
      <TabsContent value="takeoff" className="mt-4">
        <TableContent {...takeoffState} />
      </TabsContent>
    </Tabs>
  );

  if (!title) return tabs;

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      {tabs}
    </main>
  );
}
