import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  createColumnHelper,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

export type FefRow = {
  id: string;
  description: string;
  location: string;
  quantity: string;
  unit: string;
  laborHours: string;
  laborRate: string;
  materialCost: string;
  equipment: string;
  notes: string;
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
  columnHelper.accessor("id", { header: "ID", cell: EditableCell }),
  columnHelper.accessor("description", { header: "Description", cell: EditableCell }),
  columnHelper.accessor("location", { header: "Location", cell: EditableCell }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: EditableCell }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: EditableCell }),
  columnHelper.accessor("laborRate", { header: "Labor Rate ($)", cell: EditableCell }),
  columnHelper.accessor("materialCost", { header: "Material Cost ($)", cell: EditableCell }),
  columnHelper.accessor("equipment", { header: "Equipment", cell: EditableCell }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

const defaultRows: FefRow[] = [
  { id: "FEF-001", description: "Excavation - Site A", location: "Zone 1", quantity: "150", unit: "CY", laborHours: "12", laborRate: "75", materialCost: "0", equipment: "Excavator", notes: "Soft soil" },
  { id: "FEF-002", description: "Concrete Footing", location: "Zone 1", quantity: "20", unit: "CY", laborHours: "8", laborRate: "75", materialCost: "2400", equipment: "Mixer", notes: "3000 PSI mix" },
  { id: "FEF-003", description: "Steel Reinforcement", location: "Zone 1", quantity: "500", unit: "LF", laborHours: "6", laborRate: "80", materialCost: "1800", equipment: "None", notes: "#4 rebar" },
  { id: "FEF-004", description: "Block Wall - 8in CMU", location: "Zone 2", quantity: "120", unit: "SF", laborHours: "10", laborRate: "75", materialCost: "960", equipment: "None", notes: "Grouted cells" },
  { id: "FEF-005", description: "Waterproofing Membrane", location: "Zone 2", quantity: "200", unit: "SF", laborHours: "4", laborRate: "70", materialCost: "600", equipment: "None", notes: "Below grade" },
  { id: "FEF-006", description: "Backfill & Compact", location: "Zone 2", quantity: "80", unit: "CY", laborHours: "5", laborRate: "65", materialCost: "0", equipment: "Compactor", notes: "95% compaction" },
  { id: "FEF-007", description: "Electrical Conduit", location: "Zone 3", quantity: "300", unit: "LF", laborHours: "9", laborRate: "90", materialCost: "1200", equipment: "None", notes: "2in PVC" },
  { id: "FEF-008", description: "Plumbing - Rough In", location: "Zone 3", quantity: "5", unit: "EA", laborHours: "16", laborRate: "95", materialCost: "850", equipment: "None", notes: "PEX supply lines" },
  { id: "FEF-009", description: "Framing - Exterior Wall", location: "Zone 4", quantity: "400", unit: "SF", laborHours: "14", laborRate: "75", materialCost: "3200", equipment: "None", notes: "2x6 @ 16 OC" },
  { id: "FEF-010", description: "Roofing - Underlayment", location: "Zone 4", quantity: "25", unit: "SQ", laborHours: "8", laborRate: "80", materialCost: "1500", equipment: "None", notes: "30lb felt paper" },
];

type TableState = {
  data: FefRow[];
  setData: React.Dispatch<React.SetStateAction<FefRow[]>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
};

function TableContent({ data, setData, columnFilters, setColumnFilters }: TableState) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    state: { columnFilters },
    meta: {
      updateData: (rowIndex: number, columnId: string, value: string) => {
        setData((old) =>
          old.map((row, index) =>
            index === rowIndex ? { ...row, [columnId]: value } : row,
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
                  className="border border-gray-300 px-3 py-2 text-left font-semibold"
                >
                  <div className="flex flex-col gap-1">
                    <span className="whitespace-nowrap">
                      {flexRender(header.column.columnDef.header, header.getContext())}
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
            <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="border border-gray-300">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useTableState() {
  const [data, setData] = React.useState<FefRow[]>(defaultRows);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  return { data, setData, columnFilters, setColumnFilters };
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

export function DisciplinePage({ title }: { title: string }) {
  const estimateState = useTableState();
  const takeoffState = useTableState();

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
        </TabsList>
        <TabsContent value="estimate" className="mt-4">
          <TableContent {...estimateState} />
        </TabsContent>
        <TabsContent value="takeoff" className="mt-4">
          <TableContent {...takeoffState} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
