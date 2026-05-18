import React from "react";
import type { CbsOption, FefRow } from "~/lib/types";
import {
  editableCellClass,
  readOnlyCellClass,
  TextCell,
  type CellProps,
} from "~/lib/table-utils";
import { computeBoreSize } from "~/lib/utils";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "~/components/SearchableSelect";

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

export function ShopFieldSelectCell({ getValue, row, table }: CellProps) {
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

export function WeldGroupSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  const { weldGroupOptions = [], weldGroupMaterialMap = {} } =
    table.options.meta ?? {};

  const options: SearchableSelectOption[] = React.useMemo(
    () => weldGroupOptions.map((opt) => ({ value: opt, label: opt })),
    [weldGroupOptions],
  );

  return (
    <SearchableSelect
      value={value}
      options={options}
      onSelect={(classification) => {
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
    />
  );
}

export function SubCheckboxCell({ row, table }: CellProps) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const match = cbsOptions.find((o) => o.displayCode === row.original.id);
  const enabled = !!match && match.subReporting === true;
  const checked = row.original.sub === "true";

  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        aria-label="Sub reporting"
        checked={checked}
        disabled={!enabled}
        onChange={(e) => {
          table.options.meta?.updateData?.(
            row.index,
            "sub",
            e.target.checked ? "true" : "",
          );
        }}
        className={
          enabled
            ? "h-4 w-4 cursor-pointer accent-[#a63434]"
            : "h-4 w-4 cursor-not-allowed accent-slate-400 opacity-50"
        }
      />
    </div>
  );
}

export function TotalCostCell({ row }: CellProps) {
  const hours = parseFloat(row.original.laborHours);
  const rate = parseFloat(row.original.laborRate);
  const total =
    !isNaN(hours) && !isNaN(rate) && row.original.laborRate !== ""
      ? (hours * rate).toFixed(2)
      : "";
  return <span className={readOnlyCellClass}>{total}</span>;
}

export function RoleSelectCell({ getValue, row, table }: CellProps) {
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

export function LaborFactorCell({ row, table }: CellProps) {
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

export function LaborHoursCell({ row, table }: CellProps) {
  const factor = laborFactorFor(
    row.original,
    table.options.meta?.pipingFactorLookup,
  );
  const qty = parseFloat(row.original.quantity);
  const computed =
    factor !== undefined && !isNaN(qty) && row.original.quantity !== ""
      ? (factor * qty).toFixed(1)
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

export function TaskCodeSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  const { taskCodeOptions = [], pipingFactorLookup } = table.options.meta ?? {};

  const options: SearchableSelectOption[] = React.useMemo(
    () =>
      taskCodeOptions.map((opt) => ({
        value: opt.code,
        label: `${opt.taskDefinition} - ${opt.code}`,
        searchText: `${opt.taskDefinition} ${opt.code}`.toLowerCase(),
      })),
    [taskCodeOptions],
  );

  return (
    <SearchableSelect
      value={value}
      options={options}
      onSelect={(newCode) => {
        const unit = newCode
          ? (pipingFactorLookup?.get(newCode)?.unit ?? "")
          : "";
        table.options.meta?.updateRow?.(row.index, {
          taskCode: newCode,
          unit,
        });
      }}
    />
  );
}

export function PipingSizeCell({ getValue, row, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(value) => {
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
      }}
    />
  );
}

export function ScheduleSelectCell({ getValue, row, table }: CellProps) {
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
