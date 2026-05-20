import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { FefRow, CbsOption } from "~/lib/types";
import { areasByProjectQueryOptions } from "~/utils/areas";
import {
  EditableCell,
  CbsSelectCell,
  CbsNameCell,
  CbsUomCell,
  ReadOnlyCell,
  TakeOffIdReadOnlyCell,
  DeleteRowCell,
  AreaSelectCell,
  useFefTableState,
  FefTableContent,
  readOnlyCellClass,
  type FefTableMeta,
} from "~/lib/table-utils";
import {
  RoleSelectCell,
  ScheduleSelectCell,
  SubCheckboxCell,
  TotalCostCell,
} from "~/components/Piping/cells";
import { supportLaborColumns } from "~/components/Piping/columns";
import { useSelectedProject } from "~/lib/selected-project";
import { useFefRowPersistence } from "~/lib/use-fef-row-persistence";
import { DisciplineTabs } from "~/components/DisciplineTabs";

const columnHelper = createColumnHelper<FefRow>();

function MaterialsTotalCostCell({
  row,
}: {
  row: { original: FefRow };
  getValue: () => unknown;
}) {
  const qty = parseFloat(row.original.quantity);
  const cost = parseFloat(row.original.materialCost);
  const total =
    !isNaN(qty) &&
    !isNaN(cost) &&
    row.original.quantity !== "" &&
    row.original.materialCost !== ""
      ? (qty * cost).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "";
  return <span className={readOnlyCellClass}>{total ? `$${total}` : ""}</span>;
}

const fieldEstimateColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("name", { header: "Name", cell: CbsNameCell, size: 300 }),
  columnHelper.accessor("role", { header: "Role", cell: ReadOnlyCell, size: 180 }),
  columnHelper.accessor("schedule", { header: "Schedule", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: ReadOnlyCell }),
  columnHelper.accessor("sub", { header: "Sub", cell: SubCheckboxCell, size: 60 }),
  columnHelper.accessor("unit", { header: "Unit", cell: CbsUomCell }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: ReadOnlyCell }),
  columnHelper.accessor("laborRate", { header: "Labor Rate ($)", cell: ReadOnlyCell }),
  columnHelper.display({
    id: "totalCost",
    header: "Total Cost ($)",
    cell: TotalCostCell,
    size: 130,
  }),
  columnHelper.accessor("notes", { header: "Notes", cell: ReadOnlyCell }),
];

const takeOffColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: TakeOffIdReadOnlyCell, size: 150 }),
  columnHelper.accessor("name", { header: "Name", cell: CbsSelectCell, size: 300 }),
  columnHelper.accessor("description", { header: "Description", cell: EditableCell, size: 250 }),
  columnHelper.accessor("area", { header: "Area", cell: AreaSelectCell, size: 200 }),
  columnHelper.accessor("role", { header: "Role", cell: RoleSelectCell, size: 180 }),
  columnHelper.accessor("schedule", { header: "Schedule", cell: ScheduleSelectCell, size: 150 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("sub", { header: "Sub", cell: SubCheckboxCell, size: 60 }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: EditableCell }),
  columnHelper.accessor("laborRate", { header: "Labor Rate ($)", cell: ReadOnlyCell }),
  columnHelper.display({
    id: "totalCost",
    header: "Total Cost ($)",
    cell: TotalCostCell,
    size: 130,
  }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
  columnHelper.display({
    id: "delete",
    header: "",
    cell: DeleteRowCell,
    size: 40,
  }),
];

const materialsColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("name", { header: "Name", cell: ReadOnlyCell, size: 300 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("materialCost", {
    header: "Material Cost ($)",
    cell: EditableCell,
  }),
  columnHelper.display({
    id: "totalCost",
    header: "Total Cost ($)",
    cell: MaterialsTotalCostCell,
  }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
  columnHelper.display({
    id: "delete",
    header: "",
    cell: DeleteRowCell,
    size: 40,
  }),
];

export function FefTable({ title }: { title: string }) {
  const state = useFefTableState();
  return (
    <main className="p-3 md:p-4">
      <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">{title}</h1>
      <FefTableContent state={state} columns={fieldEstimateColumns} />
    </main>
  );
}

export function DisciplinePage({
  title,
  disciplineId,
  icon,
  initialRows,
  cbsOptions,
  variant,
  sectionKey,
  supportLaborInitialRows,
  roleOptions,
  scheduleOptions,
  roleRates,
}: {
  title?: string;
  disciplineId?: string;
  icon?: React.ElementType;
  initialRows?: FefRow[];
  cbsOptions?: CbsOption[];
  variant?: "materials";
  sectionKey?: string;
  supportLaborInitialRows?: FefRow[];
  roleOptions?: string[];
  scheduleOptions?: string[];
  roleRates?: { roleName: string; schedule: string; rate: number }[];
}) {
  // Areas for the Take Off "Area" dropdown. Called unconditionally so it
  // sits above the materials early-return per the rules of hooks.
  const { projectId } = useSelectedProject();
  const { data: areas = [] } = useQuery(areasByProjectQueryOptions(projectId));
  const areaOptions = React.useMemo(
    () =>
      areas.map((a) => ({
        value: String(a.id),
        label: a.displayId ? `${a.displayId} — ${a.name}` : a.name,
      })),
    [areas],
  );

  if (variant === "materials") {
    return (
      <MaterialsSection
        initialRows={initialRows}
        cbsOptions={cbsOptions}
        sectionKey={sectionKey}
      />
    );
  }

  const baseMeta: FefTableMeta = { cbsOptions };
  const laborMeta: FefTableMeta = {
    ...baseMeta,
    roleOptions,
    scheduleOptions,
    roleRates,
  };
  // Take Off gets areaOptions; craft & support don't render an area column.
  const takeOffMeta: FefTableMeta = { ...laborMeta, areaOptions };
  const supportMeta: FefTableMeta = { roleOptions, scheduleOptions, roleRates };

  return (
    <DisciplineTabs
      title={title}
      icon={icon}
      discipline={disciplineId ?? ""}
      takeOffColumns={takeOffColumns}
      craftColumns={fieldEstimateColumns}
      supportLaborColumns={supportLaborColumns}
      takeOffMeta={takeOffMeta}
      craftMeta={laborMeta}
      supportLaborMeta={supportMeta}
      supportLaborInitialRows={supportLaborInitialRows}
    />
  );
}

function MaterialsSection({
  initialRows,
  cbsOptions,
  sectionKey,
}: {
  initialRows?: FefRow[];
  cbsOptions?: CbsOption[];
  sectionKey?: string;
}) {
  const { projectId } = useSelectedProject();
  const takeOffState = useFefTableState({
    initialRows,
    sectionKey,
  });

  useFefRowPersistence({
    projectId: sectionKey ? projectId : null,
    discipline: sectionKey ?? "",
    section: "MATERIALS",
    state: takeOffState,
    fallbackRows: initialRows,
  });

  return (
    <FefTableContent
      state={takeOffState}
      meta={{ cbsOptions }}
      columns={materialsColumns}
    />
  );
}
