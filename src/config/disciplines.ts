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
} from "lucide-react";
import type React from "react";

type NavItem = {
  label: string;
  to?: string;
};

export type DisciplineConfig = {
  id: string;
  label: string;
  icon: React.ElementType;
  to?: string;
  l1Codes?: string[];
  items?: NavItem[];
};

export const disciplines: DisciplineConfig[] = [
  {
    id: "summary",
    label: "Summary",
    icon: FileText,
    items: [
      { label: "Summary", to: "/summary" },
      { label: "Basis", to: "/basis" },
      { label: "Validation", to: "/validation" },
    ],
  },
  {
    id: "project-development",
    label: "Project Development",
    icon: Briefcase,
    to: "/project-development",
    l1Codes: ["001"],
  },
  {
    id: "administration",
    label: "Administration & Home Office",
    icon: Building,
    to: "/administration",
    l1Codes: ["010", "012"],
  },
  {
    id: "engineering",
    label: "Engineering",
    icon: Compass,
    to: "/engineering",
    l1Codes: ["020", "022", "023", "024", "025", "026", "027", "028"],
  },
  {
    id: "procurement",
    label: "Procurement",
    icon: ShoppingCart,
    to: "/procurement",
    l1Codes: ["030", "031", "032", "033"],
  },
  {
    id: "indirects",
    label: "Indirects",
    icon: Layers,
    to: "/indirects",
    l1Codes: ["050", "052"],
  },
  {
    id: "demolition",
    label: "Demolition",
    icon: Hammer,
    to: "/demolition",
    l1Codes: ["090", "091", "092", "093", "099"],
  },
  {
    id: "civil",
    label: "Civil",
    icon: Shovel,
    to: "/civil",
    l1Codes: ["100", "101", "102", "103", "131", "132", "133", "134", "135", "136", "137"],
  },
  {
    id: "concrete",
    label: "Concrete",
    icon: Box,
    to: "/concrete",
    l1Codes: ["200", "201", "202", "203", "231", "232", "233", "290"],
  },
  {
    id: "steel",
    label: "Structural Steel",
    icon: Grid3x3,
    to: "/steel",
    l1Codes: ["300", "301", "302", "303", "330", "331", "332", "333", "390", "391"],
  },
  {
    id: "buildings",
    label: "Buildings",
    icon: Warehouse,
    to: "/buildings",
    l1Codes: ["400", "401", "402", "403", "407"],
  },
  {
    id: "equipment",
    label: "Equipment",
    icon: Cog,
    to: "/equipment",
    l1Codes: [
      "500", "501", "502", "503",
      "530", "531", "532", "533", "534", "535", "536", "537", "538", "539", "540",
      "590",
    ],
  },
  {
    id: "piping",
    label: "Piping",
    icon: Workflow,
    to: "/piping",
  },
  {
    id: "electric",
    label: "Electric",
    icon: Zap,
    to: "/electric",
    l1Codes: ["700", "701", "702", "703", "790"],
  },
  {
    id: "instruments",
    label: "Instruments & Controls",
    icon: Gauge,
    to: "/instruments",
    l1Codes: ["800", "801", "802", "803", "890"],
  },
  {
    id: "coatings",
    label: "Coatings",
    icon: Paintbrush,
    to: "/coatings",
    l1Codes: ["900", "901", "902", "903", "904", "905"],
  },
  {
    id: "commissioning",
    label: "Commissioning",
    icon: Rocket,
    to: "/commissioning",
    l1Codes: ["950", "951", "952"],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Activity,
    to: "/operations",
    l1Codes: ["960", "961", "962"],
  },
  {
    id: "contingency",
    label: "Contingency",
    icon: AlertTriangle,
    to: "/contingency",
    l1Codes: ["970"],
  },
  {
    id: "materials",
    label: "Materials",
    icon: Layers,
    to: "/materials",
  },
  {
    id: "subcontracts",
    label: "Subcontracts",
    icon: HardHat,
    items: [
      { label: "Civil Subcontracts", to: "/" },
      { label: "Concrete Subcontracts", to: "/fef" },
      { label: "Steel Subcontracts", to: "/fef" },
    ],
  },
];

export const disciplineById = Object.fromEntries(
  disciplines.map((d) => [d.id, d]),
);

// Ordered list of top-level discipline labels for the summary page
export const DISCIPLINE_LABELS: string[] = disciplines
  .filter((d) => d.id !== "summary")
  .map((d) => d.label);
