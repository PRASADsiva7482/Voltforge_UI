import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Cpu, Zap, Thermometer, Monitor, Power, Settings2 } from 'lucide-react';
import { componentApi } from '../../api/services';
import { useCanvasStore } from '../../store/canvasStore';
import type { ElectronicComponent, CanvasNode } from '../../types';

const categoryIcons: Record<string, any> = {
  BOARD: Cpu, LED: Zap, SENSOR: Thermometer, DISPLAY: Monitor, RELAY: Power, MOTOR: Settings2, PASSIVE: Settings2,
};

export default function ComponentPanel() {
  const { setComponentLibrary } = useCanvasStore();
  const { data } = useQuery({ queryKey: ['components'], queryFn: async () => { const r = await componentApi.getAll(); return r.data.data; } });

  useEffect(() => { if (data) setComponentLibrary(data); }, [data, setComponentLibrary]);

  const grouped = (data || []).reduce((acc: Record<string, ElectronicComponent[]>, c) => {
    const cat = c.category; if (!acc[cat]) acc[cat] = []; acc[cat].push(c); return acc;
  }, {});

  const addToCanvas = (component: ElectronicComponent) => {
    const pins = Object.entries(component.pinConfig || {}).map(([name], idx) => ({
      id: `${component.id}_pin_${idx}`, name, x: idx % 2 === 0 ? 0 : 120, y: 30 + Math.floor(idx / 2) * 20, type: 'bidirectional' as const,
    }));
    const node: CanvasNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      componentId: component.id, type: component.type, name: component.name,
      x: 200 + Math.random() * 200, y: 100 + Math.random() * 200, width: 120, height: 80, rotation: 0,
      properties: component.defaultProperties || {}, pins,
    };
    useCanvasStore.getState().addNode(node);
  };

  return (
    <div className="w-64 glass border-r border-white/5 h-full overflow-y-auto">
      <div className="p-4 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white">Components</h3>
        <p className="text-xs text-surface-400 mt-1">Drag to add to canvas</p>
      </div>
      <div className="p-2">
        {Object.entries(grouped).map(([category, components]) => {
          const Icon = categoryIcons[category] || Cpu;
          return (
            <div key={category} className="mb-3">
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-surface-400 uppercase tracking-wider">
                <Icon className="w-3.5 h-3.5" /> {category}
              </div>
              {components.map((comp) => (
                <motion.button key={comp.id} whileHover={{ x: 4 }} onClick={() => addToCanvas(comp)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-7 h-7 rounded-md bg-surface-800 flex items-center justify-center flex-shrink-0 group-hover:bg-volt-500/10">
                    <Cpu className="w-3.5 h-3.5 text-surface-400 group-hover:text-volt-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-surface-200 truncate">{comp.name}</p>
                    <p className="text-[10px] text-surface-500">{comp.type.replace(/_/g, ' ')}</p>
                  </div>
                  {comp.isPremium && <span className="ml-auto text-[9px] bg-forge-500/10 text-forge-400 px-1.5 py-0.5 rounded">PRO</span>}
                </motion.button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
