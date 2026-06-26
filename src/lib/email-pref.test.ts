import { describe, expect, it } from "vitest";
import { isEmailNotificationOptedIn } from "./email-pref";

// Gates whether a notification email actually goes out, so the default-on
// behavior and the explicit opt-out both matter — a regression here either
// silently emails users who opted out or suppresses everyone's email.
describe("isEmailNotificationOptedIn", () => {
  it("defaults to opted-in when prefs are absent or malformed", () => {
    expect(isEmailNotificationOptedIn(undefined)).toBe(true);
    expect(isEmailNotificationOptedIn(null)).toBe(true);
    expect(isEmailNotificationOptedIn("nonsense")).toBe(true);
    expect(isEmailNotificationOptedIn(42)).toBe(true);
    expect(isEmailNotificationOptedIn({})).toBe(true);
  });

  it("defaults to opted-in when the notifications branch is missing/empty", () => {
    expect(isEmailNotificationOptedIn({ dashboard: {} })).toBe(true);
    expect(isEmailNotificationOptedIn({ notifications: null })).toBe(true);
    expect(isEmailNotificationOptedIn({ notifications: {} })).toBe(true);
  });

  it("opts out ONLY on an explicit false", () => {
    expect(
      isEmailNotificationOptedIn({ notifications: { emailEnabled: false } }),
    ).toBe(false);
  });

  it("treats any non-false emailEnabled as opted-in", () => {
    expect(
      isEmailNotificationOptedIn({ notifications: { emailEnabled: true } }),
    ).toBe(true);
    // Malformed truthy values should not accidentally opt a user out.
    expect(
      isEmailNotificationOptedIn({ notifications: { emailEnabled: "no" } }),
    ).toBe(true);
    expect(
      isEmailNotificationOptedIn({ notifications: { emailEnabled: 0 } }),
    ).toBe(true);
  });
});
