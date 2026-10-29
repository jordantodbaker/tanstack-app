import { describe, expect, it } from "vitest";
import { loadCbsWorkbook } from "../../prisma/cbs-workbook";
import { stripCostTypeSuffix } from "~/lib/cbs-tree";
import { SUMMARY_ADMIN_HOME_OFFICE, SUMMARY_ENGINEERING } from "./summary-rows";

/**
 * Drift guard: the Summary page's hard-coded CBS keys against the workbook.
 *
 * The Administration rows sum one L1 division or one L1+L2 sub-account, and
 * the Engineering rows one L1 each. Those keys are typed into
 * `summary-rows.ts`, so a renumber leaves them pointing at nothing — or, worse,
 * at a different account that still exists. That happened on 2026-10-29: the
 * Bonds / Insurance / Taxes rows kept summing L1 013 after those accounts moved
 * to 032, and 013 had become "Home Office Field Support & Supplies".
 *
 * Reads the real `prisma/data/CBS.xlsx`, like `disciplines-cbs.test.ts`.
 */

/**
 * The account each key must still resolve to — the name the row was written
 * for. A renumber that leaves the key valid but pointing elsewhere lands here.
 */
const ACCOUNT_FOR_KEY: Record<string, string> = {
  "012": "Home Office Construction Support",
  "03205": "Project Bonds",
  "03210": "Project Insurance",
  "03215": "Project Finance Charges",
  "03220": "Project Taxes",
  "03225": "Project Permitting",
  "03230": "Project Licenses",
  "022": "Combined Phase (Preliminary & Detailed)",
  "024": "Concept Design",
  "025": "Preliminary Design – FEED (Class 4–3)",
  "026": "Detailed Design (Class 2-1)",
  "027": "Engineering Construction Support",
  "028": "Engineering Commissioning & Startup Support",
};

/** A key's account row: "012" → 012-00-0000-00-0, "03205" → 032-05-0000-00-0. */
function accountCodeFor(key: string): string {
  const l2 = key.length >= 5 ? key.slice(3, 5) : "00";
  return `${key.slice(0, 3)}-${l2}-0000-00-0`;
}

const keyed = [
  ...SUMMARY_ADMIN_HOME_OFFICE.map((r) => ({
    label: r.label,
    key: r.l1l2 ?? r.l1!,
  })),
  ...SUMMARY_ENGINEERING.map((r) => ({ label: r.label, key: r.l1 })),
];

const workbook = await loadCbsWorkbook();
const byCode = new Map(workbook.items.map((i) => [i.displayCode, i]));
const nameAt = (key: string) => {
  const row = byCode.get(accountCodeFor(key));
  return row ? stripCostTypeSuffix(row.name) : null;
};

describe("Summary rows against the CBS workbook", () => {
  it("points every row at an account the CBS has", () => {
    const dead = keyed
      .filter(({ key }) => !byCode.has(accountCodeFor(key)))
      .map(({ label, key }) => `${label} → ${key} (${accountCodeFor(key)})`);
    // A dead key is a Summary row that can never show a number.
    expect(dead).toEqual([]);
  });

  it("still points each row at the account it was written for", () => {
    const repointed = keyed
      .filter(({ key }) => key in ACCOUNT_FOR_KEY)
      .filter(({ key }) => nameAt(key) !== ACCOUNT_FOR_KEY[key])
      .map(
        ({ label, key }) =>
          `${label}: ${key} is now "${nameAt(key)}", expected "${ACCOUNT_FOR_KEY[key]}"`,
      );
    expect(repointed).toEqual([]);
  });

  it("records the expected account for every key, and no stale ones", () => {
    const keys = keyed.map((k) => k.key).sort();
    expect(Object.keys(ACCOUNT_FOR_KEY).sort()).toEqual(keys);
  });

  it("labels each Engineering row with its account's own name", () => {
    // These rows ARE the accounts, one per L1, so the label should say what
    // the CBS says; a label of its own is how 022 came to read "Engineering
    // Support" while summing Combined Phase hours.
    const mislabeled = SUMMARY_ENGINEERING.filter(
      (r) => nameAt(r.l1) !== r.label,
    ).map((r) => `${r.l1}: label "${r.label}", account "${nameAt(r.l1)}"`);
    expect(mislabeled).toEqual([]);
  });
});
