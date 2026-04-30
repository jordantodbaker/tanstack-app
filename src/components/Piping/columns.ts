import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { FefRow } from "~/lib/types";
import { EditableCell, SizeCell, CbsSelectCell, ReadOnlyCell, TakeOffIdReadOnlyCell } from "~/lib/table-utils";
import {
  ShopFieldSelectCell,
  WeldGroupSelectCell,
  TotalCostCell,
  RoleSelectCell,
  ScheduleSelectCell,
} from "~/components/Piping/cells";

const columnHelper = createColumnHelper<FefRow>();

export const takeOffColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: TakeOffIdReadOnlyCell, size: 150 }),
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
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
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
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

export const fieldEstimateColumns: ColumnDef<FefRow, string>[] = [
  columnHelper.accessor("id", { header: "ID", cell: ReadOnlyCell, size: 150 }),
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
  columnHelper.accessor("unit", { header: "Unit", cell: ReadOnlyCell }),
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
  columnHelper.accessor("notes", { header: "Notes", cell: EditableCell }),
];

export const supportLaborColumns: ColumnDef<FefRow, string>[] = [
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
];
