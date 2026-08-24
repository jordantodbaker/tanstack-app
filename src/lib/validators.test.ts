import { describe, expect, it } from "vitest";
import {
  Id,
  IsoDateString,
  IsoDateStringOrNull,
  StatusFilterSchema,
  parseIdInput,
  parseIdScalar,
  parseProjectIdInput,
  parseRecordRecentView,
  parseSearchInput,
  parseSetUser,
  parseTransitionInput,
  parseUpdateDashboardPrefs,
  parseUpsertChangeLog,
  parseUpsertCrewMix,
  parseUpsertFco,
  parseUpsertPco,
  parseUpsertProject,
  parseUpsertRfi,
  parseUpsertTrend,
} from "./validators";

/**
 * These schemas are the runtime boundary for every `createServerFn` call —
 * before this module existed, `inputValidator` was a typed identity function
 * and whatever JSON a caller sent went straight to Prisma. So the cases worth
 * pinning are the ones the module exists to stop: wrong-typed ids, injection-
 * shaped payloads, and unknown keys riding along into the handler.
 *
 * The happy-path builders below produce a minimal valid payload; each test
 * mutates one field, so a schema change that loosens a constraint fails here
 * rather than downstream.
 */

const ISO = "2026-06-15T12:00:00.000Z";

const cvr = (over: Record<string, unknown> = {}) => ({
  projectId: 1,
  cvrNumber: "",
  title: "Replace pump",
  description: "",
  status: "REQUESTED",
  type: "SCOPE",
  discipline: "piping",
  cbsCodes: [],
  originator: "",
  costImpact: 0,
  scheduleDaysImpact: 0,
  laborHoursImpact: 0,
  riskLevel: "LOW",
  reasonCode: "",
  requestedAt: ISO,
  dueDate: null,
  approvedAt: null,
  approver: "",
  notes: "",
  area: "",
  ...over,
});

const pco = (over: Record<string, unknown> = {}) => ({
  projectId: 1,
  pcoNumber: "",
  ownerReference: "",
  title: "Owner CO 1",
  description: "",
  priority: "NORMAL",
  requestedAmount: 0,
  approvedAmount: 0,
  scheduleDaysImpact: 0,
  ownerRepName: "",
  ownerRepEmail: "",
  reasonNarrative: "",
  notes: "",
  invoiceNumber: "",
  initiatedBy: "",
  linkedCvrIds: [],
  ...over,
});

describe("Id", () => {
  it("accepts a positive integer", () => {
    expect(Id.parse(1)).toBe(1);
    expect(parseIdScalar(42)).toBe(42);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %p",
    (bad) => {
      expect(() => Id.parse(bad)).toThrow();
    },
  );

  it("rejects a numeric string — no silent coercion", () => {
    // The handler passes this straight into a Prisma `where: { id }`; a string
    // that "looks like" a number must not slip through as one.
    expect(() => Id.parse("1")).toThrow();
  });

  it("rejects the injection-shaped payloads this module exists to stop", () => {
    expect(() => Id.parse("1; DROP TABLE users")).toThrow();
    expect(() => Id.parse({ $gt: 0 })).toThrow();
    expect(() => Id.parse([1])).toThrow();
    expect(() => Id.parse(null)).toThrow();
    expect(() => Id.parse(undefined)).toThrow();
  });

  it("rejects a missing id on the `{ id }` input shape", () => {
    expect(() => parseIdInput({})).toThrow();
    expect(() => parseIdInput({ id: "1" })).toThrow();
    expect(parseIdInput({ id: 3 })).toEqual({ id: 3 });
  });

  it("rejects a non-positive projectId", () => {
    expect(() => parseProjectIdInput(0)).toThrow();
    expect(parseProjectIdInput(7)).toBe(7);
  });
});

describe("IsoDateString", () => {
  it("accepts a UTC ISO timestamp", () => {
    expect(IsoDateString.parse(ISO)).toBe(ISO);
  });

  it("rejects a date-only string", () => {
    expect(() => IsoDateString.parse("2026-06-15")).toThrow();
  });

  it("rejects a non-UTC offset", () => {
    // Worth knowing: only `Z` is accepted. Every dialog sends
    // `new Date(...).toISOString()`, which is always UTC — a caller sending a
    // local-offset timestamp gets a 400 rather than a silently shifted date.
    expect(() => IsoDateString.parse("2026-06-15T12:00:00+02:00")).toThrow();
  });

  it("rejects free text and numbers", () => {
    expect(() => IsoDateString.parse("tomorrow")).toThrow();
    expect(() => IsoDateString.parse(1750000000000)).toThrow();
  });

  it("allows null only on the nullable variant", () => {
    expect(IsoDateStringOrNull.parse(null)).toBeNull();
    expect(() => IsoDateString.parse(null)).toThrow();
  });
});

describe("unknown keys", () => {
  it("strips fields the schema does not declare", () => {
    // The important half of the boundary: an attacker adding `isAdmin` or
    // `createdById` to the JSON must not have it reach the Prisma write.
    const out = parseUpsertChangeLog(
      cvr({ isAdmin: true, createdById: 99, projectId: 1 }),
    );
    expect(out).not.toHaveProperty("isAdmin");
    expect(out).not.toHaveProperty("createdById");
  });

  it("defaults `lineItems` to an empty array when omitted", () => {
    expect(parseUpsertChangeLog(cvr()).lineItems).toEqual([]);
  });
});

describe("required vs optional text", () => {
  it("rejects an empty or whitespace-only title", () => {
    expect(() => parseUpsertChangeLog(cvr({ title: "" }))).toThrow();
    expect(() => parseUpsertChangeLog(cvr({ title: "   " }))).toThrow();
  });

  it("trims a required field", () => {
    expect(parseUpsertChangeLog(cvr({ title: "  Pump  " })).title).toBe("Pump");
  });

  it("accepts empty strings for optional text — the dialogs' 'unset'", () => {
    const out = parseUpsertChangeLog(
      cvr({ description: "", notes: "", discipline: "" }),
    );
    expect(out.description).toBe("");
  });
});

describe("enums", () => {
  it("rejects a status outside the entity's set", () => {
    expect(() => parseUpsertChangeLog(cvr({ status: "PENDING" }))).toThrow();
    expect(() => parseUpsertChangeLog(cvr({ status: "" }))).toThrow();
  });

  it("is case-sensitive", () => {
    expect(() => parseUpsertChangeLog(cvr({ status: "requested" }))).toThrow();
  });

  it("rejects an unknown risk level and change type", () => {
    expect(() => parseUpsertChangeLog(cvr({ riskLevel: "SEVERE" }))).toThrow();
    expect(() => parseUpsertChangeLog(cvr({ type: "MAINTENANCE" }))).toThrow();
  });

  it("accepts every declared user role and rejects others", () => {
    for (const role of ["USER", "APPROVER", "ADMINISTRATOR"]) {
      expect(parseSetUser({ userId: 1, role, projectIds: [] }).role).toBe(role);
    }
    expect(() =>
      parseSetUser({ userId: 1, role: "SUPERADMIN", projectIds: [] }),
    ).toThrow();
  });
});

describe("numbers", () => {
  it("accepts negative money — credits are real", () => {
    expect(parseUpsertChangeLog(cvr({ costImpact: -5000 })).costImpact).toBe(
      -5000,
    );
  });

  it("rejects non-finite money", () => {
    expect(() =>
      parseUpsertChangeLog(cvr({ costImpact: Number.NaN })),
    ).toThrow();
    expect(() =>
      parseUpsertChangeLog(cvr({ costImpact: Number.POSITIVE_INFINITY })),
    ).toThrow();
  });

  it("rejects a fractional day count on an integer field", () => {
    expect(() =>
      parseUpsertChangeLog(cvr({ scheduleDaysImpact: 1.5 })),
    ).toThrow();
  });

  it("rejects a money value sent as a string", () => {
    expect(() => parseUpsertChangeLog(cvr({ costImpact: "5000" }))).toThrow();
  });
});

describe("email", () => {
  it("accepts empty string as 'unset'", () => {
    expect(parseUpsertPco(pco({ ownerRepEmail: "" })).ownerRepEmail).toBe("");
  });

  it("accepts a valid address and rejects a malformed one", () => {
    expect(parseUpsertPco(pco({ ownerRepEmail: "a@b.com" })).ownerRepEmail).toBe(
      "a@b.com",
    );
    expect(() => parseUpsertPco(pco({ ownerRepEmail: "not-an-email" }))).toThrow();
  });
});

describe("transition input", () => {
  it("requires a non-empty action", () => {
    expect(() => parseTransitionInput({ id: 1, action: "" })).toThrow();
    expect(parseTransitionInput({ id: 1, action: "approve" })).toEqual({
      id: 1,
      action: "approve",
    });
  });

  it("keeps an optional comment", () => {
    expect(
      parseTransitionInput({ id: 1, action: "reject", comment: "too costly" })
        .comment,
    ).toBe("too costly");
  });
});

describe("search input", () => {
  it("rejects a query shorter than two characters after trimming", () => {
    expect(() => parseSearchInput({ projectId: 1, query: "a" })).toThrow();
    expect(() => parseSearchInput({ projectId: 1, query: "  a  " })).toThrow();
  });

  it("trims before validating and returns the trimmed value", () => {
    expect(parseSearchInput({ projectId: 1, query: "  pump  " }).query).toBe(
      "pump",
    );
  });

  it("caps the query length", () => {
    expect(() =>
      parseSearchInput({ projectId: 1, query: "x".repeat(101) }),
    ).toThrow();
    expect(
      parseSearchInput({ projectId: 1, query: "x".repeat(100) }).query,
    ).toHaveLength(100);
  });
});

describe("nullable links", () => {
  it("accepts null or a positive id for a linked record", () => {
    const base = {
      projectId: 1,
      trendNumber: "",
      title: "Trend",
      description: "",
      priority: "NORMAL",
      discipline: "",
      cbsCodes: [],
      locationArea: "",
      probability: 0.5,
      costLow: 0,
      costLikely: 0,
      costHigh: 0,
      scheduleDaysImpact: 0,
      reasonNarrative: "",
      notes: "",
      identifiedAt: ISO,
      neededBy: null,
      linkedRfiId: null,
      linkedFcoId: null,
      initiatedBy: "",
    };
    expect(parseUpsertTrend(base).linkedRfiId).toBeNull();
    expect(parseUpsertTrend({ ...base, linkedFcoId: 4 }).linkedFcoId).toBe(4);
    expect(() => parseUpsertTrend({ ...base, linkedFcoId: 0 })).toThrow();
  });
});

describe("crew mix members", () => {
  const mix = (members: unknown) => ({
    name: "Crew A",
    description: "",
    schedule: "ST",
    members,
  });

  it("requires a head count of at least one", () => {
    expect(() => parseUpsertCrewMix(mix([{ roleId: 1, count: 0 }]))).toThrow();
    expect(parseUpsertCrewMix(mix([{ roleId: 1, count: 1 }])).members).toEqual([
      { roleId: 1, count: 1 },
    ]);
  });

  it("rejects a fractional head count", () => {
    expect(() => parseUpsertCrewMix(mix([{ roleId: 1, count: 1.5 }]))).toThrow();
  });

  it("accepts an empty member list", () => {
    expect(parseUpsertCrewMix(mix([])).members).toEqual([]);
  });
});

describe("project dates", () => {
  const project = (over: Record<string, unknown> = {}) => ({
    displayId: "",
    name: "Refinery",
    description: "",
    startDate: null,
    endDate: null,
    subcontractorIds: [],
    userIds: [],
    addAreaIds: [],
    ...over,
  });

  it("accepts null and any string — the handler's `new Date` is the real gate", () => {
    expect(parseUpsertProject(project()).startDate).toBeNull();
    expect(parseUpsertProject(project({ startDate: "2026-06-15" })).startDate).toBe(
      "2026-06-15",
    );
  });

  it("still rejects a non-string date", () => {
    expect(() => parseUpsertProject(project({ startDate: 20260615 }))).toThrow();
  });
});

describe("array fields", () => {
  it("rejects a bare string where a string array is expected", () => {
    expect(() => parseUpsertChangeLog(cvr({ cbsCodes: "611" }))).toThrow();
  });

  it("rejects non-string members inside a string array", () => {
    expect(() => parseUpsertChangeLog(cvr({ cbsCodes: [611] }))).toThrow();
  });

  it("rejects a non-positive id inside an id array", () => {
    expect(() => parseUpsertPco(pco({ linkedCvrIds: [1, 0] }))).toThrow();
    expect(parseUpsertPco(pco({ linkedCvrIds: [1, 2] })).linkedCvrIds).toEqual([
      1, 2,
    ]);
  });
});

describe("StatusFilterSchema", () => {
  it("accepts the empty string as 'no filter' plus any declared value", () => {
    const schema = StatusFilterSchema(["OPEN", "CLOSED"] as const);
    expect(schema.parse("")).toBe("");
    expect(schema.parse("OPEN")).toBe("OPEN");
    expect(() => schema.parse("PENDING")).toThrow();
  });
});

describe("dashboard prefs", () => {
  it("accepts arbitrary widget ids — the catalog filters stale ones at read", () => {
    const out = parseUpdateDashboardPrefs({
      hiddenWidgets: ["a-widget-that-no-longer-exists"],
      widgetOrder: ["b", "a"],
    });
    expect(out.hiddenWidgets).toEqual(["a-widget-that-no-longer-exists"]);
  });

  it("still requires both fields to be string arrays", () => {
    expect(() =>
      parseUpdateDashboardPrefs({ hiddenWidgets: "a", widgetOrder: [] }),
    ).toThrow();
    expect(() =>
      parseUpdateDashboardPrefs({ hiddenWidgets: [] }),
    ).toThrow();
  });
});

describe("recent view", () => {
  const view = (over: Record<string, unknown> = {}) => ({
    entityType: "ChangeLog",
    entityId: 1,
    projectId: 2,
    number: "CVR-001",
    title: "Replace pump",
    ...over,
  });

  it("accepts the five recordable entity types", () => {
    for (const t of ["ChangeLog", "FieldChangeOrder", "Rfi", "Trend", "Pco"]) {
      expect(parseRecordRecentView(view({ entityType: t })).entityType).toBe(t);
    }
  });

  it("rejects an entity type outside that set", () => {
    expect(() => parseRecordRecentView(view({ entityType: "User" }))).toThrow();
  });
});

describe("cross-entity payload isolation", () => {
  it("rejects an FCO payload sent to the RFI schema", () => {
    // The schemas are structurally similar enough that a wired-up-wrong client
    // could plausibly send the wrong one; `subject` vs `title` catches it.
    expect(() =>
      parseUpsertRfi({
        projectId: 1,
        fcoNumber: "",
        title: "Field change",
        description: "",
        status: "DRAFT",
      }),
    ).toThrow();
  });

  it("rejects an FCO missing its required linkedCvrId field", () => {
    expect(() =>
      parseUpsertFco({
        projectId: 1,
        fcoNumber: "",
        title: "Field change",
        description: "",
        status: "DRAFT",
        originType: "FIELD_CONDITION",
        priority: "NORMAL",
        discipline: "",
        cbsCodes: [],
        locationArea: "",
        drawingRefs: [],
        rfiNumbers: [],
        initiatedBy: "",
        fieldContact: "",
        estimatedCost: 0,
        estimatedHours: 0,
        workStopped: false,
        photosUrl: "",
        reasonNarrative: "",
        resolution: "",
        notes: "",
        initiatedAt: ISO,
        neededBy: null,
        closedAt: null,
        // linkedCvrId omitted — it is nullable, not optional.
      }),
    ).toThrow();
  });
});
