import { motion } from 'framer-motion';
import { Download, Package } from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';
import type { CanvasNode } from '../../types';
import VfFloatingPanel from '../../components/ui/VfFloatingPanel';
import VfTable from '../../components/ui/VfTable';

interface Props { isOpen: boolean; onClose: () => void; }

interface BomItem { type: string; name: string; quantity: number; properties: Record<string, unknown>; }

export default function BomPanel({ isOpen, onClose }: Props) {
  const { nodes } = useCanvasStore();

  const bomItems: BomItem[] = nodes.reduce((acc: BomItem[], node: CanvasNode) => {
    const existing = acc.find(i => i.type === node.type);
    if (existing) { existing.quantity++; }
    else { acc.push({ type: node.type, name: node.name, quantity: 1, properties: node.properties }); }
    return acc;
  }, []);

  const exportCsv = () => {
    const header = 'Component,Type,Quantity,Properties\n';
    const rows = bomItems.map(i => `"${i.name}","${i.type}",${i.quantity},"${JSON.stringify(i.properties).replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'voltforge_bom.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <VfFloatingPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Bill of Materials"
      icon={<Package className="w-4 h-4 text-forge-500 dark:text-forge-400" />}
      width="w-72"
      footer={
        bomItems.length > 0 ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] text-surface-500 dark:text-surface-400">{bomItems.length} types · {bomItems.reduce((s, i) => s + i.quantity, 0)} total</span>
            <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-volt-500/10 text-volt-600 text-[10px] font-bold hover:bg-volt-500/20 transition-colors dark:text-volt-400 cursor-pointer">
              <Download className="w-3 h-3" /> Export CSV
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="p-1">
        {bomItems.length === 0 ? (
          <p className="text-xs text-surface-500 text-center py-6">Add components to canvas to generate BOM</p>
        ) : (
          <VfTable
            data={bomItems}
            keyExtractor={(item) => item.type}
            columns={[
              {
                key: 'index',
                header: '#',
                render: (_, index) => <span className="text-surface-500">{index + 1}</span>,
                width: '30px'
              },
              {
                key: 'component',
                header: 'Component',
                render: (item) => (
                  <div>
                    <div className="text-surface-950 font-medium dark:text-white text-[10px]">{item.name}</div>
                    <div className="text-surface-500 text-[9px]">{item.type.replace(/_/g, ' ')}</div>
                  </div>
                )
              },
              {
                key: 'quantity',
                header: 'Qty',
                align: 'center',
                render: (item) => <span className="text-volt-500 dark:text-volt-400 font-bold">{item.quantity}</span>,
                width: '40px'
              }
            ]}
          />
        )}
      </div>
    </VfFloatingPanel>
  );
}
