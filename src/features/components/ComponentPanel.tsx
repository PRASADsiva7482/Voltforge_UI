import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Cpu, Zap, Thermometer, Monitor, Power, Settings2, Search } from 'lucide-react';
import { componentApi } from '../../api/services';
import { useCanvasStore } from '../../store/canvasStore';
import { componentDimensions } from '../canvas/componentSvgs';
import type { ElectronicComponent, CanvasNode } from '../../types';
import { useState } from 'react';

const categoryIcons: Record<string, any> = {
  BOARD: Cpu, LED: Zap, SENSOR: Thermometer, DISPLAY: Monitor, RELAY: Power, MOTOR: Settings2, PASSIVE: Settings2,
};

export default function ComponentPanel() {
  const { setComponentLibrary } = useCanvasStore();
  const [search, setSearch] = useState('');
  const { data } = useQuery({ queryKey: ['components'], queryFn: async () => { const r = await componentApi.getAll(); return r.data.data; } });

  useEffect(() => { if (data) setComponentLibrary(data); }, [data, setComponentLibrary]);

  const filtered = (data || []).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.type.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc: Record<string, ElectronicComponent[]>, c) => {
    const cat = c.category; if (!acc[cat]) acc[cat] = []; acc[cat].push(c); return acc;
  }, {});

  const addToCanvas = (component: ElectronicComponent) => {
    const dim = componentDimensions[component.type] || { w: 100, h: 60 };

    const pins = Object.entries(component.pinConfig || {}).map(([name], idx) => {
      let px: number, py: number;
      const total = Object.keys(component.pinConfig || {}).length;
      if (component.type.includes('ARDUINO') || component.type.includes('ESP')) {
        px = idx % 2 === 0 ? 0 : dim.w;
        py = 20 + Math.floor(idx / 2) * 15;
      } else if (component.type.includes('LED_STANDARD') || component.type.includes('LED_RGB')) {
        px = (dim.w / (total + 1)) * (idx + 1);
        py = dim.h;
      } else if (component.type === 'RESISTOR') {
        px = idx === 0 ? 0 : dim.w;
        py = dim.h / 2;
      } else {
        px = (dim.w / (total + 1)) * (idx + 1);
        py = dim.h;
      }
      return { id: `${component.id}_pin_${idx}`, name, x: px, y: py, type: 'bidirectional' as const };
    });

    const node: CanvasNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      componentId: component.id, type: component.type, name: component.name,
      x: 200 + Math.random() * 200, y: 100 + Math.random() * 200,
      width: dim.w, height: dim.h, rotation: 0,
      properties: component.defaultProperties || {}, pins,
    };
    useCanvasStore.getState().addNode(node);
  };

  return (
    <div className="w-56 glass border-r border-white/5 h-full overflow-y-auto flex flex-col">
      <div className="p-3 border-b border-white/5">
        <h3 className="text-xs font-semibold text-white mb-2">Components</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-surface-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="w-full pl-7 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-volt-500/50" />
        </div>
      </div>
      <div className="p-2 flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([category, components]) => {
          const Icon = categoryIcons[category] || Cpu;
          return (
            <div key={category} className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">
                <Icon className="w-3 h-3" /> {category}
              </div>
              {components.map((comp) => (
                <motion.button key={comp.id} whileHover={{ x: 3 }} onClick={() => addToCanvas(comp)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-6 h-6 rounded bg-surface-800 flex items-center justify-center flex-shrink-0 group-hover:bg-volt-500/10">
                    <Cpu className="w-3 h-3 text-surface-400 group-hover:text-volt-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-surface-200 truncate">{comp.name}</p>
                    <p className="text-[9px] text-surface-500">{comp.type.replace(/_/g, ' ')}</p>
                  </div>
                  {comp.isPremium && <span className="ml-auto text-[8px] bg-forge-500/10 text-forge-400 px-1 py-0.5 rounded">PRO</span>}
                </motion.button>
              ))}
            </div>
          );
        })}
        {Object.keys(grouped).length === 0 && <p className="text-xs text-surface-500 text-center py-4">No components found</p>}
      </div>
    </div>
  );
}
