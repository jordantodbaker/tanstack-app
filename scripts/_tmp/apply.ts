import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

const APPLY = process.argv.includes("--apply");
const { H, AA, AD, changes } = JSON.parse(readFileSync("scripts/_tmp/changes.json", "utf8"));

const letter = (n: number) => {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
};
const colH = letter(H), colAA = letter(AA), colAD = letter(AD);
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// row -> { cellRef: newValue }
const targets = new Map<number, Map<string, string>>();
for (const c of changes as { row: number; to: string; l7?: string }[]) {
  const cells = new Map<string, string>();
  cells.set(`${colH}${c.row}`, c.to);
  cells.set(`${colAA}${c.row}`, c.to.replace(/-/g, ""));
  if (c.l7) cells.set(`${colAD}${c.row}`, c.l7);
  targets.set(c.row, cells);
}
console.log(`rows to touch: ${targets.size}; cells: ${[...targets.values()].reduce((n, m) => n + m.size, 0)}`);

const zip = await JSZip.loadAsync(readFileSync("prisma/data/CBS.xlsx"));
const sheetPath = "xl/worksheets/sheet1.xml";
const xml = await zip.file(sheetPath)!.async("string");

const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
const out: string[] = [];
let last = 0, m: RegExpExecArray | null, touched = 0, cellsWritten = 0;
const missing: string[] = [];

while ((m = rowRe.exec(xml))) {
  const cells = targets.get(Number(m[1]));
  if (!cells) continue;
  const inner = m[2];
  const open = m[0].slice(0, m[0].length - inner.length - "</row>".length);
  let next = inner;
  for (const [ref, value] of cells) {
    const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\s\S]*?</c>)`);
    const hit = re.exec(next);
    if (!hit) { missing.push(ref); continue; }
    // Keep the style attribute; drop the old type and write an inline string,
    // so the shared-string table needs no re-indexing.
    const attrs = hit[1].replace(/\s*t="[^"]*"/, "");
    next = next.slice(0, hit.index) +
      `<c r="${ref}"${attrs} t="inlineStr"><is><t>${esc(value)}</t></is></c>` +
      next.slice(hit.index + hit[0].length);
    cellsWritten++;
  }
  out.push(xml.slice(last, m.index), open + next + "</row>");
  last = m.index + m[0].length;
  touched++;
}
out.push(xml.slice(last));

console.log(`rows rewritten: ${touched}`);
console.log(`cells rewritten: ${cellsWritten}`);
console.log(`cells not found in the XML: ${missing.length}${missing.length ? ` (${missing.slice(0, 6).join(", ")})` : ""}`);

if (!APPLY) { console.log("\ndry run — nothing written."); process.exit(0); }
if (missing.length) { console.error("refusing to write: some target cells were absent"); process.exit(1); }

zip.file(sheetPath, out.join(""));
const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync("prisma/data/CBS.xlsx", buf);
console.log(`\nwritten: prisma/data/CBS.xlsx (${buf.length} bytes)`);
