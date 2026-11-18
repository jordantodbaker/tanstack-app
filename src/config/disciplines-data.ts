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
 * XY7 training, XY9 testing — followed by its direct-labor accounts. Since the
 * 2026-11-12 master a shop block sits at X10–X39 and a field block at X40 and
 * up (steel: 311 shop materials, 320 shop fabrication, 341 field materials,
 * 350 erection); field-only disciplines (civil, buildings, electrical, I&C,
 * coatings) keep just the X40 block (civil 141 materials, 150+ labor). The
 * materials and support-labor rules below rely on that layout. Re-check these
 * lists when the master changes — `disciplines-cbs.test.ts` does it against
 * the real workbook: an L1 missing here is invisible to its discipline's
 * take-off page.
 */

/** L1 endings of a materials block (XY1): shop "11", field "41". */
export const MATERIAL_L1_SUFFIXES = ["11", "41"];
/** L1 endings of a field-staff / support-labor block (XY2): "12", "42". */
export const SUPPORT_L1_SUFFIXES = ["12", "42"];

/**
 * The suffixes only mean something inside a discipline's block, and no 0XX
 * division has one: 00X is the project root (001 is Project Development, not
 * a materials account — reading it by suffix once put its only code on the
 * Materials page and off its own take-off), 01X Home Office (012 is HO
 * Construction Support, a take-off), 02X Special Project Costs and 03X
 * Engineering have no overhead block at all (032 is Combined Phase design,
 * not field staff), and 04X Procurement's 041 / 042 are take-offs too.
 */
const NON_DISCIPLINE_DIVISIONS = ["0"];
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
    // 020 Special Project Costs is a CBS division of its own (since
    // 2026-10-29, at 030 until the 2026-11-12 master swapped it with
    // Engineering), with 022 holding Legal / Bonds / Insurance / Finance
    // Charges / Taxes / Permitting / Licenses — surfaced as L2 sub-account
    // rows on the Summary page. Owned here so its CBS items show in this
    // discipline's Take Off picker and roll back up under "administration"
    // via the auto-derived `L1_TO_DISCIPLINE` reverse map.
    l1Codes: ["010", "012", "013", "014", "015", "016", "017", "020", "022"],
  },
  {
    id: "engineering",
    label: "Engineering",
    to: "/engineering",
    // 030 Engineering & Design (020 until 2026-11-12), with a design-phase
    // block each: 032 Combined Phase (D23), 034 Concept (D1), 035 FEED, 036
    // Detailed (D3), 037 Construction Support, 038 Cx & Startup Support.
    l1Codes: ["030", "032", "034", "035", "036", "037", "038"],
  },
  {
    id: "procurement",
    label: "Procurement",
    to: "/procurement",
    // Moved from 03X to 04X on 2026-10-29: 040 summary, 041 bulk materials,
    // 042 support labor, 043 activities, 044 engineered equipment, 048
    // engineered materials.
    l1Codes: ["040", "041", "042", "043", "044", "048"],
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
      "141",
      "142",
      "144",
      "145",
      "149",
      "150",
      "151",
      "152",
      "153",
      "154",
    ],
  },
  {
    id: "concrete",
    label: "Concrete",
    // Summary reports concrete and grout as one digit-2 row.
    summaryLabel: "Concrete & Grout",
    to: "/concrete",
    // "290" moved to the new Grout discipline below. 270 is Caissons / Piling.
    l1Codes: ["200", "241", "242", "243", "244", "249", "250", "260", "270"],
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
      "311",
      "312",
      "313",
      "314",
      "317",
      "319",
      "320",
      "321",
      "329",
      "340",
      "341",
      "342",
      "344",
      "349",
      "350",
      "351",
      "352",
      "353",
      "354",
      "355",
    ],
  },
  {
    id: "buildings",
    label: "Buildings",
    to: "/buildings",
    // 451–459 are the building trades (Concrete, Metals, Doors & Windows,
    // Enclosure, Wood & Plastics, Finishes, Specialties, Mechanical,
    // Electrical) under 450 Basic Site Materials & Methods.
    l1Codes: [
      "400",
      "442",
      "444",
      "449",
      "450",
      "451",
      "452",
      "453",
      "454",
      "455",
      "456",
      "457",
      "458",
      "459",
    ],
  },
  {
    id: "equipment",
    label: "Equipment",
    to: "/equipment",
    l1Codes: [
      "500",
      "511",
      "512",
      "513",
      "514",
      "517",
      "519",
      "520",
      "540",
      "541",
      "542",
      "544",
      "549",
      "550",
      "551",
      "552",
      "553",
      "554",
      "555",
      "556",
      "557",
      "558",
      "559",
    ],
  },
  {
    id: "piping",
    label: "Piping",
    to: "/piping",
    l1Codes: [
      "600",
      "611",
      "612",
      "613",
      "614",
      "617",
      "619",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626",
      "627",
      "628",
      "629",
      "630",
      "631",
      "632",
      "633",
      "634",
      "635",
      "637",
      "638",
      "639",
      "640",
      "641",
      "642",
      "644",
      "649",
      "650",
      "651",
      "652",
      "653",
      "654",
      "655",
      "656",
      "657",
      "658",
      "659",
      "660",
      "661",
      "662",
      "663",
      "664",
      "665",
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
      "740",
      "741",
      "742",
      "743",
      "744",
      "745",
      "749",
      "750",
      "751",
      "752",
      "753",
      "754",
      "755",
      "756",
      "757",
      "758",
      "759",
      "760",
    ],
  },
  {
    id: "instruments",
    label: "Instruments & Controls",
    summaryLabel: "Instrumentation",
    to: "/instruments",
    l1Codes: [
      "800",
      "840",
      "841",
      "842",
      "844",
      "849",
      "850",
      "851",
      "852",
      "853",
      "854",
    ],
  },
  {
    id: "coatings",
    label: "Coatings",
    to: "/coatings",
    // 950–953 (Painting, Insulation, Fireproofing, Refractory) are the
    // direct-labor accounts under 940 Coatings Installation.
    l1Codes: [
      "900",
      "940",
      "941",
      "942",
      "944",
      "949",
      "950",
      "951",
      "952",
      "953",
    ],
  },
  {
    id: "specialty-services",
    label: "Specialty Services",
    to: "/specialty-services",
    // 96 is a tens division: 960 is the summary, 961 Mechanical Services and
    // 962 Industrial Cleaning Services its children. It arrived in the 2026-10
    // workbook at 920, moved to 950 when that renumber was repaired, and to
    // 960 in the 2026-11-12 master.
    l1Codes: ["960", "961", "962"],
  },
  {
    id: "commissioning",
    label: "Commissioning",
    to: "/commissioning",
    // 970 is the Startup & Commissioning root (960 until the 2026-11-12
    // master, 950 before the 2026-10 workbook put Specialty Services there).
    l1Codes: ["970", "971", "972", "973", "974", "978", "979"],
  },
  {
    id: "operations",
    label: "Operations",
    to: "/operations",
    // 988 Operations Craft Support is owned by its code: the master labels its
    // rows "97 - Commissioning", but it sits in the 98X Operations division.
    l1Codes: [
      "980",
      "981",
      "982",
      "983",
      "984",
      "985",
      "986",
      "987",
      "988",
      "989",
    ],
  },
  {
    id: "contingency",
    label: "Contingency",
    to: "/contingency",
    l1Codes: ["990"],
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
