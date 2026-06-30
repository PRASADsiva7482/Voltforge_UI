import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type TableColumn<T> = {
  align?: 'left' | 'right' | 'center'
  header: string
  id: string
  render: (row: T) => ReactNode
}

export type DataTableProps<T extends { id: string }> = {
  columns: TableColumn<T>[]
  rows: T[]
}

export function DataTable<T extends { id: string }>({ columns, rows }: DataTableProps<T>) {
  return (
    <div className="vf-table-wrap">
      <table className="vf-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={cn(column.align && `vf-table__cell--${column.align}`)} key={column.id}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td className={cn(column.align && `vf-table__cell--${column.align}`)} key={column.id}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
