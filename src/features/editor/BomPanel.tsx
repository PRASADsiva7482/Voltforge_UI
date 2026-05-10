import { motion } from 'framer-motion';
import { X, Download, ShoppingCart, Package } from 'lucide-react';
import { useCanvasStore } from '../../store/canvasStore';
import type { CanvasNode } from '../../types';

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

  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
      className="absolute top-16 right-4 w-72 glass rounded-2xl overflow-hidden z-30 shadow-2xl border border-white/10">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-surface-900/60">
        <div className="flex items-center gap-2"><Package className="w-4 h-4 text-forge-400" /><span className="text-xs font-bold text-white">Bill of Materials</span></div>
        <button onClick={onClose} className="text-surface-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="p-3 max-h-80 overflow-y-auto">
        {bomItems.length === 0 ? (
          <p className="text-xs text-surface-500 text-center py-6">Add components to canvas to generate BOM</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-surface-400 border-b border-white/5">
                <th className="text-left py-1.5 font-medium">#</th>
                <th className="text-left py-1.5 font-medium">Component</th>
                <th className="text-center py-1.5 font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {bomItems.map((item, i) => (
                <tr key={item.type} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-1.5 text-surface-500">{i + 1}</td>
                  <td className="py-1.5">
                    <div className="text-white font-medium">{item.name}</div>
                    <div className="text-surface-500">{item.type.replace(/_/g, ' ')}</div>
                  </td>
                  <td className="py-1.5 text-center text-volt-400 font-bold">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {bomItems.length > 0 && (
        <div className="p-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-[10px] text-surface-400">{bomItems.length} types · {bomItems.reduce((s, i) => s + i.quantity, 0)} total</span>
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-volt-500/10 text-volt-400 text-[10px] font-bold hover:bg-volt-500/20 transition-colors">
            <Download className="w-3 h-3" /> Export CSV
          </button>
        </div>
      )}
    </motion.div>
  );
}
