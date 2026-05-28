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
    taskCodeOptions?: { code: string; taskDefinition: string }[];
    pipingFactorLookup?: Map<string, { unit: string; values: Map<number, number> }>;
    areaOptions?: { value: string; label: string }[];
    selectedRowIndices?: Set<number>;
    onToggleRowSelected?: (rowIndex: number) => void;
  }
}
