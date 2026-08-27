import React from "react";
import type { CbsOption, FefRow } from "~/lib/types";
import {
  CellSelect,
  editableCellClass,
  readOnlyCellClass,
  TextCell,
  type CellProps,
} from "~/lib/table-utils";
import { computeBoreSize } from "~/lib/utils";
import {
  deriveLaborHours,
  fabricationHint,
  laborFactorFor,
  resolveCbsStamp,
} from "~/lib/piping-derive";
import { crewMixAverageRate } from "~/lib/crew-mix-rate";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "~/components/SearchableSelect";

export { ReadOnlyCell, TakeOffIdCell } from "~/lib/table-utils";
// Re-exported so existing importers (and cells.test.ts) keep their import path
// while the derivation itself lives in the React-free lib module.
export { deriveLaborHours } from "~/lib/piping-derive";

/** Resolves a composed piping cost code against a cell's CBS option list. */
const finder = (cbsOptions: CbsOption[]) => (costCode: string) =>
  cbsOptions.find((o) => o.costCode === costCode);

/**
 * Searchable CBS-item picker for a Name column. Client-filters the discipline's
 * `cbsOptions` (no server round-trip) and, on select, stamps the row's id (CBS
 * displayCode), name, and unit — the search-as-you-type analog of the plain
 * `CbsSelectCell` dropdown. Selecting the placeholder clears those three. The
 * picker is keyed on the row's CBS code (`id`); a blank-template sentinel id
 * shows as the placeholder rather than raw text.
 */
export function CbsSearchSelectCell({ row, table }: CellProps) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const rawId = row.original.id;
  const value = rawId.startsWith("__fe-blank-") ? "" : rawId;
  const name = row.original.name;
  const options: SearchableSelectOption[] = React.useMemo(() => {
    const base = cbsOptions.map((o) => ({
      value: o.displayCode,
      label: o.displayDescription ?? `${o.displayCode}: ${o.name}`,
      searchText: `${o.displayCode} ${o.name}`.toLowerCase(),
    }));
    // Existing rows may reference a code that isn't in this discipline's
    // option set. Surface it with its stored name so the control shows
    // "code: name" instead of falling back to the bare code.
    if (value && !base.some((o) => o.value === value)) {
      base.unshift({
        value,
        label: name ? `${value}: ${name}` : value,
        searchText: `${value} ${name}`.toLowerCase(),
      });
    }
    return base;
  }, [cbsOptions, value, name]);
  return (
    <SearchableSelect
      value={value}
      options={options}
      onSelect={(code) => {
        const selected = cbsOptions.find((o) => o.displayCode === code);
        table.options.meta?.updateRow?.(
          row.index,
          selected
            ? {
                id: selected.displayCode,
                name: selected.name,
                unit: selected.uom,
              }
            : { id: "", name: "", unit: "" },
        );
      }}
    />
  );
}

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
        const stamp = resolveCbsStamp(
          metallurgyCode,
          rowData.boreSize,
          finder(table.options.meta?.cbsOptions ?? []),
          fabricationHint(rowData),
        );
        table.options.meta?.updateRow?.(row.index, {
          shopField: newShopField,
          metallurgyCode,
          ...(stamp ?? {}),
        });
      }}
    >
      <option value="">-- Select --</option>
      <option value="Shop">Shop</option>
      <option value="Field">Field</option>
    </select>
  );
}

/**
 * Fabricate / Erect — the two work types the piping cost codes separate. The
 * catalog fuses the choice onto a NOMINAL SIZE inside segment 3
 * (633-LB-12ER-00-C, 633-LB-12FB-00-C), so it only sharpens the CBS match on a
 * row that also has a size; without one the row keeps resolving to its bore
 * rollup.
 *
 * Re-resolves the item on change for the same reason Shop/Field does: leaving
 * the old item in place would have the sheet asserting a code that contradicts
 * the inputs shown beside it.
 */
export function FabricateErectSelectCell({ getValue, row, table }: CellProps) {
  const value = getValue() as string;
  return (
    <select
      aria-label="Fabricate / Erect"
      className={editableCellClass}
      value={value}
      onChange={(e) => {
        const fabricateErect = e.target.value;
        const rowData = table.getRowModel().rows[row.index].original;
        const next = { ...rowData, fabricateErect };
        const stamp = resolveCbsStamp(
          rowData.metallurgyCode,
          rowData.boreSize,
          finder(table.options.meta?.cbsOptions ?? []),
          fabricationHint(next),
        );
        table.options.meta?.updateRow?.(row.index, {
          fabricateErect,
          ...(stamp ?? {}),
        });
      }}
    >
      <option value="">-- Select --</option>
      <option value="Fabricate">Fabricate</option>
      <option value="Erect">Erect</option>
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
        const stamp = resolveCbsStamp(
          metallurgyCode,
          rowData.boreSize,
          finder(table.options.meta?.cbsOptions ?? []),
        );
        table.options.meta?.updateRow?.(row.index, {
          weldGroupDescription: classification,
          metallurgyCode,
          ...(stamp ?? {}),
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

/**
 * Read-only Pipe Category: SB / MB / LB / XB for the row's nominal size.
 *
 * These are the same bands `computeBoreSize` feeds into the bore segment of a
 * piping cost code, so the column doubles as a read-out of which bore series
 * the row's CBS item came from — a 30" line shows XB and resolves against the
 * "-XB-" codes. One band table, so the two can't disagree.
 *
 * Derived on view rather than stored: it carries no row field of its own, so
 * it can never drift from the Size beside it and never triggers a save — see
 * `LaborHoursCell` for what storing a view-time derivation used to cost.
 */
export function PipeCategoryCell({ row }: CellProps) {
  return (
    <span className={readOnlyCellClass}>
      {computeBoreSize(row.original.size)}
    </span>
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
  const { roleRates = [] } = table.options.meta ?? {};
  const options = table.options.meta?.roleSelectOptions ?? [];
  return (
    <CellSelect
      value={value}
      options={options}
      ariaLabel="Role"
      onValueChange={(v) => {
        const rowData = table.getRowModel().rows[row.index].original;
        table.options.meta?.updateRow?.(
          row.index,
          applyRoleRate({ role: v }, rowData, roleRates),
        );
      }}
    />
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
  const { crewMixOptions = [], roleRates = [] } = table.options.meta ?? {};
  const options = table.options.meta?.crewMixSelectOptions ?? [];
  return (
    <CellSelect
      value={value}
      options={options}
      ariaLabel="Crew Mix"
      onValueChange={(id) => {
        if (id === "") {
          table.options.meta?.updateRow?.(row.index, {
            crewMixId: "",
            laborRate: "",
          });
          return;
        }
        const match = crewMixOptions.find((m) => String(m.id) === id);
        if (!match) return;
        // Rate = head-count-weighted average of the mix's member-role rates at
        // its schedule.
        const avg = crewMixAverageRate(
          match.members,
          match.schedule,
          roleRates,
        );
        table.options.meta?.updateRow?.(row.index, {
          crewMixId: id,
          laborRate: avg > 0 ? avg.toFixed(2) : "",
          // Clear role + schedule so the row's mode is unambiguous and
          // sidebar tooltips don't show stale picker values.
          role: "",
          schedule: "",
        });
      }}
    />
  );
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
        // Re-resolve CBS from the row's current metallurgy + bore. The task
        // code is not itself part of the cost code, so this can only pick up a
        // match the row's *other* inputs have since made available — or drop
        // one they have invalidated.
        const stamp = resolveCbsStamp(
          rowData.metallurgyCode,
          rowData.boreSize,
          finder(table.options.meta?.cbsOptions ?? []),
        );
        table.options.meta?.updateRow?.(row.index, {
          taskCode: newCode,
          laborHours,
          ...(stamp ?? {}),
          // A resolved CBS item's UoM wins; with no item to take one from,
          // the unit falls back to the task code's own from the factor table
          // rather than being cleared along with the rest of the stamp.
          unit: stamp?.id ? stamp.unit : unit,
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
        const stamp = resolveCbsStamp(
          rowData.metallurgyCode,
          boreSize,
          finder(table.options.meta?.cbsOptions ?? []),
        );
        const laborHours = deriveLaborHours(
          { ...rowData, size: value },
          table.options.meta?.pipingFactorLookup,
        );
        table.options.meta?.updateRow?.(row.index, {
          size: value,
          boreSize,
          laborHours,
          ...(stamp ?? {}),
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
  const { roleRates = [] } = table.options.meta ?? {};
  const options = table.options.meta?.scheduleSelectOptions ?? [];
  return (
    <CellSelect
      value={value}
      options={options}
      ariaLabel="Schedule"
      onValueChange={(v) => {
        const rowData = table.getRowModel().rows[row.index].original;
        table.options.meta?.updateRow?.(
          row.index,
          applyRoleRate({ schedule: v }, rowData, roleRates),
        );
      }}
    />
  );
}
