import {
  FileText,
  Briefcase,
  Building,
  Compass,
  ShoppingCart,
  Layers,
  Hammer,
  Shovel,
  Box,
  PaintBucket,
  Grid3x3,
  Warehouse,
  Cog,
  Workflow,
  Zap,
  Gauge,
  Paintbrush,
  Rocket,
  Activity,
  AlertTriangle,
  HardHat,
  Settings,
} from "lucide-react";
import type React from "react";
import {
  disciplinesData,
  type DisciplineData,
  type NavItem,
} from "./disciplines-data";

export type { NavItem };

export type DisciplineConfig = DisciplineData & {
  icon: React.ElementType;
};

// Icon per discipline id. Kept here (not in disciplines-data.ts) so the data
// module stays free of lucide for the pure aggregators that import it.
const ICONS: Record<string, React.ElementType> = {
  setup: Settings,
  summary: FileText,
  "project-development": Briefcase,
  administration: Building,
  engineering: Compass,
  procurement: ShoppingCart,
  indirects: Layers,
  demolition: Hammer,
  civil: Shovel,
  concrete: Box,
  grout: PaintBucket,
  steel: Grid3x3,
  buildings: Warehouse,
  equipment: Cog,
  piping: Workflow,
  electric: Zap,
  instruments: Gauge,
  coatings: Paintbrush,
  commissioning: Rocket,
  operations: Activity,
  contingency: AlertTriangle,
  materials: Layers,
  subcontracts: HardHat,
};

export const disciplines: DisciplineConfig[] = disciplinesData.map((d) => ({
  ...d,
  icon: ICONS[d.id] ?? FileText,
}));

export const disciplineById = Object.fromEntries(
  disciplines.map((d) => [d.id, d]),
);

// The Summary page aggregates all CBS items by the first digit of their L1
// code. This map names the canonical discipline for each digit-bucket so the
// summary table shows a consistent label per row.
const SUMMARY_DIGIT_TO_DISCIPLINE_ID: Record<string, string> = {
  "0": "procurement",
  "1": "civil",
  "2": "concrete",
  "3": "steel",
  "4": "buildings",
  "5": "equipment",
  "6": "piping",
  "7": "electric",
  "8": "instruments",
  "9": "coatings",
};

export const DISCIPLINE_LABELS: string[] = Object.keys(
  SUMMARY_DIGIT_TO_DISCIPLINE_ID,
)
  .sort()
  .map((digit) => {
    const d = disciplineById[SUMMARY_DIGIT_TO_DISCIPLINE_ID[digit]];
    return d?.summaryLabel ?? d?.label ?? "";
  });

// Rows shown on the Summary page's "Disciplines" section. Each row pulls its
// totals from the given `digit` bucket in projectFefRowTotals; rows with
// `digit: null` have no underlying data source yet (e.g. Shop variants) and
// only contribute their label/UOM.
export type SummaryDiscipline = {
  label: string;
  uom: string;
  digit: string | null;
};

export const SUMMARY_DISCIPLINES: SummaryDiscipline[] = [
  { label: "Demolition", uom: "AL", digit: "0" },
  { label: "Civil", uom: "CY", digit: "1" },
  { label: "Concrete", uom: "CY", digit: "2" },
  { label: "Structural Steel", uom: "TN", digit: "3" },
  { label: "Structural Steel Shop", uom: "TN", digit: null },
  { label: "Buildings", uom: "", digit: "4" },
  { label: "Equipment", uom: "EA", digit: "5" },
  { label: "Piping", uom: "LF", digit: "6" },
  { label: "Piping Shop", uom: "DI", digit: null },
  { label: "Electrical", uom: "LF", digit: "7" },
  { label: "Instrumentation", uom: "EA", digit: "8" },
  { label: "Coatings", uom: "SF", digit: "9" },
];
