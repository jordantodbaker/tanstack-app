import '@tanstack/react-table'
import { StatusLookup } from '../lib/types'

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    // Define your custom properties here
    updateData?: (rowIndex: number, columnId: string, value: any) => void
    deleteLog?: (rowIndex: number) => void
    addLog?: (log: changeLog) => void
    statusLookup: StatusLookup[]
  }
}