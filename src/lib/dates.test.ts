import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatShortDate,
  isPast,
} from "./dates";

describe("isPast", () => {
  const now = new Date("2026-08-13T09:30:00Z");

  it("returns false for a null date", () => {
    expect(isPast(null, now)).toBe(false);
  });

  it("returns true for a date before today", () => {
    expect(isPast("2026-08-12T23:59:00Z", now)).toBe(true);
  });

  it("counts today as not past (due today is not overdue)", () => {
    // Any time today — even earlier than `now` — is on-or-after start-of-day.
    expect(isPast("2026-08-13T00:00:00", now)).toBe(false);
    expect(isPast("2026-08-13T23:00:00", now)).toBe(false);
  });

  it("returns false for a future date", () => {
    expect(isPast("2026-08-14T00:00:00", now)).toBe(false);
  });
});

describe("date display", () => {
  // Local time, so the expected day does not depend on the test machine's zone.
  const iso = new Date(2026, 4, 21, 15, 30).toISOString();

  it("formatDate spells the month", () => {
    expect(formatDate(iso)).toBe("May 21, 2026");
  });

  it("formatShortDate is numeric month/day/year", () => {
    expect(formatShortDate(iso)).toBe("5/21/2026");
  });

  it("formatDateTime adds the time of day", () => {
    expect(formatDateTime(iso)).toBe("5/21/2026, 3:30:00 PM");
  });

  it("shows a dash for a missing or unparseable date", () => {
    for (const f of [formatDate, formatShortDate, formatDateTime]) {
      expect(f(null)).toBe("—");
      expect(f("")).toBe("—");
      expect(f("not a date")).toBe("—");
    }
  });
});
