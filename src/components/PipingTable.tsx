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
import type { CbsOption, FefRow } from "./FefTable";

export type { CbsOption, FefRow };

type PipingGroupValue = { id: number; size: number; value: number; pipingGroupId: number };
type PipingGroup = {
  id: number;
  groupNo: number;
  materialClassification: string;
  metallurgyCode: string;
  parentCode: string;
  weightCode: string;
  material: string;
  sched: string;
  percentAdder: number;
  values: PipingGroupValue[];
};

type ServerPagination = {
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (page: number) => void;
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

function WeldGroupSelectCell({
  getValue,
  row,
  table,
}: {
  getValue: () => unknown;
  row: { index: number };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const value = getValue() as string;
  const options = (table.options.meta as { weldGroupOptions?: string[] })?.weldGroupOptions ?? [];

  return (
    <select
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded bg-white"
      value={value}
      onChange={(e) =>
        table.options.meta?.updateData(row.index, "weldGroupDescription", e.target.value)
      }
    >
      <option value="">-- Select --</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
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
  columnHelper.accessor("location", { header: "Location", cell: EditableCell }),
  columnHelper.accessor("weldGroupDescription", {
    header: "Weld Group Description",
    cell: WeldGroupSelectCell,
    size: 220,
  }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
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
    location: "Zone 1",
    weldGroupDescription: "",
    quantity: "150",
    unit: "CY",
    laborHours: "12",
    laborRate: "75",
    materialCost: "0",
    equipment: "Excavator",
    notes: "Soft soil",
  },
];

type TableState = {
  data: FefRow[];
  setData: React.Dispatch<React.SetStateAction<FefRow[]>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  cbsOptions?: CbsOption[];
  weldGroupOptions?: string[];
};

function TableContent({
  data,
  setData,
  columnFilters,
  setColumnFilters,
  cbsOptions,
  weldGroupOptions,
  serverPagination,
}: TableState & { serverPagination?: ServerPagination }) {
  const [localPageIndex, setLocalPageIndex] = React.useState(0);

  const pagination: PaginationState = serverPagination
    ? { pageIndex: serverPagination.pageIndex, pageSize: serverPagination.pageSize }
    : { pageIndex: localPageIndex, pageSize: 25 };

  const table = useReactTable({
    data,
    columns,
    manualPagination: !!serverPagination,
    pageCount: serverPagination
      ? Math.ceil(serverPagination.totalCount / serverPagination.pageSize)
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(pagination) : updater;
      if (serverPagination) {
        serverPagination.onPageChange(next.pageIndex);
      } else {
        setLocalPageIndex(next.pageIndex);
      }
    },
    state: { columnFilters, pagination },
    meta: {
      cbsOptions: cbsOptions ?? [],
      weldGroupOptions: weldGroupOptions ?? [],
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
          {serverPagination
            ? serverPagination.totalCount
            : table.getFilteredRowModel().rows.length}{" "}
          rows
        </span>
      </div>
    </div>
  );
}

function useTableState(initialRows?: FefRow[], cbsOptions?: CbsOption[], weldGroupOptions?: string[]) {
  const [data, setData] = React.useState<FefRow[]>(initialRows ?? defaultRows);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  React.useEffect(() => {
    if (initialRows !== undefined) setData(initialRows);
  }, [initialRows]);
  return { data, setData, columnFilters, setColumnFilters, cbsOptions, weldGroupOptions };
}

function PipingGroupsTable({ groups }: { groups: PipingGroup[] }) {
  const rows = groups.flatMap((g) =>
    g.values.map((v) => ({ ...g, size: v.size, value: v.value })),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            {["Group No", "Material Classification", "Material", "Metallurgy Code", "Parent Code", "Weight Code", "Sched", "% Adder", "Size", "Value"].map((h) => (
              <th key={h} className="border border-gray-300 px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="border border-gray-300 px-3 py-1">{row.groupNo}</td>
              <td className="border border-gray-300 px-3 py-1">{row.materialClassification}</td>
              <td className="border border-gray-300 px-3 py-1">{row.material}</td>
              <td className="border border-gray-300 px-3 py-1">{row.metallurgyCode}</td>
              <td className="border border-gray-300 px-3 py-1">{row.parentCode}</td>
              <td className="border border-gray-300 px-3 py-1">{row.weightCode}</td>
              <td className="border border-gray-300 px-3 py-1">{row.sched}</td>
              <td className="border border-gray-300 px-3 py-1">{row.percentAdder}</td>
              <td className="border border-gray-300 px-3 py-1">{row.size}</td>
              <td className="border border-gray-300 px-3 py-1">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-sm text-gray-500">{rows.length} rows</div>
    </div>
  );
}

const tabTriggerClass =
  "rounded-none border-b-2 border-transparent bg-transparent px-5 py-2.5 text-sm font-medium text-slate-500 shadow-none transition-colors hover:text-slate-800 data-active:border-red-700 data-active:text-red-800 data-active:bg-transparent";

export function PipingDisciplinePage({
  title,
  initialRows,
  cbsOptions,
  pipingGroups,
  serverPagination,
}: {
  title: string;
  initialRows: FefRow[];
  cbsOptions: CbsOption[];
  pipingGroups: PipingGroup[];
  serverPagination: ServerPagination;
}) {
  const weldGroupOptions = React.useMemo(
    () => Array.from(new Set(pipingGroups.map((g) => g.materialClassification))).sort(),
    [pipingGroups],
  );
  const estimateState = useTableState(initialRows, cbsOptions, weldGroupOptions);
  const takeoffState = useTableState(undefined, cbsOptions);

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <Tabs defaultValue="estimate" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0 h-auto gap-0">
          <TabsTrigger value="estimate" className={tabTriggerClass}>
            Field Estimate
          </TabsTrigger>
          <TabsTrigger value="takeoff" className={tabTriggerClass}>
            Take Off
          </TabsTrigger>
          <TabsTrigger value="groups" className={tabTriggerClass}>
            Piping Groups
          </TabsTrigger>
        </TabsList>
        <TabsContent value="estimate" className="mt-4">
          <TableContent {...estimateState} serverPagination={serverPagination} />
        </TabsContent>
        <TabsContent value="takeoff" className="mt-4">
          <TableContent {...takeoffState} />
        </TabsContent>
        <TabsContent value="groups" className="mt-4">
          <PipingGroupsTable groups={pipingGroups} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
