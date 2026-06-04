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

type RoleRate = { roleName: string; schedule: string; rate: number };

/**
 * Looks up the composite labor rate for the (role, schedule) pair on a Take
 * Off row. Returns the updates to apply: the field the user just changed,
 * plus the freshly resolved `laborRate` (or `""` when no matching rate row
 * exists). Centralizes the lookup so the Role and Schedule cells stay in
 * sync — change one, the rate snaps to the matching cell of the rate matrix.
 */
function applyRoleRate(
  changed: { role?: string; schedule?: string },
  current: { role: string; schedule: string },
  roleRates: RoleRate[],
): Record<string, string> {
  const role = changed.role ?? current.role;
  const schedule = changed.schedule ?? current.schedule;
  const match = roleRates.find(
    (r) => r.roleName === role && r.schedule === schedule,
  );
  return { ...changed, laborRate: match ? String(match.rate) : "" };
}

export function RoleSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  const { roleOptions = [], roleRates = [] } = table.options.meta ?? {};
  return (
    <select
      className={editableCellClass}
      value={value}
      onChange={(e) => {
        const rowData = table.getRowModel().rows[row.index].original;
        table.options.meta?.updateRow?.(
          row.index,
          applyRoleRate({ role: e.target.value }, rowData, roleRates),
        );
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

/**
 * "Use Crew Mix" mode of the labor-rate input. Stores the selected crew
 * mix's id (as a string) on `crewMixId` and snapshots the average wage onto
 * `laborRate`. Like `RoleSelectCell`, the rate is frozen at edit time —
 * editing the crew mix's members later won't retroactively touch existing
 * rows.
 */
export function CrewMixSelectCell({ row, table }: CellProps) {
  const value = row.original.crewMixId;
  const { crewMixOptions = [] } = table.options.meta ?? {};
  return (
    <select
      className={editableCellClass}
      value={value}
      onChange={(e) => {
        const id = e.target.value;
        if (id === "") {
          table.options.meta?.updateRow?.(row.index, {
            crewMixId: "",
            laborRate: "",
          });
          return;
        }
        const match = crewMixOptions.find((m) => String(m.id) === id);
        const wages = match?.members ?? [];
        const avg =
          wages.length === 0
            ? 0
            : wages.reduce((acc, m) => acc + m.wage, 0) / wages.length;
        table.options.meta?.updateRow?.(row.index, {
          crewMixId: id,
          laborRate: wages.length === 0 ? "" : avg.toFixed(2),
          // Clear role + schedule so the row's mode is unambiguous and
          // sidebar tooltips don't show stale picker values.
          role: "",
          schedule: "",
        });
      }}
    >
      <option value="">-- Select --</option>
      {crewMixOptions.map((opt) => (
        <option key={opt.id} value={String(opt.id)}>
          {opt.name}
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
        // Re-resolve CBS using the row's current shopField + weldGroup +
        // boreSize. Task code isn't itself in the lookup formula, but
        // users expect any of the four trigger inputs (Shop / Weld /
        // Task / Size) to refresh the matched item — so a task-code
        // change re-runs the lookup with existing inputs and overrides
        // id/name/unit if a match is now available.
        const cbsMatch = lookupCbsItem(
          rowData.metallurgyCode,
          rowData.boreSize,
          table.options.meta?.cbsOptions ?? [],
        );
        table.options.meta?.updateRow?.(row.index, {
          taskCode: newCode,
          unit,
          laborHours,
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
                name: cbsMatch.name,
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
        const rowData = table.getRowModel().rows[row.index].original;
        table.options.meta?.updateRow?.(
          row.index,
          applyRoleRate({ schedule: e.target.value }, rowData, roleRates),
        );
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
