/**
 * Rebuilds the CBS Sample page's data from the source workbooks.
 *
 *   npx tsx scripts/build-cbs-sample.ts
 *
 * Two datasets, both formatted/outline-grouped CBS sheets, each emitted as a
 * nested tree (built from Excel's row outline levels) plus the per-level fill/
 * text colours lifted from the sheet so the web view mirrors the workbook's own
 * hierarchy colouring:
 *
 *   - cbs-codebook.ts  ← "CBS S-M Generated (2)" in SampleCSBCodeBook.xlsx
 *                        (all disciplines; the "CBS Code Book" section)
 *   - cbs-sample.ts    ← the single sheet in SampleCSB.xlsx
 *                        (the 6-discipline "Master CBS Dictionary" section)
 *
 * Re-run after the workbooks change (the sheets note the colours/outline are
 * static until rebuilt). exceljs + fflate are devDependencies used only here;
 * the generated .ts is what the app ships, so there's no Excel parser in the
 * runtime bundle. fflate strips the Excel Table parts that exceljs can't parse.
 */
import ExcelJS from "exceljs";
import { readFileSync, writeFileSync } from "node:fs";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

type Dataset = {
  src: string; // workbook under prisma/data
  sheet: string | 0; // sheet name, or 0 for the first/only sheet
  out: string; // output module under src/config
  exportName: string;
};

const DATASETS: Dataset[] = [
  {
    src: "SampleCSBCodeBook.xlsx",
    sheet: 0, // the workbook's single sheet
    out: "cbs-codebook.ts",
    exportName: "cbsCodeBook",
  },
  {
    src: "SampleCSB.xlsx",
    sheet: 0,
    out: "cbs-sample.ts",
    exportName: "cbsSample",
  },
];

const HEADER_ROW = 4; // rows 1-3 are title/description/totals; 4 is the header.
const DATA_START = 5;
const SKIP_FIELDS = new Set([
  "L1", "L2", "L22", "L3", "L4", "L5", "L6", "L7", "Name", "Display Code",
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
  if (f && f.type === "pattern" && f.fgColor?.argb) return `#${f.fgColor.argb.slice(-6)}`;
  return null;
}
function fontColor(cell: ExcelJS.Cell): string | null {
  const c = cell.font?.color;
  return c?.argb ? `#${c.argb.slice(-6)}` : null;
}

/**
 * ExcelJS throws on the `colorFilter` autofilter nodes inside Excel Tables
 * (SampleCSBCodeBook.xlsx has 29 of them). Strip the table parts in memory —
 * we only need cell values, colours, and outline levels, none of which live in
 * the table definitions. A no-op for workbooks without tables.
 */
function stripTables(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  const out: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(files)) {
    if (path.startsWith("xl/tables/")) continue;
    if (path.startsWith("xl/worksheets/") && path.endsWith(".xml")) {
      out[path] = strToU8(
        strFromU8(data).replace(/<tableParts[^>]*>[\s\S]*?<\/tableParts>/g, ""),
      );
    } else if (path.includes("/worksheets/_rels/") && path.endsWith(".rels")) {
      out[path] = strToU8(
        strFromU8(data).replace(
          /<Relationship[^>]*relationships\/table[^>]*\/>/g,
          "",
        ),
      );
    } else if (path === "[Content_Types].xml") {
      out[path] = strToU8(
        strFromU8(data).replace(
          /<Override[^>]*spreadsheetml\.table\+xml[^>]*\/>/g,
          "",
        ),
      );
    } else {
      out[path] = data;
    }
  }
  return zipSync(out);
}

function extractSheet(ws: ExcelJS.Worksheet) {
  const headers: string[] = [];
  ws.getRow(HEADER_ROW).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = (cell.text ?? "").trim();
  });
  const NAME_COL = headers.indexOf("Name");
  const CODE_COL = headers.indexOf("Display Code");
  if (NAME_COL < 0 || CODE_COL < 0) {
    throw new Error(
      `Sheet "${ws.name}": header row ${HEADER_ROW} is missing "Name"/"Display Code" (got: ${headers.filter(Boolean).join(", ")})`,
    );
  }

  const headerCell = ws.getRow(HEADER_ROW).getCell(NAME_COL);
  const headerColor = {
    fill: cellFill(headerCell) ?? "#1f3864",
    text: fontColor(headerCell) ?? "#ffffff",
  };
  const levelColors: Record<number, { fill: string; text: string }> = {};

  const roots: CbsNode[] = [];
  const stack: CbsNode[] = [];
  const counts = { total: 0, original: 0, subRows: 0, materialRows: 0 };
  let idSeq = 0;

  for (let r = DATA_START; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const nameCell = row.getCell(NAME_COL);
    const name = (nameCell.text ?? "").trim();
    const code = (row.getCell(CODE_COL).text ?? "").trim();
    if (!name && !code) continue;

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

    const node: CbsNode = { id: idSeq++, name, code, level, rowType, fields, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return {
    meta: {
      title: (ws.getRow(1).getCell(1).text ?? "").trim(),
      subtitle: (ws.getRow(2).getCell(1).text ?? "").trim(),
      sheetName: ws.name,
      generatedAt: new Date().toISOString(),
      counts,
      detailColumns: headers.filter((h) => h && !SKIP_FIELDS.has(h)),
      headerColor,
      levelColors,
    },
    roots,
  };
}

async function buildDataset(ds: Dataset) {
  const srcPath = join(ROOT, "prisma", "data", ds.src);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(stripTables(readFileSync(srcPath))) as never);

  const ws = ds.sheet === 0 ? wb.worksheets[0] : wb.getWorksheet(ds.sheet);
  if (!ws) throw new Error(`${ds.src}: sheet "${ds.sheet}" not found`);

  const { meta, roots } = extractSheet(ws);
  const out = { meta: { ...meta, source: `prisma/data/${ds.src}` }, nodes: roots };

  const json = JSON.stringify(out);
  const file =
    `// GENERATED by scripts/build-cbs-sample.ts — do not edit by hand.\n` +
    `// Rebuild after CBS changes: npx tsx scripts/build-cbs-sample.ts\n` +
    `import type { CbsData } from "./cbs-sample-types";\n\n` +
    `export const ${ds.exportName}: CbsData = JSON.parse(\n  ${JSON.stringify(json)},\n);\n`;
  writeFileSync(join(ROOT, "src", "config", ds.out), file, "utf-8");

  const c = meta.counts;
  console.log(
    `${ds.out} ← ${ds.src} [${ws.name}]: roots ${roots.length}, rows ${c.total} ` +
      `(orig ${c.original}, S ${c.subRows}, M ${c.materialRows}), ` +
      `levels ${Object.keys(meta.levelColors).join(",")}, ${(json.length / 1024).toFixed(0)} KB`,
  );
}

async function main() {
  for (const ds of DATASETS) await buildDataset(ds);
}

main().catch((e) => {
  console.error("build-cbs-sample failed:", e);
  process.exit(1);
});
