import type { HelpBlock, HelpSection } from "~/config/help-guide";
import { hasAtLeastRole, type UserRole } from "~/utils/users";

/**
 * Role filtering and search for the in-app guide (`help-guide.ts`).
 *
 * Pure functions over the content tree so the dialog and the `/help` route
 * render exactly the same guide, and so "a USER never sees admin content"
 * is a unit test rather than a code review.
 *
 * Filtering is subtractive, never a rewrite: a hidden section or block is
 * dropped outright (see the `minRole` note in `help-guide.ts`), which is how
 * the rest of the app already treats out-of-role features — the sidebar hides
 * `/setup` and `/admin` rather than disabling them.
 */

/** Text a block contributes to search. Non-textual blocks contribute "". */
function blockText(block: HelpBlock): string {
  switch (block.kind) {
    case "p":
    case "note":
      return block.text;
    case "ul":
    case "steps":
      return block.items.join(" ");
    case "keys":
      return block.rows.map((r) => `${r.keys.join(" ")} ${r.what}`).join(" ");
    case "image":
      return `${block.alt} ${block.caption ?? ""}`;
    case "workflow":
      // The rendered statuses/actions come from workflow.ts at render time;
      // the entity name is the only stable text to match on here.
      return block.entity;
  }
}

/** Every word a section (excluding its subsections) can be matched on. */
function sectionText(section: HelpSection): string {
  return [section.title, ...section.blocks.map(blockText)].join(" ");
}

/**
 * The guide as `role` may see it. Sections and blocks above the user's
 * privilege are removed, and a section left with nothing to say — no visible
 * blocks and no surviving subsections — is removed with them, so filtering
 * can't leave an empty heading behind.
 */
export function visibleSections(
  sections: HelpSection[],
  role: UserRole,
): HelpSection[] {
  const out: HelpSection[] = [];
  for (const section of sections) {
    if (section.minRole && !hasAtLeastRole(role, section.minRole)) continue;

    const blocks = section.blocks.filter(
      (b) => !b.minRole || hasAtLeastRole(role, b.minRole),
    );
    const subsections = section.subsections
      ? visibleSections(section.subsections, role)
      : undefined;

    if (blocks.length === 0 && (!subsections || subsections.length === 0)) {
      continue;
    }
    out.push({
      ...section,
      blocks,
      ...(subsections && subsections.length > 0 ? { subsections } : {}),
    });
  }
  return out;
}

/**
 * Narrows an already role-filtered tree to sections matching `query`.
 *
 * A section is kept when it matches itself — in which case its subsections
 * come along whole, since the match may be the chapter the reader wants — or
 * when any descendant matches, in which case only the matching descendants
 * survive. An empty/whitespace query returns the tree untouched.
 */
export function searchSections(
  sections: HelpSection[],
  query: string,
): HelpSection[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sections;

  const out: HelpSection[] = [];
  for (const section of sections) {
    if (sectionText(section).toLowerCase().includes(needle)) {
      out.push(section);
      continue;
    }
    const subsections = section.subsections
      ? searchSections(section.subsections, needle)
      : [];
    if (subsections.length > 0) out.push({ ...section, subsections });
  }
  return out;
}

/** A section paired with its nesting depth — the contents rail's row model. */
export type FlatSection = { section: HelpSection; depth: number };

/** Depth-first walk, parents before children. */
export function flattenSections(
  sections: HelpSection[],
  depth = 0,
): FlatSection[] {
  return sections.flatMap((section) => [
    { section, depth },
    ...(section.subsections
      ? flattenSections(section.subsections, depth + 1)
      : []),
  ]);
}
