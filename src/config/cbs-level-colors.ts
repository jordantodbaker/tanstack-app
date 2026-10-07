/**
 * Colour-by-level scheme for the CBS dictionary pages, lifted from the Master CBS
 * Dictionary workbook's own fills so the web view mirrors the sheet. Keyed by
 * the code level (`getCbsLevel` in ~/lib/cbs-tree): 0 = group root, 1 = L1
 * account (and a root's S/M twins), then one step per further code segment.
 */
export type CbsLevelColor = { fill: string; text: string };

export const CBS_HEADER_COLOR: CbsLevelColor = {
  fill: "#1F3864",
  text: "#FFFFFF",
};

const CBS_LEVEL_COLORS: Record<number, CbsLevelColor> = {
  0: { fill: "#FFD966", text: "#000000" },
  1: { fill: "#FFD966", text: "#000000" },
  2: { fill: "#4472C4", text: "#FFFFFF" },
  3: { fill: "#A9D08E", text: "#000000" },
  4: { fill: "#F4B084", text: "#000000" },
  5: { fill: "#FFFFFF", text: "#000000" },
};

/** Styling for a level deeper than the workbook ever used. */
const CBS_DEFAULT_LEVEL_COLOR: CbsLevelColor = {
  fill: "#F3F4F6",
  text: "#000000",
};

// The workbook colours L0 and L1 the same gold. Override L0 (the discipline
// roots) to a distinct red so the top of each hierarchy stands apart.
const CBS_L0_COLOR: CbsLevelColor = { fill: "#C0504D", text: "#FFFFFF" };

/** The row colour for a code level — shared by every CBS tree. */
export function cbsColorForLevel(level: number): CbsLevelColor {
  if (level === 0) return CBS_L0_COLOR;
  return CBS_LEVEL_COLORS[level] ?? CBS_DEFAULT_LEVEL_COLOR;
}

/** Legend levels, in order. */
export const CBS_LEGEND_LEVELS = Object.keys(CBS_LEVEL_COLORS)
  .map(Number)
  .sort((a, b) => a - b);
