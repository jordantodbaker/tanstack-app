/**
 * The CBS hierarchy shared by the Setup page (allow-list editor) and the CBS
 * Sample page (colour-by-depth viewer). One builder so both pages agree on
 * parent/child expansion.
 *
 * Ancestry comes from the display code `XXX-YY-ZZWW-VV-T`: the group root
 * (`getGroupL1`: 601 → 600, 012 → 010), then the L1 account when it differs
 * from its group, then each further non-"00" segment (YY, ZZ, WW, VV),
 * stopping at the first "00". A row whose immediate ancestor code is absent
 * nests under the nearest ancestor that does exist, so the tree never shows
 * placeholder rows and depth = real nesting depth.
 *
 * Parenting is cost-type aware (T = 0 backbone / S sub / M material / L, E,
 * O, D, …): a row parents to the nearest existing ancestor of its OWN cost
 * type, else to the nearest "0" backbone ancestor. So Material rows nest under
 * Material summaries, Subcontract under Subcontract, Labor prefers Labor and
 * falls back to the backbone, and the S/M twins of a group root hang one level
 * below it. This mirrors the hierarchy of the Master CBS Dictionary workbook.
 */

export type CbsRowType = "ORIGINAL" | "SUB" | "MATERIAL";

export type CbsTreeItem = {
  id: number;
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
  /** The trailing cost-type segment of the display code ("0", "S", "M", "L", …). */
  l6: string;
  displayCode: string;
  name: string;
  accountDescription: string;
  uom: string;
  rowType: CbsRowType;
  /** The workbook's "Sub Code" flag. Optional so fixtures and callers that
   *  don't badge by flag need not carry it. */
  subReporting?: boolean | null;
  /** The workbook's "Material Code" flag. */
  materialCode?: boolean | null;
  /**
   * True for a row included only so the hierarchy reads correctly — an
   * ancestor of something the project HAS been granted, which it has not been
   * granted itself. Rendered muted and badge-less, and left out of row counts.
   */
  context?: boolean;
};

export type CbsTreeNode<T extends CbsTreeItem = CbsTreeItem> = {
  /** Unique key for React/expand state — the display code (plus the row id
   *  only if a catalog ever carries duplicate codes). */
  pathKey: string;
  /** Nesting depth in the built tree (0 = root). Drives indentation. */
  depth: number;
  /** Code level (see `getCbsLevel`). Drives colouring, like the workbook's
   *  colour-by-outline-level; can exceed `depth` when an intermediate code
   *  is absent and the row collapsed up to a shallower ancestor. */
  level: number;
  item: T;
  children: CbsTreeNode<T>[];
  /** This node's item id followed by every descendant's. */
  descendantItemIds: number[];
  /** Pre-lowercased searchable text for this node (own item only). Subtree
   *  matching walks children instead of storing every ancestor's text again. */
  searchHaystack: string;
};

const LEVEL_DEFAULT = "00";
const BACKBONE_TYPE = "0";
/** Cost types (the workbook's L7) for the generated subcontract / material rows. */
const SUB_TYPE = "S";
const MATERIAL_TYPE = "M";

/**
 * L1 blocks whose division sits at the TENS rather than the hundreds.
 *
 * Most divisions are `X00` (100 Civil, 600 Pipe Shop), and the 0-series
 * subdivides at the tens (010, 020, 050, 090). A few hundreds blocks carry
 * more than one division, each with its own summary row at XX0, and grouping
 * those at the hundreds rolled them into the wrong parent:
 *
 *   29X  Grout                      — beside Concrete (200), not inside it
 *   95X  Startup & Commissioning    ┐
 *   96X  Operations & Maintenance   ├ beside Coatings & Insulation (900)
 *   97X  Contingency                ┘
 *
 * Blocks that really are part of their hundreds parent stay out of this set:
 * 23X–26X are Concrete's own accounts, and 990 is "Coatings & Insulation
 * Subcontracts".
 *
 * Shop/field pairs are also deliberately absent — 330 Steel Erection, 530
 * Equipment Installation and 630 Install Piping each share a division (and a
 * discipline) with their shop half at 300 / 500 / 600.
 */
const TENS_DIVISIONS = new Set([29, 95, 96, 97]);

/** The division root an L1 account belongs to — the top of its tree branch. */
export function getGroupL1(l1: string): string {
  if (l1.length < 3) return l1;
  const firstTwo = Number.parseInt(l1.substring(0, 2), 10);
  if (Number.isNaN(firstTwo)) return l1;
  if (firstTwo < 10) return `0${l1[1]}0`;
  if (TENS_DIVISIONS.has(firstTwo)) return `${firstTwo}0`;
  return `${l1[0]}00`;
}

/**
 * An item's lineage key plus the keys of its ancestors, nearest first. The key
 * is the L1 followed by the chain of leading non-"00" segments (stopping at
 * the first "00", so trailing markers such as the Pipe Shop's "-ST"/"-LB"
 * suffixes don't count): 601-05-1050-00 → "601|05|10|50", and its ancestors
 * are "601|05|10", "601|05", "601", then the group root "600".
 */
function lineage(item: CbsTreeItem): {
  key: string;
  ancestors: string[];
  level: number;
} {
  const chain: string[] = [];
  for (const seg of [item.l2, item.l3, item.l4, item.l5]) {
    if (seg === LEVEL_DEFAULT) break;
    chain.push(seg);
  }
  const keyAt = (n: number) => [item.l1, ...chain.slice(0, n)].join("|");
  const ancestors: string[] = [];
  for (let n = chain.length - 1; n >= 0; n--) ancestors.push(keyAt(n));
  const group = getGroupL1(item.l1);
  if (group !== item.l1) ancestors.push(group);
  let level = ancestors.length;
  // A cost-type twin of a group root sits one level below it, like the
  // workbook outline.
  if (level === 0 && costType(item) !== BACKBONE_TYPE) level = 1;
  return { key: keyAt(chain.length), ancestors, level };
}

/**
 * Every summary code that could sit above `displayCode`, nearest first: each
 * level's code with the deeper segments zeroed, in the row's own cost type and
 * then the "0" backbone, finishing with the division root.
 *
 * Both cost types at every level, because that is the order `buildCbsTree`
 * looks in — and only one of the pair usually exists. "Superintendents - Civil"
 * (052-15-1000-00-L) belongs under "Superintendents", which the workbook
 * carries as 052-15-0000-00-L; there is no 052-15-0000-00-0 to fall back to.
 *
 * Used to pull the ancestors of a filtered set of rows so a subset still
 * renders as a hierarchy rather than a row of orphans. Codes that don't exist
 * cost nothing — the caller looks them up and keeps what it finds, which is
 * the same collapsing-to-the-nearest-ancestor `buildCbsTree` already does.
 */
export function cbsAncestorCodes(displayCode: string): string[] {
  const item = parseCbsDisplayCode(displayCode);
  const segs = [item.l2, item.l3, item.l4, item.l5];
  let depth = 0;
  while (depth < segs.length && segs[depth] !== LEVEL_DEFAULT) depth++;

  const types =
    item.l6 === BACKBONE_TYPE ? [BACKBONE_TYPE] : [item.l6, BACKBONE_TYPE];
  const out: string[] = [];
  const push = (l1: string, z: readonly string[]) => {
    for (const t of types) {
      out.push(`${l1}-${z[0]}-${z[1]}${z[2]}-${z[3]}-${t}`);
    }
  };

  for (let d = depth - 1; d >= 0; d--) {
    push(
      item.l1,
      segs.map((seg, i) => (i < d ? seg : LEVEL_DEFAULT)),
    );
  }
  // The division root, which closes every chain. A row that IS the root names
  // itself here; the filter below drops that.
  push(getGroupL1(item.l1), [
    LEVEL_DEFAULT,
    LEVEL_DEFAULT,
    LEVEL_DEFAULT,
    LEVEL_DEFAULT,
  ]);
  return [...new Set(out)].filter((c) => c !== displayCode);
}

/**
 * Code level of an item: 0 for a group root (600-00-0000-00-0), 1 for an L1
 * account (601-00-…), then +1 per leading non-"00" segment; a group root's
 * S/M twin counts as 1.
 */
export function getCbsLevel(item: CbsTreeItem): number {
  return lineage(item).level;
}

function costType(item: CbsTreeItem): string {
  return item.l6 || BACKBONE_TYPE;
}

/** The stored level segments of a display code `XXX-YY-ZZWW-VV-T`. */
export function parseCbsDisplayCode(
  displayCode: string,
): Pick<CbsTreeItem, "l1" | "l2" | "l3" | "l4" | "l5" | "l6"> {
  return {
    l1: displayCode.slice(0, 3),
    l2: displayCode.slice(4, 6),
    l3: displayCode.slice(7, 9),
    l4: displayCode.slice(9, 11),
    l5: displayCode.slice(12, 14),
    l6: displayCode.slice(15, 16),
  };
}

/** Everything but the trailing cost-type segment. */
function codePrefix(code: string): string {
  const dash = code.lastIndexOf("-");
  return dash >= 0 ? code.slice(0, dash) : code;
}

// Within one prefix: the backbone row first, then its Sub and Material twins
// (the workbook order), then any other cost types alphabetically.
const TYPE_RANK: Record<string, number> = { [BACKBONE_TYPE]: 0, S: 1, M: 2 };
function typeRank(type: string): number {
  return TYPE_RANK[type] ?? 3;
}

/**
 * Dictionary order for display codes: by code prefix (parents before
 * children), then backbone → S → M → other cost types. Shared with the
 * workbook loader so stored row ids follow the same order.
 */
export function compareCbsDisplayCodes(a: string, b: string): number {
  const pa = codePrefix(a);
  const pb = codePrefix(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  const ta = a.slice(pa.length + 1) || BACKBONE_TYPE;
  const tb = b.slice(pb.length + 1) || BACKBONE_TYPE;
  const ra = typeRank(ta);
  const rb = typeRank(tb);
  if (ra !== rb) return ra - rb;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return 0;
}

/** Pre-order sort: parents before children, cost-type twins adjacent. */
function sortCbsItems<T extends CbsTreeItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      compareCbsDisplayCodes(a.displayCode, b.displayCode) || a.id - b.id,
  );
}

export function buildCbsTree<T extends CbsTreeItem>(
  items: readonly T[],
): CbsTreeNode<T>[] {
  type Build = { depth: number; level: number; item: T; children: Build[] };

  const roots: Build[] = [];
  // Every placed node keyed by "lineage|type" so a row can find the nearest
  // existing ancestor of its own cost type, then of the "0" backbone. The
  // first row to claim a key keeps it (sorted order → the backbone-most row).
  const placed = new Map<string, Build>();
  const seenKeys = new Map<string, number>();
  const keys = new Map<Build, string>();

  for (const item of sortCbsItems(items)) {
    const type = costType(item);
    const { key, ancestors, level } = lineage(item);
    const isGroupRoot = ancestors.length === 0;

    let parent: Build | null = null;
    for (const a of ancestors) {
      const hit = placed.get(`${a}|${type}`);
      if (hit) {
        parent = hit;
        break;
      }
    }
    if (!parent && type !== BACKBONE_TYPE) {
      for (const a of ancestors) {
        const hit = placed.get(`${a}|${BACKBONE_TYPE}`);
        if (hit) {
          parent = hit;
          break;
        }
      }
      // A cost-type twin of a group root (Civil Materials under Civil) hangs
      // off its own backbone row.
      if (!parent && isGroupRoot) {
        parent = placed.get(`${key}|${BACKBONE_TYPE}`) ?? null;
      }
    }

    const node: Build = {
      depth: parent ? parent.depth + 1 : 0,
      level,
      item,
      children: [],
    };
    if (parent) parent.children.push(node);
    else roots.push(node);
    // A group root's twins sit beside the root's other children (Civil
    // Subcontracts next to Civil Shop Materials), so they never act as
    // ancestors — only the backbone root does.
    const actsAsAncestor = !(isGroupRoot && type !== BACKBONE_TYPE);
    if (actsAsAncestor && !placed.has(`${key}|${type}`)) {
      placed.set(`${key}|${type}`, node);
    }

    const dupes = seenKeys.get(item.displayCode) ?? 0;
    seenKeys.set(item.displayCode, dupes + 1);
    keys.set(node, dupes ? `${item.displayCode}#${item.id}` : item.displayCode);
  }

  function toOutput(node: Build): CbsTreeNode<T> {
    const children = node.children.map(toOutput);
    const descendantItemIds: number[] = [node.item.id];
    for (const c of children) descendantItemIds.push(...c.descendantItemIds);
    return {
      pathKey: keys.get(node)!,
      depth: node.depth,
      level: node.level,
      item: node.item,
      children,
      descendantItemIds,
      searchHaystack:
        `${node.item.displayCode} ${node.item.name} ${node.item.accountDescription}`.toLowerCase(),
    };
  }

  return roots.map(toOutput);
}

export type SelectionState = "checked" | "unchecked" | "indeterminate";

function selectionState(selected: number, total: number): SelectionState {
  if (selected === 0) return "unchecked";
  if (selected === total) return "checked";
  return "indeterminate";
}

/** Selection state of one node by walking its descendant ids — fine for a
 *  single click; use `computeCbsSelectionCounts` when rendering many rows. */
export function getNodeSelectionState(
  node: CbsTreeNode,
  selectedIds: Set<number>,
): SelectionState {
  let selected = 0;
  for (const id of node.descendantItemIds) {
    if (selectedIds.has(id)) selected++;
  }
  return selectionState(selected, node.descendantItemIds.length);
}

/**
 * Selected-descendant count for every node, keyed by pathKey, in one
 * bottom-up pass (O(n) per selection change) — so rendering thousands of
 * rows doesn't re-walk each node's descendant list per row.
 */
export function computeCbsSelectionCounts(
  nodes: CbsTreeNode[],
  selectedIds: Set<number>,
): Map<string, number> {
  const counts = new Map<string, number>();
  const rec = (n: CbsTreeNode): number => {
    let selected = selectedIds.has(n.item.id) ? 1 : 0;
    for (const c of n.children) selected += rec(c);
    counts.set(n.pathKey, selected);
    return selected;
  };
  for (const n of nodes) rec(n);
  return counts;
}

/** Selection state from a `computeCbsSelectionCounts` map. */
export function selectionStateFromCounts(
  node: CbsTreeNode,
  counts: Map<string, number>,
): SelectionState {
  return selectionState(
    counts.get(node.pathKey) ?? 0,
    node.descendantItemIds.length,
  );
}

/**
 * Does this row carry subcontract cost? Either it IS a subcontract code — its
 * own cost type (the workbook's L7) is "S", which covers both the rows the
 * workbook ships that way and the twins the dictionary generates — or it is a
 * code whose Sub Code column says YES, meaning a subcontract twin exists for
 * it. The toolbar's "Subcontracts" filter is exactly this question.
 */
export function cbsIsSubcontract(item: CbsTreeItem): boolean {
  return item.l6 === SUB_TYPE || item.subReporting === true;
}

/** The material counterpart of `cbsIsSubcontract` — L7 "M", or Material Code YES. */
export function cbsIsMaterial(item: CbsTreeItem): boolean {
  return item.l6 === MATERIAL_TYPE || item.materialCode === true;
}

/**
 * What a CBS tree view is currently showing: free text plus the row-type
 * toggles. `query` must already be lower-cased and trimmed.
 */
export type CbsRowFilter = {
  query: string;
  sub: boolean;
  material: boolean;
};

export const CBS_FILTER_NONE: CbsRowFilter = {
  query: "",
  sub: false,
  material: false,
};

/** Is this filter showing everything (so callers can skip the walk)? */
export function cbsFilterIsEmpty(filter: CbsRowFilter): boolean {
  return !filter.query && !filter.sub && !filter.material;
}

/**
 * The text and the type toggles narrow each other: "pumps" with Subcontracts
 * on means subcontract rows mentioning pumps. The two toggles widen each
 * other, since asking for both is asking for either.
 */
function rowMatches<T extends CbsTreeItem>(
  node: CbsTreeNode<T>,
  filter: CbsRowFilter,
): boolean {
  if (filter.query && !node.searchHaystack.includes(filter.query)) return false;
  if (!filter.sub && !filter.material) return true;
  return (
    (filter.sub && cbsIsSubcontract(node.item)) ||
    (filter.material && cbsIsMaterial(node.item))
  );
}

/**
 * Single-pass filter that prunes nodes whose subtrees hold nothing matching
 * `filter`. A self-match may keep its whole subtree intact (same object);
 * otherwise a surviving node is a copy with just the matching children.
 */
function searchCbsTree<T extends CbsTreeItem>(
  nodes: CbsTreeNode<T>[],
  filter: CbsRowFilter,
  /** A self-matching node keeps its WHOLE subtree, unrecursed, so the kept
   *  node is the original object. Off: only matching descendants survive. */
  keepMatchedSubtree: boolean,
  onMatch?: () => void,
): CbsTreeNode<T>[] {
  const out: CbsTreeNode<T>[] = [];
  for (const n of nodes) {
    const selfMatch = rowMatches(n, filter);
    if (selfMatch && keepMatchedSubtree) {
      onMatch?.();
      out.push(n);
      continue;
    }
    const kids = searchCbsTree(n.children, filter, keepMatchedSubtree, onMatch);
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
  const typeFiltered = filter.sub || filter.material;
  return searchCbsTree(nodes, filter, !typeFiltered);
}

/**
 * Strict filter for the viewers: keeps only nodes that match `filter`
 * themselves plus their ancestors (a matching parent does NOT keep its
 * non-matching children), and counts the matches.
 */
export function pruneCbsTree<T extends CbsTreeItem>(
  nodes: CbsTreeNode<T>[],
  filter: CbsRowFilter,
): { nodes: CbsTreeNode<T>[]; matches: number } {
  if (cbsFilterIsEmpty(filter)) return { nodes, matches: 0 };
  let matches = 0;
  return {
    nodes: searchCbsTree(nodes, filter, false, () => matches++),
    matches,
  };
}

/** The "S" / "M" marker shown beside generated rows; null for originals.
 *  Reached through `cbsRowTypeBadges`, which is what callers render. */
function rowTypeBadge(
  rowType: CbsRowType,
): { label: string; title: string } | null {
  if (rowType === "SUB") return { label: "S", title: "Generated sub-code row" };
  if (rowType === "MATERIAL") {
    return { label: "M", title: "Generated material row" };
  }
  return null;
}

/** One marker shown beside a row. */
export type CbsBadge = { label: string; title: string };

/** Badges by row type — what a generated row IS. Used where generated rows
 *  sit alongside their originals (Setup, the Master CBS Dictionary). */
export function cbsRowTypeBadges(item: CbsTreeItem): CbsBadge[] {
  const badge = rowTypeBadge(item.rowType);
  return badge ? [badge] : [];
}

/**
 * Badges by the workbook's own flags — what a row HAS. Used where only
 * original rows are listed (the CBS Code Book), so the row itself shows
 * whether it carries a sub code, a material code, or both.
 */
export function cbsFlagBadges(item: CbsTreeItem): CbsBadge[] {
  const out: CbsBadge[] = [];
  if (item.subReporting === true) {
    out.push({ label: "S", title: "Sub Code: YES" });
  }
  if (item.materialCode === true) {
    out.push({ label: "M", title: "Material Code: YES" });
  }
  return out;
}

/**
 * Path keys to open so the tree shows down to `level` and no further — what
 * the colour legend's L0…L5 buttons set. Keyed on the CODE level (the legend's
 * own colour key), not tree depth, so "L2" means the blue rows whatever depth
 * they landed at. Level 0 opens nothing, which is "collapse all".
 */
export function collectKeysToLevel(
  nodes: CbsTreeNode[],
  level: number,
): string[] {
  const keys: string[] = [];
  const walk = (list: CbsTreeNode[]) => {
    for (const n of list) {
      // A node at or past the target stays shut, and nothing under it can be
      // visible, so there is no reason to walk into it.
      if (n.children.length > 0 && n.level < level) {
        keys.push(n.pathKey);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

/** Path keys of every node that has children — for "Expand all". */
export function collectExpandableKeys(nodes: CbsTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (list: CbsTreeNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) {
        keys.push(n.pathKey);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
}
