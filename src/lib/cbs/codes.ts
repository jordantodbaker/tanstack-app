/**
 * The display code `XXX-YY-ZZWW-VV-T` as data: which division a row belongs
 * to, how deep its code sits, what its ancestors would be called, and the
 * order codes sort in.
 *
 * Pure string work on one row at a time. The tree is assembled from this in
 * `build`, which is the only other module that needs the internals here.
 */
import { BACKBONE_TYPE, LEVEL_DEFAULT, type CbsTreeItem } from "./types";

/**
 * L1 blocks whose division sits at the TENS rather than the hundreds.
 *
 * Most divisions are `X00` (100 Civil, 600 Pipe Shop), and the 0-series
 * subdivides at the tens (010, 020, 050, 090). A few hundreds blocks carry
 * more than one division, each with its own summary row at XX0, and grouping
 * those at the hundreds rolled them into the wrong parent:
 *
 *   29X  Grout                      — beside Concrete (200), not inside it
 *   95X  Specialty Services         ┐
 *   96X  Startup & Commissioning    ├ beside Coatings & Insulation (900)
 *   97X  Operations & Maintenance   │
 *   98X  Contingency                ┘
 *
 * The 9-series shifted by one block when Specialty Services was inserted at
 * 950: what was 95X/96X/97X is now 96X/97X/98X. Membership is by position, so
 * adding 98 is all the renumber needs from this file — but see DEPLOYMENT §11a
 * for the code tables a renumber DOES invalidate.
 *
 * Blocks that really are part of their hundreds parent stay out of this set:
 * 23X–26X are Concrete's own accounts, and 990 is "Coatings & Insulation
 * Subcontracts". 93X (Paint & Coatings, Insulation, FireProofing, Refractory)
 * is also absent on purpose — it reads as part of Coatings & Insulation (900);
 * add it here if it should root beside it instead.
 *
 * Shop/field pairs are also deliberately absent — 330 Steel Erection, 530
 * Equipment Installation and 630 Install Piping each share a division (and a
 * discipline) with their shop half at 300 / 500 / 600.
 */
const TENS_DIVISIONS = new Set([29, 95, 96, 97, 98]);

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
export function lineage(item: CbsTreeItem): {
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

export function costType(item: CbsTreeItem): string {
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

/**
 * Restores the l1-l6 segments that the CBS wire payload omits.
 *
 * They are pure slices of the display code — the import derives them from the
 * code in the first place rather than trusting the workbook's own L1-L6
 * columns (see `prisma/cbs-workbook.ts`), and a check across all 7,169 rows
 * found none where the stored columns differ from the parse. So the two were
 * the same data twice: leaving them out cut the catalog payload from 134 KB to
 * 104 KB gzipped, at the cost of one slice per segment per row.
 *
 * Applied in the query functions (see `~/utils/cbs`), so it runs once per
 * fetch rather than once per component that reads the cache.
 */
export function withCbsLevels<T extends { displayCode: string }>(
  row: T,
): T & Pick<CbsTreeItem, "l1" | "l2" | "l3" | "l4" | "l5" | "l6"> {
  return { ...row, ...parseCbsDisplayCode(row.displayCode) };
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
export function sortCbsItems<T extends CbsTreeItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      compareCbsDisplayCodes(a.displayCode, b.displayCode) || a.id - b.id,
  );
}
