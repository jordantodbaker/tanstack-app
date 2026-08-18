/**
 * The "Documentation for Development" checklist shown on the Validation page.
 * `key` is the stable identifier persisted in `DevelopmentDocChecklist.checkedKeys`
 * — never change a key once shipped or existing checks would be lost; `label`
 * is display-only and safe to reword.
 */
export type DevelopmentDocItem = { key: string; label: string };

export const DEVELOPMENT_DOC_ITEMS: DevelopmentDocItem[] = [
  { key: "basic-design-eng-package", label: "Basic Design & Engineering Package" },
  { key: "pid", label: "P&ID's" },
  { key: "3d-model", label: "3D Model" },
  { key: "equipment-list", label: "Equipment List" },
  { key: "tie-in-list", label: "Tie-in List" },
  { key: "plot-plan", label: "Plot Plan" },
  { key: "scaffold-estimate", label: "Scaffold Estimate" },
  { key: "basis-of-design", label: "Basis of Design" },
  { key: "equipment-location-plan", label: "Equipment Location Plan" },
  { key: "instrument-location-plan", label: "Instrument Location Plan" },
  {
    key: "vendor-tagged-equipment-quote",
    label: "Vendor Tagged Equipment Quotation",
  },
  {
    key: "vendor-bulk-materials-quote",
    label: "Vendor Build Materials Quotation",
  },
  {
    key: "vendor-sc-equipment-quote",
    label: "Vendor S/C or Equipment Quotation",
  },
  { key: "other", label: "Other" },
];

/**
 * Yes/No readiness checks in the Validation section — a checked box means
 * "Yes". Persisted in the same `checkedKeys` set as the documentation items
 * (keys are distinct, so there's no collision).
 */
export const ESTIMATE_READINESS_ITEMS: DevelopmentDocItem[] = [
  {
    key: "readiness-bulk-materials-10pct",
    label:
      "Are bulk materials greater than 10% of TFC based on vendor quote?",
  },
  {
    key: "readiness-tagged-equipment-vendor-quote",
    label: "Is tagged equipment based on vendor quotes?",
  },
  {
    key: "readiness-lead-times-in-schedule",
    label: "Are material lead times accounted for in the EPC schedule?",
  },
];
