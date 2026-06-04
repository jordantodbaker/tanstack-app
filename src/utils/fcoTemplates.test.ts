import { describe, expect, it } from "vitest";
import { FCO_TEMPLATE_FIELDS } from "./fcoTemplates";
import type {
  FcoTemplateFieldSet,
  UpsertFcoTemplateInput,
} from "./fcoTemplates";
import type { UpsertFcoInput } from "./fcoLog";

/**
 * Hand-maintained witness list of the templatable FCO field set. Mirrors
 * the cvrTemplates.test.ts drift guard. If a new column is added to
 * FieldChangeOrder and it should ride a template, add it to both
 * `FCO_TEMPLATE_FIELDS` and this list.
 */
const EXPECTED_TEMPLATE_FIELDS = [
  "title",
  "description",
  "originType",
  "priority",
  "discipline",
  "cbsCodes",
  "locationArea",
  "drawingRefs",
  "rfiNumbers",
  "initiatedBy",
  "fieldContact",
  "estimatedCost",
  "estimatedHours",
  "workStopped",
  "photosUrl",
  "reasonNarrative",
  "notes",
] as const;

describe("FCO_TEMPLATE_FIELDS", () => {
  it("matches the hand-maintained expected list (drift guard)", () => {
    expect([...FCO_TEMPLATE_FIELDS].sort()).toEqual(
      [...EXPECTED_TEMPLATE_FIELDS].sort(),
    );
  });

  it("is a strict subset of UpsertFcoInput's keys", () => {
    const sampleTemplate: FcoTemplateFieldSet = {
      title: "",
      description: "",
      originType: "FIELD_CONDITION",
      priority: "NORMAL",
      discipline: "",
      cbsCodes: [],
      locationArea: "",
      drawingRefs: [],
      rfiNumbers: [],
      initiatedBy: "",
      fieldContact: "",
      estimatedCost: 0,
      estimatedHours: 0,
      workStopped: false,
      photosUrl: "",
      reasonNarrative: "",
      notes: "",
    };
    const sampleFco: Pick<UpsertFcoInput, keyof FcoTemplateFieldSet> =
      sampleTemplate;
    expect(Object.keys(sampleFco).sort()).toEqual(
      [...EXPECTED_TEMPLATE_FIELDS].sort(),
    );
  });

  it("UpsertFcoTemplateInput adds exactly name + templateDescription on top", () => {
    const sample: UpsertFcoTemplateInput = {
      name: "x",
      templateDescription: "",
      title: "",
      description: "",
      originType: "FIELD_CONDITION",
      priority: "NORMAL",
      discipline: "",
      cbsCodes: [],
      locationArea: "",
      drawingRefs: [],
      rfiNumbers: [],
      initiatedBy: "",
      fieldContact: "",
      estimatedCost: 0,
      estimatedHours: 0,
      workStopped: false,
      photosUrl: "",
      reasonNarrative: "",
      notes: "",
    };
    const expected = [
      "name",
      "templateDescription",
      ...EXPECTED_TEMPLATE_FIELDS,
    ];
    expect(Object.keys(sample).sort()).toEqual([...expected].sort());
  });
});
