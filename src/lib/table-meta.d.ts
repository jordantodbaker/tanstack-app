import "@tanstack/react-table";
import type { ChangeLog, StatusLookup } from "~/lib/types";

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    updateData?: (rowIndex: number, columnId: string, value: any) => void;
    updateRow?: (rowIndex: number, updates: Record<string, string>) => void;
    deleteLog?: (rowIndex: number) => void;
    addLog?: (log: ChangeLog) => void;
    statusLookup?: StatusLookup[];
    cbsOptions?: { displayCode: string; name: string; uom: string; displayDescription: string | null }[];
    weldGroupOptions?: string[];
    weldGroupMaterialMap?: Record<string, { shopCode: string; installCode: string }>;
    roleOptions?: string[];
    scheduleOptions?: string[];
    roleRates?: { roleName: string; schedule: string; rate: number }[];
    taskCodeOptions?: string[];
    pipingFactorLookup?: Map<string, { unit: string; values: Map<number, number> }>;
  }
}
