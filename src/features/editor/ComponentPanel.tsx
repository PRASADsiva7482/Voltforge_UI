import { lazy, memo, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu, Zap, Thermometer, Monitor, Power, Settings2, Search, Radio, BatteryCharging, Plus, ChevronDown, ChevronRight, Gauge, Binary } from 'lucide-react';
import { aiApi, componentApi } from '../../api/services';
import { useCanvasStore } from '../../store/canvasStore';
import { createCanvasNodeFromComponent } from '../canvas/componentFactory';
import { mergeComponentLibrary } from '../canvas/componentCatalog';
import type { AiComponentCoverageEntry, ElectronicComponent } from '../../types/domain';
import { aiComponentCoverageStatusClass, aiComponentCoverageStatusLabel } from '../ai/aiHardwareCoverage';
import { buildPaletteIndex, filterPaletteIndex, getPalettePage, normalizePaletteSearch } from './componentPalette';

const CustomComponentStudio = lazy(() => import('../components/CustomComponentStudio'));

const StudioLauncher = memo(function ComponentStudioLauncher({ readOnly }: { readOnly?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => { if (readOnly) close(); }, [readOnly, close]);
  return <>
    {!readOnly && <button
      onClick={() => { setLoaded(true); setOpen(true); }}
      className="vf-panel-header__btn"
      title="Create custom component"
      aria-label="Create custom component"
      type="button"
    ><Plus size={14} /></button>}
    {loaded && <Suspense fallback={<span role="status">Loading component studio…</span>}>
      {/* Keep the first-opened studio mounted so closing it retains the draft. */}
      <CustomComponentStudio isOpen={open && !readOnly} onClose={close} />
    </Suspense>}
  </>;
});

const categoryIcons: Record<string, React.FC<{ size?: number }>> = {
  BOARD: Cpu, LOGIC: Binary, LED: Zap, SENSOR: Thermometer, DISPLAY: Monitor,
  RELAY: Power, MOTOR: Settings2, PASSIVE: Settings2,
  COMMUNICATION: Radio, POWER: BatteryCharging, INSTRUMENT: Gauge,
};

const PaletteItem = memo(function PaletteItem({ component, coverage, readOnly, onAdd }: {
  component: ElectronicComponent;
  coverage?: AiComponentCoverageEntry;
  readOnly?: boolean;
  onAdd: (component: ElectronicComponent) => void;
}) {
  return <button
    type="button"
    data-component-type={component.type}
    onClick={() => onAdd(component)}
    disabled={readOnly}
    className="vf-component-panel__item"
    style={readOnly ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
    title={coverage?.reason}
  >
    <div className="vf-component-panel__item-icon"><Cpu size={12} /></div>
    <div className="vf-component-panel__item-info">
      <span className="vf-component-panel__item-name">{component.name}</span>
      <span className="vf-component-panel__item-type">{component.type.replace(/_/g, ' ')}</span>
    </div>
    {coverage && <span className={`vf-component-panel__coverage-badge ${aiComponentCoverageStatusClass(coverage.status)}`}>
      {aiComponentCoverageStatusLabel(coverage.status)}
    </span>}
    {component.isPremium && <span className="vf-component-panel__pro-badge">PRO</span>}
  </button>;
});

function ComponentPanel({ readOnly }: { readOnly?: boolean }) {
  const setComponentLibrary = useCanvasStore((state) => state.setComponentLibrary);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [requestedPage, setRequestedPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

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

  const index = useMemo(() => buildPaletteIndex(componentLibrary), [componentLibrary]);
  const categories = useMemo(() => [...new Set(index.map(entry => entry.component.category))], [index]);
  const selectedCategory = categories.some(value => value === category) ? category : '';
  const normalizedSearch = normalizePaletteSearch(search);
  const filtered = useMemo(() => filterPaletteIndex(index, normalizedSearch, selectedCategory), [index, normalizedSearch, selectedCategory]);
  const page = useMemo(() => getPalettePage(filtered, requestedPage), [filtered, requestedPage]);
  useLayoutEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [page.page, normalizedSearch, selectedCategory]);
  // A shrinking catalogue must not leave an out-of-range page in state.
  useEffect(() => { if (requestedPage !== page.page) setRequestedPage(page.page); }, [requestedPage, page.page]);
  const changePage = (next: number) => {
    setRequestedPage(next);
    listRef.current?.focus();
  };

  const addToCanvas = useCallback((component: ElectronicComponent) => {
    if (readOnly) return;
    const { viewport } = useCanvasStore.getState();
    const spawnX = (300 - viewport.x) / viewport.scale;
    const spawnY = (250 - viewport.y) / viewport.scale;

    const node = createCanvasNodeFromComponent(component, { x: spawnX, y: spawnY });
    useCanvasStore.getState().addNode(node);
  }, [readOnly]);

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="vf-component-panel">
      <div className="vf-component-panel__header">
        <h3 className="vf-component-panel__title">Components</h3>
        <StudioLauncher readOnly={readOnly} />
      </div>
      <div className="vf-component-panel__search">

        <Search size={14} />
        <input
          type="text"
          placeholder="Search components..."
          aria-label="Search components"
          aria-controls={listId}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setRequestedPage(0); }}
          className="vf-component-panel__input"
        />
      </div>
      <select
        className="vf-component-panel__category-select"
        aria-label="Browse component category"
        aria-controls={listId}
        value={normalizedSearch ? '' : selectedCategory}
        disabled={Boolean(normalizedSearch)}
        onChange={(event) => {
          const value = event.target.value;
          setCategory(value); setRequestedPage(0);
          setCollapsed(previous => ({ ...previous, [value]: false }));
        }}
      >
        <option value="">{normalizedSearch ? 'Searching all categories' : 'All categories'}</option>
        {categories.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <div className="vf-component-panel__coverage-summary" role="status" aria-live="polite">
        {componentCoverageQuery.isLoading
          ? 'Checking AI component coverage...'
          : componentCoverageQuery.isError
            ? 'AI component coverage unavailable'
            : `${componentCoverageQuery.data?.summary.verified ?? 0} exact / ${componentCoverageQuery.data?.summary.variantRequired ?? 0} require a variant / ${componentCoverageQuery.data?.summary.simulationOnly ?? 0} simulation-only`}
      </div>
      <div className="vf-component-panel__list" ref={listRef} id={listId} tabIndex={-1} role="region" aria-label="Component results">
        {[...page.groups].map(([category, components]) => {
          const Icon = categoryIcons[category] || Cpu;
          // Search must reveal matches even in a previously collapsed category.
          const isCollapsed = !normalizedSearch && Boolean(collapsed[category]);
          const categoryId = `${listId}-${category}`;
          return (
            <div key={category} className="vf-component-panel__category">
              <button
                className="vf-component-panel__category-header"
                onClick={() => toggleCategory(category)}
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={categoryId}
                disabled={Boolean(normalizedSearch)}
              >
                <Icon size={14} />
                <span>{category}</span>
                <span className="vf-component-panel__count" title="Components on this page">{components.length}</span>
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
              <div className="vf-component-panel__items" id={categoryId} hidden={isCollapsed}>
                {!isCollapsed && components.map(component => <PaletteItem
                  key={component.id}
                  component={component}
                  coverage={componentCoverageByType.get(component.type)}
                  readOnly={readOnly}
                  onAdd={addToCanvas}
                />)}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="vf-component-panel__empty">No components found</p>
        )}
      </div>
      <div className="vf-component-panel__pagination">
        <span role="status" aria-live="polite" aria-atomic="true">
          {filtered.length ? `${page.start + 1}–${page.end} of ${filtered.length}` : '0 components'}
        </span>
        {page.pageCount > 1 && <div className="vf-component-panel__page-buttons">
          <button type="button" aria-label="Previous components" aria-controls={listId} disabled={page.page === 0} onClick={() => changePage(page.page - 1)}>Previous</button>
          <button type="button" aria-label="Next components" aria-controls={listId} disabled={page.page === page.pageCount - 1} onClick={() => changePage(page.page + 1)}>Next</button>
        </div>}
      </div>
    </div>
  );
}

export default memo(ComponentPanel);
