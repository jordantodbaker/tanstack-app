import { describe, expect, it } from "vitest";
import { CVR_TEMPLATE_FIELDS } from "./cvrTemplates";
import type {
  CvrTemplateFieldSet,
  UpsertCvrTemplateInput,
} from "./cvrTemplates";
import type { UpsertChangeLogInput } from "./changelog";

/**
 * Hand-maintained witness list of the templatable CVR field set. If a new
 * column is added to ChangeLog *and* it should ride a template, add it to
 * both `CVR_TEMPLATE_FIELDS` in cvrTemplates.ts and this list — the
 * drift-guard tests below will fail until both sides match.
 *
 * Same pattern used by `fef-helpers.test.ts` for the FefRow field set.
 */
const EXPECTED_TEMPLATE_FIELDS = [
  "title",
  "description",
  "type",
  "discipline",
  "cbsCodes",
  "originator",
  "costImpact",
  "scheduleDaysImpact",
  "laborHoursImpact",
  "riskLevel",
  "reasonCode",
  "notes",
  "area",
] as const;

describe("CVR_TEMPLATE_FIELDS", () => {
  it("matches the hand-maintained expected list (drift guard)", () => {
    expect([...CVR_TEMPLATE_FIELDS].sort()).toEqual(
      [...EXPECTED_TEMPLATE_FIELDS].sort(),
    );
  });

  it("is a strict subset of UpsertChangeLogInput's keys", () => {
    // Compile-time check: `CvrTemplateFieldSet` field names must be valid
    // `UpsertChangeLogInput` keys. If a template field name diverges from
    // the CVR upsert input, this assignment fails to typecheck.
    const sampleTemplate: CvrTemplateFieldSet = {
      title: "",
      description: "",
      type: "SCOPE",
      discipline: "",
      cbsCodes: [],
      originator: "",
      costImpact: 0,
      scheduleDaysImpact: 0,
      laborHoursImpact: 0,
      riskLevel: "MEDIUM",
      reasonCode: "",
      notes: "",
      area: "",
    };
    const sampleCvr: Pick<UpsertChangeLogInput, keyof CvrTemplateFieldSet> =
      sampleTemplate;
    expect(Object.keys(sampleCvr).sort()).toEqual(
      [...EXPECTED_TEMPLATE_FIELDS].sort(),
    );
  });

  it("the UpsertCvrTemplateInput adds exactly name + templateDescription on top of the field set", () => {
    const sample: UpsertCvrTemplateInput = {
      name: "x",
      templateDescription: "",
      title: "",
      description: "",
      type: "SCOPE",
      discipline: "",
      cbsCodes: [],
      originator: "",
      costImpact: 0,
      scheduleDaysImpact: 0,
      laborHoursImpact: 0,
      riskLevel: "MEDIUM",
      reasonCode: "",
      notes: "",
      area: "",
    };
    const expected = [
      "name",
      "templateDescription",
      ...EXPECTED_TEMPLATE_FIELDS,
    ];
    expect(Object.keys(sample).sort()).toEqual([...expected].sort());
  });
});
