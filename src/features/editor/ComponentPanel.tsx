import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu, Zap, Thermometer, Monitor, Power, Settings2, Search, Radio, BatteryCharging, Plus, ChevronDown, ChevronRight, Gauge } from 'lucide-react';
import { componentApi } from '../../api/services';
import { useCanvasStore } from '../../store/canvasStore';
import { BOARD_CATALOG } from '../canvas/boardCatalog';
import { componentDimensions } from '../canvas/componentSvgs';
import { getPinsForComponent } from '../canvas/pinRegistry';
import type { ElectronicComponent, CanvasNode } from '../../types/domain';
import CustomComponentStudio from '../components/CustomComponentStudio';

const categoryIcons: Record<string, React.FC<{ size?: number }>> = {
  BOARD: Cpu, LED: Zap, SENSOR: Thermometer, DISPLAY: Monitor,
  RELAY: Power, MOTOR: Settings2, PASSIVE: Settings2,
  COMMUNICATION: Radio, POWER: BatteryCharging, INSTRUMENT: Gauge,
};

const categoryOrder = ['BOARD', 'PASSIVE', 'LED', 'SENSOR', 'DISPLAY', 'MOTOR', 'RELAY', 'COMMUNICATION', 'POWER', 'INSTRUMENT'];

const catalogBoardComponents: ElectronicComponent[] = BOARD_CATALOG.map((board) => ({
  category: 'BOARD',
  createdAt: '',
  defaultProperties: {
    clockSpeed: board.clock,
    compilerSupport: board.compiler,
    family: board.family,
    features: board.features,
    logicVoltage: board.logicVoltage,
  },
  description: `${board.family} board with ${board.features.join(', ')}.`,
  id: `catalog_${board.type}`,
  isPremium: false,
  name: board.name,
  pinConfig: { footprint: board.footprint, pinProfile: board.type },
  sortOrder: board.sortOrder,
  type: board.type,
  updatedAt: '',
}));

function mergeComponentLibrary(apiComponents: ElectronicComponent[] = []) {
  const byType = new Map<string, ElectronicComponent>();
  catalogBoardComponents.forEach((component) => byType.set(component.type, component));
  apiComponents.forEach((component) => byType.set(component.type, component));
  return Array.from(byType.values());
}

export default function ComponentPanel({ readOnly }: { readOnly?: boolean }) {
  const { setComponentLibrary } = useCanvasStore();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [studioOpen, setStudioOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['components'],
    queryFn: async () => { const r = await componentApi.getAll(); return r.data.data; }
  });

  const componentLibrary = useMemo(() => mergeComponentLibrary(data || []), [data]);

  useEffect(() => { setComponentLibrary(componentLibrary); }, [componentLibrary, setComponentLibrary]);

  const filtered = [...componentLibrary]
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

  const sortedCategories = Object.keys(grouped).sort((a, b) =>
    (categoryOrder.indexOf(a) ?? 99) - (categoryOrder.indexOf(b) ?? 99)
  );

  const addToCanvas = (component: ElectronicComponent) => {
    if (readOnly) return;
    const dim = componentDimensions[component.type] || {
      w: Number(component.defaultProperties?.width || 120),
      h: Number(component.defaultProperties?.height || 90),
    };

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
    <div className="vf-component-panel">
      <CustomComponentStudio isOpen={studioOpen} onClose={() => setStudioOpen(false)} />
      <div className="vf-component-panel__header">
        <h3 className="vf-component-panel__title">Components</h3>
        {!readOnly && (
          <button
            onClick={() => setStudioOpen(true)}
            className="vf-panel-header__btn"
            title="Create custom component"
            type="button"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="vf-component-panel__search">

        <Search size={14} />
        <input
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="vf-component-panel__input"
        />
      </div>
      <div className="vf-component-panel__list">
        {sortedCategories.map((category) => {
          const components = grouped[category];
          const Icon = categoryIcons[category] || Cpu;
          const isCollapsed = collapsed[category];
          return (
            <div key={category} className="vf-component-panel__category">
              <button
                className="vf-component-panel__category-header"
                onClick={() => toggleCategory(category)}
              >
                <Icon size={14} />
                <span>{category}</span>
                <span className="vf-component-panel__count">{components.length}</span>
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
              {!isCollapsed && (
                <div className="vf-component-panel__items">
                  {components.map((comp) => (
                    <button
                      key={comp.id}
                      onClick={() => addToCanvas(comp)}
                      disabled={readOnly}
                      className="vf-component-panel__item"
                      style={readOnly ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                    >
                      <div className="vf-component-panel__item-icon">
                        <Cpu size={12} />
                      </div>
                      <div className="vf-component-panel__item-info">
                        <span className="vf-component-panel__item-name">{comp.name}</span>
                        <span className="vf-component-panel__item-type">{comp.type.replace(/_/g, ' ')}</span>
                      </div>
                      {comp.isPremium && (
                        <span className="vf-component-panel__pro-badge">PRO</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {sortedCategories.length === 0 && (
          <p className="vf-component-panel__empty">No components found</p>
        )}
      </div>
    </div>
  );
}
