import React from "react";
import { useReactTable } from "@tanstack/react-table";
import { Trash2, ChevronDown } from "lucide-react";
import type { CbsOption, FefRow } from "~/lib/types";
import { cn, computeBoreSize } from "./utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { aggregateTakeOff } from "./take-off-sync";
import {
  BLANK_ID_PREFIX,
  canComputeTotalCost,
  isBlankId,
  makeFefRow,
} from "./fef-helpers";
import {
  computeLaborHours,
  computeSteelQuantity,
  DEFAULT_LABOR_FACTOR,
  effectiveLaborFactor,
} from "./fef-derive";

export const editableCellClass =
  "w-full bg-white border border-slate-200 px-2 py-1 text-sm hover:border-blue-300 focus:border-blue-400 focus:outline-none rounded";

/** Read-only presentation for a display-until-edit cell — same box metrics as
 *  `editableCellClass` so switching to the input doesn't shift layout. */
export const displayEditCellClass =
  "w-full bg-white border border-transparent px-2 py-1 text-sm rounded cursor-text truncate hover:border-slate-200 focus:border-blue-400 focus:outline-none";

// Radix Select forbids an item value of "", so the placeholder/clear row uses
// this sentinel and CellSelect maps it back to "" on change.
const SELECT_CLEAR = "__clear__";

/**
 * Shared `onMouseDown` for a display-until-edit cell: a modifier-click belongs
 * to range selection, so block the focus that would open the editor while
 * letting the event bubble to the row's range handler. A plain click still
 * focuses (and its `onFocus` opens the editor).
 */
function guardRangeModifierMouseDown(e: React.MouseEvent): void {
  if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault();
}

/**
 * Cell dropdown built on the custom (non-native) Radix Select. It replaces the
 * old native `<select>` cells so Ctrl+V paste works even while the dropdown is
 * open: a native `<select>` popup swallows keystrokes at the OS level, but this
 * one keeps focus on an in-page listbox, so the grid's copy/paste key handler
 * still fires. Value semantics match the old selects — `""` means "nothing
 * selected" (shows the placeholder), and the placeholder row clears back to `""`.
 */
// Building one SelectItem element per option is the cell's dominant render cost
// (the CBS catalog is hundreds of items). Every dropdown cell in a column shares
// the SAME memoized `options` array (built once at the table level), so we cache
// the built `<SelectItem>` list by that array reference in a module-level
// WeakMap. React elements are immutable, so the one shared list renders safely
// inside all ~25 Select instances — turning 25 per-cell builds into 1. (Entries
// are GC'd when the options array is unreferenced; a per-cell useMemo, by
// contrast, rebuilt the whole list on every cell mount and every tab remount.)
const cellSelectItemsCache = new WeakMap<object, React.ReactNode>();
function cellSelectItems(
  options: { value: string; label: string }[],
): React.ReactNode {
  const cached = cellSelectItemsCache.get(options);
  if (cached !== undefined) return cached;
  const built = options
    .filter((opt) => opt.value !== "")
    .map((opt) => (
      <SelectItem key={opt.value} value={opt.value}>
        {opt.label}
      </SelectItem>
    ));
  cellSelectItemsCache.set(options, built);
  return built;
}

/**
 * Dropdown cell with display-until-edit: a wide take-off page mounts ~80–100 of
 * these, and a Radix `Select.Root` per cell is the dominant mount cost. So until
 * the cell is focused/clicked it renders only a lightweight span (looked-up label
 * + chevron, styled to match the closed trigger); the real Radix Select mounts
 * only for the one cell being edited, and unmounts back to the span when the
 * dropdown closes. The stored `onValueChange` semantics are unchanged. Grid
 * arrow-nav intentionally skips these (the span has no `data-cell-control`), just
 * as it skipped the old always-mounted trigger; Tab and click still reach them.
 */
export function CellSelect({
  value,
  options,
  onValueChange,
  placeholder = "-- Select --",
  ariaLabel,
}: {
  value: string;
  /**
   * `label` is what the OPEN list shows — keep it identifying (the CBS code
   * plus the name) so the right item can be found among near-duplicates.
   * `shortLabel` is what the closed cell shows once one is chosen; the column
   * has a heading and an ID column beside it, so repeating the code in every
   * cell only crowds out the name.
   */
  options: { value: string; label: string; shortLabel?: string }[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = React.useState(false);

  if (!editing) {
    const selected =
      value !== "" ? options.find((opt) => opt.value === value) : undefined;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onFocus={() => setEditing(true)}
        onMouseDown={guardRangeModifierMouseDown}
        className={cn(
          editableCellClass,
          "flex h-auto cursor-default items-center justify-between gap-1 font-normal",
        )}
      >
        <span className={cn("line-clamp-1", !selected && "text-slate-400")}>
          {selected ? (selected.shortLabel ?? selected.label) : placeholder}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-400" aria-hidden />
      </div>
    );
  }

  const items = cellSelectItems(options);
  return (
    <Select
      value={value}
      defaultOpen
      onValueChange={(v) => onValueChange(v === SELECT_CLEAR ? "" : v)}
      // Closing the dropdown (select / escape / click-away) returns to the span.
      onOpenChange={(open) => {
        if (!open) setEditing(false);
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(editableCellClass, "h-auto justify-between font-normal")}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={SELECT_CLEAR} className="text-slate-400">
          {placeholder}
        </SelectItem>
        {items}
      </SelectContent>
    </Select>
  );
}

export const readOnlyCellClass =
  "block px-2 py-1 text-sm text-slate-500 bg-slate-100";

/**
 * Props every FEF table cell renderer receives from TanStack Table. Cells
 * destructure only what they need; this is the shared maximal shape.
 */
export type CellProps = {
  getValue: () => unknown;
  row: { index: number; original: FefRow };
  column: { id: string };
  table: ReturnType<typeof useReactTable<FefRow>>;
};

/** Focus a focusable, non-disabled control inside `cell`, selecting its text
 *  if it's an input. Returns true when something was focused. `[data-cell-control]`
 *  matches a display-until-edit cell's focusable wrapper — focusing it makes the
 *  cell switch itself into edit mode (its own onFocus), so grid navigation lands
 *  on it exactly like a real input. */
function focusCellControl(cell: Element | undefined | null): boolean {
  const target = cell?.querySelector<HTMLElement>(
    "input, select, textarea, [data-cell-control]",
  );
  if (!target || (target as HTMLInputElement).disabled) return false;
  target.focus();
  if (target instanceof HTMLInputElement) target.select();
  return true;
}

/**
 * Move keyboard focus to the editable control in the same column of the
 * adjacent row, so the grid navigates like a spreadsheet. Walks the DOM from
 * the current cell (`<td>`) to the next/previous `<tr>`, skipping rows whose
 * cell in that column is read-only (a `<span>`, no focusable control) or
 * disabled. `direction` is +1 for down, -1 for up.
 */
function focusSiblingCell(from: HTMLElement, direction: 1 | -1) {
  const td = from.closest("td");
  const tr = td?.closest("tr");
  if (!td || !tr) return;
  const colIndex = Array.from(tr.children).indexOf(td);
  if (colIndex < 0) return;
  let sibling =
    direction === 1 ? tr.nextElementSibling : tr.previousElementSibling;
  while (sibling) {
    if (focusCellControl(sibling.children[colIndex])) return;
    sibling =
      direction === 1
        ? sibling.nextElementSibling
        : sibling.previousElementSibling;
  }
}

/**
 * Move keyboard focus to the next/previous editable control in the same row,
 * skipping read-only or disabled cells. `direction` is +1 for right, -1 for
 * left.
 */
function focusAdjacentColumn(from: HTMLElement, direction: 1 | -1) {
  const td = from.closest("td");
  const tr = td?.closest("tr");
  if (!td || !tr) return;
  const cells = Array.from(tr.children);
  let idx = cells.indexOf(td);
  if (idx < 0) return;
  for (idx += direction; idx >= 0 && idx < cells.length; idx += direction) {
    if (focusCellControl(cells[idx])) return;
  }
}

/**
 * Editable text input whose value commits on blur. Holds a local draft so
 * keystrokes don't churn table state; resyncs when the underlying value
 * changes. `stripBlankPrefix` blanks the synthetic `__fe-blank-*` row ids.
 *
 * Keyboard (Excel-style): Enter or Arrow Down commits and moves down one row
 * (Shift+Enter / Arrow Up move up). Arrow Left/Right move the caret within the
 * text and only jump to the adjacent column once the caret sits at the text
 * boundary. Escape reverts the draft to the underlying value and blurs.
 * Tab/Shift+Tab keep their native left/right movement — leaving the field
 * fires `onBlur`, which commits — so the grid is fully navigable by keyboard.
 */
export function TextCell({
  value: rawValue,
  stripBlankPrefix = false,
  autoFocus = false,
  onCommit,
  onEditEnd,
}: {
  value: string;
  stripBlankPrefix?: boolean;
  /** Focus + select the input on mount (used when a display cell enters edit). */
  autoFocus?: boolean;
  onCommit: (value: string) => void;
  /** Called after the input blurs (commit already fired) — lets a display-until-
   *  edit wrapper switch back to its read-only span. */
  onEditEnd?: () => void;
}) {
  const normalize = (v: string) =>
    stripBlankPrefix && isBlankId(v) ? "" : v;
  const [value, setValue] = React.useState(() => normalize(rawValue));
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setValue(stripBlankPrefix && isBlankId(rawValue) ? "" : rawValue);
  }, [rawValue, stripBlankPrefix]);

  React.useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    // Mount-only: focus+select when this input was opened from a display cell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      onCommit(value);
      const up = e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey);
      focusSiblingCell(input, up ? -1 : 1);
    } else if (e.key === "ArrowLeft") {
      // Only leave the cell once the caret is at the very start with no
      // selection; otherwise let the caret move through the text.
      if (input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        onCommit(value);
        focusAdjacentColumn(input, -1);
      }
    } else if (e.key === "ArrowRight") {
      // Symmetric: only leave once the caret is at the end of the text.
      const atEnd =
        input.selectionStart === value.length &&
        input.selectionEnd === value.length;
      if (atEnd) {
        e.preventDefault();
        onCommit(value);
        focusAdjacentColumn(input, 1);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setValue(normalize(rawValue));
      input.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      className={editableCellClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        onCommit(value);
        onEditEnd?.();
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

/**
 * Display-until-edit text cell: renders a lightweight read-only span until the
 * cell is focused or clicked, then swaps in a real `<input>` (reusing TextCell).
 * Keeps ~1 live input on screen instead of one per cell — the mount-cost win for
 * very wide sheets — while preserving grid navigation: focusing the wrapper
 * (`data-cell-control`, so `focusCellControl` finds it) enters edit mode, and
 * on blur it returns to the span. Shift/Ctrl/Meta-clicks fall through to range
 * selection instead of opening the editor.
 */
/**
 * Display-until-edit shell: renders `value` as a lightweight focusable span
 * until the user focuses it, then swaps to a real text editor that reports the
 * committed value via `onCommit`. Kept generic so cells with custom commit
 * logic (e.g. the steel dimensions that recompute Quantity) can reuse it.
 */
export function DisplayEditControl({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);

  if (editing) {
    return (
      <TextCell
        value={value}
        autoFocus
        onCommit={onCommit}
        onEditEnd={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      tabIndex={0}
      data-cell-control
      role="textbox"
      onFocus={() => setEditing(true)}
      onMouseDown={guardRangeModifierMouseDown}
      className={displayEditCellClass}
    >
      {value}
    </div>
  );
}

export function DisplayEditCell({ getValue, row, column, table }: CellProps) {
  return (
    <DisplayEditControl
      value={getValue() as string}
      onCommit={(v) =>
        table.options.meta?.updateData?.(row.index, column.id, v)
      }
    />
  );
}

export function makeBlankRow(i: number): FefRow {
  return makeFefRow({ id: `${BLANK_ID_PREFIX}${i}` });
}

export const TAKE_OFF_INITIAL_ROWS: FefRow[] = Array.from(
  { length: 25 },
  (_, i) => makeBlankRow(i),
);

export const FIELD_ESTIMATE_INITIAL_ROWS: FefRow[] = [];

export function useTakeOffSync(
  source: { data: FefRow[] },
  target: { setData: React.Dispatch<React.SetStateAction<FefRow[]>> },
) {
  return () => {
    target.setData(aggregateTakeOff(source.data));
  };
}

export function EditableCell({ getValue, row, column, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(v) =>
        table.options.meta?.updateData?.(row.index, column.id, v)
      }
    />
  );
}

export function SizeCell({ getValue, row, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(v) =>
        table.options.meta?.updateRow?.(row.index, {
          size: v,
          boreSize: computeBoreSize(v),
        })
      }
    />
  );
}

export function CbsSelectCell({ row, table }: CellProps) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const currentDisplayCode = row.original.id;

  const options = table.options.meta?.cbsSelectOptions ?? [];

  return (
    <CellSelect
      value={currentDisplayCode}
      options={options}
      ariaLabel="CBS item"
      onValueChange={(v) => {
        if (v === "") {
          table.options.meta?.updateRow?.(row.index, {
            id: "",
            name: "",
            unit: "",
          });
          return;
        }
        const selected = cbsOptions.find((o) => o.displayCode === v);
        if (selected) {
          table.options.meta?.updateRow?.(row.index, {
            id: selected.displayCode,
            name: selected.name,
            unit: selected.uom,
          });
        }
      }}
    />
  );
}

export function TakeOffIdCell({ getValue, row, column, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      stripBlankPrefix
      onCommit={(v) =>
        table.options.meta?.updateData?.(row.index, column.id, v)
      }
    />
  );
}

export function TakeOffIdReadOnlyCell({ getValue }: { getValue: () => unknown }) {
  const raw = getValue() as string;
  const value = isBlankId(raw) ? "" : raw;
  return (
    <span className={readOnlyCellClass}>{value}</span>
  );
}

export function ReadOnlyCell({ getValue }: { getValue: () => unknown }) {
  return (
    <span className={readOnlyCellClass}>
      {getValue() as string}
    </span>
  );
}

export { computeLaborHours, computeSteelQuantity } from "./fef-derive";

/** Structural-steel Total Tons = Quantity × the member's TNS/Unit (SLTO_Data).
 *  Quantity is itself derived (# of shapes × L), so this recomputes from the
 *  same inputs. Returns "" when the quantity is blank or the member has no
 *  tons-per-unit figure. */
export function computeTotalTons(
  shapeCount: string,
  length: string,
  tonsPerUnit: number | null | undefined,
): string {
  const qty = parseFloat(computeSteelQuantity(shapeCount, length));
  if (!Number.isFinite(qty) || tonsPerUnit == null) return "";
  return String(Math.round(qty * tonsPerUnit * 10000) / 10000);
}

/**
 * Labor-factor input for the dynamic disciplines' Take Off sheet. Empty
 * rows display `DEFAULT_LABOR_FACTOR` so a brand-new row produces a
 * meaningful labor-hours estimate (labor hours == quantity) without
 * further input. Typing overrides the default and stamps the row;
 * clearing reverts to the default on the next render.
 */
export function LaborFactorInputCell({ getValue, row, table }: CellProps) {
  const stored = (getValue() as string) ?? "";
  return (
    <TextCell
      value={effectiveLaborFactor(stored)}
      onCommit={(v) => {
        const next = v.trim();
        // Storing the default verbatim is wasteful — leave the row empty
        // so a future change to `DEFAULT_LABOR_FACTOR` still flows through.
        const persisted = next === DEFAULT_LABOR_FACTOR ? "" : next;
        const newLaborHours = computeLaborHours(row.original.quantity, persisted);
        table.options.meta?.updateRow?.(row.index, {
          laborFactor: persisted,
          laborHours: newLaborHours,
        });
      }}
    />
  );
}

/**
 * Quantity input that, beyond storing the typed value, recomputes the
 * row's `laborHours` from the new quantity × the effective labor factor.
 * Keeps `laborHours` authoritative so the read-only Labor Hours cell and
 * the downstream Total Cost cell don't need to know about the factor.
 */
export function LaborFactorQuantityCell({ getValue, row, table }: CellProps) {
  return (
    <TextCell
      value={getValue() as string}
      onCommit={(v) => {
        const newLaborHours = computeLaborHours(v, row.original.laborFactor);
        table.options.meta?.updateRow?.(row.index, {
          quantity: v,
          laborHours: newLaborHours,
        });
      }}
    />
  );
}

/**
 * Read-only Labor Hours display for the dynamic disciplines. Recomputes
 * on every render from `quantity × effective factor` so rows migrated in
 * from before this column existed (stored `laborHours` may be stale)
 * still display the right number.
 */
/**
 * Labor Hours as STORED on the row, not recomputed from quantity.
 *
 * It used to render `quantity x laborFactor` on every paint, which disagreed
 * with every other reader of the same row: the toolbar totals, Total Cost and
 * both unit-rate columns all use `laborHours`. On a row with 101 units and no
 * factor the cell showed 101.0 while the unit rate beside it showed 0.35 —
 * derived from the 35.02 actually saved.
 *
 * The write path is unchanged: editing Quantity still recomputes and STORES
 * hours (`LaborFactorQuantityCell`), so typing keeps behaving as before. What
 * changes is that the cell now reports the number the rest of the app costs
 * from, including hours that arrived by import or by paste rather than by
 * multiplication.
 */
export function ComputedLaborHoursCell({ row }: CellProps) {
  return (
    <span className={readOnlyCellClass}>{row.original.laborHours}</span>
  );
}

// ── Structural Steel Quantity = # of shapes × length (L) ─────────────────────
// The steel take-off derives Quantity instead of typing it: editing either
// "# of Shapes" or "L" recomputes Quantity (and, since Quantity drives labor,
// the row's laborHours) via updateRow. Both editors use the display-until-edit
// shell to match the H/W/L dimension cells.

/**
 * Both steel dimension editors ("# of Shapes" and "L") do the same thing: on
 * commit, recompute Quantity = count × L (with the *other* dimension read from
 * the row), then push the edited field + derived Quantity + laborHours back
 * through updateRow. Only the field they own differs, so they share this
 * factory rather than duplicating the commit block.
 */
function makeSteelDimensionCell(field: "shapeCount" | "length") {
  return function SteelDimensionCell({ getValue, row, table }: CellProps) {
    return (
      <DisplayEditControl
        value={getValue() as string}
        onCommit={(v) => {
          const shapeCount =
            field === "shapeCount" ? v : row.original.shapeCount;
          const length = field === "length" ? v : row.original.length;
          const quantity = computeSteelQuantity(shapeCount, length);
          const patch: Partial<FefRow> = {
            quantity,
            laborHours: computeLaborHours(quantity, row.original.laborFactor),
          };
          patch[field] = v;
          table.options.meta?.updateRow?.(row.index, patch);
        }}
      />
    );
  };
}

/** Editable "# of Shapes" (steel). Recomputes Quantity = count × L. */
export const ShapeCountCell = makeSteelDimensionCell("shapeCount");

/** Editable "L" (length, steel). Recomputes Quantity = # of shapes × L. */
export const SteelLengthCell = makeSteelDimensionCell("length");

/** Read-only Quantity for steel — always shows # of shapes × L, recomputed on
 *  render so rows saved before this derivation still display correctly. */
export function SteelQuantityCell({ row }: CellProps) {
  return (
    <span className={readOnlyCellClass}>
      {computeSteelQuantity(row.original.shapeCount, row.original.length)}
    </span>
  );
}

/** Read-only Total Tons for steel — Quantity × the selected member's TNS/Unit,
 *  looked up from `steelMemberTonsLookup` by the row's Task Code. */
export function SteelTotalTonsCell({ row, table }: CellProps) {
  const { shapeCount, length, taskCode } = row.original;
  const tonsPerUnit = table.options.meta?.steelMemberTonsLookup?.[taskCode];
  return (
    <span className={readOnlyCellClass}>
      {computeTotalTons(shapeCount, length, tonsPerUnit)}
    </span>
  );
}

/**
 * Take Off row-selection checkbox. Disabled until the row can compute a
 * Total Cost (i.e. has both labor hours and rate); ticked rows feed the
 * "Create CVR from Selected" action.
 */
export function SelectionCheckboxCell({ row, table }: CellProps) {
  const selectable = canComputeTotalCost(row.original);
  const selectedSet = table.options.meta?.selectedRowIndices;
  const checked = selectable && (selectedSet?.has(row.index) ?? false);
  const onToggle = table.options.meta?.onToggleRowSelected;
  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        aria-label="Select row for duplication"
        checked={checked}
        disabled={!selectable}
        onChange={() => onToggle?.(row.index)}
        className={
          selectable
            ? "h-4 w-4 cursor-pointer accent-[#a63434]"
            : "h-4 w-4 cursor-not-allowed accent-slate-400 opacity-50"
        }
      />
    </div>
  );
}

export function DeleteRowCell({ row, table }: CellProps) {
  const onDelete = table.options.meta?.deleteRow;
  // Don't allow deleting the trailing auto-appended blank row — the table
  // always wants one undeletable blank slot at the bottom for new entries.
  const data = table.options.data as FefRow[];
  const isTrailingBlank =
    row.index === data.length - 1 && isBlankId(row.original.id);
  if (isTrailingBlank) {
    return <div className="flex h-7 items-center justify-center" />;
  }
  return (
    <div className="flex items-center justify-center">
      <button
        type="button"
        aria-label="Delete row"
        title="Delete row"
        onClick={() => onDelete?.(row.index)}
        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** Read-only cell that mirrors a field from the row's matched CBS option. */
function CbsLookupCell({
  row,
  table,
  field,
}: Pick<CellProps, "row" | "table"> & { field: "name" | "uom" }) {
  const cbsOptions = table.options.meta?.cbsOptions ?? [];
  const match = cbsOptions.find((o) => o.displayCode === row.original.id);
  const fallback = field === "name" ? row.original.name : row.original.unit;
  return (
    <span className={readOnlyCellClass}>{match?.[field] ?? fallback}</span>
  );
}

export function CbsNameCell(props: CellProps) {
  return <CbsLookupCell {...props} field="name" />;
}

export function CbsUomCell(props: CellProps) {
  return <CbsLookupCell {...props} field="uom" />;
}

/**
 * Dropdown of areas for the current project. Stores the selected area's id
 * (as a string) on the row's `area` field; options come from
 * `meta.areaOptions`.
 */
export function AreaSelectCell({ getValue, row, column, table }: CellProps) {
  const value = getValue() as string;
  const areaOptions = table.options.meta?.areaOptions ?? [];
  return (
    <CellSelect
      value={value}
      options={areaOptions}
      ariaLabel="Area"
      onValueChange={(v) =>
        table.options.meta?.updateData?.(row.index, column.id, v)
      }
    />
  );
}

/**
 * How an equipment line item is procured: in bulk, or as a tagged item with
 * its own equipment number. Blank means "not classified yet" — an estimator
 * types quantities long before that decision is made, so an unset value is a
 * normal state rather than a missing one.
 *
 * A fixed vocabulary rather than free text: it drives how the line is reported,
 * and "tagged"/"Tagged "/"TAG" would fragment that.
 */
export const MATERIAL_TYPE_OPTIONS = [
  { value: "Bulk", label: "Bulk" },
  { value: "Tagged", label: "Tagged" },
] as const;

/** Valid stored values, blank included. Shared with the range-paste validator
 *  so typing and pasting accept exactly the same set. */
export const MATERIAL_TYPES: readonly string[] = MATERIAL_TYPE_OPTIONS.map(
  (o) => o.value,
);

export function MaterialTypeSelectCell({ getValue, row, column, table }: CellProps) {
  const value = getValue() as string;
  return (
    <CellSelect
      value={value}
      // `CellSelect`, not a native <select>: the native popup swallows Ctrl+V
      // at the OS level, which would break paste while the cell is focused.
      options={MATERIAL_TYPE_OPTIONS as unknown as { value: string; label: string }[]}
      ariaLabel="Material type"
      onValueChange={(v) =>
        table.options.meta?.updateData?.(row.index, column.id, v)
      }
    />
  );
}

type PaginatableTable = {
  firstPage: () => void;
  previousPage: () => void;
  nextPage: () => void;
  lastPage: () => void;
  getCanPreviousPage: () => boolean;
  getCanNextPage: () => boolean;
  getPageCount: () => number;
  getState: () => { pagination: { pageIndex: number } };
  getFilteredRowModel: () => { rows: unknown[] };
};

export function TablePagination({
  table,
  totalCount,
}: {
  table: PaginatableTable;
  totalCount?: number;
}) {
  const rowCount = totalCount ?? table.getFilteredRowModel().rows.length;
  return (
    <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
          onClick={() => table.firstPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {"<<"}
        </button>
        <button
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {"<"}
        </button>
        <button
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {">"}
        </button>
        <button
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
          onClick={() => table.lastPage()}
          disabled={!table.getCanNextPage()}
        >
          {">>"}
        </button>
      </div>
      <span>
        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} &mdash; {rowCount} rows
      </span>
    </div>
  );
}

export function ColumnFilter({
  column,
  data,
}: {
  column: {
    id: string;
    getFilterValue: () => unknown;
    setFilterValue: (v: unknown) => void;
  };
  data: FefRow[];
}) {
  const value = (column.getFilterValue() ?? "") as string;
  const options = React.useMemo(
    () =>
      Array.from(
        new Set(
          data
            .map((row) => row[column.id as keyof FefRow])
            .filter((v): v is string => v !== undefined),
        ),
      ).sort(),
    [data, column.id],
  );

  if (options.length === 0) return null;

  return (
    <select
      className="mt-1 w-full border border-gray-300 px-1 py-0.5 text-xs font-normal rounded focus:border-blue-400 focus:outline-none bg-white"
      value={value}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
    >
      <option value="">All</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
