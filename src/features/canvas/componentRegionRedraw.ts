import Konva from 'konva';

type Bounds = { x: number; y: number; width: number; height: number };
type Component = { bounds: Bounds; safe: boolean; nodes: Map<Konva.Node, () => void> };
const intersects = (a: Bounds, b: Bounds) => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
const union = (a: Bounds, b: Bounds): Bounds => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) });
const supported = new Set(['Group', 'Rect', 'Circle', 'Text', 'Line', 'Arc', 'Image']);

// Preserve native transforms/compositing and repaint whole overlapping components
// in document order. No extra bitmap/layer allocations or global Konva patches.
export function installComponentRegionRedraw(layer: Konva.Layer) {
  const original = layer.drawScene, ownDraw = Object.hasOwn(layer, 'drawScene');
  const context = layer.getCanvas().getContext(), clear = context.clear, ownClear = Object.hasOwn(context, 'clear');
  const components = new Map<Konva.Node, Component>(), owners = new Map<Konva.Node, Component>(), dirty = new Set<Konva.Node>();
  const requestLayer = layer._requestDraw, ownLayerRequest = Object.hasOwn(layer, '_requestDraw');
  let previousRoots: Konva.Node[] = [], previousKey = '', full = true, drawing = false, region: Bounds | undefined;
  const invalidate = () => { full = true; layer.batchDraw(); };
  const wrappedLayerRequest = () => { full = true; requestLayer.call(layer); };
  layer._requestDraw = wrappedLayerRequest;
  const wrappedClear: typeof context.clear = function (bounds) {
    if (!drawing) full = true;
    return clear.call(context, bounds || region);
  };
  context.clear = wrappedClear;
  document.fonts?.addEventListener('loadingdone', invalidate);
  document.fonts?.addEventListener('loadingerror', invalidate);

  const scan = (root: Konva.Node, component: Component) => {
    const seen = new Set<Konva.Node>();
    let padding = 2, safe = root.hasName('schematic-component');
    const visit = (node: Konva.Node) => {
      seen.add(node);
      if (!component.nodes.has(node)) {
        const owner = owners.get(node);
        owner?.nodes.get(node)?.(); owner?.nodes.delete(node);
        // Konva setters, child insertion/removal, caching and image load all
        // request a draw through this node method. Keep the original scheduler.
        const request = node._requestDraw, ownRequest = Object.hasOwn(node, '_requestDraw');
        const wrappedRequest = () => { dirty.add(root); request.call(node); };
        node._requestDraw = wrappedRequest;
        owners.set(node, component);
        component.nodes.set(node, () => {
          if (node._requestDraw !== wrappedRequest) return;
          if (ownRequest) node._requestDraw = request;
          else delete (node as unknown as { _requestDraw?: unknown })._requestDraw;
        });
      }
      const attrs = node.attrs;
      if (!supported.has(node.getClassName()) || node.isCached() || node.filters()?.length || node.globalCompositeOperation() !== 'source-over' || attrs.sceneFunc || attrs.clipFunc || attrs.clipWidth || attrs.clipHeight || attrs.fillPatternImage) safe = false;
      if (node instanceof Konva.Image && !(node.image() instanceof HTMLImageElement)) safe = false;
      if (node instanceof Konva.Shape && node.hasShadow()) {
        const scale = node.getAbsoluteScale();
        padding = Math.max(padding, 2 + node.shadowBlur() * Math.max(Math.abs(scale.x), Math.abs(scale.y)));
      }
      if (node instanceof Konva.Container) for (const child of node.getChildren()) visit(child);
    };
    visit(root);
    for (const [node, restore] of component.nodes) if (!seen.has(node)) { restore(); component.nodes.delete(node); owners.delete(node); }
    const rect = root.getClientRect();
    component.bounds = { x: rect.x - padding, y: rect.y - padding, width: rect.width + 2 * padding, height: rect.height + 2 * padding };
    component.safe = safe && Object.values(component.bounds).every(Number.isFinite);
  };

  const wrapped: typeof layer.drawScene = function (canvas, top, buffer) {
    const own = layer.getCanvas();
    if ((canvas && canvas !== own) || top || buffer) return original.call(layer, canvas, top, buffer);
    const roots: Konva.Node[] = layer.getChildren();
    const key = [...layer.getAbsoluteTransform().getMatrix(), own.width, own.height, own.pixelRatio, layer.getAbsoluteOpacity(), Number(layer.isVisible())].join(':');
    const drawAll = () => {
      drawing = true;
      try { return original.call(layer, canvas, top, buffer); }
      catch (error) { full = true; throw error; }
      finally { drawing = false; }
    };
    // Camera changes require a full draw and fresh bounds. Holding the pointer
    // alone does not: animation frames between drag events can reuse the bounds.
    if (key !== previousKey || !layer.clearBeforeDraw() || layer.globalCompositeOperation() !== 'source-over' || layer.isCached() || layer.attrs.clipFunc || layer.attrs.clipWidth || layer.attrs.clipHeight) {
      previousKey = key; full = true;
      return drawAll();
    }
    if (roots.length !== previousRoots.length || roots.some((root, i) => root !== previousRoots[i])) full = true;
    let mustDrawAll = full, damage: Bounds | undefined;
    if (full) {
      for (const [root, component] of components) if (!roots.includes(root)) {
        for (const [node, restore] of component.nodes) { restore(); owners.delete(node); }
        components.delete(root); dirty.delete(root);
      }
      previousRoots = [...roots];
    }
    for (const root of roots) {
      let component = components.get(root);
      const oldBounds = component?.bounds;
      // The last full draw may contain pixels outside an unsupported painter's
      // declared bounds. Clear them fully when that painter is removed.
      if (component && !component.safe) mustDrawAll = true;
      if (!component) {
        component = { bounds: { x: 0, y: 0, width: 0, height: 0 }, safe: false, nodes: new Map() };
        components.set(root, component); full = true; mustDrawAll = true;
      }
      if (full || dirty.has(root)) {
        scan(root, component);
        const bounds = oldBounds ? union(oldBounds, component.bounds) : component.bounds;
        damage = damage ? union(damage, bounds) : bounds;
      }
      if (!component.safe) mustDrawAll = true;
    }
    dirty.clear(); full = false; previousKey = key;
    // An explicit draw without a tracked mutation still refreshes everything.
    if (mustDrawAll || !damage) return drawAll();
    // Clipping buffered glows changes browser shadow rasterization. Instead,
    // expand the clear area to include whole transitive overlap clusters.
    const affected = new Set<Konva.Node>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const root of roots) {
        const bounds = components.get(root)!.bounds;
        if (affected.has(root) || !intersects(bounds, damage)) continue;
        affected.add(root); damage = union(damage, bounds); grew = true;
      }
    }
    const ratio = own.pixelRatio, width = own.width / ratio, height = own.height / ratio;
    const x = Math.max(0, Math.floor(damage.x * ratio) / ratio), y = Math.max(0, Math.floor(damage.y * ratio) / ratio);
    const right = Math.min(width, Math.ceil((damage.x + damage.width) * ratio) / ratio), bottom = Math.min(height, Math.ceil((damage.y + damage.height) * ratio) / ratio);
    region = { x, y, width: right - x, height: bottom - y };
    if (region.width <= 0 || region.height <= 0 || region.width * region.height > width * height * .6) { region = undefined; return drawAll(); }
    const restore: Array<() => void> = [];
    try {
      for (const root of roots) {
        if (affected.has(root)) continue;
        const draw = root.drawScene, ownMethod = Object.hasOwn(root, 'drawScene');
        root.drawScene = function (target, anchor, scratch) {
          if (target === own && !anchor) return this;
          return draw.call(this, target, anchor, scratch);
        };
        restore.push(() => { if (ownMethod) root.drawScene = draw; else delete (root as unknown as { drawScene?: unknown }).drawScene; });
      }
      return drawAll();
    } finally {
      for (const reset of restore) reset();
      region = undefined;
    }
  };
  layer.drawScene = wrapped;
  invalidate();
  return () => {
    if (layer.drawScene === wrapped) {
      if (ownDraw) layer.drawScene = original;
      else delete (layer as unknown as { drawScene?: unknown }).drawScene;
    }
    if (context.clear === wrappedClear) {
      if (ownClear) context.clear = clear;
      else delete (context as unknown as { clear?: unknown }).clear;
    }
    if (layer._requestDraw === wrappedLayerRequest) {
      if (ownLayerRequest) layer._requestDraw = requestLayer;
      else delete (layer as unknown as { _requestDraw?: unknown })._requestDraw;
    }
    for (const component of components.values()) for (const restore of component.nodes.values()) restore();
    document.fonts?.removeEventListener('loadingdone', invalidate);
    document.fonts?.removeEventListener('loadingerror', invalidate);
    components.clear(); owners.clear(); dirty.clear(); previousRoots = [];
    layer.batchDraw();
  };
}
