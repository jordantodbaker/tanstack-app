import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    updateData?: (rowIndex: number, columnId: string, value: string) => void;
    updateRow?: (rowIndex: number, updates: Record<string, string>) => void;
    deleteRow?: (rowIndex: number) => void;
    cbsOptions?: {
      displayCode: string;
      name: string;
      uom: string;
      displayDescription: string | null;
      subReporting?: boolean | null;
    }[];
    weldGroupOptions?: string[];
    weldGroupMaterialMap?: Record<string, { shopCode: string; installCode: string }>;
    roleOptions?: string[];
    scheduleOptions?: string[];
    roleRates?: { roleName: string; schedule: string; rate: number }[];
    crewMixOptions?: {
      id: number;
      name: string;
      schedule: string;
      members: { roleName: string; count: number }[];
    }[];
    // Pre-mapped `{ value, label }` lists for the dropdown cells, computed once
    // per grid (see FefTableContent) so each cell doesn't re-map its source.
    cbsSelectOptions?: { value: string; label: string }[];
    roleSelectOptions?: { value: string; label: string }[];
    scheduleSelectOptions?: { value: string; label: string }[];
    crewMixSelectOptions?: { value: string; label: string }[];
    taskCodeOptions?: { code: string; taskDefinition: string }[];
    pipingFactorLookup?: Map<string, { unit: string; values: Map<number, number> }>;
    areaOptions?: { value: string; label: string }[];
    selectedRowIndices?: Set<number>;
    onToggleRowSelected?: (rowIndex: number) => void;
  }
}
