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

type PipingFactorLookup = Map<
  string,
  { unit: string; values: Map<number, number> }
>;

function laborFactorFor(
  row: Pick<FefRow, "taskCode" | "size">,
  lookup: PipingFactorLookup | undefined,
): number | undefined {
  if (!lookup || !row.taskCode || row.size === "") return undefined;
  const size = parseFloat(row.size);
  if (isNaN(size)) return undefined;
  return lookup.get(row.taskCode)?.values.get(size);
}

/**
 * Derives the labor-hours string a Take Off row should hold given its
 * current `taskCode`, `size`, and `quantity`. Returns `""` when the inputs
 * can't produce a value (missing factor, blank quantity, non-numeric qty).
 *
 * Lives here because the derivation needs to fire on the same event that
 * changes one of those three fields — the previous "compute on view, write
 * via useEffect" pattern in `LaborHoursCell` was issuing a debounced save
 * for every loaded row whose stored value didn't bit-match the recomputed
 * one, so just opening the take-off triggered a fan-out of saves.
 */
export function deriveLaborHours(
  row: Pick<FefRow, "taskCode" | "size" | "quantity">,
  lookup: PipingFactorLookup | undefined,
): string {
  const factor = laborFactorFor(row, lookup);
  const qty = parseFloat(row.quantity);
  if (factor === undefined || isNaN(qty) || row.quantity === "") return "";
  return (factor * qty).toFixed(1);
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

/**
 * Pure display. The stored value is the authoritative one — derivation
 * happens at edit time inside `TaskCodeSelectCell`, `PipingSizeCell`, and
 * `PipingQuantityCell`. View-time recompute used to write back via effect,
 * which generated a save on every row whose stored value diverged from the
 * current piping-factor table (e.g. after a factor CSV update).
 */
export function LaborHoursCell({ row }: CellProps) {
  return <span className={readOnlyCellClass}>{row.original.laborHours}</span>;
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
        const rowData = table.getRowModel().rows[row.index].original;
        const laborHours = deriveLaborHours(
          { ...rowData, taskCode: newCode },
          pipingFactorLookup,
        );
        table.options.meta?.updateRow?.(row.index, {
          taskCode: newCode,
          unit,
          laborHours,
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
        const laborHours = deriveLaborHours(
          { ...rowData, size: value },
          table.options.meta?.pipingFactorLookup,
        );
        table.options.meta?.updateRow?.(row.index, {
          size: value,
          boreSize,
          laborHours,
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

/**
 * Quantity cell that keeps `laborHours` in sync when the user types a new
 * quantity. Replaces the generic `EditableCell` on the piping take-off's
 * quantity column — without this, changing quantity would update `quantity`
 * alone and leave `laborHours` stale (the view-time auto-recompute loop is
 * gone now).
 */
export function PipingQuantityCell({ getValue, row, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(value) => {
        const rowData = table.getRowModel().rows[row.index].original;
        const laborHours = deriveLaborHours(
          { ...rowData, quantity: value },
          table.options.meta?.pipingFactorLookup,
        );
        table.options.meta?.updateRow?.(row.index, {
          quantity: value,
          laborHours,
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
