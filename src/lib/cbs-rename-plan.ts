/**
 * Decides what a CBS account rename should do, given the renames asked for and
 * the rows currently stored. Pure, so the safety rule below is testable without
 * a database: see `scripts/rename-cbs-accounts.ts` for the caller.
 *
 * Account names come from the "Name" column of `prisma/data/CBS.xlsx`, so
 * a rename applied only to the database is reverted by the next CBS import. The
 * script therefore re-runs after every import, which makes it important that it
 * NEVER writes blind: an entry whose stored name is neither the old name nor
 * the new one means the workbook has since said something else, and that wins.
 */

/** One rename, as the script's table declares it. */
export type CbsRename = {
  displayCode: string;
  /** The name expected to be in the database before the rename. */
  from: string;
  to: string;
  /** Where the same edit belongs in the workbook, for the reminder output. */
  workbookCell: string;
};

/** The stored row a rename is matched against. */
export type CbsRenameRow = { id: number; displayCode: string; name: string };

export type CbsRenameOutcome =
  /** Stored name matches `from` — rename it. */
  | { kind: "rename"; displayCode: string; id: number; from: string; to: string }
  /** Already renamed; re-running is a no-op. */
  | { kind: "current"; displayCode: string; name: string }
  /** Stored name is neither `from` nor `to` — refuse, don't overwrite. */
  | { kind: "stale"; displayCode: string; actual: string; expected: string }
  /** No such account in the catalog. */
  | { kind: "missing"; displayCode: string };

/**
 * One outcome per rename, in the order declared. `rename` entries carry the row
 * id to update; every other kind is a no-op the caller reports.
 */
export function planCbsRenames(
  renames: readonly CbsRename[],
  rows: readonly CbsRenameRow[],
): CbsRenameOutcome[] {
  const byCode = new Map(rows.map((r) => [r.displayCode, r]));
  return renames.map((r): CbsRenameOutcome => {
    const row = byCode.get(r.displayCode);
    if (!row) return { kind: "missing", displayCode: r.displayCode };
    // Check "already done" before "unexpected", so a second run after a
    // successful rename reports `current` rather than refusing.
    if (row.name === r.to) {
      return { kind: "current", displayCode: r.displayCode, name: row.name };
    }
    if (row.name !== r.from) {
      return {
        kind: "stale",
        displayCode: r.displayCode,
        actual: row.name,
        expected: r.from,
      };
    }
    return {
      kind: "rename",
      displayCode: r.displayCode,
      id: row.id,
      from: row.name,
      to: r.to,
    };
  });
}

/** The display description a renamed row should carry. */
export function cbsDisplayDescription(displayCode: string, name: string): string {
  return `${displayCode}:  ${name}`;
}
