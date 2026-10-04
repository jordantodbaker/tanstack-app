/**
 * Rebuilds the CBS Sample page's data from the source workbook.
 *
 *   npx tsx scripts/build-cbs-sample.ts
 *
 * Reads `prisma/data/SampleCSB.xlsx` — a formatted, outline-grouped subset of
 * the CBS dictionary — and emits `src/config/cbs-sample.json`: the rows as a
 * nested tree (built from Excel's row outline levels) plus the per-level fill/
 * text colors lifted straight from the sheet, so the web view mirrors the
 * workbook's own hierarchy colouring. Re-run this whenever the workbook changes
 * (the sheet itself notes the colours/outline are static until rebuilt).
 *
 * exceljs is a devDependency used only here; the generated JSON is what the app
 * ships, so there's no Excel parser in the runtime bundle.
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "prisma", "data", "SampleCSB.xlsx");
// Emitted as a .ts module (not .json): a ~2 MB JSON import would make tsc infer
// the whole literal type and choke. JSON.parse of a string literal is typed
// once as CbsData with no deep inference, and parses fast at runtime.
const OUT = join(ROOT, "src", "config", "cbs-sample.ts");

const HEADER_ROW = 4; // rows 1-3 are title/description/totals; 4 is the header.
const DATA_START = 5;
// Hierarchy segments (encoded in Display Code) + the two fields we hoist — kept
// out of the per-node `fields` blob to cut noise and size.
const SKIP_FIELDS = new Set([
  "L1", "L2", "L3", "L4", "L5", "L6", "L7", "Name", "Display Code",
]);

type CbsNode = {
  id: number;
  name: string;
  code: string;
  level: number;
  rowType: string;
  fields: Record<string, string>;
  children: CbsNode[];
};

function cellFill(cell: ExcelJS.Cell): string | null {
  const f = cell.fill;
  if (f && f.type === "pattern" && f.fgColor?.argb) {
    return `#${f.fgColor.argb.slice(-6)}`;
  }
  return null;
}
function fontColor(cell: ExcelJS.Cell): string | null {
  const c = cell.font?.color;
  return c?.argb ? `#${c.argb.slice(-6)}` : null;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.worksheets[0];

  // Header labels, column index → label.
  const headers: string[] = [];
  ws.getRow(HEADER_ROW).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = (cell.text ?? "").trim();
  });

  // Per-level fill/text colour, read from the "Name" column (H = 8), which
  // carries the active level's colour on every row.
  const NAME_COL = headers.indexOf("Name");
  const levelColors: Record<number, { fill: string; text: string }> = {};
  const headerCell = ws.getRow(HEADER_ROW).getCell(NAME_COL);
  const headerColor = {
    fill: cellFill(headerCell) ?? "#1f3864",
    text: fontColor(headerCell) ?? "#ffffff",
  };

  const roots: CbsNode[] = [];
  const stack: CbsNode[] = []; // stack[i] is the open ancestor at each depth
  const counts = { total: 0, original: 0, subRows: 0, materialRows: 0 };
  let idSeq = 0;

  for (let r = DATA_START; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const nameCell = row.getCell(NAME_COL);
    const name = (nameCell.text ?? "").trim();
    const code = (row.getCell(headers.indexOf("Display Code")).text ?? "").trim();
    if (!name && !code) continue; // skip blank spacer rows

    const level = row.outlineLevel ?? 0;

    if (!levelColors[level]) {
      levelColors[level] = {
        fill: cellFill(nameCell) ?? "#ffffff",
        text: fontColor(nameCell) ?? "#000000",
      };
    }

    const fields: Record<string, string> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const label = headers[col];
      if (!label || SKIP_FIELDS.has(label)) return;
      const text = (cell.text ?? "").trim();
      if (text) fields[label] = text;
    });

    const rowType = fields["Row Type"] ?? "Original";
    counts.total++;
    if (rowType.includes("Sub")) counts.subRows++;
    else if (rowType.includes("Material")) counts.materialRows++;
    else counts.original++;

    const node: CbsNode = {
      id: idSeq++,
      name,
      code,
      level,
      rowType,
      fields,
      children: [],
    };

    // Nearest open ancestor with a strictly smaller level is the parent.
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  const out = {
    meta: {
      title: (ws.getRow(1).getCell(1).text ?? "").trim(),
      subtitle: (ws.getRow(2).getCell(1).text ?? "").trim(),
      sheetName: ws.name,
      generatedAt: new Date().toISOString(),
      source: "prisma/data/SampleCSB.xlsx",
      counts,
      // Headers minus the hoisted/segment columns — the detail fields, in order.
      detailColumns: headers.filter((h) => h && !SKIP_FIELDS.has(h)),
      headerColor,
      levelColors,
    },
    nodes: roots,
  };

  const json = JSON.stringify(out);
  // JSON.stringify(json) yields a safe, fully-escaped double-quoted JS string
  // literal — no manual escaping needed.
  const file =
    `// GENERATED by scripts/build-cbs-sample.ts — do not edit by hand.\n` +
    `// Rebuild after CBS changes: npx tsx scripts/build-cbs-sample.ts\n` +
    `import type { CbsData } from "./cbs-sample-types";\n\n` +
    `export const cbsSample: CbsData = JSON.parse(\n  ${JSON.stringify(json)},\n);\n`;
  writeFileSync(OUT, file, "utf-8");
  const bytes = Buffer.byteLength(json);
  console.log(
    `Wrote ${OUT}\n  roots: ${roots.length}  rows: ${counts.total} ` +
      `(orig ${counts.original}, S ${counts.subRows}, M ${counts.materialRows})\n` +
      `  levels: ${Object.keys(levelColors).join(", ")}  size: ${(bytes / 1024).toFixed(0)} KB`,
  );
}

main().catch((e) => {
  console.error("build-cbs-sample failed:", e);
  process.exit(1);
});
