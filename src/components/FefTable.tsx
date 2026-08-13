import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { FefRow, CbsOption } from "~/lib/types";
import { areasByProjectQueryOptions } from "~/utils/areas";
import { EMPTY_ARRAY } from "~/lib/fef-helpers";
import {
  EditableCell,
  DisplayEditCell,
  CbsSelectCell,
  CbsNameCell,
  CbsUomCell,
  ReadOnlyCell,
  TakeOffIdReadOnlyCell,
  DeleteRowCell,
  AreaSelectCell,
  LaborFactorInputCell,
  LaborFactorQuantityCell,
  ComputedLaborHoursCell,
  useFefTableState,
  FefTableContent,
  readOnlyCellClass,
  LABOR_COST_GROUP,
  type FefTableMeta,
  type ColumnGroup,
} from "~/lib/table-utils";
import {
  RoleSelectCell,
  ScheduleSelectCell,
  SubCheckboxCell,
  TotalCostCell,
  CrewMixSelectCell,
} from "~/components/Piping/cells";
import { supportLaborColumns } from "~/components/Piping/columns";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import { useFefRowPersistence } from "~/lib/use-fef-row-persistence";
import { DisciplineTabs } from "~/components/DisciplineTabs";
import { SaveIndicator } from "~/components/SaveIndicator";

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
  // ── Reference (universal) ──
  columnHelper.accessor("projectPhase", { header: "Project Phase", cell: DisplayEditCell, size: 130 }),
  columnHelper.accessor("drawingNumber", { header: "Drawing Number", cell: DisplayEditCell, size: 140 }),
  columnHelper.accessor("drawingRev", { header: "Rev#", cell: DisplayEditCell, size: 70 }),
  columnHelper.accessor("areaName", { header: "Area Name", cell: DisplayEditCell, size: 140 }),
  columnHelper.accessor("systemName", { header: "System", cell: DisplayEditCell, size: 120 }),
  columnHelper.accessor("tagNumber", { header: "Tag Number", cell: DisplayEditCell, size: 120 }),
  // ── Location (universal) ──
  columnHelper.accessor("elevation", { header: "Elevation", cell: DisplayEditCell, size: 100 }),
  // ── Labor Adjustments (universal) ──
  columnHelper.accessor("siteFactor", { header: "Site Factor", cell: DisplayEditCell, size: 100 }),
  columnHelper.accessor("feetAboveGrade", { header: "Feet above grade", cell: DisplayEditCell, size: 120 }),
  columnHelper.accessor("efficAdjust", { header: "Effic Adjust", cell: DisplayEditCell, size: 110 }),
  columnHelper.accessor("laborFactorAdj", { header: "Labor Factor", cell: DisplayEditCell, size: 110 }),
  columnHelper.accessor("elevAdder", { header: "Elev' Adder", cell: DisplayEditCell, size: 100 }),
  columnHelper.accessor("area", { header: "Area", cell: AreaSelectCell, size: 200 }),
  columnHelper.accessor("role", { header: "Role", cell: RoleSelectCell, size: 180 }),
  columnHelper.accessor("crewMixId", { header: "Crew Mix", cell: CrewMixSelectCell, size: 180 }),
  columnHelper.accessor("schedule", { header: "Schedule", cell: ScheduleSelectCell, size: 150 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: LaborFactorQuantityCell }),
  columnHelper.accessor("laborFactor", { header: "Labor Factor", cell: LaborFactorInputCell, size: 110 }),
  columnHelper.accessor("sub", { header: "Sub", cell: SubCheckboxCell, size: 60 }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: ComputedLaborHoursCell }),
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

/** Grouped-header bands for the generic (non-piping) take-off. Only the
 *  universal columns exist on this sheet, so the piping-only "Spec & Testing"
 *  group is absent. */
const takeOffColumnGroups: ColumnGroup[] = [
  {
    label: "Reference",
    columnIds: [
      "projectPhase",
      "drawingNumber",
      "drawingRev",
      "areaName",
      "systemName",
      "tagNumber",
    ],
  },
  { label: "Location", columnIds: ["elevation"] },
  {
    label: "Labor Adjustments",
    columnIds: [
      "siteFactor",
      "feetAboveGrade",
      "efficAdjust",
      "laborFactorAdj",
      "elevAdder",
    ],
  },
  // Computed output columns — chip-only toggle (was the "Show Details" button).
  LABOR_COST_GROUP,
];

// ── Structural Steel only: member dimensions (Height / Width / Length) ────────
const steelDimensionColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("height", { header: "H", cell: DisplayEditCell, size: 70 }),
  columnHelper.accessor("width", { header: "W", cell: DisplayEditCell, size: 70 }),
  columnHelper.accessor("length", { header: "L", cell: DisplayEditCell, size: 70 }),
];
const steelDimensionsGroup: ColumnGroup = {
  label: "Dimensions",
  columnIds: ["height", "width", "length"],
};

/** A column's leaf id — its explicit `id` or, for accessor columns, the key. */
function columnId(c: ColumnDef<FefRow, string>): string | undefined {
  return (
    (c as { id?: string }).id ?? (c as { accessorKey?: string }).accessorKey
  );
}

/** Return `base` with `extra` inserted immediately after the column `afterId`
 *  (appended if not found). Keeps the inserted columns contiguous for banners. */
function insertColumnsAfter(
  base: ColumnDef<FefRow, string>[],
  afterId: string,
  extra: ColumnDef<FefRow, string>[],
): ColumnDef<FefRow, string>[] {
  const idx = base.findIndex((c) => columnId(c) === afterId);
  if (idx < 0) return [...base, ...extra];
  return [...base.slice(0, idx + 1), ...extra, ...base.slice(idx + 1)];
}

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
  crewMixOptions,
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
  crewMixOptions?: FefTableMeta["crewMixOptions"];
}) {
  // Areas for the Take Off "Area" dropdown. Called unconditionally so it
  // sits above the materials early-return per the rules of hooks.
  const { projectId } = useSelectedProject();
  const { data: areas = EMPTY_ARRAY } = useQuery(
    areasByProjectQueryOptions(projectId),
  );
  const areaOptions = React.useMemo(
    () =>
      areas.map((a) => ({
        value: String(a.id),
        label: a.displayId ? `${a.displayId} — ${a.name}` : a.name,
      })),
    [areas],
  );

  // Structural Steel gets extra member-dimension columns (H/W/L) after Quantity,
  // plus a "Dimensions" group. Other disciplines use the base columns unchanged.
  const isSteel = disciplineId === "steel";
  const takeOffCols = React.useMemo(
    () =>
      isSteel
        ? insertColumnsAfter(takeOffColumns, "quantity", steelDimensionColumns)
        : takeOffColumns,
    [isSteel],
  );
  const takeOffGroups = React.useMemo(() => {
    if (!isSteel) return takeOffColumnGroups;
    // Dimensions chip sits after the banner groups, before chip-only Labor & Cost.
    const banner = takeOffColumnGroups.filter((g) => g.banner !== false);
    const chipOnly = takeOffColumnGroups.filter((g) => g.banner === false);
    return [...banner, steelDimensionsGroup, ...chipOnly];
  }, [isSteel]);

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
  // Take Off gets areaOptions + crewMixOptions; craft & support don't render
  // those columns.
  const takeOffMeta: FefTableMeta = {
    ...laborMeta,
    areaOptions,
    crewMixOptions,
  };
  // cbsOptions powers the searchable CBS picker on the Support Labor Name
  // column (client-filtered from the discipline's catalog).
  const supportMeta: FefTableMeta = {
    ...baseMeta,
    roleOptions,
    scheduleOptions,
    roleRates,
  };

  return (
    <DisciplineTabs
      title={title}
      icon={icon}
      discipline={disciplineId ?? ""}
      takeOffColumns={takeOffCols}
      takeOffColumnGroups={takeOffGroups}
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
  const { versionId } = useSelectedVersion();
  const takeOffState = useFefTableState({
    initialRows,
    sectionKey,
  });

  const { saveStatus, lastSavedAt } = useFefRowPersistence({
    versionId: sectionKey ? versionId : null,
    discipline: sectionKey ?? "",
    section: "MATERIALS",
    state: takeOffState,
    fallbackRows: initialRows,
  });

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>
      <FefTableContent
        state={takeOffState}
        meta={{ cbsOptions }}
        columns={materialsColumns}
      />
    </div>
  );
}
