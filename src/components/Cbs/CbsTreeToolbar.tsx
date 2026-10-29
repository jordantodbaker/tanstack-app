import * as React from "react";
import { ChevronDown } from "lucide-react";
import { SearchBox } from "~/components/SearchBox";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  CBS_COST_TYPES,
  CBS_BLANK_VALUE,
  CBS_ROW_TYPE_FILTERS,
  CBS_STATUSES,
  CBS_VALUE_FILTERS,
  cbsFilterIsEmpty,
  cbsFilterSummary,
  type CbsRowFilter,
  type CbsRowTypeFilter,
  type CbsValueFilter,
  type CbsValueFilterKey,
  type CbsValueOption,
  type CbsCostTypeKey,
  type CbsStatusKey,
} from "~/lib/cbs-tree";

const valueLabel = (value: string) =>
  value === CBS_BLANK_VALUE ? "(none)" : value;

/**
 * A multi-select over one free-text column — one entry of
 * `CBS_VALUE_FILTERS`: a button naming what is picked, and a checkbox list
 * under it. A list rather than buttons: the workbook carries too many values
 * for a row of toggles.
 */
function ValuePicker({
  label,
  plural,
  selected,
  options,
  onChange,
  disabled = false,
  disabledHint,
}: {
  /** "Cost classification" — the caption, and the picker's accessible name. */
  label: string;
  /** "classifications" — for "All classifications" / "3 classifications". */
  plural: string;
  selected: readonly string[];
  options: readonly CbsValueOption[];
  onChange: (next: string[]) => void;
  /**
   * Greyed out rather than hidden, so the toolbar keeps its shape and the
   * picker is discoverable before the cost type it belongs to is pressed.
   */
  disabled?: boolean;
  /** Why it is disabled — the button's tooltip. */
  disabledHint?: string;
}) {
  const picked = new Set(selected);
  const toggle = (value: string) =>
    onChange(
      // Kept in the list's order, not the click order, so the export's filter
      // note reads the same however the boxes were ticked.
      options
        .map((o) => o.value)
        .filter((v) => (v === value ? !picked.has(v) : picked.has(v))),
    );
  const summary =
    selected.length === 0
      ? `All ${plural}`
      : selected.length === 1
        ? valueLabel(selected[0])
        : `${selected.length} ${plural}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">{label}:</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={selected.length > 0 ? "default" : "outline"}
            size="sm"
            aria-label={`${label}: ${summary}`}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
          >
            {summary}
            <ChevronDown className="ml-1 size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-1">
          <div
            role="group"
            aria-label={`Filter by ${label.toLowerCase()}`}
            className="max-h-80 overflow-auto"
          >
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-100"
              >
                <input
                  type="checkbox"
                  aria-label={valueLabel(o.value)}
                  checked={picked.has(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span className="truncate">{valueLabel(o.value)}</span>
                <span className="ml-auto text-xs text-slate-500 tabular-nums">
                  {o.count.toLocaleString()}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end border-t border-slate-100 p-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Row Type: one of All / Original / Generated, as a segmented control. */
function RowTypeToggle({
  value,
  onChange,
}: {
  value: CbsRowTypeFilter;
  onChange: (next: CbsRowTypeFilter) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="radiogroup"
      aria-label="Filter by row type"
    >
      <span className="text-xs text-slate-500">Row type:</span>
      {CBS_ROW_TYPE_FILTERS.map((r) => (
        <Button
          key={r.key}
          role="radio"
          aria-checked={value === r.key}
          variant={value === r.key ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(r.key)}
          title={
            r.key === "generated"
              ? "Only rows generated from an original — Original Row FALSE in the CBS"
              : r.key === "original"
                ? "Only original rows — Original Row TRUE in the CBS"
                : "Every row"
          }
        >
          {r.label}
        </Button>
      ))}
    </div>
  );
}

/** A labeled row of on/off buttons — the cost types, the statuses. */
function ToggleGroup<K extends string>({
  label,
  ariaLabel,
  options,
  on,
  onToggle,
  title,
}: {
  label: string;
  ariaLabel: string;
  options: readonly { key: K; label: string }[];
  on?: Record<K, boolean>;
  onToggle: (key: K) => void;
  title: (key: K) => string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={ariaLabel}
    >
      <span className="text-xs text-slate-500">{label}</span>
      {options.map((o) => {
        const pressed = on?.[o.key] ?? false;
        return (
          <Button
            key={o.key}
            variant={pressed ? "default" : "outline"}
            size="sm"
            onClick={() => onToggle(o.key)}
            aria-pressed={pressed}
            title={title(o.key)}
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The filter half of the toolbar's props — the search box and every filter
 * control. `useCbsRowFilter` returns exactly this, so a page spreads it in.
 */
export type CbsTreeFilterControls = {
  query: string;
  onQueryChange: (value: string) => void;
  /** Which cost-type filters are on. Omit the handler to leave them out. */
  costTypes?: Record<CbsCostTypeKey, boolean>;
  onToggleCostType?: (key: CbsCostTypeKey) => void;
  /** Which status filters are on. Omit the handler to leave the row out. */
  statuses?: Record<CbsStatusKey, boolean>;
  onToggleStatus?: (key: CbsStatusKey) => void;
  /**
   * What each value picker has ticked, empty for all, by `CBS_VALUE_FILTERS`
   * key. Omit the handler to leave the pickers out. A picker that belongs to
   * a cost type shows only while that type is on.
   */
  values?: Record<CbsValueFilterKey, readonly string[]>;
  onValueChange?: (key: CbsValueFilterKey, next: string[]) => void;
  /** Each picker's options — see `cbsValueFilterOptions`. */
  valueOptions?: Record<CbsValueFilterKey, readonly CbsValueOption[]>;
  /** All / Original / Generated. Omit the handler to leave the row out. */
  rowType?: CbsRowTypeFilter;
  onRowTypeChange?: (next: CbsRowTypeFilter) => void;
  /**
   * The whole filter as applied, for the "what is narrowing this tree" line
   * and the Clear filters button. Omit either to leave them out.
   */
  filter?: CbsRowFilter;
  onClearFilters?: () => void;
};

/**
 * Two rows for a CBS tree. First, everything that decides WHICH rows exist:
 * the value pickers around the cost-type buttons, then Status and Row Type
 * where a page offers them. Second, the controls that only change how the
 * rows are shown — the search box, Expand all / Collapse all, a trailing slot
 * for page-specific controls (the Excel export, a match count, a selected
 * count, saving…) — and, while anything is active, a line saying what the
 * filters are and a Clear filters button. Shared by the Setup editor and the
 * CBS dictionary viewers.
 */
export function CbsTreeToolbar({
  query,
  onQueryChange,
  placeholder = "Search code or name…",
  onExpandAll,
  onCollapseAll,
  costTypes,
  onToggleCostType,
  statuses,
  onToggleStatus,
  values,
  onValueChange,
  valueOptions,
  rowType = "all",
  onRowTypeChange,
  filter,
  onClearFilters,
  children,
}: CbsTreeFilterControls & {
  placeholder?: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  children?: React.ReactNode;
}) {
  // A picker that belongs to a cost type (Material Type to Materials) is
  // greyed out until that type is on, and only narrows that type's lines.
  const pickers = (placement: CbsValueFilter["placement"]) =>
    onValueChange &&
    CBS_VALUE_FILTERS.filter((v) => v.placement === placement).map((v) => {
      const owner = v.requiresCostType
        ? CBS_COST_TYPES.find((t) => t.key === v.requiresCostType)
        : undefined;
      const off = !!owner && !costTypes?.[owner.key];
      return (
        <ValuePicker
          key={v.key}
          label={v.label}
          plural={v.plural}
          selected={values?.[v.key] ?? []}
          options={valueOptions?.[v.key] ?? []}
          onChange={(next) => onValueChange(v.key, next)}
          disabled={off}
          disabledHint={
            owner
              ? `Press ${owner.label} to narrow its lines by ${v.label.toLowerCase()}`
              : undefined
          }
        />
      );
    });

  const active = filter !== undefined && !cbsFilterIsEmpty(filter);

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {pickers("before-cost-types")}
        {onToggleCostType && (
          <ToggleGroup
            label="Cost types:"
            ariaLabel="Filter by cost type"
            options={CBS_COST_TYPES}
            on={costTypes}
            onToggle={onToggleCostType}
            title={(key) => {
              const t = CBS_COST_TYPES.find((c) => c.key === key)!;
              return `Show only ${t.label.toLowerCase()} codes — those ending in -${t.code}`;
            }}
          />
        )}
        {pickers("after-cost-types")}
        {onToggleStatus && (
          <ToggleGroup
            label="Status:"
            ariaLabel="Filter by status"
            options={CBS_STATUSES}
            on={statuses}
            onToggle={onToggleStatus}
            title={(key) =>
              `Show only codes with Status ${CBS_STATUSES.find((s) => s.key === key)!.label}${key === "active" ? " (a blank Status counts as Active)" : ""}`
            }
          />
        )}
        {onRowTypeChange && (
          <RowTypeToggle value={rowType} onChange={onRowTypeChange} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={query}
          onChange={onQueryChange}
          placeholder={placeholder}
          ariaLabel="Search this CBS hierarchy"
          className="h-8 w-72"
        />
        <Button variant="outline" size="sm" onClick={onExpandAll}>
          Expand all
        </Button>
        <Button variant="outline" size="sm" onClick={onCollapseAll}>
          Collapse all
        </Button>
        {children}
        {active && (
          <>
            <span
              className="text-xs text-slate-500"
              data-testid="cbs-filter-summary"
            >
              {cbsFilterSummary(filter)}
            </span>
            {onClearFilters && (
              <Button variant="ghost" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
