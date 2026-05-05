import React from "react";
import { useReactTable } from "@tanstack/react-table";
import type { CbsOption, FefRow } from "~/lib/types";
import { editableCellClass, readOnlyCellClass } from "~/lib/table-utils";
import { computeBoreSize } from "~/lib/utils";

function lookupCbsItem(
  metallurgyCode: string,
  boreSize: string,
  cbsOptions: CbsOption[],
): CbsOption | undefined {
  if (!metallurgyCode || !boreSize) return undefined;
  const code = `${metallurgyCode}${boreSize}ST0000C`;
  return cbsOptions.find((o) => o.costCode === code);
}

export { ReadOnlyCell, TakeOffIdCell } from "~/lib/table-utils";

export function ShopFieldSelectCell({
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
      className={editableCellClass}
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
        const cbsMatch = lookupCbsItem(
          metallurgyCode,
          rowData.boreSize,
          table.options.meta?.cbsOptions ?? [],
        );
        table.options.meta?.updateRow?.(row.index, {
          shopField: newShopField,
          metallurgyCode,
          ...(cbsMatch
            ? {
                id: cbsMatch.displayCode,
                name: cbsMatch.name,
                unit: cbsMatch.uom,
              }
            : {}),
        });
      }}
    >
      <option value="">-- Select --</option>
      <option value="Shop">Shop</option>
      <option value="Field">Field</option>
    </select>
  );
}

export function WeldGroupSelectCell({
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
      className={editableCellClass}
      value={value}
      onChange={(e) => {
        const classification = e.target.value;
        const rowData = table.getRowModel().rows[row.index].original;
        const entry = classification
          ? weldGroupMaterialMap[classification]
          : undefined;
        const metallurgyCode =
          entry && rowData.shopField
            ? rowData.shopField === "Shop"
              ? entry.shopCode
              : entry.installCode
            : "";
        const cbsMatch = lookupCbsItem(
          metallurgyCode,
          rowData.boreSize,
          table.options.meta?.cbsOptions ?? [],
        );
        table.options.meta?.updateRow?.(row.index, {
          weldGroupDescription: classification,
          metallurgyCode,
          ...(cbsMatch
            ? {
                id: cbsMatch.displayCode,
                name: cbsMatch.name,
                unit: cbsMatch.uom,
              }
            : {}),
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

export function TotalCostCell({
  row,
}: {
  row: { original: FefRow };
  getValue: () => unknown;
}) {
  const hours = parseFloat(row.original.laborHours);
  const rate = parseFloat(row.original.laborRate);
  const total =
    !isNaN(hours) && !isNaN(rate) && row.original.laborRate !== ""
      ? (hours * rate).toFixed(2)
      : "";
  return <span className={readOnlyCellClass}>{total}</span>;
}

export function RoleSelectCell({
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
      className={editableCellClass}
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

function laborFactorFor(
  row: FefRow,
  lookup:
    | Map<string, { unit: string; values: Map<number, number> }>
    | undefined,
): number | undefined {
  if (!lookup || !row.taskCode || row.size === "") return undefined;
  const size = parseFloat(row.size);
  if (isNaN(size)) return undefined;
  return lookup.get(row.taskCode)?.values.get(size);
}

export function LaborFactorCell({
  row,
  table,
}: {
  row: { original: FefRow };
  getValue: () => unknown;
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const factor = laborFactorFor(
    row.original,
    table.options.meta?.pipingFactorLookup,
  );
  return (
    <span className={readOnlyCellClass}>
      {factor !== undefined ? String(factor) : ""}
    </span>
  );
}

export function LaborHoursCell({
  row,
  table,
}: {
  row: { index: number; original: FefRow };
  getValue: () => unknown;
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
}) {
  const factor = laborFactorFor(
    row.original,
    table.options.meta?.pipingFactorLookup,
  );
  const qty = parseFloat(row.original.quantity);
  const computed =
    factor !== undefined && !isNaN(qty) && row.original.quantity !== ""
      ? String(factor * qty)
      : "";

  const stored = row.original.laborHours;
  const rowIndex = row.index;
  const updateData = table.options.meta?.updateData;
  React.useEffect(() => {
    if (stored !== computed) {
      updateData?.(rowIndex, "laborHours", computed);
    }
  }, [stored, computed, rowIndex, updateData]);

  return <span className={readOnlyCellClass}>{computed}</span>;
}

export function TaskCodeSelectCell({
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
  const { taskCodeOptions = [], pipingFactorLookup } = table.options.meta ?? {};
  return (
    <select
      className={editableCellClass}
      value={value}
      onChange={(e) => {
        const newCode = e.target.value;
        const unit = newCode
          ? (pipingFactorLookup?.get(newCode)?.unit ?? "")
          : "";
        table.options.meta?.updateRow?.(row.index, {
          taskCode: newCode,
          unit,
        });
      }}
    >
      <option value="">-- Select --</option>
      {taskCodeOptions.map((opt) => (
        <option key={opt.code} value={opt.code}>
          {opt.taskDefinition} - {opt.code}
        </option>
      ))}
    </select>
  );
}

export function PipingSizeCell({
  getValue,
  row,
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
    const boreSize = computeBoreSize(value);
    const rowData = table.getRowModel().rows[row.index].original;
    const cbsMatch = lookupCbsItem(
      rowData.metallurgyCode,
      boreSize,
      table.options.meta?.cbsOptions ?? [],
    );
    table.options.meta?.updateRow?.(row.index, {
      size: value,
      boreSize,
      ...(cbsMatch
        ? {
            id: cbsMatch.displayCode,
            description: cbsMatch.name,
            unit: cbsMatch.uom,
          }
        : {}),
    });
  };

  return (
    <input
      className={editableCellClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
    />
  );
}

export function ScheduleSelectCell({
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
      className={editableCellClass}
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
