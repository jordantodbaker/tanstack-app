import '@tanstack/react-table'
import { StatusLookup } from '../lib/types'

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    updateData?: (rowIndex: number, columnId: string, value: any) => void
    updateRow?: (rowIndex: number, updates: Record<string, string>) => void
    deleteLog?: (rowIndex: number) => void
    addLog?: (log: changeLog) => void
    statusLookup?: StatusLookup[]
    cbsOptions?: { displayCode: string; name: string; uom: string; displayDescription: string | null }[]
    weldGroupOptions?: string[]
    weldGroupMaterialMap?: Record<string, { shopCode: string; installCode: string }>
    roleOptions?: string[]
    scheduleOptions?: string[]
    roleRates?: { roleName: string; schedule: string; rate: number }[]
  }
}