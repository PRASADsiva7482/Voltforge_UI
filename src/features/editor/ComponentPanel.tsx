import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu, Zap, Thermometer, Monitor, Power, Settings2, Search, Radio, BatteryCharging, Plus, ChevronDown, ChevronRight, Gauge, Binary } from 'lucide-react';
import { aiApi, componentApi } from '../../api/services';
import { useCanvasStore } from '../../store/canvasStore';
import { createCanvasNodeFromComponent } from '../canvas/componentFactory';
import { mergeComponentLibrary } from '../canvas/componentCatalog';
import type { ElectronicComponent } from '../../types/domain';
import CustomComponentStudio from '../components/CustomComponentStudio';
import { aiComponentCoverageStatusClass, aiComponentCoverageStatusLabel } from '../ai/aiHardwareCoverage';

const categoryIcons: Record<string, React.FC<{ size?: number }>> = {
  BOARD: Cpu, LOGIC: Binary, LED: Zap, SENSOR: Thermometer, DISPLAY: Monitor,
  RELAY: Power, MOTOR: Settings2, PASSIVE: Settings2,
  COMMUNICATION: Radio, POWER: BatteryCharging, INSTRUMENT: Gauge,
};

const categoryOrder = ['BOARD', 'PASSIVE', 'LOGIC', 'LED', 'SENSOR', 'DISPLAY', 'MOTOR', 'RELAY', 'COMMUNICATION', 'POWER', 'INSTRUMENT'];

export default function ComponentPanel({ readOnly }: { readOnly?: boolean }) {
  const { setComponentLibrary } = useCanvasStore();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [studioOpen, setStudioOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['components'],
    queryFn: async () => { const r = await componentApi.getAll(); return r.data.data; }
  });

  const componentCoverageQuery = useQuery({
    queryKey: ['ai', 'component-coverage'],
    queryFn: () => aiApi.getComponentCoverage().then((response) => response.data.data),
  });

  const componentLibrary = useMemo(() => mergeComponentLibrary(data || []), [data]);
  const componentCoverageByType = useMemo(
    () => new Map(
      (componentCoverageQuery.data?.entries ?? []).map((entry) => [entry.componentType, entry])
    ),
    [componentCoverageQuery.data]
  );

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
    const { viewport } = useCanvasStore.getState();
    const spawnX = (300 - viewport.x) / viewport.scale;
    const spawnY = (250 - viewport.y) / viewport.scale;

    const node = createCanvasNodeFromComponent(component, { x: spawnX, y: spawnY });
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
      <div className="vf-component-panel__coverage-summary" role="status" aria-live="polite">
        {componentCoverageQuery.isLoading
          ? 'Checking AI component coverage...'
          : componentCoverageQuery.isError
            ? 'AI component coverage unavailable'
            : `${componentCoverageQuery.data?.summary.verified ?? 0} exact / ${componentCoverageQuery.data?.summary.variantRequired ?? 0} require a variant / ${componentCoverageQuery.data?.summary.simulationOnly ?? 0} simulation-only`}
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
                  {components.map((comp) => {
                    const coverage = componentCoverageByType.get(comp.type);
                    return (
                      <button
                        key={comp.id}
                        onClick={() => addToCanvas(comp)}
                        disabled={readOnly}
                        className="vf-component-panel__item"
                        style={readOnly ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                        title={coverage?.reason}
                      >
                      <div className="vf-component-panel__item-icon">
                        <Cpu size={12} />
                      </div>
                      <div className="vf-component-panel__item-info">
                        <span className="vf-component-panel__item-name">{comp.name}</span>
                        <span className="vf-component-panel__item-type">{comp.type.replace(/_/g, ' ')}</span>
                      </div>
                      {coverage && (
                        <span
                          className={`vf-component-panel__coverage-badge ${aiComponentCoverageStatusClass(coverage.status)}`}
                        >
                          {aiComponentCoverageStatusLabel(coverage.status)}
                        </span>
                      )}
                      {comp.isPremium && (
                        <span className="vf-component-panel__pro-badge">PRO</span>
                      )}
                      </button>
                    );
                  })}
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
