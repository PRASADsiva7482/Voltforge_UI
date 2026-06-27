import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Cpu, Zap, Thermometer, Monitor, Power, Settings2, Search, Radio, BatteryCharging, Plus, ChevronDown } from 'lucide-react';
import { componentApi } from '../../api/services';
import { useCanvasStore } from '../../store/canvasStore';
import { componentDimensions } from '../canvas/componentSvgs';
import { getPinsForComponent } from '../canvas/pinRegistry';
import type { ElectronicComponent, CanvasNode } from '../../types';
import CustomComponentStudio from './CustomComponentStudio';
import VfSearchInput from '../../components/ui/VfSearchInput';
import VfCollapsible from '../../components/ui/VfCollapsible';
import { useTranslation } from 'react-i18next';

const categoryIcons: Record<string, any> = {
  BOARD: Cpu, LED: Zap, SENSOR: Thermometer, DISPLAY: Monitor,
  RELAY: Power, MOTOR: Settings2, PASSIVE: Settings2,
  COMMUNICATION: Radio, POWER: BatteryCharging,
};

const categoryOrder = ['BOARD', 'PASSIVE', 'LED', 'SENSOR', 'DISPLAY', 'MOTOR', 'RELAY', 'COMMUNICATION', 'POWER'];

export default function ComponentPanel() {
  const { t } = useTranslation();
  const { setComponentLibrary } = useCanvasStore();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [studioOpen, setStudioOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['components'],
    queryFn: async () => { const r = await componentApi.getAll(); return r.data.data; }
  });

  useEffect(() => { if (data) setComponentLibrary(data); }, [data, setComponentLibrary]);

  const filtered = [...(data || [])]
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
    .filter(c =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.type.toLowerCase().includes(search.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(search.toLowerCase())
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

    const { viewport } = useCanvasStore.getState();
    const spawnX = (300 - viewport.x) / viewport.scale;
    const spawnY = (250 - viewport.y) / viewport.scale;

    const node: CanvasNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      componentId: component.id,
      type: component.type,
      name: component.name,
      x: spawnX,
      y: spawnY,
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
    <div className="w-56 glass border-r border-surface-200/70 h-full flex flex-col dark:border-white/5">
      <CustomComponentStudio isOpen={studioOpen} onClose={() => setStudioOpen(false)} />
      <div className="p-3 border-b border-surface-200/70 dark:border-white/5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-surface-955 dark:text-white">{t("Components")}</h3>
          <button onClick={() => setStudioOpen(true)} className="rounded-md p-1 text-surface-500 hover:bg-surface-100 hover:text-surface-950 dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white" title={t("Create custom component")}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <VfSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("Search...")}
          hotkey="/"
        />
      </div>
      <div className="p-2 flex-1 overflow-y-auto">
        {sortedCategories.map((category) => {
          const components = grouped[category];
          const Icon = categoryIcons[category] || Cpu;
          const isCollapsed = collapsed[category];
          return (
            <VfCollapsible
              key={category}
              isOpen={!isCollapsed}
              onToggle={() => toggleCategory(category)}
              title={t(category)}
              icon={<Icon className="w-3.5 h-3.5" />}
              actions={
                <span className="text-[8px] bg-slate-100 dark:bg-surface-800 px-1 py-0.5 rounded text-slate-500 dark:text-slate-400 font-bold">
                  {components.length}
                </span>
              }
              headerClassName="!bg-transparent border-none px-2 py-1"
              bodyClassName="p-0 space-y-0.5"
            >
              {components.map((comp) => (
                <motion.button key={comp.id} whileHover={{ x: 3 }}
                  onClick={() => addToCanvas(comp)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-lg hover:bg-surface-100 transition-colors group dark:hover:bg-white/5 outline-none cursor-pointer"
                >
                  <div className="w-6 h-6 rounded bg-surface-100 flex items-center justify-center flex-shrink-0 group-hover:bg-volt-500/10 dark:bg-surface-800">
                    <Cpu className="w-3 h-3 text-surface-500 group-hover:text-volt-500 dark:text-surface-400 dark:group-hover:text-volt-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-surface-800 truncate dark:text-surface-200">{t(comp.name)}</p>
                    <p className="text-[9px] text-surface-500">{t(comp.type.replace(/_/g, ' '))}</p>
                  </div>
                  {comp.isPremium && (
                    <span className="text-[8px] bg-forge-500/10 text-forge-400 px-1 py-0.5 rounded font-bold">PRO</span>
                  )}
                </motion.button>
              ))}
            </VfCollapsible>
          );
        })}
        {sortedCategories.length === 0 && (
          <p className="text-xs text-surface-500 text-center py-4">{t("No components found")}</p>
        )}
      </div>
    </div>
  );
}
