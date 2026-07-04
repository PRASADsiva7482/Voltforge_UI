import { Download, Package } from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { DataTable, type TableColumn } from '../../components/ui/DataTable'

interface Props {
  isOpen: boolean
  onClose: () => void
}

interface BomItem {
  id: string
  name: string
  properties: Record<string, unknown>
  quantity: number
  type: string
}

export default function BomPanel({ isOpen, onClose }: Props) {
  const { nodes } = useCanvasStore()

  // Generate BOM item list grouped by component type
  const bomItems: BomItem[] = nodes.reduce((acc: BomItem[], node) => {
    const existing = acc.find((i) => i.type === node.type)
    if (existing) {
      existing.quantity++
    } else {
      acc.push({
        id: node.type, // DataTable requires id
        type: node.type,
        name: node.name,
        quantity: 1,
        properties: node.properties || {},
      })
    }
    return acc
  }, [])

  const exportCsv = () => {
    const header = 'Component,Type,Quantity,Properties\n'
    const rows = bomItems
      .map(
        (i) =>
          `"${i.name}","${i.type}",${i.quantity},"${JSON.stringify(
            i.properties
          ).replace(/"/g, '""')}"`
      )
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voltforge_bom.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns: TableColumn<BomItem>[] = [
    {
      id: 'index',
      header: '#',
      render: (_, index?: number) => (
        <span className="vf-bom-index">{(index ?? 0) + 1}</span>
      ),
      align: 'left',
    },
    {
      id: 'component',
      header: 'Component',
      render: (item) => (
        <div className="vf-bom-details">
          <div className="vf-bom-name">{item.name}</div>
          <div className="vf-bom-type">{item.type.replace(/_/g, ' ')}</div>
        </div>
      ),
      align: 'left',
    },
    {
      id: 'quantity',
      header: 'Qty',
      render: (item) => (
        <span className="vf-bom-qty">{item.quantity}</span>
      ),
      align: 'center',
    },
  ]

  const totalQty = bomItems.reduce((s, i) => s + i.quantity, 0)

  const footer = bomItems.length > 0 ? (
    <div className="vf-bom-footer">
      <span className="vf-bom-summary">
        {bomItems.length} types · {totalQty} total
      </span>
      <button
        onClick={exportCsv}
        className="vf-bom-export"
        type="button"
      >
        <Download size={12} />
        <span>Export CSV</span>
      </button>
    </div>
  ) : undefined

  return (
    <FloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Bill of Materials"
      icon={<Package size={14} />}
      width="280px"
      footer={footer}
    >
      <div className="vf-bom-content">
        {bomItems.length === 0 ? (
          <p className="vf-bom-empty">
            Add components to canvas to generate BOM
          </p>
        ) : (
          <DataTable columns={columns} rows={bomItems} />
        )}
      </div>
    </FloatingPanel>
  )
}
export { BomPanel }
