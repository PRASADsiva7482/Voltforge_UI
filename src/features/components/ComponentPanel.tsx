import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Cpu, Zap, Thermometer, Monitor, Power, Settings2, Search, Radio, BatteryCharging, Plus } from 'lucide-react';
import { componentApi } from '../../api/services';
import { useCanvasStore } from '../../store/canvasStore';
import { componentDimensions } from '../canvas/componentSvgs';
import { getPinsForComponent } from '../canvas/pinRegistry';
import type { ElectronicComponent, CanvasNode } from '../../types';
import CustomComponentStudio from './CustomComponentStudio';

const categoryIcons: Record<string, any> = {
  BOARD: Cpu, LED: Zap, SENSOR: Thermometer, DISPLAY: Monitor,
  RELAY: Power, MOTOR: Settings2, PASSIVE: Settings2,
  COMMUNICATION: Radio, POWER: BatteryCharging,
};

const categoryOrder = ['BOARD', 'PASSIVE', 'LED', 'SENSOR', 'DISPLAY', 'MOTOR', 'RELAY', 'COMMUNICATION', 'POWER'];

export default function ComponentPanel() {
  const { setComponentLibrary } = useCanvasStore();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [studioOpen, setStudioOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['components'],
    queryFn: async () => { const r = await componentApi.getAll(); return r.data.data; }
  });

  useEffect(() => { if (data) setComponentLibrary(data); }, [data, setComponentLibrary]);

  const filtered = (data || []).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.type.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc: Record<string, ElectronicComponent[]>, c) => {
    const cat = c.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {});

  // Sort categories by predefined order
  const sortedCategories = Object.keys(grouped).sort((a, b) =>
    (categoryOrder.indexOf(a) ?? 99) - (categoryOrder.indexOf(b) ?? 99)
  );

  const addToCanvas = (component: ElectronicComponent) => {
    const dim = componentDimensions[component.type] || {
      w: Number(component.defaultProperties?.width || 120),
      h: Number(component.defaultProperties?.height || 90),
    };

    // Use pin registry for accurate pin positions
    const pins = getPinsForComponent(component.type, component.pinConfig as Record<string, unknown>, dim.w, dim.h);

    const node: CanvasNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      componentId: component.id,
      type: component.type,
      name: component.name,
      x: 200 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      width: dim.w, height: dim.h,
      rotation: 0,
      properties: { ...(component.defaultProperties || {}), svgData: component.svgData },
      pins,
    };
    useCanvasStore.getState().addNode(node);
  };

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="w-56 glass border-r border-white/5 h-full overflow-y-auto flex flex-col">
      <CustomComponentStudio isOpen={studioOpen} onClose={() => setStudioOpen(false)} />
      <div className="p-3 border-b border-white/5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white">Components</h3>
          <button onClick={() => setStudioOpen(true)} className="rounded-md p-1 text-surface-400 hover:bg-white/5 hover:text-white" title="Create custom component">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-surface-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-volt-500/50"
          />
        </div>
      </div>
      <div className="p-2 flex-1 overflow-y-auto">
        {sortedCategories.map((category) => {
          const components = grouped[category];
          const Icon = categoryIcons[category] || Cpu;
          const isCollapsed = collapsed[category];
          return (
            <div key={category} className="mb-1">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold text-surface-400 uppercase tracking-wider hover:text-surface-200 transition-colors"
              >
                <Icon className="w-3 h-3" />
                <span className="flex-1 text-left">{category}</span>
                <span className="text-[8px] bg-surface-800 px-1 py-0.5 rounded text-surface-500">{components.length}</span>
                <span className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>▾</span>
              </button>
              {!isCollapsed && components.map((comp) => (
                <motion.button key={comp.id} whileHover={{ x: 3 }}
                  onClick={() => addToCanvas(comp)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <div className="w-6 h-6 rounded bg-surface-800 flex items-center justify-center flex-shrink-0 group-hover:bg-volt-500/10">
                    <Cpu className="w-3 h-3 text-surface-400 group-hover:text-volt-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-surface-200 truncate">{comp.name}</p>
                    <p className="text-[9px] text-surface-500">{comp.type.replace(/_/g, ' ')}</p>
                  </div>
                  {comp.isPremium && (
                    <span className="text-[8px] bg-forge-500/10 text-forge-400 px-1 py-0.5 rounded">PRO</span>
                  )}
                </motion.button>
              ))}
            </div>
          );
        })}
        {sortedCategories.length === 0 && (
          <p className="text-xs text-surface-500 text-center py-4">No components found</p>
        )}
      </div>
    </div>
  );
}
