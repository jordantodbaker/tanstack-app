import { describe, expect, it } from "vitest";
import { isPast } from "./dates";

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
