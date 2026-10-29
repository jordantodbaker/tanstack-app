/** Colors shared by the Validation page's charts, cards and area grid. */

export const DISC_COLOR = "#a63434";
export const INDI_COLOR = "#1e40af";
export const MATERIAL_COLOR = "#6b7280";

// Per-discipline colors keyed by SUMMARY_DISCIPLINES digit bucket.
export const DISCIPLINE_COLORS_BY_DIGIT: Record<string, string> = {
  "0": "#64748b", // demolition   (slate)
  "1": "#92400e", // civil        (amber)
  "2": "#78716c", // concrete     (stone)
  "3": "#0f766e", // steel        (teal)
  "4": "#059669", // buildings    (emerald)
  "5": "#0891b2", // equipment    (cyan)
  "6": "#a63434", // piping       (app red)
  "7": "#ca8a04", // electric     (yellow)
  "8": "#0284c7", // instruments  (sky)
  "9": "#be185d", // coatings     (pink)
};
