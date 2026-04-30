import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
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
import type { CbsOption, FefRow, BaseTableState } from "~/lib/types";
import {
  ColumnFilter,
  TablePagination,
  useTakeOffSync,
  TAKE_OFF_INITIAL_ROWS,
  FIELD_ESTIMATE_INITIAL_ROWS,
} from "~/lib/table-utils";
import {
  takeOffColumns,
  fieldEstimateColumns,
  supportLaborColumns,
} from "~/components/Piping/columns";

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

type TableState = BaseTableState & {
  weldGroupOptions?: string[];
  weldGroupMaterialMap?: Record<
    string,
    { shopCode: string; installCode: string }
  >;
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: { roleName: string; schedule: string; rate: number }[];
};

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
  const [data, setData] = React.useState<FefRow[]>(initialRows ?? TAKE_OFF_INITIAL_ROWS);
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
  columns: ColumnDef<FefRow, string>[];
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
      <TablePagination table={table} totalCount={serverPagination?.totalCount} />
    </div>
  );
}

const tabTriggerClass =
  "rounded-md border border-slate-300 bg-white px-6 py-4 text-lg font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 data-active:border-red-700 data-active:bg-red-700 data-active:text-white data-active:shadow";

export function PipingDisciplinePage({
  title,
  icon: Icon,
  cbsOptions,
  pipingGroups,
  serverPagination,
  supportLaborInitialRows,
  roleOptions,
  scheduleOptions,
  roleRates,
}: {
  title: string;
  icon?: React.ElementType;
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

  const takeOffState = useTableState(
    TAKE_OFF_INITIAL_ROWS,
    cbsOptions,
    weldGroupOptions,
    weldGroupMaterialMap,
  );
  const fieldEstimateState = useTableState(
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

  const syncToFieldEstimate = useTakeOffSync(takeOffState, fieldEstimateState);

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        {Icon && <Icon className="size-7" />}
        {title}
      </h1>
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
          <TableContent
            {...takeOffState}
            columns={takeOffColumns}
            serverPagination={serverPagination}
          />
        </TabsContent>
        <TabsContent value="estimate" className="mt-4">
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
                <TableContent
                  {...fieldEstimateState}
                  columns={fieldEstimateColumns}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>
    </main>
  );
}
