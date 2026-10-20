import { L1_TO_DISCIPLINE } from "~/config/disciplines-data";

/**
 * Which of a project's granted cost codes the estimate actually books against.
 *
 * Setup grants codes generously — a project can hold thousands while its
 * estimate touches a few hundred — so the Project Cost Code List says what is
 * *permitted*, never what is *used*. This module is the other half: granted
 * against used, per division, so an allow-list can be pruned on evidence.
 *
 * Usage counts rows in EVERY version of the estimate, not the current one. A
 * code dropped from the latest version is still the reason an earlier version
 * reads the way it does, and revoking it would be the wrong call.
 */

/** A granted code, with however many estimate rows book against it. */
export type UsageItem = {
  displayCode: string;
  name: string;
  /** Estimate rows carrying this code, across every version. */
  rows: number;
};

/** One CBS division (L1 block), granted against used. */
export type UsageDivision = {
  l1: string;
  name: string;
  discipline: string;
  granted: number;
  used: number;
  rows: number;
  items: UsageItem[];
};

export type UsageModel = {
  divisions: UsageDivision[];
  totals: {
    granted: number;
    used: number;
    rows: number;
    /** Codes booked against that the project was never granted. */
    ungranted: number;
    /** Codes booked against that are in no CBS catalog row at all. */
    unknown: number;
  };
  /** In the catalog, used by the estimate, but not granted to this project. */
  ungranted: UsageItem[];
  /**
   * Used by the estimate and in the catalog nowhere.
   *
   * Not an error: the take-off pages build codes from a catalog account plus
   * the row's own attributes — metallurgy, bore size, fabricate/erect — so a
   * piping row books to something like 604-MB-ST00-00-C that was never a
   * dictionary row. It matters here because those rows cannot be matched to a
   * granted code, and a utilization figure that ignored them would read far
   * lower than the truth.
   */
  unknown: UsageItem[];
};

export type UsageRow = { displayCode: string; name: string };

/**
 * `granted` is the project's allow-list; `usage` counts estimate rows by code.
 *
 * The division name comes from the block's own summary row when the project
 * holds it, and falls back to the lowest granted code's name — an allow-list
 * need not include the summary above the codes it grants.
 */
export function buildCodeUsage(
  granted: UsageRow[],
  usage: Map<string, number>,
  /** Every display code in the catalog, to tell "not granted" from "not a CBS code". */
  catalog: Set<string> = new Set(granted.map((g) => g.displayCode)),
): UsageModel {
  const divisions = new Map<string, UsageDivision>();

  for (const row of granted) {
    const l1 = row.displayCode.slice(0, 3);
    const entry = divisions.get(l1) ?? {
      l1,
      name: "",
      discipline: L1_TO_DISCIPLINE[l1] ?? "",
      granted: 0,
      used: 0,
      rows: 0,
      items: [] as UsageItem[],
    };
    const rows = usage.get(row.displayCode) ?? 0;
    entry.granted++;
    if (rows > 0) {
      entry.used++;
      entry.rows += rows;
    }
    entry.items.push({ displayCode: row.displayCode, name: row.name, rows });
    // The block's own summary row names the division and always wins; failing
    // that, the first granted code's name stands in, since an allow-list need
    // not include the summary above the codes it grants.
    const isSummary = row.displayCode.endsWith("-00-0000-00-0");
    if (isSummary || !entry.name) entry.name = row.name;
    divisions.set(l1, entry);
  }

  const grantedCodes = new Set(granted.map((g) => g.displayCode));
  const ungranted: UsageItem[] = [];
  const unknown: UsageItem[] = [];
  for (const [code, rows] of usage) {
    if (grantedCodes.has(code)) continue;
    // In the catalog but not granted is an allow-list gap; absent from the
    // catalog entirely is a take-off-built code, which is a different thing
    // and must not be counted as a missing grant.
    (catalog.has(code) ? ungranted : unknown).push({
      displayCode: code,
      name: "",
      rows,
    });
  }

  for (const d of divisions.values()) {
    // Unused first: this list is read to decide what to revoke, and the
    // unused codes are the whole point of reading it.
    d.items.sort(
      (a, b) => a.rows - b.rows || a.displayCode.localeCompare(b.displayCode),
    );
  }

  return {
    // Most wasted grants first — the biggest pruning opportunity on top.
    divisions: [...divisions.values()].sort(
      (a, b) =>
        b.granted - b.used - (a.granted - a.used) || a.l1.localeCompare(b.l1),
    ),
    totals: {
      granted: granted.length,
      used: [...divisions.values()].reduce((n, d) => n + d.used, 0),
      rows: [...divisions.values()].reduce((n, d) => n + d.rows, 0),
      ungranted: ungranted.length,
      unknown: unknown.length,
    },
    ungranted: ungranted.sort((a, b) => b.rows - a.rows),
    unknown: unknown.sort((a, b) => b.rows - a.rows),
  };
}
