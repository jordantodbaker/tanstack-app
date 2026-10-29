/**
 * The CBS hierarchy — public surface.
 *
 * This was one 916-line module covering seven unrelated jobs. It is now a
 * barrel over `cbs/`, so the 24 call sites are unchanged and the split is an
 * implementation detail:
 *
 *   cbs/types      the row and node shapes, and the display code's segments
 *   cbs/codes      the display code as data — division, level, ancestry, order
 *   cbs/build      assembling the cost-type-aware tree
 *   cbs/selection  tri-state checkbox arithmetic for the Setup editor
 *   cbs/filter     what a view filters BY, asked one row at a time
 *   cbs/prune      applying a filter to a built tree
 *   cbs/badges     the markers shown beside a row's name
 *   cbs/expansion  which nodes to open
 *
 * Re-exported by name rather than with `export *`: the group shares a few
 * internals across module boundaries (the segment constants, `lineage`,
 * `costType`, `sortCbsItems`) that were private before and should stay out of
 * the public API. This list is that boundary, and reads as the contents page.
 */

export type { CbsTreeItem, CbsTreeNode } from "./cbs/types";

export {
  getGroupL1,
  cbsAncestorCodes,
  getCbsLevel,
  parseCbsDisplayCode,
  withCbsLevels,
  compareCbsDisplayCodes,
  stripCostTypeSuffix,
  costTypeSuffixOf,
} from "./cbs/codes";

export { buildCbsTree } from "./cbs/build";

export {
  getNodeSelectionState,
  computeCbsSelectionCounts,
  selectionStateFromCounts,
  type SelectionState,
} from "./cbs/selection";

export {
  CBS_COST_TYPES,
  CBS_STATUSES,
  CBS_FILTER_NONE,
  cbsHasCostType,
  cbsIsCostType,
  cbsIsBackbone,
  cbsIsBackboneCode,
  cbsIsActive,
  cbsHasStatus,
  cbsNoCostTypes,
  cbsNoStatuses,
  cbsHasCostTypeFilter,
  cbsHasStatusFilter,
  cbsHasRowTypeFilter,
  CBS_VALUE_FILTERS,
  cbsNoValues,
  cbsValueFilterInForce,
  cbsHasValueFilter,
  cbsMatchesValueFilter,
  cbsValueFilterOptions,
  CBS_NO_CLASSIFICATION,
  CBS_BLANK_VALUE,
  CBS_ROW_TYPE_FILTERS,
  cbsMatchesRowType,
  cbsIsGenerated,
  cbsFilterIsEmpty,
  cbsQueryTokens,
  type CbsValueFilter,
  type CbsValueFilterKey,
  type CbsValueOption,
  type CbsCostType,
  type CbsCostTypeKey,
  type CbsRowFilter,
  type CbsRowTypeFilter,
  type CbsStatusKey,
} from "./cbs/filter";

export { filterCbsTree, pruneCbsTree } from "./cbs/prune";

export { collectKeysToLevel, collectExpandableKeys } from "./cbs/expansion";
