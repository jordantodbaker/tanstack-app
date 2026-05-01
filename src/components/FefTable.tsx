import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  createColumnHelper,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
} from "@tanstack/react-table";
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { FefRow, CbsOption, BaseTableState } from "~/lib/types";
import {
  EditableCell,
  CbsSelectCell,
  ColumnFilter,
  ReadOnlyCell,
  TakeOffIdReadOnlyCell,
  TablePagination,
  useTakeOffSync,
  readOnlyCellClass,
  TAKE_OFF_INITIAL_ROWS,
  FIELD_ESTIMATE_INITIAL_ROWS,
} from "~/lib/table-utils";
import {
  setMaterialsSectionTotal,
  getMaterialsSectionRows,
  setMaterialsSectionRows,
} from "~/lib/materialsStore";

const columnHelper = createColumnHelper<FefRow>();

function MaterialsTotalCostCell({ row }: { row: { original: FefRow }; getValue: () => unknown }) {
  const qty = parseFloat(row.original.quantity);
  const cost = parseFloat(row.original.materialCost);
  const total =
    !isNaN(qty) && !isNaN(cost) && row.original.quantity !== "" && row.original.materialCost !== ""
      ? (qty * cost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "";
  return <span className={readOnlyCellClass}>{total ? `$${total}` : ""}</span>;
}

const fieldEstimateColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("description", { header: "Description", cell: CbsSelectCell, size: 300 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("size", { header: "Size", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: EditableCell }),
  columnHelper.accessor("laborRate", { header: "Labor Rate ($)", cell: EditableCell }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

const takeOffColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: TakeOffIdReadOnlyCell, size: 150 }),
  columnHelper.accessor("description", { header: "Description", cell: CbsSelectCell, size: 300 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("size", { header: "Size", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: EditableCell }),
  columnHelper.accessor("laborRate", { header: "Labor Rate ($)", cell: EditableCell }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

const materialsColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("description", { header: "Description", cell: ReadOnlyCell, size: 300 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("materialCost", { header: "Material Cost ($)", cell: EditableCell }),
  columnHelper.display({ id: "totalCost", header: "Total Cost ($)", cell: MaterialsTotalCostCell }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

type TableState = BaseTableState & {
  variant?: "materials";
};

function TableContent({
  data,
  setData,
  columnFilters,
  setColumnFilters,
  cbsOptions,
  variant,
  columns: columnsProp,
}: TableState & { columns?: ColumnDef<FefRow, string>[] }) {
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const resolvedColumns = columnsProp ?? (variant === "materials" ? materialsColumns : fieldEstimateColumns);

  const table = useReactTable({
    data,
    columns: resolvedColumns,
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
      <TablePagination table={table} />
    </div>
  );
}

function useTableState(
  initialRows?: FefRow[],
  cbsOptions?: CbsOption[],
  variant?: "materials",
  sectionKey?: string,
) {
  const [data, setDataState] = React.useState<FefRow[]>(() => {
    if (sectionKey) {
      const cached = getMaterialsSectionRows(sectionKey);
      if (cached) return cached;
    }
    return initialRows ?? TAKE_OFF_INITIAL_ROWS;
  });
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );

  const setData = React.useCallback<React.Dispatch<React.SetStateAction<FefRow[]>>>(
    (updater) => {
      setDataState((old) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: FefRow[]) => FefRow[])(old)
            : updater;
        if (sectionKey) setMaterialsSectionRows(sectionKey, next);
        return next;
      });
    },
    [sectionKey],
  );

  React.useEffect(() => {
    if (sectionKey) return;
    if (initialRows !== undefined) setDataState(initialRows);
  }, [initialRows, sectionKey]);

  return { data, setData, columnFilters, setColumnFilters, cbsOptions, variant };
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
  "rounded-md border border-slate-300 bg-white px-6 py-4 text-lg font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 data-active:border-[#a63434] data-active:bg-[#a63434] data-active:text-white data-active:shadow";

export function DisciplinePage({
  title,
  icon: Icon,
  initialRows,
  cbsOptions,
  variant,
  sectionKey,
}: {
  title?: string;
  icon?: React.ElementType;
  initialRows?: FefRow[];
  cbsOptions?: CbsOption[];
  variant?: "materials";
  sectionKey?: string;
}) {
  const takeOffState = useTableState(
    variant === "materials" ? initialRows : TAKE_OFF_INITIAL_ROWS,
    cbsOptions,
    variant,
    variant === "materials" ? sectionKey : undefined,
  );
  const fieldEstimateState = useTableState(FIELD_ESTIMATE_INITIAL_ROWS, cbsOptions, variant);

  const syncToFieldEstimate = useTakeOffSync(takeOffState, fieldEstimateState);

  React.useEffect(() => {
    if (variant !== "materials" || !sectionKey) return;
    const total = takeOffState.data.reduce((acc, row) => {
      const q = parseFloat(row.quantity);
      const c = parseFloat(row.materialCost);
      if (isNaN(q) || isNaN(c)) return acc;
      return acc + q * c;
    }, 0);
    setMaterialsSectionTotal(sectionKey, total);
  }, [variant, sectionKey, takeOffState.data]);

  if (variant === "materials") {
    return <TableContent {...takeOffState} />;
  }

  const tabs = (
    <Tabs
      defaultValue="takeoff"
      className="w-full"
      onValueChange={(v) => { if (v === "estimate") syncToFieldEstimate(); }}
    >
      <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0 pb-2 h-auto gap-2">
        <TabsTrigger value="takeoff" className={tabTriggerClass}>
          Take Off
        </TabsTrigger>
        <TabsTrigger value="estimate" className={tabTriggerClass}>
          Field Estimate
        </TabsTrigger>
      </TabsList>
      <TabsContent value="takeoff" className="mt-4">
        <TableContent {...takeOffState} columns={takeOffColumns} />
      </TabsContent>
      <TabsContent value="estimate" className="mt-4">
        <TableContent {...fieldEstimateState} />
      </TabsContent>
    </Tabs>
  );

  if (!title) return tabs;

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        {Icon && <Icon className="size-7" />}
        {title}
      </h1>
      {tabs}
    </main>
  );
}
