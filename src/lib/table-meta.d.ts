import '@tanstack/react-table'

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    // Define your custom properties here
    updateData?: (rowIndex: number, columnId: string, value: any) => void
    deleteLog?: (rowIndex: number) => void
  }
}