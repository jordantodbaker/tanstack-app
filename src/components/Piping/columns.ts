import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { FefRow } from "~/lib/types";
import { EditableCell, DisplayEditCell, SizeCell, ReadOnlyCell, TakeOffIdReadOnlyCell, CbsNameCell, CbsUomCell, DeleteRowCell, AreaSelectCell, LABOR_COST_GROUP, type ColumnGroup } from "~/lib/table-utils";
import {
  ShopFieldSelectCell,
  FabricateErectSelectCell,
  WeldGroupSelectCell,
  TotalCostCell,
  RoleSelectCell,
  ScheduleSelectCell,
  TaskCodeSelectCell,
  LaborFactorCell,
  LaborHoursCell,
  PipingQuantityCell,
  PipingSizeCell,
  SubCheckboxCell,
  CrewMixSelectCell,
  CbsSearchSelectCell,
  PipeCategoryCell,
} from "~/components/Piping/cells";

const columnHelper = createColumnHelper<FefRow>();

export const takeOffColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: TakeOffIdReadOnlyCell, size: 100 }),
  // Read-only: on piping the CBS item is DERIVED, not chosen. Weld group +
  // Shop/Field give the metallurgy code, Size gives the bore, Fabricate/Erect
  // gives the FB/ER segment, and `resolveCbsStamp` stamps id/name/unit from
  // those. A dropdown here let someone pick an item the other four columns
  // contradict, and the next edit to any of them silently overwrote it.
  // Every one of the 748 weld-group x Shop/Field x Fab/Erect x size
  // combinations resolves to an item, so nothing is unreachable without it.
  columnHelper.accessor("name", { header: "Name", cell: CbsNameCell, size: 220 }),
  columnHelper.accessor("description", { header: "Description", cell: EditableCell, size: 180 }),
  columnHelper.accessor("area", { header: "Area", cell: AreaSelectCell, size: 140 }),
  // ── Reference ──
  columnHelper.accessor("projectPhase", { header: "Project Phase", cell: DisplayEditCell, size: 120 }),
  columnHelper.accessor("drawingNumber", { header: "Drawing Number", cell: DisplayEditCell, size: 130 }),
  columnHelper.accessor("drawingRev", { header: "Rev#", cell: DisplayEditCell, size: 60 }),
  columnHelper.accessor("processUnit", { header: "Process Unit", cell: DisplayEditCell, size: 120 }),
  columnHelper.accessor("areaName", { header: "Area Name", cell: DisplayEditCell, size: 130 }),
  columnHelper.accessor("systemName", { header: "System", cell: DisplayEditCell, size: 110 }),
  columnHelper.accessor("tagNumber", { header: "Tag Number", cell: DisplayEditCell, size: 110 }),
  // ── Spec & Testing ──
  columnHelper.accessor("lineSpec", { header: "Spec", cell: DisplayEditCell, size: 90 }),
  columnHelper.accessor("paintSpec", { header: "Paint Spec / Galv.", cell: DisplayEditCell, size: 130 }),
  columnHelper.accessor("insulation", { header: "Insulation", cell: DisplayEditCell, size: 100 }),
  columnHelper.accessor("nde", { header: "NDE", cell: DisplayEditCell, size: 70 }),
  columnHelper.accessor("pwht", { header: "PWHT", cell: DisplayEditCell, size: 70 }),
  columnHelper.accessor("hydro", { header: "HYDRO", cell: DisplayEditCell, size: 80 }),
  columnHelper.accessor("heatTrace", { header: "TRACE", cell: DisplayEditCell, size: 80 }),
  // ── Location ──
  columnHelper.accessor("agUg", { header: "AG / UG", cell: DisplayEditCell, size: 80 }),
  // ── Labor Adjustments ──
  columnHelper.accessor("feetAboveGrade", { header: "Feet above grade", cell: DisplayEditCell, size: 110 }),
  columnHelper.accessor("efficAdjust", { header: "Effic Adjust", cell: DisplayEditCell, size: 100 }),
  columnHelper.accessor("weldAdder", { header: "Weld Adder", cell: DisplayEditCell, size: 90 }),
  columnHelper.accessor("role", { header: "Role", cell: RoleSelectCell, size: 130 }),
  columnHelper.accessor("crewMixId", { header: "Crew Mix", cell: CrewMixSelectCell, size: 140 }),
  columnHelper.accessor("schedule", { header: "Schedule", cell: ScheduleSelectCell, size: 100 }),
  columnHelper.accessor("shopField", { header: "Shop / Field", cell: ShopFieldSelectCell, size: 90 }),
  columnHelper.accessor("fabricateErect", { header: "Fabricate / Erect", cell: FabricateErectSelectCell, size: 120 }),
  columnHelper.accessor("weldGroupDescription", { header: "Weld Group Description", cell: WeldGroupSelectCell, size: 160 }),
  columnHelper.accessor("taskCode", { header: "Task Code", cell: TaskCodeSelectCell, size: 110 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: PipingQuantityCell, size: 90 }),
  columnHelper.accessor("size", { header: "Size", cell: PipingSizeCell, size: 80 }),
  columnHelper.accessor("sub", { header: "Sub", cell: SubCheckboxCell, size: 50 }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell, size: 70 }),
  columnHelper.display({ id: "laborFactor", header: "Labor Factor", cell: LaborFactorCell, size: 100 }),
  columnHelper.accessor("laborHours", { header: "Labor Hours", cell: LaborHoursCell, size: 100 }),
  columnHelper.accessor("laborRate", { header: "Labor Rate ($)", cell: ReadOnlyCell, size: 110 }),
  columnHelper.display({ id: "totalCost", header: "Total Cost ($)", cell: TotalCostCell, size: 110 }),
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell, size: 130 }),
  columnHelper.display({ id: "delete", header: "", cell: DeleteRowCell, size: 40 }),
];

/** Grouped-header bands for the Piping take-off — includes the piping-only
 *  Spec & Testing group and the pipe-specific columns in the other groups. */
export const pipingTakeOffColumnGroups: ColumnGroup[] = [
  {
    label: "Reference",
    columnIds: [
      "projectPhase",
      "drawingNumber",
      "drawingRev",
      "processUnit",
      "areaName",
      "systemName",
      "tagNumber",
    ],
  },
  {
    label: "Spec & Testing",
    // Opens collapsed — QA/testing attributes are entered later in the workflow.
    defaultCollapsed: true,
    columnIds: [
      "lineSpec",
      "paintSpec",
      "insulation",
      "nde",
      "pwht",
      "hydro",
      "heatTrace",
    ],
  },
  { label: "Location", columnIds: ["agUg"] },
  {
    label: "Labor Adjustments",
    defaultCollapsed: true,
    columnIds: ["feetAboveGrade", "efficAdjust", "weldAdder"],
  },
  // Computed output columns — chip-only toggle (was the "Show Details" button).
  LABOR_COST_GROUP,
];

export const fieldEstimateColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("name", { header: "Name", cell: CbsNameCell, size: 300 }),
  columnHelper.accessor("shopField", { header: "Shop / Field", cell: ReadOnlyCell, size: 130 }),
  columnHelper.accessor("weldGroupDescription", { header: "Weld Group Description", cell: ReadOnlyCell, size: 220 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: ReadOnlyCell }),
  columnHelper.accessor("size", { header: "Size", cell: ReadOnlyCell }),
  // Derived from Size, not stored — a display column so nothing persists it.
  columnHelper.display({ id: "pipeCategory", header: "Pipe Category", cell: PipeCategoryCell, size: 110 }),
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
];

export const supportLaborColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: EditableCell, size: 150 }),
  columnHelper.accessor("name", {
    header: "Name",
    cell: CbsSearchSelectCell,
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
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
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
  columnHelper.display({
    id: "delete",
    header: "",
    cell: DeleteRowCell,
    size: 40,
  }),
];
