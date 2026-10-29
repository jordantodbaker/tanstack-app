import * as React from "react";
import {
  cbsFilterIsEmpty,
  cbsNoCostTypes,
  cbsNoStatuses,
  type CbsCostTypeKey,
  type CbsRowFilter,
  type CbsRowTypeFilter,
  type CbsStatusKey,
  type CbsValueOption,
} from "~/lib/cbs-tree";
import type { CbsTreeFilterControls } from "~/components/Cbs/CbsTreeToolbar";

/**
 * The state behind a CBS tree's toolbar: the search box and every filter row,
 * folded into the one `CbsRowFilter` that `pruneCbsTree`, `filterCbsTree` and
 * the Excel export all take.
 *
 * Every filter is always in the returned `filter`; a page that does not offer
 * one simply never changes it from its "everything" value, and its control is
 * left off the toolbar because the handler is not handed out.
 */
export function useCbsRowFilter({
  classificationOptions,
  materialTypeOptions,
  statusFilter = false,
  rowTypeFilter = false,
  deferQuery = false,
}: {
  /** The Cost Classifications to offer — see `cbsClassificationOptions`. */
  classificationOptions: readonly CbsValueOption[];
  /**
   * The Material Types to offer — see `cbsMaterialTypeOptions`. Passing them
   * turns the picker on; it shows only while Materials is pressed.
   */
  materialTypeOptions?: readonly CbsValueOption[];
  /** Offer Active / Inactive / Retired. */
  statusFilter?: boolean;
  /** Offer All / Original / Generated. */
  rowTypeFilter?: boolean;
  /**
   * Filter on a deferred copy of the search text, so typing stays responsive
   * over a tree too large to re-filter per keystroke. `searchPending` is true
   * while the filter lags the box.
   */
  deferQuery?: boolean;
}): {
  filter: CbsRowFilter;
  /** True when any filter narrows the rows. */
  filtering: boolean;
  /** True while a deferred search has not caught up with the box. */
  searchPending: boolean;
  /** Spread into `CbsTreeToolbar`. */
  controls: CbsTreeFilterControls;
} {
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);
  const appliedQuery = deferQuery ? deferredQuery : query;

  const [costTypes, setCostTypes] = React.useState(cbsNoCostTypes);
  const [materialTypes, setMaterialTypes] = React.useState<string[]>([]);
  const toggleCostType = React.useCallback((key: CbsCostTypeKey) => {
    setCostTypes((prev) => ({ ...prev, [key]: !prev[key] }));
    // The Material Type picker belongs to Materials; it starts fresh each
    // time Materials is pressed rather than reviving an old pick.
    if (key === "material") setMaterialTypes([]);
  }, []);

  const [statuses, setStatuses] = React.useState(cbsNoStatuses);
  const toggleStatus = React.useCallback(
    (key: CbsStatusKey) =>
      setStatuses((prev) => ({ ...prev, [key]: !prev[key] })),
    [],
  );
  const [rowType, setRowType] = React.useState<CbsRowTypeFilter>("all");
  const [classifications, setClassifications] = React.useState<string[]>([]);

  const filter: CbsRowFilter = React.useMemo(
    () => ({
      query: appliedQuery.trim().toLowerCase(),
      classifications,
      rowType,
      materialTypes,
      ...costTypes,
      ...statuses,
    }),
    [appliedQuery, classifications, rowType, materialTypes, costTypes, statuses],
  );

  return {
    filter,
    filtering: !cbsFilterIsEmpty(filter),
    searchPending: deferQuery && query !== deferredQuery,
    controls: {
      query,
      onQueryChange: setQuery,
      costTypes,
      onToggleCostType: toggleCostType,
      statuses,
      onToggleStatus: statusFilter ? toggleStatus : undefined,
      classifications,
      onClassificationsChange: setClassifications,
      classificationOptions,
      rowType,
      onRowTypeChange: rowTypeFilter ? setRowType : undefined,
      materialTypes,
      onMaterialTypesChange:
        materialTypeOptions && costTypes.material ? setMaterialTypes : undefined,
      materialTypeOptions,
    },
  };
}
