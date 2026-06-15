import { describe, expect, it } from "vitest";
import { applyRecentView, extractRecents, type RecentItem } from "./userPreferences";
import { RECENTS_MAX_STORED } from "~/config/recent-entities";

/**
 * Pure-function tests for the recents read path (`extractRecents`) and the
 * recents write transform (`applyRecentView`). The server fns themselves
 * (`recordRecentView`, `fetchUserRecents`) hit Prisma and aren't covered
 * here — those run as integration tests against a real DB.
 */

const VALID: RecentItem = {
  entityType: "ChangeLog",
  entityId: 7,
  projectId: 3,
  number: "CVR-007",
  title: "Slab work delay",
  viewedAt: "2026-06-15T10:00:00.000Z",
};

describe("extractRecents", () => {
  it("returns [] for non-object roots (null, primitive, array)", () => {
    expect(extractRecents(null)).toEqual([]);
    expect(extractRecents(undefined)).toEqual([]);
    expect(extractRecents("recents")).toEqual([]);
    expect(extractRecents(42)).toEqual([]);
    // A bare array is not the prefs blob — it should be `{recentlyViewed: [...]}`.
    expect(extractRecents([VALID])).toEqual([]);
  });

  it("returns [] when the recentlyViewed key is missing or not an array", () => {
    expect(extractRecents({})).toEqual([]);
    expect(extractRecents({ recentlyViewed: null })).toEqual([]);
    expect(extractRecents({ recentlyViewed: "" })).toEqual([]);
    expect(extractRecents({ recentlyViewed: { 0: VALID } })).toEqual([]);
  });

  it("passes a well-formed entry through unchanged", () => {
    expect(extractRecents({ recentlyViewed: [VALID] })).toEqual([VALID]);
  });

  it("drops entries with an unknown entityType (drift guard)", () => {
    const stale = { ...VALID, entityType: "OldEntity" };
    expect(extractRecents({ recentlyViewed: [stale, VALID] })).toEqual([VALID]);
  });

  it("drops entries with non-integer entityId or projectId", () => {
    const badId = { ...VALID, entityId: 7.5 };
    const badProject = { ...VALID, projectId: "3" as unknown as number };
    const okOnly = extractRecents({
      recentlyViewed: [badId, badProject, VALID],
    });
    expect(okOnly).toEqual([VALID]);
  });

  it("drops entries missing string fields (number, title, viewedAt)", () => {
    const noNumber = { ...VALID, number: undefined };
    const noTitle = { ...VALID, title: 42 };
    const noViewedAt = { ...VALID };
    delete (noViewedAt as Partial<RecentItem>).viewedAt;
    expect(
      extractRecents({
        recentlyViewed: [noNumber, noTitle, noViewedAt, VALID],
      }),
    ).toEqual([VALID]);
  });

  it("drops non-object entries (null, primitives) but keeps siblings", () => {
    expect(
      extractRecents({ recentlyViewed: [null, 1, "x", VALID] }),
    ).toEqual([VALID]);
  });

  it("preserves order across mixed valid / invalid entries", () => {
    const a = { ...VALID, entityId: 1, number: "CVR-001" };
    const b = { ...VALID, entityId: 2, number: "CVR-002" };
    const result = extractRecents({
      recentlyViewed: [a, { not: "valid" }, b],
    });
    expect(result.map((r) => r.entityId)).toEqual([1, 2]);
  });
});

describe("applyRecentView", () => {
  it("prepends the new entry to an empty list", () => {
    const next = applyRecentView([], VALID);
    expect(next).toEqual([VALID]);
  });

  it("prepends the new entry without mutating the input", () => {
    const existing: RecentItem[] = [
      { ...VALID, entityId: 1, number: "CVR-001" },
    ];
    const frozen = [...existing];
    const next = applyRecentView(existing, VALID);
    expect(next[0]).toEqual(VALID);
    expect(next[1]).toEqual(frozen[0]);
    // input untouched
    expect(existing).toEqual(frozen);
  });

  it("dedupes by (entityType, entityId) — re-open moves entry to top", () => {
    const older: RecentItem = {
      ...VALID,
      title: "Older title",
      viewedAt: "2026-06-14T10:00:00.000Z",
    };
    const next = applyRecentView([older], VALID);
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual(VALID);
    expect(next[0].title).toBe("Slab work delay");
  });

  it("treats same entityId across different entityTypes as distinct", () => {
    const cvr: RecentItem = { ...VALID, entityType: "ChangeLog", entityId: 7 };
    const fco: RecentItem = {
      ...VALID,
      entityType: "FieldChangeOrder",
      entityId: 7,
      number: "FCO-007",
    };
    const next = applyRecentView([cvr], fco);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(fco);
    expect(next[1]).toEqual(cvr);
  });

  it("caps the result at RECENTS_MAX_STORED, rolling off the oldest", () => {
    // Build an existing list at the cap, each with a unique entityId.
    const existing: RecentItem[] = Array.from(
      { length: RECENTS_MAX_STORED },
      (_, i) => ({
        ...VALID,
        entityId: 100 + i,
        number: `CVR-${100 + i}`,
      }),
    );
    const newest: RecentItem = { ...VALID, entityId: 999, number: "CVR-999" };
    const next = applyRecentView(existing, newest);
    expect(next).toHaveLength(RECENTS_MAX_STORED);
    expect(next[0]).toEqual(newest);
    // The original tail (oldest, last in `existing`) is the item that rolled off.
    const rolledOffId = existing[existing.length - 1].entityId;
    expect(next.some((r) => r.entityId === rolledOffId)).toBe(false);
  });

  it("dedup + cap: re-opening an existing record does not drop another", () => {
    // List at cap; one of the items in the middle is re-opened. The dedup
    // removes it, then prepend brings the count back to the cap exactly —
    // no other item should be evicted.
    const existing: RecentItem[] = Array.from(
      { length: RECENTS_MAX_STORED },
      (_, i) => ({
        ...VALID,
        entityId: 100 + i,
        number: `CVR-${100 + i}`,
      }),
    );
    const midId = existing[5].entityId;
    const reopened: RecentItem = {
      ...VALID,
      entityId: midId,
      title: "Now updated",
    };
    const next = applyRecentView(existing, reopened);
    expect(next).toHaveLength(RECENTS_MAX_STORED);
    expect(next[0]).toEqual(reopened);
    // Every other original entityId is still present.
    for (const orig of existing) {
      if (orig.entityId === midId) continue;
      expect(next.some((r) => r.entityId === orig.entityId)).toBe(true);
    }
  });
});
