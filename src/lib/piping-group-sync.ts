/**
 * Reads the piping metallurgy codes out of `prisma/data/piping_groups.csv` and
 * works out which stored `PipingGroup` rows are stale. Pure — the caller
 * (`scripts/sync-piping-group-codes.ts`) supplies the file text and the rows.
 *
 * These two columns are what the Piping take-off composes CBS cost codes from,
 * and they are NOT derived from the CBS workbook. A renumbered piping
 * series therefore leaves them pointing at accounts that no longer exist, and
 * piping rows silently stop auto-populating their CBS id and name.
 */

/** The two codes a material classification maps to. */
export type PipingGroupCodes = { installCode: string; shopCode: string };

/** The stored row a sync is matched against. */
export type PipingGroupRow = {
  id: number;
  materialClassification: string;
} & PipingGroupCodes;

export type PipingGroupSyncPlan = {
  /** Rows to update, with the codes to write. */
  stale: ({ id: number } & PipingGroupCodes)[];
  /** Rows already holding the CSV's codes. */
  current: number;
  /** Classifications stored but absent from the CSV — reported, never touched. */
  unknown: string[];
  /** One "old → new" line per changed classification, for the run log. */
  changes: { classification: string; description: string }[];
};

/** Split one CSV line, honouring double-quoted fields. */
export function parsePipingCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuote = false;
      } else field += c;
    } else if (c === '"') inQuote = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

/**
 * classification → codes, from the CSV's text. The file carries one row per
 * (group, pipe size), so a classification repeats many times with the same
 * codes: first row wins. Rows missing any of the three fields are skipped.
 */
export function parsePipingGroupCodes(
  csvText: string,
): Map<string, PipingGroupCodes> {
  const map = new Map<string, PipingGroupCodes>();
  for (const line of csvText.split(/\r?\n/).slice(1)) {
    if (line.trim() === "") continue;
    const cols = parsePipingCsvLine(line);
    const classification = (cols[1] ?? "").trim();
    const installCode = (cols[2] ?? "").trim();
    const shopCode = (cols[3] ?? "").trim();
    if (!classification || !installCode || !shopCode) continue;
    if (!map.has(classification)) map.set(classification, { installCode, shopCode });
  }
  return map;
}

export function planPipingGroupSync(
  wanted: Map<string, PipingGroupCodes>,
  groups: readonly PipingGroupRow[],
): PipingGroupSyncPlan {
  const stale: ({ id: number } & PipingGroupCodes)[] = [];
  const unknown = new Set<string>();
  const changes = new Map<string, string>();
  let current = 0;

  for (const g of groups) {
    const want = wanted.get(g.materialClassification);
    if (!want) {
      unknown.add(g.materialClassification);
      continue;
    }
    if (g.installCode === want.installCode && g.shopCode === want.shopCode) {
      current++;
      continue;
    }
    stale.push({ id: g.id, ...want });
    // One line per classification, not per group row — the CSV has hundreds of
    // rows per classification and they all move together.
    changes.set(
      g.materialClassification,
      `${g.installCode}/${g.shopCode} → ${want.installCode}/${want.shopCode}`,
    );
  }

  return {
    stale,
    current,
    unknown: [...unknown],
    changes: [...changes].map(([classification, description]) => ({
      classification,
      description,
    })),
  };
}
