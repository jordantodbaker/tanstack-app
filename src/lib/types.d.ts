import type { Dispatch, SetStateAction } from "react";
import type { ColumnFiltersState } from "@tanstack/react-table";

export interface ChangeLog {
  id: number;
  projectId: number;
  cvrId: number;
  description: string;
  statusId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: number;
  displayId: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusLookup {
  id: number;
  status: "Requested" | "Pending" | "Approved" | "Denied" | "Executed" | "Void";
}

export type FefRow = {
  id: string;
  description: string;
  shopField: string;
  weldGroupDescription: string;
  quantity: string;
  size: string;
  unit: string;
  metallurgyCode: string;
  boreSize: string;
  role: string;
  schedule: string;
  taskCode: string;
  laborHours: string;
  laborRate: string;
  materialCost: string;
  equipment: string;
  notes: string;
};

export type CbsOption = {
  displayCode: string;
  name: string;
  uom: string;
  displayDescription: string | null;
};

export type BaseTableState = {
  data: FefRow[];
  setData: Dispatch<SetStateAction<FefRow[]>>;
  columnFilters: ColumnFiltersState;
  setColumnFilters: Dispatch<SetStateAction<ColumnFiltersState>>;
  cbsOptions?: CbsOption[];
};
