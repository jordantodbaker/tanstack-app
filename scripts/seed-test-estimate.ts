// Populates ONE project with a realistic, medium-sized estimate for testing.
//
//   npx tsx scripts/seed-test-estimate.ts                  # ~1200 rows on 1901
//   npx tsx scripts/seed-test-estimate.ts --rows 3000
//   npx tsx scripts/seed-test-estimate.ts --project 1902
//   npx tsx scripts/seed-test-estimate.ts --remove         # undo
//
// It creates its own estimate revision rather than writing into an existing
// one, so nothing already in the project is touched and `--remove` is a single
// version delete (FefRow cascades on versionId).
//
// The rows are not filler. Piping take-off rows are built the way the grid
// builds them — pick a weld group and Shop/Field, derive the metallurgy code,
// derive the bore from the size, then resolve the CBS stamp through the real
// `resolveCbsStamp` — so the Name column holds what the app itself would have
// chosen. Every other discipline draws its CBS code from that discipline's own
// L1 range, restricted to the items the project is actually allowed to use.
// Labor rates are the rates that resolve for the role and schedule on the row,
// formatted the way `applyRoleRate` formats them, so a "Refresh rates" run over
// this data reports no drift.
//
// Deterministic: the same --seed produces the same estimate.
import "dotenv/config";
import { prisma } from "../src/server/db";
import {
  deriveLaborHours,
  fabricateErectCode,
  pipingSizeCode,
  resolveCbsStamp,
} from "../src/lib/piping-derive";
import {
  packPipingFactors,
  unpackPipingFactors,
} from "../src/lib/piping-factors";
import { computeBoreSize } from "../src/lib/utils";

const LABEL = "Generated test data";

const arg = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const TARGET_ROWS = Number(arg("--rows", "1200"));
const PROJECT_DISPLAY_ID = arg("--project", "1901");
const SEED = Number(arg("--seed", "1901"));
const REMOVE = process.argv.includes("--remove");

/** Deterministic PRNG, so a given --seed always yields the same estimate. */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
/** Fixed-decimal string, matching how the grid stores numeric cells. */
const num = (v: number, dp = 2) => v.toFixed(dp);

/**
 * Share of the estimate each discipline carries.
 *
 * Weighted like a process/industrial job: piping dominates the take off,
 * concrete and steel follow, and the balance thins out across the rest.
 */
const TAKE_OFF_MIX: [string, number][] = [
  ["piping", 0.34],
  ["concrete", 0.13],
  ["steel", 0.1],
  ["electric", 0.085],
  ["equipment", 0.055],
  ["instruments", 0.05],
  ["civil", 0.045],
  ["buildings", 0.035],
  ["coatings", 0.03],
  ["demolition", 0.02],
  ["grout", 0.015],
];
const SUPPORT_MIX: [string, number][] = [
  ["piping", 0.03],
  ["concrete", 0.02],
  ["steel", 0.02],
  ["electric", 0.015],
];
/** Materials sheets are keyed by CBS L1 code, not by discipline name. */
const MATERIALS_MIX: [string, number][] = [
  ["601", 0.025],
  ["701", 0.015],
  ["101", 0.012],
  ["301", 0.012],
];

/** L1 prefixes per discipline, mirroring src/config/disciplines-data.ts. */
const L1: Record<string, string[]> = {
  piping: ["600", "601", "602", "603", "604", "605", "606", "607", "608", "609", "610", "611", "612", "613", "630", "631", "632", "633", "634", "635", "636", "637", "638", "639", "640", "641", "642", "643", "680", "681", "690", "691"],
  concrete: ["200", "201", "202", "203", "231", "232", "233"],
  steel: ["300", "301", "302", "303", "330", "331", "332", "333", "390", "391"],
  electric: ["700", "701", "702", "703", "790"],
  equipment: ["500", "501", "502", "503", "530", "531", "532", "533", "534", "535", "536", "537", "538", "539", "540", "590"],
  instruments: ["800", "801", "802", "803", "890"],
  civil: ["100", "101", "102", "103", "131", "132", "133", "134", "135", "136", "137"],
  buildings: ["400", "401", "402", "403", "407"],
  coatings: ["900", "901", "902", "903", "904", "905"],
  demolition: ["090", "091", "092", "093", "099"],
  grout: ["290", "291", "292", "293"],
};

const PIPE_SIZES = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24];
const SYSTEMS = ["Cooling Water", "Process Steam", "Condensate", "Instrument Air", "Caustic", "CIP Supply", "CIP Return", "Glycol", "Plant Water", "Nitrogen"];
const PAINT_SPECS = ["PS-100", "PS-210", "PS-315", "None"];
const INSULATION = ["None", "IN-1.5", "IN-2.0", "IN-3.0"];
const NDE = ["", "RT 5%", "RT 10%", "PT", "VT"];
const PHASES = ["Phase 1", "Phase 2", "Phase 3"];

async function main() {
  const project = await prisma.project.findFirst({
    where: { displayId: PROJECT_DISPLAY_ID },
    select: {
      id: true,
      name: true,
      estimateVersions: {
        select: { id: true, versionNumber: true, name: true },
        orderBy: { versionNumber: "desc" },
      },
      areas: { select: { id: true, name: true } },
    },
  });
  if (!project) throw new Error(`No project with displayId ${PROJECT_DISPLAY_ID}.`);

  if (REMOVE) {
    const generated = project.estimateVersions.filter((v) => v.name === LABEL);
    if (generated.length === 0) {
      console.log(`Nothing to remove — no "${LABEL}" revision on ${PROJECT_DISPLAY_ID}.`);
      return;
    }
    for (const v of generated) {
      const { count } = await prisma.fefRow.deleteMany({ where: { versionId: v.id } });
      await prisma.estimateVersion.delete({ where: { id: v.id } });
      console.log(`Removed v${v.versionNumber} ("${LABEL}") and ${count} rows.`);
    }
    return;
  }

  if (project.estimateVersions.some((v) => v.name === LABEL)) {
    throw new Error(
      `${PROJECT_DISPLAY_ID} already has a "${LABEL}" revision. ` +
        `Run with --remove first if you want to regenerate it.`,
    );
  }

  // ---- catalogs -----------------------------------------------------------
  // Only items the project is allowed to use: picking outside the allow-list
  // would produce rows the Take Off page filters out of its own dropdowns.
  const cbs = await prisma.cbsItem.findMany({
    where: { allowedInProjects: { some: { id: project.id } } },
    select: {
      displayCode: true,
      costCode: true,
      name: true,
      uom: true,
      l1: true,
      subReporting: true,
    },
  });
  const byL1 = new Map<string, typeof cbs>();
  for (const item of cbs) {
    const list = byL1.get(item.l1);
    if (list) list.push(item);
    else byL1.set(item.l1, [item]);
  }
  const byL1entries = () => byL1.entries();
  const forDiscipline = (d: string) =>
    (L1[d] ?? []).flatMap((code) => byL1.get(code) ?? []);

  // Roles carry the disciplines they serve, so labor can be assigned by craft
  // rather than at random — otherwise piping ends up priced as "Painter".
  const roles = await prisma.role.findMany({
    select: {
      name: true,
      disciplines: true,
      rates: { select: { schedule: true, rate: true } },
    },
  });
  const priced = roles.filter((r) => r.rates.length > 0);
  if (priced.length === 0) throw new Error("No role rates — cannot price rows.");

  const groups = await prisma.pipingGroup.findMany({
    select: { materialClassification: true, shopCode: true, installCode: true },
  });

  // The piping factor catalog, packed and unpacked exactly as the app does, so
  // labor hours come out of the same lookup the grid uses. Only codes that
  // carry a factor at a standard pipe size are usable — the lookup matches the
  // size exactly, so a code priced only at 30"/36"/42" would leave every row
  // it landed on with blank hours.
  const factorLookup = unpackPipingFactors(
    packPipingFactors(
      await prisma.pipingFactor.findMany({
        select: {
          code: true,
          unit: true,
          taskDefinition: true,
          values: {
            select: { size: true, value: true },
            orderBy: { size: "asc" },
          },
        },
        orderBy: [{ code: "asc" }, { id: "asc" }],
      }),
    ).pipingFactors,
  );
  const taskChoices = [...factorLookup]
    .map(([code, entry]) => ({
      code,
      sizes: PIPE_SIZES.filter((s) => entry.values.has(s)),
    }))
    .filter((t) => t.sizes.length > 0);
  if (taskChoices.length === 0) {
    throw new Error("No piping factor codes price at a standard pipe size.");
  }
  // The grid has two area columns: `area` holds the project-area id chosen in
  // the dropdown, `areaName` is free text beside it. Populate both, agreeing.
  const areaChoices = project.areas.map((a) => ({ id: String(a.id), name: a.name }));

  // `sub` is a FLAG ("true" / ""), not a cost, and the checkbox is only enabled
  // when the CBS item is marked subReporting. Writing an amount there would
  // render as a checked box the estimator cannot uncheck.
  const subReportable = new Map(cbs.map((c) => [c.displayCode, c.subReporting === true]));
  const findByCostCode = (costCode: string) =>
    cbs.find((c) => c.costCode === costCode);

  // ---- the revision -------------------------------------------------------
  const latest = project.estimateVersions[0];
  const version = await prisma.estimateVersion.create({
    data: {
      projectId: project.id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      name: LABEL,
      description: `Synthetic estimate for testing (~${TARGET_ROWS} rows, seed ${SEED}).`,
      parentVersionId: latest?.id ?? null,
    },
    select: { id: true, versionNumber: true },
  });

  // ---- row generation -----------------------------------------------------
  type Row = Record<string, string | number>;
  const rows: Row[] = [];
  const base = (discipline: string, section: string, position: number) => ({
    projectId: project.id,
    versionId: version.id,
    discipline,
    section,
    position,
  });

  /**
   * The craft that most often does a discipline's work.
   *
   * Weighted so the primary trade dominates rather than every eligible role
   * appearing equally — a piping sheet priced evenly across Painter, Machinist
   * and Insulation would not look like any real estimate.
   */
  const PRIMARY: Record<string, string[]> = {
    piping: ["Pipe Install", "Pipe Shop"],
    concrete: ["Concrete", "Carpenter"],
    steel: ["Steel Install", "Ironworker", "Steel Shop"],
    electric: ["Electrical"],
    instruments: ["Instrumentation"],
    equipment: ["Equipment", "Machinist"],
    civil: ["Civil", "Laborer"],
    buildings: ["Carpenter"],
    coatings: ["Painter"],
    demolition: ["Demolition"],
    grout: ["Concrete"],
  };

  /**
   * A role/schedule pairing appropriate to the discipline, that actually has a
   * rate — so nothing prices at blank and nothing prices at the wrong craft.
   */
  const laborPick = (discipline: string) => {
    const eligible = priced.filter((r) => r.disciplines.includes(discipline));
    const primaries = eligible.filter((r) =>
      (PRIMARY[discipline] ?? []).includes(r.name),
    );
    // 75% the primary trade, otherwise any craft cleared for the discipline.
    const from =
      primaries.length && rnd() < 0.75
        ? primaries
        : eligible.length
          ? eligible
          : priced;
    const role = pick(from);
    const rate = pick(role.rates);
    return { role: role.name, schedule: rate.schedule, rate: rate.rate };
  };

  /** Both area columns, agreeing: `area` is the id, `areaName` the label. */
  const areaCols = () => {
    if (areaChoices.length === 0) return { area: "", areaName: "" };
    const a = pick(areaChoices);
    return { area: a.id, areaName: a.name };
  };

  const commonRefs = () => ({
    ...areaCols(),
    projectPhase: pick(PHASES),
    drawingNumber: `D-${int(100, 999)}-${int(10, 99)}`,
    drawingRev: String(int(0, 3)),
    processUnit: `U-${int(10, 60)}`,
    systemName: pick(SYSTEMS),
  });

  // TAKE_OFF — piping, derived exactly as the grid derives it.
  const pipingCount = Math.round(TARGET_ROWS * (TAKE_OFF_MIX.find((m) => m[0] === "piping")![1]));
  for (let i = 0; i < pipingCount; i++) {
    const group = groups.length ? pick(groups) : null;
    const shopField = rnd() < 0.35 ? "Shop" : "Field";
    // Task code FIRST, then a size that code actually carries a factor for.
    // Labor hours are derived from the (code, size) factor, and the lookup is
    // an exact size match — choosing the size independently would leave rows
    // with a task code that prices nothing.
    const task = pick(taskChoices);
    const size = pick(task.sizes);
    const boreSize = computeBoreSize(String(size));
    // Shop work is fabrication and field work is erection, the vast majority of
    // the time. The 10% crossover keeps a few field-fab and shop-erect rows in
    // the set, which do occur and which the CBS resolution has to handle.
    const fabricateErect =
      rnd() < 0.9
        ? shopField === "Shop"
          ? "Fabricate"
          : "Erect"
        : shopField === "Shop"
          ? "Erect"
          : "Fabricate";
    const metallurgyCode = group
      ? shopField === "Shop"
        ? group.shopCode
        : group.installCode
      : "";

    const feCode = fabricateErectCode(fabricateErect);
    const sizeCode = pipingSizeCode(String(size), boreSize);
    const stamp = resolveCbsStamp(
      metallurgyCode,
      boreSize,
      findByCostCode,
      feCode && sizeCode ? { sizeCode, feCode } : undefined,
    );

    const labor = laborPick("piping");

    // Count scales inversely with the factor. A bevel at 0.2 hr each shows up
    // by the dozen; a 20" condensate fabrication at 120 hr each does not come
    // 38 to a line. Without this the biggest factors land on the biggest
    // counts and produce single lines carrying thousands of hours.
    const factor = factorLookup.get(task.code)?.values.get(size) ?? 1;
    const quantity =
      factor < 1 ? int(4, 60) : factor < 5 ? int(2, 24) : factor < 20 ? int(1, 10) : int(1, 3);

    // Derived by the app's own function from the task code's factor curve —
    // not invented. This is what the grid would have written when the
    // estimator picked that task code at that size.
    const hours = deriveLaborHours(
      { taskCode: task.code, size: String(size), quantity: String(quantity) },
      factorLookup,
    );
    rows.push({
      ...base("piping", "TAKE_OFF", i),
      ...commonRefs(),
      cbsCode: stamp?.id ?? "",
      name: stamp?.name ?? "",
      unit: stamp?.unit ?? "",
      description: `${pick(SYSTEMS)} line ${int(1000, 9999)}`,
      weldGroupDescription: group?.materialClassification ?? "",
      shopField,
      metallurgyCode,
      fabricateErect,
      size: String(size),
      boreSize,
      quantity: String(quantity),
      lineSpec: `${int(1, 9)}${pick(["A", "B", "C"])}-${int(100, 999)}`,
      tagNumber: `PL-${int(1000, 9999)}`,
      paintSpec: pick(PAINT_SPECS),
      insulation: pick(INSULATION),
      nde: pick(NDE),
      pwht: rnd() < 0.1 ? "Yes" : "",
      hydro: rnd() < 0.7 ? "Yes" : "",
      agUg: rnd() < 0.85 ? "AG" : "UG",
      role: labor.role,
      schedule: labor.schedule,
      laborRate: String(labor.rate),
      taskCode: task.code,
      laborHours: hours,
      // A UNIT price: the rollup computes qty x materialCost.
      materialCost: num(between(6, 240)),
      equipment: rnd() < 0.25 ? num(between(100, 1500)) : "",
      notes: rnd() < 0.15 ? "Field verify before fab" : "",
      // A flag, not a cost — and only meaningful where the CBS item allows it.
      sub:
        stamp?.id && subReportable.get(stamp.id) && rnd() < 0.45 ? "true" : "",
      elevation: rnd() < 0.45 ? `EL ${int(0, 120)}'-${int(0, 11)}"` : "",
      heatTrace: rnd() < 0.12 ? "HT-1" : "",
    });
  }

  // TAKE_OFF — every other discipline.
  for (const [discipline, share] of TAKE_OFF_MIX) {
    if (discipline === "piping") continue;
    const items = forDiscipline(discipline);
    const count = Math.round(TARGET_ROWS * share);
    for (let i = 0; i < count; i++) {
      const item = items.length ? pick(items) : null;
      const labor = laborPick(discipline);
      const quantity = int(1, 250);
      rows.push({
        ...base(discipline, "TAKE_OFF", i),
        ...commonRefs(),
        cbsCode: item?.displayCode ?? "",
        name: item?.name ?? "",
        unit: item?.uom ?? "",
        description: `${discipline} scope item ${i + 1}`,
        quantity: String(quantity),
        size: rnd() < 0.4 ? num(between(1, 48), 0) : "",
        role: labor.role,
        schedule: labor.schedule,
        laborRate: String(labor.rate),
        laborHours: num(between(0.05, 0.7) * quantity),
        // A UNIT price, not a line total (see project-totals: qty x matCost).
        materialCost: num(between(10, 320)),
        equipment: rnd() < 0.32 ? num(between(500, 26000)) : "",
        sub:
          item && subReportable.get(item.displayCode) && rnd() < 0.45
            ? "true"
            : "",
        elevation: rnd() < 0.3 ? `EL ${int(0, 120)}'-${int(0, 11)}"` : "",
      });
    }
  }

  // SUPPORT_LABOR — role/schedule/crew driven, no CBS stamp.
  for (const [discipline, share] of SUPPORT_MIX) {
    const count = Math.round(TARGET_ROWS * share);
    for (let i = 0; i < count; i++) {
      const labor = laborPick(discipline);
      rows.push({
        ...base(discipline, "SUPPORT_LABOR", i),
        ...areaCols(),
        name: `${labor.role} support — ${pick(["supervision", "QA/QC", "rigging", "scaffold", "cleanup", "layout"])}`,
        description: `${discipline} indirect support`,
        quantity: String(int(1, 12)),
        unit: "CRW",
        role: labor.role,
        schedule: labor.schedule,
        laborRate: String(labor.rate),
        // Sized against direct hours: craft support typically runs 15-30% of
        // direct labor, so these stay well below take-off row hours.
        laborHours: num(between(20, 160)),
      });
    }
  }

  // MATERIALS — keyed by CBS L1 rather than by discipline.
  //
  // The preferred buckets are only preferences: a project's CBS allow-list may
  // not cover them (1901 has no 701 items at all). Rather than emit rows with
  // no name or unit, drop the empty buckets and backfill from the richest ones
  // the project actually allows, reporting any substitution.
  const MIN_ITEMS = 5;
  const usable = MATERIALS_MIX.filter(
    ([l1]) => (byL1.get(l1)?.length ?? 0) >= MIN_ITEMS,
  );
  const dropped = MATERIALS_MIX.filter((m) => !usable.includes(m));
  const fallbackShare =
    dropped.reduce((n, [, share]) => n + share, 0) / Math.max(1, dropped.length);
  const substitutes = [...byL1entries()]
    .filter(([l1, items]) => items.length >= MIN_ITEMS && !MATERIALS_MIX.some((m) => m[0] === l1))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, dropped.length)
    .map(([l1]) => [l1, fallbackShare] as [string, number]);

  if (dropped.length) {
    console.log(
      `Materials: ${dropped.map((d) => d[0]).join(", ")} have <${MIN_ITEMS} allowed ` +
        `items on this project — using ${substitutes.map((s) => s[0]).join(", ")} instead.`,
    );
  }

  for (const [l1, share] of [...usable, ...substitutes]) {
    const items = byL1.get(l1) ?? [];
    const count = Math.round(TARGET_ROWS * share);
    for (let i = 0; i < count; i++) {
      const item = items.length ? pick(items) : null;
      rows.push({
        ...base(l1, "MATERIALS", i),
        cbsCode: item?.displayCode ?? "",
        name: item?.name ?? `Material item ${i + 1}`,
        unit: item?.uom ?? "EA",
        description: `Bulk material ${l1}-${int(100, 999)}`,
        quantity: String(int(5, 500)),
        // Unit price. MATERIALS rows are the ONLY ones the Summary rolls into
        // Material $, as qty x materialCost (project-totals.ts).
        materialCost: num(between(15, 480)),
        ...areaCols(),
      });
    }
  }

  // ---- write --------------------------------------------------------------
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.fefRow.createMany({ data: rows.slice(i, i + CHUNK) as never });
  }

  // ---- report -------------------------------------------------------------
  const summary = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.discipline}/${r.section}`;
    summary.set(k, (summary.get(k) ?? 0) + 1);
  }
  const unstamped = rows.filter((r) => r.section === "TAKE_OFF" && r.cbsCode === "").length;

  console.log(`Project ${PROJECT_DISPLAY_ID} — "${project.name}"`);
  console.log(`Created revision v${version.versionNumber} ("${LABEL}", id ${version.id})`);
  console.log(`Inserted ${rows.length} rows:\n`);
  for (const [k, n] of [...summary].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${k}`);
  }
  if (unstamped > 0) {
    console.log(
      `\n  ${unstamped} take-off row(s) resolved to no CBS item — expected for ` +
        `metallurgy/bore combinations the catalog does not carry.`,
    );
  }
  console.log(`\nUndo with:  npx tsx scripts/seed-test-estimate.ts --remove`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
