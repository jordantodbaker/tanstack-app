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
import { BACKBONE_TYPE, type CbsTreeItem, type CbsTreeNode } from "./types";
import { costType, lineage, sortCbsItems } from "./codes";

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
    // The "0" cost type IS the account's roll-up code, so an account's priced
    // variants are its children rather than its siblings: 013-00-0000-00-M and
    // -S belong under 013-00-0000-00-0, not beside it. Checked before the
    // ancestor walk, because that walk would otherwise hand them to the
    // account's own parent and leave the three looking like peers.
    //
    // `lineage` keys on the level segments alone, so an account and all its
    // cost types share one key and are told apart by the "|type" suffix.
    const ownRollUp =
      type === BACKBONE_TYPE
        ? null
        : (placed.get(`${key}|${BACKBONE_TYPE}`) ?? null);
    parent = ownRollUp;

    if (!parent) {
      for (const a of ancestors) {
        const hit = placed.get(`${a}|${type}`);
        if (hit) {
          parent = hit;
          break;
        }
      }
    }
    if (!parent && type !== BACKBONE_TYPE) {
      // No roll-up row for this account — the ~1,000 deliverable-style codes
      // have none — so fall back to the nearest backbone above it.
      for (const a of ancestors) {
        const hit = placed.get(`${a}|${BACKBONE_TYPE}`);
        if (hit) {
          parent = hit;
          break;
        }
      }
    }

    const node: Build = {
      depth: parent ? parent.depth + 1 : 0,
      // Colour follows the nesting when a row sits under its own roll-up: the
      // variant reads one level in from the account it prices.
      level: ownRollUp ? ownRollUp.level + 1 : level,
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
      // The code appears twice: once as written and once with the dashes
      // stripped, because cost codes travel without them (the workbook's Cost
      // Code column, exports, anything pasted out of Excel) and "60420" should
      // find 604-20-0000-00-0. UOM is in so "tn" finds the tonnage codes.
      searchHaystack: [
        node.item.displayCode,
        node.item.displayCode.replace(/-/g, ""),
        node.item.name,
        node.item.accountDescription,
        node.item.uom,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  }

  return roots.map(toOutput);
}
