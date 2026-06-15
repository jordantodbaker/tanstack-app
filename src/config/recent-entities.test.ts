import { describe, expect, it } from "vitest";
import {
  RECENTS_MAX_DISPLAYED,
  RECENTS_MAX_STORED,
  RECENT_ENTITY_LABELS,
  RECENT_ENTITY_ROUTES,
  RECENT_ENTITY_TYPES,
} from "./recent-entities";
import { COMMENT_ENTITY_TYPES } from "~/utils/comments";
import { ATTACHMENT_ENTITY_TYPES } from "~/utils/attachments";

/**
 * Hand-maintained witness list. If you add a new entity to recents, update
 * this list, the comments catalog (~/utils/comments.ts), the attachments
 * catalog (~/utils/attachments.ts), and the dialog wiring — the drift-guard
 * tests below fail until all four sides agree.
 */
const EXPECTED_RECENT_ENTITY_TYPES = [
  "ChangeLog",
  "FieldChangeOrder",
  "Rfi",
  "Trend",
  "Pco",
] as const;

describe("RECENT_ENTITY_TYPES catalog", () => {
  it("drift guard: catalog matches the hand-maintained expected list", () => {
    expect([...RECENT_ENTITY_TYPES].sort()).toEqual(
      [...EXPECTED_RECENT_ENTITY_TYPES].sort(),
    );
  });

  // Recents, comments, and attachments all hang off the same five top-level
  // entity types. If one catalog adds a sixth and the others don't, the
  // recents flow silently fails for the new entity. Pin them together.
  it("matches the COMMENT_ENTITY_TYPES catalog (one-to-one)", () => {
    expect([...RECENT_ENTITY_TYPES].sort()).toEqual(
      [...COMMENT_ENTITY_TYPES].sort(),
    );
  });

  it("matches the ATTACHMENT_ENTITY_TYPES catalog (one-to-one)", () => {
    expect([...RECENT_ENTITY_TYPES].sort()).toEqual(
      [...ATTACHMENT_ENTITY_TYPES].sort(),
    );
  });

  it("every type has a label and a route", () => {
    for (const t of RECENT_ENTITY_TYPES) {
      expect(typeof RECENT_ENTITY_LABELS[t]).toBe("string");
      expect(RECENT_ENTITY_LABELS[t].length).toBeGreaterThan(0);
      expect(typeof RECENT_ENTITY_ROUTES[t]).toBe("string");
      expect(RECENT_ENTITY_ROUTES[t].startsWith("/")).toBe(true);
    }
  });

  it("display cap does not exceed storage cap", () => {
    expect(RECENTS_MAX_DISPLAYED).toBeLessThanOrEqual(RECENTS_MAX_STORED);
  });
});
