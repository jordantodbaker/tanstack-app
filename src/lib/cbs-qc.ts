import { check, type HealthCheck, type HealthFinding } from "./cbs-health";

/**
 * The deterministic rules from the CBS QC pass, applied to this catalog.
 *
 * The QC skill runs in Excel over the dictionary workbook's per-discipline
 * sheets. The rules are the same but the shape is not: here there is one
 * combined sheet, already imported, so "differs from the rest of the sheet"
 * becomes "differs from the rest of its division", and anything about sheet
 * layout falls away.
 *
 * Carried over: the cost-type rules, required fields, material type, the Sub
 * Code equipment-ownership rule, the format and consistency checks, and
 * duplicate names. NOT carried over: typo detection and the "UoM/description
 * may be wrong" passes, which the skill itself hands to a human rather than
 * deciding — a page that guessed at them would cry wolf several thousand
 * times.
 *
 * Column names below are the WORKBOOK's. This app slices the display code
 * differently: the workbook's L1+L2 is one field here, its L3 is `l2`, and its
 * L7 — the cost type — is `l6`.
 */

export type QcRow = {
  /** Import order, which is the workbook's row order. */
  id: number;
  displayCode: string;
  costCode: string;
  name: string;
  uom: string;
  description: string | null;
  accountDescription: string;
  l2Description: string | null;
  costCenter: string | null;
  costClassification: string | null;
  status: string | null;
  gl: string | null;
  discipline: string | null;
  materialType: string | null;
  /** The workbook's "Material Code" — the material category flag. */
  materialCode: boolean | null;
  /** The workbook's "Sub Code". */
  subReporting: boolean | null;
  /** Row in the unexpanded Master CBS, carried onto every finding. */
  masterCbsRow: number | null;
};

const blank = (v: string | null | undefined) => !v || v.trim() === "";
/** The workbook's L3 segment. "00" means a roll-up level. */
const l3Of = (code: string) => code.slice(4, 6);
/** The workbook's L7 segment — the cost type. */
const l7Of = (code: string) => code.slice(15, 16);

const STANDARD_UOM = new Set([
  "LS",
  "HR",
  "MO",
  "WK",
  "DY",
  "EA",
  "LF",
  "SF",
  "SY",
  "CY",
  "CF",
  "TN",
  "LB",
  "GL",
  "KW",
  "AL",
]);

/** Name keywords that imply a unit, with the units that are acceptable. */
const UOM_RULES: { test: RegExp; ok: string[]; suggest: string }[] = [
  {
    test: /\b(pipe|piping|cable|conduit|trench|trenching|fence|fencing|wire|tubing|handrail)\b/,
    ok: ["LF", "EA", "LS", "HR"],
    suggest: "LF",
  },
  {
    test: /\b(rental|monthly|per month)\b/,
    ok: ["MO", "DY", "WK", "LS", "EA", "HR"],
    suggest: "MO",
  },
  { test: /\bper diem\b/, ok: ["DY", "LS", "HR", "MO"], suggest: "DY" },
];

/** Equipment ownership, which fixes what Sub Code has to be. */
const HASKELL_OWNED = /haskell[\s-]*owned\s+equip/i;
const THIRD_PARTY = /(3rd|third)[\s-]*party\s+equip/i;
function ownershipOf(name: string): "NO" | "YES" | null {
  if (HASKELL_OWNED.test(name)) return "NO";
  if (THIRD_PARTY.test(name)) return "YES";
  return null;
}

/** Required on every row, by the workbook's column name. */
const REQUIRED: { label: string; of: (r: QcRow) => string | null }[] = [
  { label: "Name", of: (r) => r.name },
  { label: "UOM", of: (r) => r.uom },
  { label: "Description", of: (r) => r.description },
  { label: "Cost Center", of: (r) => r.costCenter },
  { label: "Cost Classification", of: (r) => r.costClassification },
  { label: "Status", of: (r) => r.status },
  { label: "Account Description", of: (r) => r.accountDescription },
  { label: "L2 Description", of: (r) => r.l2Description },
  { label: "G/L", of: (r) => r.gl },
  { label: "Discipline", of: (r) => r.discipline },
  { label: "Cost Code", of: (r) => r.costCode },
];

/** A finding for one catalog row. */
const at = (r: QcRow, detail: string): HealthFinding => ({
  code: r.displayCode,
  name: r.name,
  detail,
  // So the reader can go straight to the row in the master spreadsheet.
  masterRow: r.masterCbsRow,
});

export function runCbsQcChecks(rows: QcRow[]): HealthCheck[] {
  const byCode = new Map(rows.map((r) => [r.displayCode, r]));
  const checks: HealthCheck[] = [];

  // Parent lookup the way the QC pass does it: zero the deepest non-zero
  // level and take the nearest row that exists, WITHOUT regard to cost type.
  //
  // `cbsAncestorCodes` cannot be reused here. It only ever climbs to a parent
  // of the row's own type or to the backbone, so by construction a priced
  // parent collects only children of its own type — which makes the
  // mixed-children rule unable to fire at all. The workbook has no such
  // guarantee, and catching where it is violated is the point.
  const prefixOf = (code: string) => code.slice(0, 14);
  const byPrefix = new Map<string, QcRow[]>();
  for (const r of rows) {
    const key = prefixOf(r.displayCode);
    byPrefix.set(key, [...(byPrefix.get(key) ?? []), r]);
  }
  /** The account rows directly above this one, nearest first. */
  const ancestorPrefixes = (code: string): string[] => {
    // Levels from deepest to shallowest, as the workbook numbers them: our
    // l5/l4/l3/l2 are its L6/L5/L4/L3.
    const parts = [
      code.slice(0, 3),
      code.slice(4, 6),
      code.slice(7, 9),
      code.slice(9, 11),
      code.slice(12, 14),
    ];
    const out: string[] = [];
    for (let level = 4; level >= 1; level--) {
      if (parts[level] === "00") continue;
      parts[level] = "00";
      out.push(`${parts[0]}-${parts[1]}-${parts[2]}${parts[3]}-${parts[4]}`);
    }
    return out;
  };
  const parentOf = (r: QcRow): QcRow | null => {
    for (const prefix of ancestorPrefixes(r.displayCode)) {
      const hits = byPrefix.get(prefix);
      if (!hits) continue;
      // Prefer the account's own "-0" row; it is the one that summarizes.
      return hits.find((h) => l7Of(h.displayCode) === "0") ?? hits[0];
    }
    return null;
  };

  // --- 1. A roll-up level (workbook L3 = 00) must carry the "0" cost type.
  const l3 = rows.filter(
    (r) => l3Of(r.displayCode) === "00" && l7Of(r.displayCode) !== "0",
  );
  checks.push(
    check({
      id: "qc-l3-cost-type",
      title: "Roll-up rows with a cost type",
      severity: "error",
      findings: l3.map((r) =>
        at(r, `cost type ${l7Of(r.displayCode)}, expected 0`),
      ),
      count: l3.length,
      summary:
        "A row whose L3 segment is 00 is a roll-up level and must carry cost type 0. These carry a priced type instead, so they total as though they were line items.",
      action:
        "Set the cost type to 0 in CBS.xlsx, or move the cost to a child row.",
      clear: "Every roll-up level carries cost type 0.",
    }),
  );

  // --- 2. A parent's cost type against its children's.
  const childTypes = new Map<string, Set<string>>();
  for (const r of rows) {
    const parent = parentOf(r);
    if (!parent) continue;
    const set = childTypes.get(parent.displayCode) ?? new Set<string>();
    set.add(l7Of(r.displayCode));
    childTypes.set(parent.displayCode, set);
  }
  const parentType: HealthFinding[] = [];
  for (const [code, types] of childTypes) {
    const row = byCode.get(code)!;
    const own = l7Of(code);
    if (own === "0") continue;
    if (types.size > 1) {
      parentType.push(
        at(
          row,
          `is ${own}, children are ${[...types].sort().join(", ")}; expected 0`,
        ),
      );
    } else if (!types.has(own)) {
      parentType.push(
        at(
          row,
          `is ${own}, children are all ${[...types][0]}; expected 0 or ${[...types][0]}`,
        ),
      );
    }
  }
  checks.push(
    check({
      id: "qc-parent-cost-type",
      title: "Parent cost type disagrees with its children",
      severity: "error",
      findings: parentType,
      count: parentType.length,
      summary:
        "A parent either summarizes mixed cost types, in which case it must be 0, or it shares its children's single type. These do neither, so a roll-up double-counts or lands in the wrong column.",
      action:
        "Set the parent's cost type to 0 in CBS.xlsx, or correct the children.",
      clear: "Every parent's cost type agrees with its children.",
    }),
  );

  // --- 3. Required fields.
  const missingByField = new Map<string, number>();
  const missing: HealthFinding[] = [];
  for (const r of rows) {
    for (const field of REQUIRED) {
      if (!blank(field.of(r))) continue;
      missingByField.set(
        field.label,
        (missingByField.get(field.label) ?? 0) + 1,
      );
      missing.push(at(r, `no ${field.label}`));
    }
  }
  const byColumn = [...missingByField.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => `${label} ${n.toLocaleString()}`)
    .join(", ");
  checks.push(
    check({
      id: "qc-required-fields",
      title: "Required fields left blank",
      severity: "warning",
      findings: missing,
      count: missing.length,
      summary: `Every row is meant to carry Name, UOM, Description, Cost Center, Cost Classification, Status, Account Description, L2 Description, G/L, Discipline and Cost Code. By column: ${byColumn}. A blank Discipline or Cost Center is what makes a code unreportable downstream.`,
      action: "Fill them in CBS.xlsx and re-import.",
      clear: "Every row carries all eleven required fields.",
    }),
  );

  // --- 4. Material category without a material type.
  const matBlank = rows.filter(
    (r) => r.materialCode === true && blank(r.materialType),
  );
  const matNa = rows.filter(
    (r) =>
      r.materialCode === true &&
      (r.materialType ?? "").trim().toLowerCase() === "n/a",
  );
  checks.push(
    check({
      id: "qc-material-type",
      title: "Material rows with no material type",
      severity: "error",
      findings: matBlank.map((r) =>
        at(r, "Material Code YES, Material Type blank"),
      ),
      count: matBlank.length,
      summary:
        "Material Code is YES but Material Type is blank, so the row is a material that does not say which kind.",
      action: "Set Material Type (Bulks / Tagged) in CBS.xlsx.",
      clear: "Every material row names its material type.",
    }),
  );
  checks.push(
    check({
      id: "qc-material-type-na",
      title: 'Material rows typed "n/a"',
      severity: "warning",
      findings: matNa.map((r) =>
        at(r, 'Material Type "n/a", expected Bulks or Tagged'),
      ),
      count: matNa.length,
      summary:
        'Material Code is YES but Material Type reads "n/a", which is not one of the material types.',
      action: "Replace with Bulks or Tagged in CBS.xlsx.",
      clear: 'No material row is typed "n/a".',
    }),
  );

  // --- 5. Sub Code against equipment ownership.
  const subWrong: HealthFinding[] = [];
  for (const r of rows) {
    let expected = ownershipOf(r.name);
    let source = "its own name";
    if (!expected) {
      // The row's own name wins; failing that, the nearest ancestor that says.
      let parent = parentOf(r);
      let guard = 0;
      while (parent && guard++ < 10) {
        const owned = ownershipOf(parent.name);
        if (owned) {
          expected = owned;
          source = `"${parent.name}" (${parent.displayCode})`;
          break;
        }
        parent = parentOf(parent);
      }
    }
    if (!expected) continue;
    const actual =
      r.subReporting === true ? "YES" : r.subReporting === false ? "NO" : "";
    if (actual === expected) continue;
    subWrong.push(
      at(
        r,
        `Sub Code ${actual || "blank"}, expected ${expected} from ${source}`,
      ),
    );
  }
  checks.push(
    check({
      id: "qc-sub-code-ownership",
      title: "Sub Code wrong for the equipment's ownership",
      severity: "error",
      findings: subWrong,
      count: subWrong.length,
      summary:
        "Haskell Owned Equipment must have Sub Code NO; Third Party Equipment must have Sub Code YES. Ownership is taken from the row's own name, or from the nearest ancestor that states it.",
      action:
        "Correct the Sub Code column in CBS.xlsx. Getting this wrong puts owned plant into subcontract reporting, or leaves rented plant out of it.",
      clear:
        "Sub Code matches the equipment's ownership everywhere it is stated.",
    }),
  );

  // --- 6/7/8. Format of the controlled columns.
  const costCenter = rows.filter(
    (r) => !blank(r.costCenter) && !/^\d{4}$/.test(r.costCenter!.trim()),
  );
  checks.push(
    check({
      id: "qc-cost-center",
      title: "Cost Center is not a 4-digit code",
      severity: "warning",
      findings: costCenter.map((r) => at(r, `Cost Center "${r.costCenter}"`)),
      count: costCenter.length,
      summary: "Cost Center is expected to be four digits.",
      action: "Correct the Cost Center column in CBS.xlsx.",
      clear: "Every Cost Center is a 4-digit code.",
    }),
  );

  const badStatus = rows.filter(
    (r) => !blank(r.status) && !/^(Active|Inactive)$/i.test(r.status!.trim()),
  );
  checks.push(
    check({
      id: "qc-status-values",
      title: "Status is neither Active nor Inactive",
      severity: "warning",
      findings: badStatus.map((r) => at(r, `Status "${r.status}"`)),
      count: badStatus.length,
      summary:
        "Status is a controlled value. Anything else is treated as not active by every view that filters on it.",
      action: "Use Active or Inactive in CBS.xlsx.",
      clear: "Every Status is Active or Inactive.",
    }),
  );

  const badUom = rows.filter(
    (r) => !blank(r.uom) && !STANDARD_UOM.has(r.uom.trim().toUpperCase()),
  );
  const uomCounts = new Map<string, number>();
  for (const r of badUom) {
    const u = r.uom.trim().toUpperCase();
    uomCounts.set(u, (uomCounts.get(u) ?? 0) + 1);
  }
  checks.push(
    check({
      id: "qc-uom-standard",
      title: "Non-standard unit of measure",
      severity: "warning",
      findings: badUom.map((r) =>
        at(r, `unit "${r.uom.trim().toUpperCase()}"`),
      ),
      count: badUom.length,
      summary: `The standard units are ${[...STANDARD_UOM].join(", ")}. These rows use something else, which estimators cannot total against. By unit: ${[
        ...uomCounts.entries(),
      ]
        .sort((a, b) => b[1] - a[1])
        .map(([u, n]) => `${u} ${n.toLocaleString()}`)
        .join(", ")}.`,
      action:
        "Map each to a standard unit in CBS.xlsx, or add it to the standard list if it is genuinely new.",
      clear: "Every unit of measure is one of the standard set.",
    }),
  );

  // --- 9. A unit that disagrees with what the name describes.
  const hasChildren = new Set(childTypes.keys());
  const uomVsName: HealthFinding[] = [];
  for (const r of rows) {
    if (hasChildren.has(r.displayCode) || blank(r.uom)) continue;
    const name = r.name.toLowerCase();
    const unit = r.uom.trim().toUpperCase();
    for (const rule of UOM_RULES) {
      if (rule.test.test(name) && !rule.ok.includes(unit)) {
        uomVsName.push(
          at(r, `unit ${unit}, expected something like ${rule.suggest}`),
        );
        break;
      }
    }
  }
  checks.push(
    check({
      id: "qc-uom-vs-name",
      title: "Unit of measure looks wrong for the item",
      severity: "warning",
      findings: uomVsName,
      count: uomVsName.length,
      summary:
        "The name describes something measured one way and the unit says another — pipe priced by the each, a rental priced by the hour.",
      action: "Check each one; this rule reads the name, so it can be wrong.",
      clear: "Every unit of measure suits the item it is on.",
    }),
  );

  // --- 10. Stray whitespace in the text columns.
  const TEXT: { label: string; of: (r: QcRow) => string | null }[] = [
    { label: "Name", of: (r) => r.name },
    { label: "Description", of: (r) => r.description },
    { label: "Account Description", of: (r) => r.accountDescription },
    { label: "L2 Description", of: (r) => r.l2Description },
    { label: "Cost Classification", of: (r) => r.costClassification },
    { label: "Status", of: (r) => r.status },
    { label: "Material Type", of: (r) => r.materialType },
    { label: "Discipline", of: (r) => r.discipline },
  ];
  const spaces: HealthFinding[] = [];
  let spaceCount = 0;
  for (const r of rows) {
    for (const field of TEXT) {
      const value = field.of(r);
      if (!value) continue;
      if (!/^\s|\s$|\s{2,}/.test(value)) continue;
      spaceCount++;
      spaces.push(at(r, `${field.label}: ${JSON.stringify(value)}`));
    }
  }
  checks.push(
    check({
      id: "qc-extra-spaces",
      title: "Leading, trailing or doubled spaces",
      severity: "warning",
      findings: spaces,
      count: spaceCount,
      summary:
        "Stray whitespace in a text column. It survives the import, so it shows up in exports and breaks exact-match lookups.",
      action: "Trim the cells in CBS.xlsx.",
      clear: "No text column carries stray whitespace.",
    }),
  );

  // --- 11. Discipline against the rest of its division.
  const byDivision = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (blank(r.discipline)) continue;
    const division = r.displayCode.slice(0, 3);
    const counts = byDivision.get(division) ?? new Map<string, number>();
    counts.set(r.discipline!, (counts.get(r.discipline!) ?? 0) + 1);
    byDivision.set(division, counts);
  }
  const modeOf = new Map<string, string>();
  for (const [division, counts] of byDivision) {
    modeOf.set(
      division,
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0],
    );
  }
  const oddDiscipline = rows.filter(
    (r) =>
      !blank(r.discipline) &&
      modeOf.get(r.displayCode.slice(0, 3)) !== r.discipline,
  );
  checks.push(
    check({
      id: "qc-discipline-consistency",
      title: "Discipline differs from the rest of its division",
      severity: "warning",
      findings: oddDiscipline.map((r) =>
        at(
          r,
          `${r.discipline}, rest of ${r.displayCode.slice(0, 3)} is ${modeOf.get(r.displayCode.slice(0, 3))}`,
        ),
      ),
      count: oddDiscipline.length,
      summary:
        "Rows in one division normally share a Discipline. These disagree with the majority of their own division.",
      action:
        "Correct the Discipline column in CBS.xlsx, or confirm the division really is shared.",
      clear: "Every division has one discipline.",
    }),
  );

  // --- 12. Duplicate names.
  //
  // Account rows only. This workbook is pre-expanded, so every account also
  // carries its L / S / M / E / O variants under the SAME name — comparing all
  // rows reported 11,556 "duplicates" that are one account seen five times.
  const accounts = rows.filter((r) => l7Of(r.displayCode) === "0");
  const byName = new Map<string, QcRow[]>();
  for (const r of accounts) {
    if (blank(r.name)) continue;
    const key = r.name.trim().toLowerCase().replace(/\s+/g, " ");
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  const dupNames = [...byName.entries()].filter(([, list]) => list.length > 1);
  checks.push(
    check({
      id: "qc-duplicate-names",
      title: "The same name on several codes",
      severity: "info",
      // One row per affected code, not one per name: the export is a list of
      findings:
        // codes to go and look at.
        dupNames
          .sort((a, b) => b[1].length - a[1].length)
          .flatMap(([, list]) =>
            list.map((r) =>
              at(
                r,
                `shares this name with ${list.length - 1} other code(s): ${list
                  .filter((other) => other !== r)
                  .slice(0, 4)
                  .map((other) => other.displayCode)
                  .join(", ")}`,
              ),
            ),
          ),
      count: dupNames.reduce((n, [, list]) => n + list.length, 0),
      summary:
        "The same account name appears on more than one code. Usually deliberate — every discipline has a Field Staff — but it makes a name search ambiguous.",
      action:
        "No action needed unless two of them are meant to be the same account.",
      clear: "Every account name is unique.",
    }),
  );

  // --- 13. Import order against cost code order.
  //
  // Account rows only, for the same reason: the expansion writes each
  // account's variants together as 0, S, M, E, O, which is not code order and
  // is not meant to be.
  const sorted = [...accounts].sort((a, b) => a.id - b.id);
  const outOfOrder: HealthFinding[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].costCode >= sorted[i - 1].costCode) continue;
    outOfOrder.push(
      at(
        sorted[i],
        `sorts before ${sorted[i - 1].displayCode} but comes after it`,
      ),
    );
  }
  checks.push(
    check({
      id: "qc-sort-order",
      title: "Workbook rows out of code order",
      severity: "info",
      findings: outOfOrder,
      count: outOfOrder.length,
      summary:
        "The workbook is expected to run in cost code order. These rows sit after a row that should follow them, which makes the sheet hard to read and hides gaps.",
      action:
        "Sort the sheet by Cost Code in CBS.xlsx. Nothing in the app depends on the order.",
      clear: "The workbook runs in cost code order.",
    }),
  );

  return checks;
}
