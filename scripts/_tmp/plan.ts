import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";

const DOUBLED = /^([0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2})-([0-9A-Z])-([0-9A-Z])$/;
const VALID = /^[0-9A-Z]{3}-[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{2}-[0-9A-Z]$/;
/** "(S)" / "(M)" mark a generated twin; "(*)" marks the account's own row. */
const NAME_SUFFIX = /\((\*|[A-Z])\)\s*$/;

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("prisma/data/CBS.xlsx");
const ws = wb.getWorksheet("CBS Expanded")!;
const col: Record<string, number> = {};
ws.getRow(1).eachCell((c, n) => { col[`${c.value ?? ""}`.trim()] = n; });
const H = col["Display Code"], AA = col["Cost Code"], AD = col["L7"], G = col["Name"];

type Change = { row: number; from: string; to: string; l7?: string; why: string; name: string };
const changes: Change[] = [];
const nameConflicts: string[] = [];

ws.eachRow((row, r) => {
  if (r === 1) return;
  const code = `${row.getCell(H).value ?? ""}`.trim();
  const name = `${row.getCell(G).value ?? ""}`.trim();
  if (!code) return;

  const m = DOUBLED.exec(code);
  if (m) {
    const [, base, a, b] = m;
    // Keep the cost type, drop the duplicated "0" backbone segment. The L7
    // column is NOT used as the authority: it still reads "0" on the twelve
    // "-0-S" / "-0-M" rows, and trusting it collapsed each account's 0 / S / M
    // rows onto one code.
    const keep = a !== "0" ? a : b;
    // The name suffix is an independent witness: "(S)" / "(M)" on a twin,
    // "(*)" on the account's own row whatever its cost type.
    const suffix = NAME_SUFFIX.exec(name)?.[1];
    if (suffix && suffix !== "*" && suffix !== keep) {
      nameConflicts.push(`row ${r}: name says "(${suffix})" but keeping "${keep}" — ${code}`);
    }
    const l7 = `${row.getCell(AD).value ?? ""}`.trim().toUpperCase();
    changes.push({ row: r, from: code, to: `${base}-${keep}`, l7: l7 === keep ? undefined : keep, why: "doubled cost-type segment", name });
    return;
  }
  if (code === "920-00-0000-00-0") {
    changes.push({ row: r, from: code, to: "950-00-0000-00-0", why: "division renumber (L1=95)", name });
  }
});

console.log(`changes: ${changes.length}`);
const byWhy = new Map<string, number>();
for (const c of changes) byWhy.set(c.why, (byWhy.get(c.why) ?? 0) + 1);
for (const [w, n] of byWhy) console.log(`  ${n}  ${w}`);
console.log(`L7 cells also corrected: ${changes.filter((c) => c.l7).length}`);

console.log(`\nname-suffix conflicts: ${nameConflicts.length}`);
for (const d of nameConflicts.slice(0, 8)) console.log(`  ${d}`);
console.log(`every result is a valid display code: ${changes.every((c) => VALID.test(c.to))}`);

const changedRows = new Set(changes.map((c) => c.row));
const survivors = new Set<string>();
ws.eachRow((row, r) => { if (r > 1 && !changedRows.has(r)) survivors.add(`${row.getCell(H).value ?? ""}`.trim()); });
const collisions = changes.filter((c) => survivors.has(c.to));
console.log(`collisions with an untouched row: ${collisions.length}`);
for (const c of collisions.slice(0, 8)) console.log(`  row ${c.row}: ${c.from} -> ${c.to}`);
const seen = new Map<string, number>();
const dupes: string[] = [];
for (const c of changes) {
  if (seen.has(c.to)) dupes.push(`${c.to} (rows ${seen.get(c.to)} and ${c.row})`);
  else seen.set(c.to, c.row);
}
console.log(`two corrections landing on the same code: ${dupes.length}`);
for (const d of dupes.slice(0, 8)) console.log(`  ${d}`);

console.log("\nsamples (the ones that caught me out first):");
for (const r of [247, 248, 249, 251, 1303, 1304]) {
  const c = changes.find((x) => x.row === r);
  if (c) console.log(`  row ${String(c.row).padStart(5)}  ${c.from.padEnd(20)} -> ${c.to.padEnd(18)} ${c.name.slice(0, 40)}`);
}
const div = changes.find((c) => c.why.startsWith("division"))!;
console.log(`  row ${div.row}  ${div.from} -> ${div.to}  ${div.name}`);
writeFileSync("scripts/_tmp/changes.json", JSON.stringify({ H, AA, AD, changes }));
