import { describe, expect, it } from "vitest";
import { loadCbsWorkbook } from "../../prisma/cbs-workbook";
import { disciplinesData } from "./disciplines-data";

/**
 * Drift guard: `disciplines-data.ts` against the CBS workbook it describes.
 *
 * The `l1Codes` list is not documentation — it is the only route from a CBS
 * code to a take-off picker. `$discipline.tsx` scopes the picker to exactly
 * that list, and `Sidebar` hides a discipline outright when none of its codes
 * are in the project's allow-list. So a list that drifts from the workbook
 * silently empties a page rather than failing.
 *
 * It has drifted three times already: Civil's picker fell to one code, piping
 * stopped auto-populating after the metallurgy renumber, and inserting 950
 * Specialty Services repointed Commissioning at someone else's accounts. Every
 * one was found by a person noticing a page looked wrong.
 *
 * This reads the real `prisma/data/CBS.xlsx`, the same file the import reads,
 * so a renumber fails here before it reaches a database.
 */

/** Blocks that belong to no discipline on purpose. */
const UNCLAIMED_BY_DESIGN: Record<string, string> = {
  "000": "The project root — a single summary row above every discipline.",
};

/**
 * Blocks that look like they belong to a discipline but are not listed yet.
 *
 * Each is invisible to that discipline's take-off picker until someone adds
 * it. This is a backlog, not a design: the guard holds it steady so the list
 * can only shrink, and a NEW unclaimed block fails instead of joining it
 * quietly. The suggested owner is a first pass — correct it and move the code
 * into `disciplines-data.ts`.
 */
const UNCLAIMED_BACKLOG: Record<string, string> = {};

/**
 * The CBS root name each discipline's lowest block carries.
 *
 * This is what catches a renumber REPOINTING a list rather than emptying it:
 * the codes still exist, so nothing else notices that they now mean something
 * different.
 */
const DISCIPLINE_ROOT_NAME: Record<string, string> = {
  "project-development": "Project Development",
  administration: "Administration & Home Office Management",
  engineering: "Engineering & Design",
  procurement: "Procurement",
  indirects: "Field Indirects",
  demolition: "Demolition",
  civil: "Civil",
  concrete: "Concrete",
  grout: "Grout",
  // Renamed from "Structural Steel Shop Fabrication" on 2026-10-15: the 300
  // division covers field erection (330-390) as well as the shop, so the
  // division name should not say "Shop Fabrication". Changed in the workbook
  // too, by `cbs:rename --workbook`, so an import no longer reverts it.
  steel: "Structural Steel",
  buildings: "Buildings",
  equipment: "Equipment",
  piping: "Piping",
  electric: "Electrical",
  instruments: "Instrument & Controls",
  coatings: "Coatings & Insulation",
  "specialty-services": "Specialty Services",
  commissioning: "Startup & Commissioning",
  operations: "Operations & Maintenance",
  contingency: "Contingency",
};

const workbook = await loadCbsWorkbook();
const cbsL1s = new Set(workbook.items.map((i) => i.l1));

/** The name the division root of `l1` carries, for the fingerprint check. */
function rootNameOf(l1: string): string {
  const rows = workbook.items.filter((i) => i.l1 === l1);
  const root =
    rows.find((i) => i.displayCode.endsWith("-00-0000-00-0")) ?? rows[0];
  return root?.name ?? "";
}

const withCodes = disciplinesData.filter((d) => d.l1Codes?.length);

describe("disciplines-data against the CBS workbook", () => {
  it("lists no code the CBS doesn't have", () => {
    const dead = withCodes.flatMap((d) =>
      (d.l1Codes ?? [])
        .filter((c) => !cbsL1s.has(c))
        .map((c) => `${d.id} → ${c}`),
    );
    // A dead code is a picker entry that can never match anything.
    expect(dead).toEqual([]);
  });

  it("gives every CBS block exactly one owner, or a recorded reason", () => {
    const owner = new Map<string, string>();
    const doubleClaimed: string[] = [];
    for (const d of withCodes) {
      for (const c of d.l1Codes ?? []) {
        if (owner.has(c))
          doubleClaimed.push(`${c}: ${owner.get(c)} and ${d.id}`);
        else owner.set(c, d.id);
      }
    }
    expect(doubleClaimed).toEqual([]);

    const unexplained = [...cbsL1s]
      .filter(
        (l1) =>
          !owner.has(l1) &&
          !(l1 in UNCLAIMED_BY_DESIGN) &&
          !(l1 in UNCLAIMED_BACKLOG),
      )
      .sort();
    // A new block nobody owns is invisible to every take-off picker. Give it a
    // discipline, or record why it has none.
    expect(unexplained).toEqual([]);
  });

  it("keeps the unclaimed lists honest", () => {
    const claimed = new Set(withCodes.flatMap((d) => d.l1Codes ?? []));
    const contradictory = [
      ...Object.keys(UNCLAIMED_BY_DESIGN),
      ...Object.keys(UNCLAIMED_BACKLOG),
    ].filter((l1) => claimed.has(l1));
    // Once a block gets an owner it must leave these lists, or the backlog
    // stops meaning anything.
    expect(contradictory).toEqual([]);

    const vanished = [
      ...Object.keys(UNCLAIMED_BY_DESIGN),
      ...Object.keys(UNCLAIMED_BACKLOG),
    ].filter((l1) => !cbsL1s.has(l1));
    expect(vanished).toEqual([]);
  });

  it("gives every discipline a distinct four-letter abbreviation", () => {
    // The Core Code Roll-up matrix has one narrow column per discipline and
    // heads it with the label's first four characters. Three collided
    // Concrete with Contingency and Procurement with Project Development —
    // two columns that would have read the same and meant different things.
    const seen = new Map<string, string[]>();
    for (const d of disciplinesData) {
      const key = d.label.slice(0, 4).toUpperCase();
      seen.set(key, [...(seen.get(key) ?? []), d.label]);
    }
    const collisions = [...seen]
      .filter(([, labels]) => labels.length > 1)
      .map(([key, labels]) => `${key}: ${labels.join(" / ")}`);
    expect(collisions).toEqual([]);
  });

  it("the backlog only shrinks", () => {
    // Pinned so a renumber that strands another block fails here rather than
    // silently lengthening the list.
    //
    // Empty since 2026-10-15: Specialty Services became a discipline of its
    // own and took 950, 951 and 952 with it, so every CBS block now has an
    // owner or a recorded reason. The number only goes up with a note saying
    // why, and that note has to say when it comes back down.
    expect(Object.keys(UNCLAIMED_BACKLOG)).toHaveLength(0);
  });

  it("still points each discipline at the accounts it is named for", () => {
    const repointed: string[] = [];
    for (const d of withCodes) {
      const expected = DISCIPLINE_ROOT_NAME[d.id];
      // Every discipline with codes needs a fingerprint, or the check is
      // silently skipped for it.
      expect(expected, `no recorded root name for "${d.id}"`).toBeDefined();
      const lowest = [...(d.l1Codes ?? [])].sort()[0];
      const actual = rootNameOf(lowest);
      if (actual !== expected) {
        repointed.push(
          `${d.id}: ${lowest} is now "${actual}", expected "${expected}"`,
        );
      }
    }
    // A renumber that leaves the codes valid but moves what they mean lands
    // here — this is what sent Commissioning to Specialty Services.
    expect(repointed).toEqual([]);
  });
});
