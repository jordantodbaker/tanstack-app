import { L1_TO_DISCIPLINE } from "~/config/disciplines-data";

/**
 * Core codes — the second axis of the CBS.
 *
 * A CBS code says WHERE a cost sits (Civil's field staff live at 102-xx,
 * Concrete's at 232-xx). A Core code says WHAT KIND of cost it is, by pointing
 * at the account in 050 Field Indirects that it belongs with. So Civil Field
 * Staff, Concrete Field Staff and Piping Field Staff all carry a Core code of
 * 052-00-0000-00-0 "Field Staff".
 *
 * That gives two independent roll-ups over the same estimate: by discipline
 * (every Civil cost) and by core account (every field-staff cost, whichever
 * discipline paid for it).
 *
 * This module turns the raw `core` cells into that second structure, and is
 * honest about the gaps — the coding is a work in progress, so a view of it
 * that hid the holes would be worse than useless.
 */

/** The fields this module needs from a CBS row. */
export type CoreLinkRow = {
  displayCode: string;
  costCode: string;
  name: string;
  core: string | null;
};

/** One CBS item feeding a core account. */
export type CoreLinkItem = {
  displayCode: string;
  name: string;
  discipline: string;
};

/** A core account and everything that rolls into it. */
export type CoreTarget = {
  /** Display code of the account the links point at. */
  code: string;
  name: string;
  /** discipline id -> how many items from that discipline link here. */
  counts: Record<string, number>;
  total: number;
  disciplineCount: number;
  items: CoreLinkItem[];
};

/** A core cell that points at nothing, grouped by the raw value. */
export type CoreProblem = {
  raw: string;
  count: number;
  /** Why it did not resolve, for the UI to explain rather than just count. */
  reason: "missing" | "ambiguous";
  /** What it would have matched, for the ambiguous case. */
  candidates: string[];
  /** A few of the rows carrying it. */
  sample: string[];
};

export type CoreCoverage = {
  discipline: string;
  coded: number;
  total: number;
};

export type CoreLinkModel = {
  /** Core accounts, most-linked first. */
  targets: CoreTarget[];
  /** Discipline ids that appear in at least one link, in CBS code order. */
  disciplines: string[];
  coverage: CoreCoverage[];
  problems: CoreProblem[];
  totals: {
    rows: number;
    coded: number;
    linked: number;
    unresolved: number;
    targets: number;
    crossDiscipline: number;
  };
};

/**
 * The cost codes a raw Core cell might mean.
 *
 * Two deformations have to be undone. Excel holds the column as a number, so
 * "052-15-0500-00" comes back as 5215050000 with the leading zero gone; and a
 * four-segment code (11 characters) names an account rather than a priced row,
 * which in this dictionary is the "-0" backbone.
 *
 * Both readings of an 11-character value are returned on purpose — "53000000000"
 * is either 530-00-0000-00-0 or 053-00-0000-00-0, and only the catalog can say
 * which exist. Callers treat two hits as ambiguous rather than guessing.
 */
export function coreCodeCandidates(raw: string): string[] {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed || trimmed.length > 12) return [];
  const out: string[] = [];
  for (const padded of [
    trimmed,
    trimmed.padStart(11, "0"),
    trimmed.padStart(12, "0"),
  ]) {
    if (padded.length === 12) out.push(padded);
    // A four-segment account code: the row that carries it is the backbone.
    if (padded.length === 11) out.push(`${padded}0`);
  }
  return [...new Set(out)];
}

/** The discipline that owns a display code, or "" when none claims it. */
export function disciplineForDisplayCode(displayCode: string): string {
  return L1_TO_DISCIPLINE[displayCode.slice(0, 3)] ?? "";
}

/** Sorts discipline ids by the lowest CBS block each one owns. */
function disciplineOrder(): Map<string, number> {
  const order = new Map<string, number>();
  for (const [l1, id] of Object.entries(L1_TO_DISCIPLINE)) {
    const n = Number(l1);
    if (!order.has(id) || n < order.get(id)!) order.set(id, n);
  }
  return order;
}

export function buildCoreLinks(rows: CoreLinkRow[]): CoreLinkModel {
  const byCostCode = new Map(rows.map((r) => [r.costCode, r]));
  const targets = new Map<string, CoreTarget>();
  const problems = new Map<string, CoreProblem>();
  const coverage = new Map<string, CoreCoverage>();

  let coded = 0;
  let linked = 0;

  for (const row of rows) {
    const discipline = disciplineForDisplayCode(row.displayCode);
    const cov = coverage.get(discipline) ?? { discipline, coded: 0, total: 0 };
    cov.total++;

    const raw = row.core?.trim();
    if (raw) {
      cov.coded++;
      coded++;
    }
    coverage.set(discipline, cov);
    if (!raw) continue;

    const hits = coreCodeCandidates(raw).filter((c) => byCostCode.has(c));
    if (hits.length !== 1) {
      const key = `${raw}`;
      const problem = problems.get(key) ?? {
        raw,
        count: 0,
        reason:
          hits.length === 0 ? ("missing" as const) : ("ambiguous" as const),
        candidates: coreCodeCandidates(raw),
        sample: [],
      };
      problem.count++;
      if (problem.sample.length < 5) problem.sample.push(row.displayCode);
      problems.set(key, problem);
      continue;
    }

    const target = byCostCode.get(hits[0])!;
    const entry = targets.get(target.displayCode) ?? {
      code: target.displayCode,
      name: target.name,
      counts: {} as Record<string, number>,
      total: 0,
      disciplineCount: 0,
      items: [] as CoreLinkItem[],
    };
    entry.counts[discipline] = (entry.counts[discipline] ?? 0) + 1;
    entry.total++;
    entry.items.push({
      displayCode: row.displayCode,
      name: row.name,
      discipline,
    });
    targets.set(target.displayCode, entry);
    linked++;
  }

  const order = disciplineOrder();
  const used = new Set<string>();
  for (const t of targets.values()) {
    t.disciplineCount = Object.keys(t.counts).length;
    // Items read best grouped by discipline, then by code within it.
    t.items.sort(
      (a, b) =>
        (order.get(a.discipline) ?? 999) - (order.get(b.discipline) ?? 999) ||
        a.displayCode.localeCompare(b.displayCode),
    );
    for (const d of Object.keys(t.counts)) used.add(d);
  }

  return {
    // Most-linked first: the accounts doing the most cross-discipline work are
    // the ones worth looking at, and the long tail of single links sorts out
    // of the way on its own.
    targets: [...targets.values()].sort(
      (a, b) =>
        b.disciplineCount - a.disciplineCount ||
        b.total - a.total ||
        a.code.localeCompare(b.code),
    ),
    disciplines: [...used]
      .filter(Boolean)
      .sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999)),
    coverage: [...coverage.values()]
      .filter((c) => c.discipline)
      .sort((a, b) => b.coded / b.total - a.coded / a.total),
    problems: [...problems.values()].sort((a, b) => b.count - a.count),
    totals: {
      rows: rows.length,
      coded,
      linked,
      unresolved: coded - linked,
      targets: targets.size,
      crossDiscipline: [...targets.values()].filter(
        (t) => Object.keys(t.counts).length > 1,
      ).length,
    },
  };
}
