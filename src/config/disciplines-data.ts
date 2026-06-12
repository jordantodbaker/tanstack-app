/**
 * Pure discipline data — no lucide icons — so it can be imported by icon-free
 * modules (the pure aggregators `project-totals.ts` / `cvr-bucket.ts` and their
 * tests) without dragging React icon components into those bundles.
 *
 * `disciplines.ts` re-exports this list with icons attached; everything else
 * that only needs the data (l1Codes, labels, the L1→discipline reverse map)
 * imports from here.
 */

export type NavItem = {
  label: string;
  to?: string;
};

export type DisciplineData = {
  id: string;
  label: string;
  summaryLabel?: string;
  to?: string;
  l1Codes?: string[];
  items?: NavItem[];
};

export const disciplinesData: DisciplineData[] = [
  { id: "setup", label: "Setup", to: "/setup" },
  {
    id: "summary",
    label: "Summary",
    items: [
      { label: "Summary", to: "/summary" },
      { label: "Basis", to: "/basis" },
      { label: "Validation", to: "/validation" },
    ],
  },
  {
    id: "project-development",
    label: "Project Development",
    to: "/project-development",
    l1Codes: ["001"],
  },
  {
    id: "administration",
    label: "Administration & Home Office",
    to: "/administration",
    // 013 ("Project Costs") covers Bonds / Insurance / Finance Charges /
    // Taxes / Permitting / Licenses — surfaced as L2 sub-account rows on
    // the Summary page. Listed here so its CBS items also show in the
    // discipline's Take Off picker and roll back up under "administration"
    // via the auto-derived `L1_TO_DISCIPLINE` reverse map.
    l1Codes: ["010", "012", "013"],
  },
  {
    id: "engineering",
    label: "Engineering",
    to: "/engineering",
    l1Codes: ["020", "022", "023", "024", "025", "026", "027", "028"],
  },
  {
    id: "procurement",
    label: "Procurement",
    to: "/procurement",
    l1Codes: ["030", "031", "032", "033"],
  },
  {
    id: "indirects",
    label: "Indirects",
    to: "/indirects",
    l1Codes: ["050", "052"],
  },
  {
    id: "demolition",
    label: "Demolition",
    to: "/demolition",
    l1Codes: ["090", "091", "092", "093", "099"],
  },
  {
    id: "civil",
    label: "Civil",
    to: "/civil",
    l1Codes: ["100", "101", "102", "103", "131", "132", "133", "134", "135", "136", "137"],
  },
  {
    id: "concrete",
    label: "Concrete",
    to: "/concrete",
    // "290" moved to the new Grout discipline below.
    l1Codes: ["200", "201", "202", "203", "231", "232", "233"],
  },
  {
    id: "grout",
    label: "Grout",
    to: "/grout",
    l1Codes: ["290", "291", "292", "293"],
  },
  {
    id: "steel",
    label: "Structural Steel",
    to: "/steel",
    l1Codes: ["300", "301", "302", "303", "330", "331", "332", "333", "390", "391"],
  },
  {
    id: "buildings",
    label: "Buildings",
    to: "/buildings",
    l1Codes: ["400", "401", "402", "403", "407"],
  },
  {
    id: "equipment",
    label: "Equipment",
    to: "/equipment",
    l1Codes: [
      "500", "501", "502", "503",
      "530", "531", "532", "533", "534", "535", "536", "537", "538", "539", "540",
      "590",
    ],
  },
  {
    id: "piping",
    label: "Piping",
    to: "/piping",
    l1Codes: [
      "600", "601", "602", "603", "604", "605", "606", "607", "608", "609",
      "610", "611", "612", "613",
      "630", "631", "632", "633", "634", "635", "636", "637", "638", "639",
      "640", "641", "642", "643",
      "680", "681", "690", "691",
    ],
  },
  {
    id: "electric",
    label: "Electric",
    summaryLabel: "Electrical",
    to: "/electric",
    l1Codes: ["700", "701", "702", "703", "790"],
  },
  {
    id: "instruments",
    label: "Instruments & Controls",
    summaryLabel: "Instrumentation",
    to: "/instruments",
    l1Codes: ["800", "801", "802", "803", "890"],
  },
  {
    id: "coatings",
    label: "Coatings",
    to: "/coatings",
    l1Codes: ["900", "901", "902", "903", "904", "905"],
  },
  {
    id: "commissioning",
    label: "Commissioning",
    to: "/commissioning",
    l1Codes: ["950", "951", "952"],
  },
  {
    id: "operations",
    label: "Operations",
    to: "/operations",
    l1Codes: ["960", "961", "962"],
  },
  {
    id: "contingency",
    label: "Contingency",
    to: "/contingency",
    l1Codes: ["970"],
  },
  { id: "materials", label: "Materials", to: "/materials" },
  {
    id: "subcontracts",
    label: "Subcontracts",
    items: [
      { label: "Civil Subcontracts", to: "/" },
      { label: "Concrete Subcontracts" },
      { label: "Steel Subcontracts" },
    ],
  },
];

/**
 * Leading CBS digit → the canonical discipline for that digit. Fallback for
 * attributing an L1 code that isn't explicitly listed under any discipline
 * (e.g. legacy/synthetic codes) — mirrors the old digit-bucket behaviour so no
 * cost is dropped from roll-ups.
 */
export const DIGIT_TO_DISCIPLINE: Record<string, string> = {
  "0": "procurement",
  "1": "civil",
  "2": "concrete",
  "3": "steel",
  "4": "buildings",
  "5": "equipment",
  "6": "piping",
  "7": "electric",
  "8": "instruments",
  "9": "coatings",
};

/** Discipline id → its L1 codes, for disciplines that have a take-off bucket. */
export const disciplineL1Codes: Record<string, string[]> = Object.fromEntries(
  disciplinesData
    .filter((d) => d.l1Codes && d.l1Codes.length > 0)
    .map((d) => [d.id, d.l1Codes as string[]]),
);

/**
 * L1 (parent CBS) code → discipline id. Drives discipline-bucketed roll-ups
 * (EVM, CVR/Trend attribution) where the leading digit isn't granular enough —
 * e.g. `290`–`293` resolve to "grout", not "concrete", though both are digit 2.
 */
export const L1_TO_DISCIPLINE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const d of disciplinesData) {
    for (const code of d.l1Codes ?? []) map[code] = d.id;
  }
  return map;
})();
