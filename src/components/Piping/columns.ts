import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { FefRow } from "~/lib/types";
import { EditableCell, SizeCell, CbsSelectCell, ReadOnlyCell, TakeOffIdReadOnlyCell, CbsNameCell, CbsUomCell, DeleteRowCell, AreaSelectCell } from "~/lib/table-utils";
import {
  ShopFieldSelectCell,
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
} from "~/components/Piping/cells";

const columnHelper = createColumnHelper<FefRow>();

export const takeOffColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: TakeOffIdReadOnlyCell, size: 100 }),
  columnHelper.accessor("name", { header: "Name", cell: CbsSelectCell, size: 220 }),
  columnHelper.accessor("description", { header: "Description", cell: EditableCell, size: 180 }),
  columnHelper.accessor("area", { header: "Area", cell: AreaSelectCell, size: 140 }),
  columnHelper.accessor("role", { header: "Role", cell: RoleSelectCell, size: 130 }),
  columnHelper.accessor("crewMixId", { header: "Crew Mix", cell: CrewMixSelectCell, size: 140 }),
  columnHelper.accessor("schedule", { header: "Schedule", cell: ScheduleSelectCell, size: 100 }),
  columnHelper.accessor("shopField", { header: "Shop / Field", cell: ShopFieldSelectCell, size: 90 }),
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

export const fieldEstimateColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
  columnHelper.accessor("name", { header: "Name", cell: CbsNameCell, size: 300 }),
  columnHelper.accessor("shopField", { header: "Shop / Field", cell: ReadOnlyCell, size: 130 }),
  columnHelper.accessor("weldGroupDescription", { header: "Weld Group Description", cell: ReadOnlyCell, size: 220 }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: ReadOnlyCell }),
  columnHelper.accessor("size", { header: "Size", cell: ReadOnlyCell }),
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
