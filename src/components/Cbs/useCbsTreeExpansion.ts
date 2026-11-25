import { CBS_LEGEND_LEVELS } from "~/config/cbs-level-colors";
import { toggleInSet } from "~/lib/utils";
import * as React from "react";
import {
  cbsTreeWithParents,
  collectExpandableKeys,
  collectKeysToLevel,
  type CbsRowFilter,
  type CbsTreeNode,
} from "~/lib/cbs-tree";

/** The last legend button, which is documented as the same as Expand all. */
const DEEPEST_LEVEL = Math.max(...CBS_LEGEND_LEVELS);

const keysToLevel = (nodes: CbsTreeNode[], level: number) =>
  level >= DEEPEST_LEVEL
    ? collectExpandableKeys(nodes)
    : collectKeysToLevel(nodes, level);

/**
 * Expand/collapse state for a CBS tree — shared by the Setup editor and the
 * CBS dictionary viewers. `expandAll` opens every node of the full `nodes` tree
 * (not just the currently filtered view) so a later cleared search shows the
 * whole catalog open.
 *
 * `expandToLevel` opens the tree down to one code level, which is what the
 * color legend's L0…L5 buttons call. `levelShown` is the level last asked for,
 * so the legend can mark it; any other change to the expansion clears it,
 * because the tree no longer stands at a single level.
 *
 * While a filter is on, the filtered tree has an expansion of its own. It
 * starts fully open, since the matches are the point, and every control acts
 * on it from there. Changing the filter opens it again so no new match is
 * hidden. Picking a level brings back the parents of the matches, so the levels
 * above it are all there. Clearing the filter returns to the expansion the full tree had.
 */
export function useCbsTreeExpansion(
  nodes: CbsTreeNode[],
  view: { nodes: CbsTreeNode[]; filtering: boolean; filter: CbsRowFilter },
) {
  // Belongs to the one filtered tree it was set on; null is "fully open".
  const [narrowed, setNarrowed] = React.useState<{
    source: CbsTreeNode[];
    nodes: CbsTreeNode[];
    expanded: Set<string>;
    levelShown: number | null;
  } | null>(null);
  const current =
    view.filtering && narrowed?.source === view.nodes ? narrowed : null;

  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [levelShown, setLevelShown] = React.useState<number | null>(null);

  const toggle = React.useCallback((pathKey: string) => {
    setLevelShown(null);
    setExpanded((prev) => toggleInSet(prev, pathKey));
  }, []);

  const expandableKeys = React.useMemo(
    () => collectExpandableKeys(nodes),
    [nodes],
  );
  const expandAll = React.useCallback(() => {
    setLevelShown(null);
    setExpanded(new Set(expandableKeys));
  }, [expandableKeys]);

  // "Collapse all" and the legend's L0 are the same thing, so they agree on
  // what the legend highlights.
  const collapseAll = React.useCallback(() => {
    setLevelShown(0);
    setExpanded(new Set());
  }, []);

  /**
   * Opens the given nodes without closing anything — what a `?code=` deep link
   * needs, since the row it names is usually four levels down and every
   * ancestor has to be open for it to exist in the list at all.
   */
  const reveal = React.useCallback((pathKeys: string[]) => {
    if (pathKeys.length === 0) return;
    setLevelShown(null);
    setExpanded((prev) => {
      if (pathKeys.every((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      for (const k of pathKeys) next.add(k);
      return next;
    });
  }, []);

  const expandToLevel = React.useCallback(
    (level: number) => {
      setLevelShown(level);
      setExpanded(new Set(keysToLevel(nodes, level)));
    },
    [nodes],
  );

  const { filter, nodes: filteredNodes } = view;
  const toggleFiltered = React.useCallback(
    (pathKey: string) =>
      setNarrowed((prev) => {
        const base = prev?.source === filteredNodes ? prev : null;
        const shown = base?.nodes ?? filteredNodes;
        return {
          source: filteredNodes,
          nodes: shown,
          expanded: toggleInSet(
            base?.expanded ?? new Set(collectExpandableKeys(shown)),
            pathKey,
          ),
          levelShown: null,
        };
      }),
    [filteredNodes],
  );
  const expandAllFiltered = React.useCallback(() => setNarrowed(null), []);
  const collapseAllFiltered = React.useCallback(
    () =>
      setNarrowed({
        source: filteredNodes,
        nodes: filteredNodes,
        expanded: new Set(),
        levelShown: null,
      }),
    [filteredNodes],
  );
  const expandFilteredToLevel = React.useCallback(
    (level: number) => {
      const shown = cbsTreeWithParents(nodes, filter) ?? filteredNodes;
      setNarrowed({
        source: filteredNodes,
        nodes: shown,
        expanded: new Set(keysToLevel(shown, level)),
        levelShown: level,
      });
    },
    [nodes, filter, filteredNodes],
  );

  if (view.filtering) {
    return {
      /** The rows to list: the filtered ones, with parents once a level is picked. */
      shownNodes: current?.nodes ?? filteredNodes,
      expanded: current?.expanded ?? expanded,
      /** Treat every row as open: a filter whose expansion is untouched. */
      forceOpen: current === null,
      toggle: toggleFiltered,
      expandAll: expandAllFiltered,
      collapseAll: collapseAllFiltered,
      expandToLevel: expandFilteredToLevel,
      reveal,
      levelShown: current?.levelShown ?? null,
    };
  }
  return {
    shownNodes: filteredNodes,
    expanded,
    forceOpen: false,
    toggle,
    expandAll,
    collapseAll,
    expandToLevel,
    reveal,
    levelShown,
  };
}
