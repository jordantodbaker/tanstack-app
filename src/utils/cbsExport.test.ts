import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CbsExportRow } from "~/lib/cbs-export";

/**
 * The Excel export rebuilds each view on the server from the view name and the
 * filter in force, so the file holds exactly the rows on screen. These pin the
 * rules it has to mirror from the page: which rows each view lists, that a
 * cost type is read off a row's own code, and that every filter — the Cost
 * Classification picker included — reaches the file and its filter note.
 *
 * The row sources and the workbook builder are faked: the tests read what
 * `buildCbsWorkbook` was handed rather than parsing an .xlsx.
 */
const {
  catalogRows,
  projectRows,
  buildWorkbook,
  requireProjectAccess,
  findProject,
} = vi.hoisted(() => ({
  catalogRows: vi.fn(),
  projectRows: vi.fn(),
  buildWorkbook: vi.fn(),
  requireProjectAccess: vi.fn(),
  findProject: vi.fn(),
}));

vi.mock("../server/db", () => ({
  prisma: { project: { findUnique: findProject } },
}));
vi.mock("./users.server", () => ({
  requireProjectAccess,
  // The real one checks the caller is an administrator first.
  adminHandler: (h: unknown) => h,
}));
vi.mock("./cbs-rows.server", () => ({
  cbsCatalogRows: catalogRows,
  projectCostCodeRows: projectRows,
}));
vi.mock("./cbs-xlsx.server", () => ({ buildCbsWorkbook: buildWorkbook }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const builder = {
      inputValidator(v: (d: unknown) => unknown) {
        validate = v;
        return builder;
      },
      handler(h: (args: { data: unknown }) => unknown) {
        return async (args?: { data: unknown }) =>
          h({ data: validate(args?.data) });
      },
    };
    return builder;
  },
}));

import {
  describeCbsFilter,
  exportCbsCatalog,
  exportProjectCostCodes,
} from "./cbsExport";
import { CBS_FILTER_NONE, type CbsRowFilter } from "~/lib/cbs-tree";

let nextId = 1;
/** A row as `cbsCatalogRows` returns it — no level segments on the wire. */
const wire = (
  displayCode: string,
  name: string,
  over: Record<string, unknown> = {},
) => ({
  id: nextId++,
  displayCode,
  name,
  uom: "LS",
  accountDescription: name,
  rowType: "ORIGINAL",
  subReporting: null,
  materialCode: null,
  laborCode: null,
  equipmentCode: null,
  otherCode: null,
  status: "Active",
  costClassification: null,
  ...over,
});

// One account and its lines. Every line carries the account's flags, as the
// workbook ships them — which is what makes reading the flags wrong here.
const FLAGS = { subReporting: true, materialCode: true };
const CATALOG = [
  wire("601-00-0000-00-0", "Welding (*)", { ...FLAGS, costClassification: "INDIRECT" }),
  wire("601-00-0000-00-L", "Welding Labor (L)", { ...FLAGS, costClassification: "DIRECT LABOR" }),
  wire("601-00-0000-00-S", "Welding Subs (S)", { ...FLAGS, costClassification: "DIRECT SUBCONTRACTS" }),
  wire("601-00-0000-00-M", "Welding Materials (M)", { ...FLAGS, costClassification: "MATERIALS" }),
  wire("601-05-0000-00-0", "Hot Tap (reserved)", { status: "Inactive" }),
  wire("601-10-0000-00-0", "Old Rack", { status: "Retired" }),
  wire("601-15-0000-00-0", "Blank Status", { status: null }),
];

/** What the workbook was given on the last export. */
const written = () => {
  const [rows, meta] = buildWorkbook.mock.calls.at(-1)!;
  return {
    names: (rows as CbsExportRow[]).map((r) => r.name),
    meta: meta as { filterNote: string; scope: string; availableRows: number },
  };
};

const filter = (over: Partial<CbsRowFilter> = {}) => ({
  ...CBS_FILTER_NONE,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 1;
  catalogRows.mockResolvedValue(CATALOG);
  buildWorkbook.mockResolvedValue(Buffer.from("xlsx"));
  findProject.mockResolvedValue({ displayId: "1901", name: "FIME" });
  requireProjectAccess.mockResolvedValue({ id: 1 });
});

describe("which rows each catalog view exports", () => {
  it("Cost Accounts: every active line, inactive and retired left out", async () => {
    await exportCbsCatalog({ data: { view: "codeBook", projectId: null } });
    const { names } = written();
    expect(names).toEqual(
      expect.arrayContaining([
        "Welding (*)",
        "Welding Labor (L)",
        "Welding Subs (S)",
        "Welding Materials (M)",
        // A blank Status counts as active.
        "Blank Status",
      ]),
    );
    expect(names).not.toContain("Hot Tap (reserved)");
    expect(names).not.toContain("Old Rack");
  });

  it("CBS Dictionary: everything, whatever its status", async () => {
    await exportCbsCatalog({ data: { view: "dictionary", projectId: null } });
    expect(written().names).toHaveLength(CATALOG.length);
  });

  it("CBS Dictionary honors the Status filter", async () => {
    await exportCbsCatalog({
      data: { view: "dictionary", projectId: null, filter: filter({ retired: true }) },
    });
    expect(written().names).toEqual(["Old Rack"]);
    expect(written().meta.filterNote).toBe("Filtered: status retired");
  });
});

describe("filters reach the file", () => {
  it("reads a cost type off each line's own code, not the account's flags", async () => {
    await exportCbsCatalog({
      data: { view: "codeBook", projectId: null, filter: filter({ material: true }) },
    });
    // Not the S line, though it carries Material Code YES, nor the roll-up.
    expect(written().names).toEqual(["Welding Materials (M)"]);
  });

  it("keeps only the classifications picked", async () => {
    await exportCbsCatalog({
      data: {
        view: "dictionary",
        projectId: null,
        filter: filter({ classifications: ["DIRECT LABOR", "MATERIALS"] }),
      },
    });
    // In the tree's own order, which is not the order picked.
    expect([...written().names].sort()).toEqual([
      "Welding Labor (L)",
      "Welding Materials (M)",
    ]);
    expect(written().meta.filterNote).toBe(
      "Filtered: cost classification DIRECT LABOR or MATERIALS",
    );
  });

  it("picks out blank classifications with the (none) entry", async () => {
    await exportCbsCatalog({
      data: { view: "codeBook", projectId: null, filter: filter({ classifications: [""] }) },
    });
    expect(written().names).toEqual(["Blank Status"]);
    expect(written().meta.filterNote).toBe("Filtered: cost classification none");
  });

  it("matches a search the way the page does — trimmed and case-folded", async () => {
    await exportCbsCatalog({
      data: { view: "dictionary", projectId: null, filter: filter({ query: "  WELDING subs " }) },
    });
    expect(written().names).toContain("Welding Subs (S)");
    expect(written().names).not.toContain("Welding Labor (L)");
  });

  it("filters on Rental like any other cost type", async () => {
    catalogRows.mockResolvedValue([
      ...CATALOG,
      wire("601-00-0000-00-R", "Welding Rental (R)", { ...FLAGS, rentalCode: true }),
    ]);
    await exportCbsCatalog({
      data: { view: "dictionary", projectId: null, filter: filter({ rental: true }) },
    });
    expect(written().names).toEqual(["Welding Rental (R)"]);
    expect(written().meta.filterNote).toBe("Filtered: rental codes");
  });

  it("carries the Dictionary's Row Type into the file", async () => {
    catalogRows.mockResolvedValue([
      ...CATALOG,
      wire("601-20-0000-00-S", "Generated Subs (S)", { rowType: "SUB" }),
    ]);
    await exportCbsCatalog({
      data: { view: "dictionary", projectId: null, filter: filter({ rowType: "generated" }) },
    });
    expect(written().names).toEqual(["Generated Subs (S)"]);
    expect(written().meta.filterNote).toBe("Filtered: generated rows only");
  });

  it("carries the Material Type pick into the file while Materials is on", async () => {
    catalogRows.mockResolvedValue([
      wire("601-00-0000-00-M", "Tagged Pipe (M)", { materialType: "Tagged" }),
      wire("601-05-0000-00-M", "Bulk Bolts (M)", { materialType: "Bulks" }),
    ]);
    await exportCbsCatalog({
      data: {
        view: "dictionary",
        projectId: null,
        filter: filter({ material: true, materialTypes: ["Bulks"] }),
      },
    });
    expect(written().names).toEqual(["Bulk Bolts (M)"]);
    expect(written().meta.filterNote).toBe(
      "Filtered: materials codes, material type Bulks",
    );
  });

  it("ignores a Material Type pick sent without Materials", async () => {
    await exportCbsCatalog({
      data: {
        view: "dictionary",
        projectId: null,
        filter: filter({ materialTypes: ["Bulks"] }),
      },
    });
    expect(written().names).toHaveLength(CATALOG.length);
    expect(written().meta.filterNote).toBe("");
  });

  it("defaults to no filter when the client sends none", async () => {
    await exportCbsCatalog({ data: { view: "dictionary", projectId: null } });
    expect(written().meta.filterNote).toBe("");
  });
});

describe("the project view", () => {
  const PROJECT = [
    wire("601-00-0000-00-L", "Granted Labor (L)"),
    { ...wire("601-00-0000-00-0", "Ungranted Parent (*)"), context: true },
  ];

  it("checks access to the project before exporting", async () => {
    projectRows.mockResolvedValue(PROJECT);
    requireProjectAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(
      exportProjectCostCodes({ data: { view: "projectCostCodes", projectId: 1 } }),
    ).rejects.toThrow("Forbidden");
    expect(buildWorkbook).not.toHaveBeenCalled();
  });

  it("leaves ungranted parents in, uncounted, unless they are hidden", async () => {
    projectRows.mockResolvedValue(PROJECT);
    await exportProjectCostCodes({ data: { view: "projectCostCodes", projectId: 1 } });
    expect(written().names).toEqual(["Ungranted Parent (*)", "Granted Labor (L)"]);
    expect(written().meta.availableRows).toBe(1);

    await exportProjectCostCodes({
      data: { view: "projectCostCodes", projectId: 1, hideContext: true },
    });
    expect(written().names).toEqual(["Granted Labor (L)"]);
    expect(written().meta.scope).toMatch(/ungranted parents hidden/);
  });

  it("puts the project number in the filename", async () => {
    projectRows.mockResolvedValue(PROJECT);
    const result = await exportProjectCostCodes({
      data: { view: "projectCostCodes", projectId: 1 },
    });
    expect(result.filename).toMatch(/^project-cost-code-list-1901-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("won't export the project view through the catalog route, or vice versa", async () => {
    await expect(
      exportCbsCatalog({ data: { view: "projectCostCodes", projectId: 1 } }),
    ).rejects.toThrow(/only exports the catalog views/);
    await expect(
      exportProjectCostCodes({ data: { view: "dictionary", projectId: 1 } }),
    ).rejects.toThrow(/only exports the project view/);
  });
});

describe("describeCbsFilter", () => {
  it("says nothing when nothing is filtered", () => {
    expect(describeCbsFilter(filter())).toBe("");
  });

  it("joins every filter in force, in a fixed order", () => {
    expect(
      describeCbsFilter(
        filter({
          query: "pipe",
          labor: true,
          material: true,
          active: true,
          classifications: ["INDIRECT"],
        }),
      ),
    ).toBe(
      "Filtered: matching “pipe”, labor or materials codes, status active, cost classification INDIRECT",
    );
  });

  it("lists three or more with commas and a final 'or'", () => {
    expect(
      describeCbsFilter(filter({ classifications: ["A", "B", ""] })),
    ).toBe("Filtered: cost classification A, B or none");
  });
});
