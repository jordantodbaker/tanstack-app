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

/**
 * CBS L1 convention (prisma/data/CBS.xlsx): each discipline owns
 * a block XY0–XY9 of overhead accounts — XY0 summary, XY1 materials, XY2 field
 * staff, XY3 support services, XY4 equipment, XY5 facilities, XY6 mob/demob,
 * XY7 training, XY9 testing — followed by its direct-labor accounts. A shop
 * block sits at X00–X29 and a field block at X30 and up; since the 2026-10
 * renumber, field-only disciplines (civil, buildings, electrical, I&C,
 * coatings) keep just the X30 block (e.g. civil 131 materials, 140+ labor).
 * The materials and support-labor rules below rely on that layout. Re-check
 * these lists when the master changes — `disciplines-cbs.test.ts` does it
 * against the real workbook: an L1 missing here is invisible to its
 * discipline's take-off page.
 */

/** L1 endings of a materials block (XY1): shop "01", field "31". */
export const MATERIAL_L1_SUFFIXES = ["01", "31"];
/** L1 endings of a field-staff / support-labor block (XY2): "02", "32". */
export const SUPPORT_L1_SUFFIXES = ["02", "32"];

/**
 * The suffixes only mean something inside a discipline's block. 00X is the
 * project root — 001 is Project Development, not a materials account — and
 * reading it by suffix put Project Development's only code on the Materials
 * page and off its own take-off. 03X is Special Project Costs (since
 * 2026-10-29: 030 is the division root, 032 its Bonds / Insurance / Finance
 * Charges / Taxes / Permitting / Licenses accounts), a division with no
 * overhead block at all, so 032 is not a support-labor account either.
 */
const NON_DISCIPLINE_DIVISIONS = ["00", "03"];
const inDisciplineBlock = (l1: string) =>
  !NON_DISCIPLINE_DIVISIONS.some((p) => l1.startsWith(p));

/** Belongs on the Materials sheet, not a take-off. */
export const isMaterialL1 = (l1: string) =>
  inDisciplineBlock(l1) && MATERIAL_L1_SUFFIXES.some((s) => l1.endsWith(s));
/** Seeds the Support Labor sheet, not a take-off. */
export const isSupportL1 = (l1: string) =>
  inDisciplineBlock(l1) && SUPPORT_L1_SUFFIXES.some((s) => l1.endsWith(s));

export const disciplinesData: DisciplineData[] = [
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
    // 030 Special Project Costs is a CBS division of its own since 2026-10-29
    // (it was L1 013 "Project Costs" before), with 032 holding Bonds /
    // Insurance / Finance Charges / Taxes / Permitting / Licenses — surfaced
    // as L2 sub-account rows on the Summary page. Owned here, as the
    // workbook's Discipline column says, so its CBS items show in this
    // discipline's Take Off picker and roll back up under "administration"
    // via the auto-derived `L1_TO_DISCIPLINE` reverse map. 019 left the
    // workbook at the same time.
    l1Codes: ["010", "012", "013", "014", "015", "016", "017", "030", "032"],
  },
  {
    id: "engineering",
    label: "Engineering",
    to: "/engineering",
    l1Codes: ["020", "022", "024", "025", "026", "027", "028"],
  },
  {
    id: "procurement",
    label: "Procurement",
    to: "/procurement",
    // Moved from 03X to 04X on 2026-10-29, when 030 became Special Project
    // Costs: 040 summary, 041 bulk materials, 042 support labor, 043
    // activities, 044 engineered equipment.
    l1Codes: ["040", "041", "042", "043", "044"],
  },
  {
    id: "indirects",
    label: "Indirects",
    to: "/indirects",
    l1Codes: ["050", "052", "053", "054", "055", "056", "057", "058", "059"],
  },
  {
    id: "demolition",
    label: "Demolition",
    to: "/demolition",
    l1Codes: ["090", "091", "092", "093", "094", "096", "097", "098"],
  },
  {
    id: "civil",
    label: "Civil",
    to: "/civil",
    l1Codes: [
      "100",
      "131",
      "132",
      "134",
      "135",
      "139",
      "140",
      "141",
      "142",
      "143",
      "150",
    ],
  },
  {
    id: "concrete",
    label: "Concrete",
    // Summary reports concrete and grout as one digit-2 row.
    summaryLabel: "Concrete & Grout",
    to: "/concrete",
    // "290" moved to the new Grout discipline below.
    l1Codes: ["200", "231", "232", "233", "234", "239", "240", "250", "260"],
  },
  {
    id: "grout",
    label: "Grout",
    to: "/grout",
    l1Codes: ["290", "291", "292", "293", "294", "295", "296"],
  },
  {
    id: "steel",
    label: "Structural Steel",
    to: "/steel",
    l1Codes: [
      "300",
      "301",
      "302",
      "303",
      "304",
      "307",
      "309",
      "310",
      "311",
      "312",
      "330",
      "331",
      "332",
      "334",
      "339",
      "340",
      "341",
      "342",
      "343",
      "344",
      "345",
    ],
  },
  {
    id: "buildings",
    label: "Buildings",
    to: "/buildings",
    // 441–449 are the building trades (Concrete, Metals, Doors & Windows,
    // Enclosure, Wood & Plastics, Finishes, Specialties, Mechanical,
    // Electrical) under 440 Building Construction; 431 left the workbook.
    l1Codes: [
      "400",
      "432",
      "434",
      "440",
      "441",
      "442",
      "443",
      "444",
      "445",
      "446",
      "447",
      "448",
      "449",
    ],
  },
  {
    id: "equipment",
    label: "Equipment",
    to: "/equipment",
    l1Codes: [
      "500",
      "501",
      "502",
      "503",
      "504",
      "507",
      "509",
      "510",
      "530",
      "531",
      "532",
      "534",
      "539",
      "540",
      "541",
      "542",
      "543",
      "544",
      "545",
      "546",
      "547",
      "548",
      "549",
    ],
  },
  {
    id: "piping",
    label: "Piping",
    to: "/piping",
    l1Codes: [
      "600",
      "601",
      "602",
      "603",
      "604",
      "607",
      "609",
      "610",
      "611",
      "612",
      "613",
      "614",
      "615",
      "616",
      "617",
      "618",
      "619",
      "620",
      "625",
      "629",
      "630",
      "631",
      "632",
      "634",
      "639",
      "640",
      "641",
      "642",
      "643",
      "644",
      "645",
      "646",
      "647",
      "648",
      "649",
      "650",
      "680",
    ],
  },
  {
    id: "electric",
    label: "Electric",
    summaryLabel: "Electrical",
    to: "/electric",
    l1Codes: [
      "700",
      "730",
      "731",
      "732",
      "733",
      "734",
      "739",
      "740",
      "741",
      "742",
      "743",
      "744",
      "745",
      "746",
      "747",
      "748",
      "749",
    ],
  },
  {
    id: "instruments",
    label: "Instruments & Controls",
    summaryLabel: "Instrumentation",
    to: "/instruments",
    l1Codes: [
      "800",
      "830",
      "831",
      "832",
      "834",
      "839",
      "840",
      "841",
      "842",
      "843",
      "844",
    ],
  },
  {
    id: "coatings",
    label: "Coatings",
    to: "/coatings",
    // 940–943 (Painting, Insulation, Fireproofing, Refractory) are the
    // direct-labor accounts under 930 Coatings Installation.
    l1Codes: [
      "900",
      "930",
      "931",
      "932",
      "934",
      "939",
      "940",
      "941",
      "942",
      "943",
    ],
  },
  {
    id: "specialty-services",
    label: "Specialty Services",
    to: "/specialty-services",
    // 95 is a tens division: 950 is the summary, 951 Mechanical Services and
    // 952 Industrial Cleaning Services its children. It arrived in the 2026-10
    // workbook at 920 and moved to 950 when that renumber was repaired, which
    // is why Commissioning used to list 951 and 952.
    l1Codes: ["950", "951", "952"],
  },
  {
    id: "commissioning",
    label: "Commissioning",
    to: "/commissioning",
    // 960 is the Startup & Commissioning root, not 950: the 2026-10 workbook
    // put Specialty Services at 950 and moved this division to 960. 951 and
    // 952 (Mechanical Services, Industrial Cleaning Services) went with
    // Specialty Services and are listed in the drift guard's backlog until
    // that division has an owner.
    l1Codes: ["960", "961", "962", "963", "964", "969"],
  },
  {
    id: "operations",
    label: "Operations",
    to: "/operations",
    l1Codes: ["970", "971", "972", "973", "974", "975", "976", "977", "979"],
  },
  {
    id: "contingency",
    label: "Contingency",
    to: "/contingency",
    l1Codes: ["980"],
  },
  { id: "materials", label: "Materials", to: "/materials" },
  {
    id: "subcontracts",
    label: "Subcontracts",
    // Not built yet. All three are `to`-less so the sidebar renders them as
    // grayed-out placeholders; "Civil Subcontracts" used to point at "/",
    // which bounced the user out of the estimate.
    items: [
      { label: "Civil Subcontracts" },
      { label: "Concrete Subcontracts" },
      { label: "Steel Subcontracts" },
    ],
  },
];

/**
 * Leading CBS digit → the canonical discipline for that digit. Fallback for
 * attributing an L1 code that isn't explicitly listed under any discipline
 * (e.g. legacy/synthetic codes) — mirrors the old digit-bucket behavior so no
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
