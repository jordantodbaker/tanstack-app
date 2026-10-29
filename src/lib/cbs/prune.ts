/**
 * Applying a filter to a built tree — the two walks a view can ask for.
 *
 * `filterCbsTree` keeps a matched row's whole subtree (the Setup editor, where
 * ticking a row grants what you can see). `pruneCbsTree` is strict (the
 * viewers, where a cost-type filter is read as a report). Both judge a single
 * row with the predicates in `filter`.
 */
import { type CbsTreeItem, type CbsTreeNode } from "./types";
import {
  cbsCriteriaFor,
  cbsFilterIsEmpty,
  cbsHasCostTypeFilter,
  cbsHasStatusFilter,
  cbsHasRowTypeFilter,
  cbsHasValueFilter,
  cbsItemMatches,
  type CbsCriteria,
  type CbsRowFilter,
} from "./filter";

const criteriaFor = cbsCriteriaFor;

function rowMatches<T extends CbsTreeItem>(
  node: CbsTreeNode<T>,
  criteria: CbsCriteria,
): boolean {
  return cbsItemMatches(node.item, node.searchHaystack, criteria);
}

/**
 * Whether any filter that is read as a report is on — the ones that keep only
 * qualifying rows rather than keeping ancestors for context. Everything but a
 * bare text search.
 */
function isStrictFilter(filter: CbsRowFilter): boolean {
  return (
    cbsHasCostTypeFilter(filter) ||
    cbsHasStatusFilter(filter) ||
    cbsHasRowTypeFilter(filter) ||
    cbsHasValueFilter(filter)
  );
}

/**
 * Single-pass filter that prunes nodes whose subtrees hold nothing matching
 * `filter`. A self-match may keep its whole subtree intact (same object);
 * otherwise a surviving node is a copy with just the matching children.
 */
function searchCbsTree<T extends CbsTreeItem>(
  nodes: CbsTreeNode<T>[],
  criteria: CbsCriteria,
  /** A self-matching node keeps its WHOLE subtree, unrecursed, so the kept
   *  node is the original object. Off: only matching descendants survive. */
  keepMatchedSubtree: boolean,
  onMatch?: () => void,
): CbsTreeNode<T>[] {
  const out: CbsTreeNode<T>[] = [];
  for (const n of nodes) {
    const selfMatch = rowMatches(n, criteria);
    if (selfMatch && keepMatchedSubtree) {
      onMatch?.();
      out.push(n);
      continue;
    }
    const kids = searchCbsTree(
      n.children,
      criteria,
      keepMatchedSubtree,
      onMatch,
    );
    if (selfMatch || kids.length > 0) {
      if (selfMatch) onMatch?.();
      out.push({ ...n, children: kids });
    }
  }
  return out;
}

/**
 * Filter for the Setup editor: a text match keeps the matched row's whole
 * subtree, so ticking it still grants what you can see. The type toggles are
 * strict even here — keeping whole subtrees under, say, a Sub Code parent
 * would put the entire catalog back on screen and defeat the filter.
 *
 * Returns the original `nodes` array for an empty filter so callers can
 * fast-path on reference identity.
 */
export function filterCbsTree<T extends CbsTreeItem>(
  nodes: CbsTreeNode<T>[],
  filter: CbsRowFilter,
): CbsTreeNode<T>[] {
  if (cbsFilterIsEmpty(filter)) return nodes;
  return searchCbsTree(nodes, criteriaFor(filter), !isStrictFilter(filter));
}

/**
 * Keeps only rows that match, lifting the survivors into the place of any
 * ancestor that didn't.
 *
 * `searchCbsTree` keeps a non-matching parent whenever a descendant matches, so
 * the hierarchy still reads top-down. Under a cost-type filter that misleads:
 * the kept parent is not of the cost type being filtered on, so the list
 * answers "which codes are Labor codes?" with rows that are not. Here a row
 * earns its place on its own code and nothing else, and a match orphaned
 * by a dropped ancestor is promoted rather than lost.
 *
 * `depth` is re-assigned on the way down, since it drives indentation and the
 * promoted rows would otherwise indent as though their parent were still
 * above them. `level` is left alone — it is the CODE's level and drives the
 * color, which should not change because a filter is on.
 */
function strictCbsRows<T extends CbsTreeItem>(
  nodes: CbsTreeNode<T>[],
  criteria: CbsCriteria,
  depth: number,
  onMatch: () => void,
): CbsTreeNode<T>[] {
  const out: CbsTreeNode<T>[] = [];
  for (const n of nodes) {
    if (rowMatches(n, criteria)) {
      onMatch();
      out.push({
        ...n,
        depth,
        children: strictCbsRows(n.children, criteria, depth + 1, onMatch),
      });
    } else {
      out.push(...strictCbsRows(n.children, criteria, depth, onMatch));
    }
  }
  return out;
}

export function pruneCbsTree<T extends CbsTreeItem>(
  nodes: CbsTreeNode<T>[],
  filter: CbsRowFilter,
): { nodes: CbsTreeNode<T>[]; matches: number } {
  if (cbsFilterIsEmpty(filter)) return { nodes, matches: 0 };
  let matches = 0;
  const onMatch = () => matches++;
  // A cost-type, status, row-type or value-picker filter is read as a report
  // — "show me the Labor codes", "show me the inactive ones", "show me the
  // INDIRECT ones" — so only rows that qualify survive. A bare text search
  // still keeps ancestors: there, knowing WHERE a hit sits is most of the
  // answer.
  const criteria = criteriaFor(filter);
  const kept = isStrictFilter(filter)
    ? strictCbsRows(nodes, criteria, 0, onMatch)
    : searchCbsTree(nodes, criteria, false, onMatch);
  return { nodes: kept, matches };
}
