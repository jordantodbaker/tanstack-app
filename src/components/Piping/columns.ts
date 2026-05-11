import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { FefRow } from "~/lib/types";
import { EditableCell, SizeCell, CbsSelectCell, ReadOnlyCell, TakeOffIdReadOnlyCell, CbsNameCell, CbsUomCell, DeleteRowCell } from "~/lib/table-utils";
import {
  ShopFieldSelectCell,
  WeldGroupSelectCell,
  TotalCostCell,
  RoleSelectCell,
  ScheduleSelectCell,
  TaskCodeSelectCell,
  LaborFactorCell,
  LaborHoursCell,
  PipingSizeCell,
  SubCheckboxCell,
} from "~/components/Piping/cells";

const columnHelper = createColumnHelper<FefRow>();

export const takeOffColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: TakeOffIdReadOnlyCell, size: 150 }),
  columnHelper.accessor("name", {
    header: "Name",
    cell: CbsSelectCell,
    size: 300,
  }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: EditableCell,
    size: 250,
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
  columnHelper.accessor("taskCode", {
    header: "Task Code",
    cell: TaskCodeSelectCell,
    size: 160,
  }),
  columnHelper.accessor("quantity", { header: "Quantity", cell: EditableCell }),
  columnHelper.accessor("size", { header: "Size", cell: PipingSizeCell }),
  columnHelper.accessor("sub", { header: "Sub", cell: SubCheckboxCell, size: 60 }),
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
  columnHelper.display({
    id: "laborFactor",
    header: "Labor Factor",
    cell: LaborFactorCell,
    size: 130,
  }),
  columnHelper.accessor("laborHours", {
    header: "Labor Hours",
    cell: LaborHoursCell,
  }),
  columnHelper.accessor("laborRate", {
    header: "Labor Rate ($)",
    cell: ReadOnlyCell,
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
