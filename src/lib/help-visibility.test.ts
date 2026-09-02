import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  HELP_SECTIONS,
  type HelpBlock,
  type HelpSection,
} from "~/config/help-guide";
import {
  flattenSections,
  searchSections,
  visibleSections,
} from "./help-visibility";
import type { UserRole } from "~/utils/users";

/** Every section in a tree, flattened, regardless of depth. */
const allSections = (sections: HelpSection[]): HelpSection[] =>
  flattenSections(sections).map((f) => f.section);

const allBlocks = (sections: HelpSection[]): HelpBlock[] =>
  allSections(sections).flatMap((s) => s.blocks);

const idsFor = (role: UserRole) =>
  allSections(visibleSections(HELP_SECTIONS, role)).map((s) => s.id);

describe("help guide content", () => {
  it("has unique section ids", () => {
    const ids = allSections(HELP_SECTIONS).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses anchor-safe ids", () => {
    for (const id of allSections(HELP_SECTIONS).map((s) => s.id)) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("nests at most one level deep", () => {
    // The contents rail renders two levels; a third would silently vanish.
    for (const { depth } of flattenSections(HELP_SECTIONS)) {
      expect(depth).toBeLessThanOrEqual(1);
    }
  });

  it("has no empty sections", () => {
    for (const section of allSections(HELP_SECTIONS)) {
      const hasContent =
        section.blocks.length > 0 || (section.subsections?.length ?? 0) > 0;
      expect(hasContent, `section "${section.id}" is empty`).toBe(true);
    }
  });

  it("references only images that exist in public/help", () => {
    const images = allBlocks(HELP_SECTIONS).filter((b) => b.kind === "image");
    for (const image of images) {
      expect(image.src, `${image.src} must be served from /help/`).toMatch(
        /^\/help\/[a-z0-9-]+\.(png|jpg|svg)$/,
      );
      const file = join(process.cwd(), "public", image.src.replace("/", ""));
      expect(existsSync(file), `missing screenshot: ${image.src}`).toBe(true);
    }
  });
});

describe("visibleSections", () => {
  it("hides administrator content from a plain user", () => {
    const ids = idsFor("USER");
    expect(ids).not.toContain("admin");
    expect(ids).not.toContain("admin-rates");
    expect(ids).not.toContain("setup");
    expect(ids).not.toContain("approvals");
  });

  it("gives an approver the review chapter but not administration", () => {
    const ids = idsFor("APPROVER");
    expect(ids).toContain("approvals");
    expect(ids).not.toContain("admin");
    expect(ids).not.toContain("setup");
  });

  it("shows an administrator everything", () => {
    const ids = idsFor("ADMINISTRATOR");
    expect(ids).toContain("admin");
    expect(ids).toContain("setup");
    expect(ids).toContain("approvals");
    expect(ids.length).toBe(allSections(HELP_SECTIONS).length);
  });

  it("keeps the sections everyone shares at every role", () => {
    const shared = ["getting-started", "take-off", "cvr", "tips"];
    for (const role of ["USER", "APPROVER", "ADMINISTRATOR"] as UserRole[]) {
      expect(idsFor(role)).toEqual(expect.arrayContaining(shared));
    }
  });

  it("filters gated blocks out of a section that is otherwise visible", () => {
    const gated = (role: UserRole) =>
      allSections(visibleSections(HELP_SECTIONS, role)).find(
        (s) => s.id === "logs-common",
      )!;
    // "logs-common" is visible to everyone, but carries an admin-only note.
    expect(gated("USER").blocks.length).toBeLessThan(
      gated("ADMINISTRATOR").blocks.length,
    );
    expect(
      gated("USER").blocks.some((b) => b.kind === "note" && /Void/.test(b.text)),
    ).toBe(false);
  });

  it("drops a section left with nothing to show", () => {
    const sections: HelpSection[] = [
      {
        id: "parent",
        title: "Parent",
        blocks: [{ kind: "p", text: "admins only", minRole: "ADMINISTRATOR" }],
        subsections: [
          {
            id: "child",
            title: "Child",
            minRole: "ADMINISTRATOR",
            blocks: [{ kind: "p", text: "also admins only" }],
          },
        ],
      },
    ];
    expect(visibleSections(sections, "USER")).toEqual([]);
    expect(visibleSections(sections, "ADMINISTRATOR")).toHaveLength(1);
  });

  it("keeps a parent whose blocks are gated but whose child survives", () => {
    const sections: HelpSection[] = [
      {
        id: "parent",
        title: "Parent",
        blocks: [{ kind: "p", text: "admins only", minRole: "ADMINISTRATOR" }],
        subsections: [
          { id: "child", title: "Child", blocks: [{ kind: "p", text: "all" }] },
        ],
      },
    ];
    const [parent] = visibleSections(sections, "USER");
    expect(parent.blocks).toEqual([]);
    expect(parent.subsections).toHaveLength(1);
  });

  it("does not mutate the source content", () => {
    const before = JSON.stringify(HELP_SECTIONS);
    visibleSections(HELP_SECTIONS, "USER");
    expect(JSON.stringify(HELP_SECTIONS)).toBe(before);
  });
});

describe("searchSections", () => {
  it("returns everything for an empty query", () => {
    expect(searchSections(HELP_SECTIONS, "   ")).toBe(HELP_SECTIONS);
  });

  it("matches body text, not just titles", () => {
    const hits = allSections(searchSections(HELP_SECTIONS, "fill handle"));
    expect(hits.map((s) => s.id)).toContain("range-editing");
  });

  it("keeps a matching subsection under its parent", () => {
    const hits = searchSections(HELP_SECTIONS, "crew mix");
    const top = hits.map((s) => s.id);
    expect(top).toContain("estimate");
    expect(allSections(hits).map((s) => s.id)).toContain("take-off");
  });

  it("is case-insensitive and finds keyboard shortcuts", () => {
    const hits = allSections(searchSections(HELP_SECTIONS, "CTRL"));
    expect(hits.length).toBeGreaterThan(0);
  });

  it("returns nothing for a term the guide does not cover", () => {
    expect(searchSections(HELP_SECTIONS, "zzzznotathing")).toEqual([]);
  });

  it("searches only what the role can see when composed with filtering", () => {
    const forUser = searchSections(
      visibleSections(HELP_SECTIONS, "USER"),
      "crew mixes",
    );
    const forAdmin = searchSections(
      visibleSections(HELP_SECTIONS, "ADMINISTRATOR"),
      "crew mixes",
    );
    expect(allSections(forUser).map((s) => s.id)).not.toContain("admin-rates");
    expect(allSections(forAdmin).map((s) => s.id)).toContain("admin-rates");
  });
});
