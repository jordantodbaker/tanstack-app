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
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "~/components/ui/accordion";
import type { CbsOption, FefRow } from "./FefTable";
import { computeBoreSize } from "~/lib/utils";
import { EditableCell, SizeCell } from "~/lib/table-utils";

export type { CbsOption, FefRow };

type PipingGroupValue = {
  id: number;
  size: number;
  value: number;
  pipingGroupId: number;
};
type PipingGroup = {
  id: number;
  groupNo: number;
  materialClassification: string;
  installCode: string;
  shopCode: string;
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

function ShopFieldSelectCell({
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
  return (
    <select
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded bg-white"
      value={value}
      onChange={(e) => {
        const newShopField = e.target.value;
        const rowData = table.getRowModel().rows[row.index].original;
        const map = table.options.meta?.weldGroupMaterialMap ?? {};
        const entry = rowData.weldGroupDescription
          ? map[rowData.weldGroupDescription]
          : undefined;
        const metallurgyCode =
          entry && newShopField
            ? newShopField === "Shop"
              ? entry.shopCode
              : entry.installCode
            : "";
        table.options.meta?.updateRow?.(row.index, {
          shopField: newShopField,
          metallurgyCode,
        });
      }}
    >
      <option value="">-- Select --</option>
      <option value="Shop">Shop</option>
      <option value="Field">Field</option>
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
  const { weldGroupOptions = [], weldGroupMaterialMap = {} } =
    table.options.meta ?? {};

  return (
    <select
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded bg-white"
      value={value}
      onChange={(e) => {
        const classification = e.target.value;
        const shopField =
          table.getRowModel().rows[row.index].original.shopField;
        const entry = classification
          ? weldGroupMaterialMap[classification]
          : undefined;
        const metallurgyCode =
          entry && shopField
            ? shopField === "Shop"
              ? entry.shopCode
              : entry.installCode
            : "";
        table.options.meta?.updateRow?.(row.index, {
          weldGroupDescription: classification,
          metallurgyCode,
        });
      }}
    >
      <option value="">-- Select --</option>
      {weldGroupOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function TakeOffIdCell({
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
  const raw = getValue() as string;
  const initialValue = raw.startsWith("__fe-blank-") ? "" : raw;
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(raw.startsWith("__fe-blank-") ? "" : raw);
  }, [raw]);

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

function ReadOnlyCell({ getValue }: { getValue: () => unknown }) {
  return (
    <span className="block px-2 py-1 text-sm text-gray-700">
      {getValue() as string}
    </span>
  );
}

function TotalCostCell({ row }: { row: { original: FefRow }; getValue: () => unknown }) {
  const hours = parseFloat(row.original.laborHours);
  const rate = parseFloat(row.original.laborRate);
  const total = !isNaN(hours) && !isNaN(rate) && row.original.laborRate !== "" ? (hours * rate).toFixed(2) : "";
  return (
    <span className="block px-2 py-1 text-sm text-gray-700">{total}</span>
  );
}

function RoleSelectCell({
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
  const { roleOptions = [], roleRates = [] } = table.options.meta ?? {};
  return (
    <select
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded bg-white"
      value={value}
      onChange={(e) => {
        const newRole = e.target.value;
        const schedule = table.getRowModel().rows[row.index].original.schedule;
        const match = roleRates.find(
          (r) => r.roleName === newRole && r.schedule === schedule,
        );
        table.options.meta?.updateRow?.(row.index, {
          role: newRole,
          laborRate: match ? String(match.rate) : "",
        });
      }}
    >
      <option value="">-- Select --</option>
      {roleOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function ScheduleSelectCell({
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
  const { scheduleOptions = [], roleRates = [] } = table.options.meta ?? {};
  return (
    <select
      className="w-full border border-transparent px-2 py-1 text-sm focus:border-blue-400 focus:outline-none rounded bg-white"
      value={value}
      onChange={(e) => {
        const newSchedule = e.target.value;
        const role = table.getRowModel().rows[row.index].original.role;
        const match = roleRates.find(
          (r) => r.roleName === role && r.schedule === newSchedule,
        );
        table.options.meta?.updateRow?.(row.index, {
          schedule: newSchedule,
          laborRate: match ? String(match.rate) : "",
        });
      }}
    >
      <option value="">-- Select --</option>
      {scheduleOptions.map((opt) => (
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

const takeOffColumns: ColumnDef<FefRow, any>[] = [
  columnHelper.accessor("id", { header: "ID", cell: TakeOffIdCell, size: 150 }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: CbsSelectCell,
    size: 300,
  }),
  columnHelper.accessor("shopField", {
    header: "Shop / Field",
    cell: ShopFieldSelectCell,
    size: 130,
  }),
  columnHelper.accessor("weldGroupDescription", {
    header: "Weld Group Description",
    cell: WeldGroupSelectCell,
    size: 220,
  }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("size", { header: "Size", cell: SizeCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: EditableCell }),
  columnHelper.accessor("metallurgyCode", {
    header: "Metallurgy Code",
    cell: ReadOnlyCell,
    size: 140,
  }),
  columnHelper.accessor("boreSize", {
    header: "Bore Size",
    cell: ReadOnlyCell,
    size: 110,
  }),
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

const fieldEstimateColumns: ColumnDef<FefRow, any>[] = [
  columnHelper.accessor("id", { header: "ID", cell: EditableCell, size: 150 }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: CbsSelectCell,
    size: 300,
  }),
  columnHelper.accessor("shopField", {
    header: "Shop / Field",
    cell: ShopFieldSelectCell,
    size: 130,
  }),
  columnHelper.accessor("weldGroupDescription", {
    header: "Weld Group Description",
    cell: WeldGroupSelectCell,
    size: 220,
  }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("size", { header: "Size", cell: SizeCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: EditableCell }),
  columnHelper.accessor("metallurgyCode", {
    header: "Metallurgy Code",
    cell: ReadOnlyCell,
    size: 140,
  }),
  columnHelper.accessor("boreSize", {
    header: "Bore Size",
    cell: ReadOnlyCell,
    size: 110,
  }),
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

const supportLaborColumns: ColumnDef<FefRow, any>[] = [
  columnHelper.accessor("id", { header: "ID", cell: EditableCell, size: 150 }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: ReadOnlyCell,
    size: 300,
  }),
  columnHelper.accessor("role", {
    header: "Role",
    cell: RoleSelectCell,
    size: 180,
  }),
  columnHelper.accessor("schedule", {
    header: "Schedule",
    cell: ScheduleSelectCell,
    size: 150,
  }),
  columnHelper.accessor("unit", { header: "Unit", cell: EditableCell }),
  columnHelper.accessor("laborHours", {
    header: "Labor Hours",
    cell: EditableCell,
  }),
  columnHelper.accessor("laborRate", {
    header: "Labor Rate ($)",
    cell: ReadOnlyCell,
    size: 130,
  }),
  columnHelper.display({
    id: "totalCost",
    header: "Total Cost ($)",
    cell: TotalCostCell,
    size: 130,
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
    size: "150",
    unit: "CY",
    metallurgyCode: "",
    boreSize: "XB",
    role: "",
    schedule: "",
    laborHours: "12",
    laborRate: "75",
    materialCost: "0",
    equipment: "Excavator",
    notes: "Soft soil",
  },
];

function makeBlankRow(i: number): FefRow {
  return {
    id: `__fe-blank-${i}`,
    description: "",
    shopField: "",
    weldGroupDescription: "",
    quantity: "",
    size: "",
    unit: "",
    metallurgyCode: "",
    boreSize: "",
    role: "",
    schedule: "",
    laborHours: "",
    laborRate: "",
    materialCost: "",
    equipment: "",
    notes: "",
  };
}

const TAKE_OFF_INITIAL_ROWS: FefRow[] = Array.from({ length: 25 }, (_, i) =>
  makeBlankRow(i),
);

const FIELD_ESTIMATE_INITIAL_ROWS: FefRow[] = [];

type TableState = {
  data: FefRow[];
  setData: React.Dispatch<React.SetStateAction<FefRow[]>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  cbsOptions?: CbsOption[];
  weldGroupOptions?: string[];
  weldGroupMaterialMap?: Record<
    string,
    { shopCode: string; installCode: string }
  >;
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: { roleName: string; schedule: string; rate: number }[];
};

function TableContent({
  data,
  setData,
  columnFilters,
  setColumnFilters,
  cbsOptions,
  weldGroupOptions,
  weldGroupMaterialMap,
  roleOptions,
  scheduleOptions,
  roleRates,
  serverPagination,
  columns,
}: TableState & {
  serverPagination?: ServerPagination;
  columns: ColumnDef<FefRow, any>[];
}) {
  const [localPageIndex, setLocalPageIndex] = React.useState(0);

  const pagination: PaginationState = serverPagination
    ? {
        pageIndex: serverPagination.pageIndex,
        pageSize: serverPagination.pageSize,
      }
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
      weldGroupMaterialMap: weldGroupMaterialMap ?? {},
      roleOptions: roleOptions ?? [],
      scheduleOptions: scheduleOptions ?? [],
      roleRates: roleRates ?? [],
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

function useTableState(
  initialRows?: FefRow[],
  cbsOptions?: CbsOption[],
  weldGroupOptions?: string[],
  weldGroupMaterialMap?: Record<
    string,
    { shopCode: string; installCode: string }
  >,
  roleOptions?: string[],
  scheduleOptions?: string[],
  roleRates?: { roleName: string; schedule: string; rate: number }[],
) {
  const [data, setData] = React.useState<FefRow[]>(initialRows ?? defaultRows);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  React.useEffect(() => {
    if (initialRows !== undefined) setData(initialRows);
  }, [initialRows]);
  return {
    data,
    setData,
    columnFilters,
    setColumnFilters,
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
    roleOptions,
    scheduleOptions,
    roleRates,
  };
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
            {[
              "Group No",
              "Material Classification",
              "Material",
              "Install Code",
              "Shop Code",
              "Parent Code",
              "Weight Code",
              "Sched",
              "% Adder",
              "Size",
              "Value",
            ].map((h) => (
              <th
                key={h}
                className="border border-gray-300 px-3 py-2 text-left font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="border border-gray-300 px-3 py-1">
                {row.groupNo}
              </td>
              <td className="border border-gray-300 px-3 py-1">
                {row.materialClassification}
              </td>
              <td className="border border-gray-300 px-3 py-1">
                {row.material}
              </td>
              <td className="border border-gray-300 px-3 py-1">
                {row.installCode}
              </td>
              <td className="border border-gray-300 px-3 py-1">
                {row.shopCode}
              </td>
              <td className="border border-gray-300 px-3 py-1">
                {row.parentCode}
              </td>
              <td className="border border-gray-300 px-3 py-1">
                {row.weightCode}
              </td>
              <td className="border border-gray-300 px-3 py-1">{row.sched}</td>
              <td className="border border-gray-300 px-3 py-1">
                {row.percentAdder}
              </td>
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
  cbsOptions,
  pipingGroups,
  serverPagination,
  supportLaborInitialRows,
  roleOptions,
  scheduleOptions,
  roleRates,
}: {
  title: string;
  cbsOptions: CbsOption[];
  pipingGroups: PipingGroup[];
  serverPagination: ServerPagination;
  supportLaborInitialRows?: FefRow[];
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: { roleName: string; schedule: string; rate: number }[];
}) {
  const weldGroupOptions = React.useMemo(
    () =>
      Array.from(
        new Set(pipingGroups.map((g) => g.materialClassification)),
      ).sort(),
    [pipingGroups],
  );

  const weldGroupMaterialMap = React.useMemo(
    () =>
      Object.fromEntries(
        pipingGroups.map((g) => [
          g.materialClassification,
          { shopCode: g.shopCode, installCode: g.installCode },
        ]),
      ),
    [pipingGroups],
  );

  const estimateState = useTableState(
    TAKE_OFF_INITIAL_ROWS,
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
  );
  const takeoffState = useTableState(
    FIELD_ESTIMATE_INITIAL_ROWS,
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
  );
  const supportLaborState = useTableState(
    supportLaborInitialRows,
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
    roleOptions,
    scheduleOptions,
    roleRates,
  );

  const takeoffSyncedIds = React.useRef(new Set<string>());

  React.useEffect(() => {
    const qualifiedRows = estimateState.data.filter(
      (r) => Number(r.quantity) > 1,
    );
    const qualifiedIds = new Set(qualifiedRows.map((r) => r.id));
    const prevSyncedIds = takeoffSyncedIds.current;

    takeoffState.setData((prev) => {
      const prevMap = new Map(prev.map((r) => [r.id, r]));
      const retained = prev.filter(
        (r) => !prevSyncedIds.has(r.id) || qualifiedIds.has(r.id),
      );
      const added = qualifiedRows
        .filter((r) => !prevMap.has(r.id))
        .map((r) => ({ ...r }));
      return [...retained, ...added];
    });

    takeoffSyncedIds.current = qualifiedIds;
  }, [estimateState.data]);

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <Tabs defaultValue="estimate" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0 h-auto gap-0">
          <TabsTrigger value="estimate" className={tabTriggerClass}>
            Take Off
          </TabsTrigger>
          <TabsTrigger value="takeoff" className={tabTriggerClass}>
            Field Estimate
          </TabsTrigger>
          <TabsTrigger value="groups" className={tabTriggerClass}>
            Piping Groups
          </TabsTrigger>
        </TabsList>
        <TabsContent value="estimate" className="mt-4">
          <TableContent
            {...estimateState}
            columns={takeOffColumns}
            serverPagination={serverPagination}
          />
        </TabsContent>
        <TabsContent value="takeoff" className="mt-4">
          <Accordion type="multiple" defaultValue={["support", "craft"]}>
            <AccordionItem value="support">
              <AccordionTrigger>Support Labor</AccordionTrigger>
              <AccordionContent>
                <TableContent
                  {...supportLaborState}
                  columns={supportLaborColumns}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="craft">
              <AccordionTrigger>Craft Labor</AccordionTrigger>
              <AccordionContent>
                <TableContent {...takeoffState} columns={fieldEstimateColumns} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
        <TabsContent value="groups" className="mt-4">
          <PipingGroupsTable groups={pipingGroups} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
