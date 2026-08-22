import type { CanvasNode, ElectronicComponent, PinPosition } from '../../types/domain';
import { findCatalogComponent } from './componentCatalog';
import { componentDimensions } from './componentSvgs';
import { getPinsForComponent } from './pinRegistry';

const FALLBACK_DIMENSIONS = { w: 120, h: 90 };

export type CanvasNodeSeed = Partial<CanvasNode> & {
  id: string;
  name?: string;
  type: string;
};

type DimensionSource = {
  defaultProperties?: Record<string, unknown>;
  height?: unknown;
  width?: unknown;
};

type CreateNodeOptions = {
  componentId?: string;
  height?: number;
  id?: string;
  name?: string;
  pins?: PinPosition[];
  properties?: Record<string, unknown>;
  rotation?: number;
  width?: number;
  x: number;
  y: number;
};

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatTypeName(type: string): string {
  return type
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function resolveComponentDimensions(type: string, source: DimensionSource = {}): { h: number; w: number } {
  const canonical = componentDimensions[type];
  const defaults = source.defaultProperties || {};

  return {
    h: finiteNumber(source.height) ?? canonical?.h ?? finiteNumber(defaults.height) ?? FALLBACK_DIMENSIONS.h,
    w: finiteNumber(source.width) ?? canonical?.w ?? finiteNumber(defaults.width) ?? FALLBACK_DIMENSIONS.w,
  };
}

function resolveComponent(type: string, library: ElectronicComponent[]): ElectronicComponent | undefined {
  return library.find((component) => component.type === type) || findCatalogComponent(type);
}

function clonePins(pins?: PinPosition[]): PinPosition[] {
  if (!Array.isArray(pins)) return [];
  return pins
    .filter((pin) => pin && typeof pin.id === 'string')
    .map((pin) => ({
      ...pin,
      x: finiteNumber(pin.x) ?? 0,
      y: finiteNumber(pin.y) ?? 0,
    }));
}

function resolvePins(
  node: Pick<CanvasNodeSeed, 'pins' | 'type'>,
  component: ElectronicComponent | undefined,
  width: number,
  height: number
): PinPosition[] {
  const existingPins = clonePins(node.pins);
  const canonicalPins = getPinsForComponent(
    node.type,
    component?.pinConfig as Record<string, unknown> | undefined,
    width,
    height
  );

  // Older saved projects contain real, user-connected pin IDs that are not
  // present in the current catalog profile (for example RELAY_SINGLE used
  // coil1/coil2 before the module profile was introduced). Replacing those
  // pins makes the canvas lose the wire anchors; the netlist can still
  // resolve the legacy aliases, so keep that pinout intact when it is found.
  if (existingPins.length > 0 && canonicalPins.length > 0) {
    const canonicalIds = new Set(canonicalPins.map((pin) => pin.id));
    const hasLegacyPin = existingPins.some((pin) => !canonicalIds.has(pin.id));
    if (hasLegacyPin) return existingPins;
  }

  if (canonicalPins.length > 0 && componentDimensions[node.type]) {
    return canonicalPins;
  }

  return existingPins.length > 0 ? existingPins : canonicalPins;
}

export function hydrateCanvasNode(seed: CanvasNodeSeed, componentLibrary: ElectronicComponent[] = []): CanvasNode {
  const component = resolveComponent(seed.type, componentLibrary);
  const baseProperties = component?.defaultProperties || {};
  const properties: Record<string, unknown> = {
    ...baseProperties,
    ...(seed.properties || {}),
  };

  if (component?.svgData && properties.svgData === undefined) {
    properties.svgData = component.svgData;
  }

  const dimensions = resolveComponentDimensions(seed.type, {
    defaultProperties: properties,
    height: seed.height,
    width: seed.width,
  });

  return {
    componentId: seed.componentId || component?.id || seed.id,
    height: dimensions.h,
    id: seed.id,
    name: seed.name || component?.name || formatTypeName(seed.type),
    pins: resolvePins(seed, component, dimensions.w, dimensions.h),
    properties,
    rotation: finiteNumber(seed.rotation) ?? 0,
    type: seed.type,
    width: dimensions.w,
    x: finiteNumber(seed.x) ?? 0,
    y: finiteNumber(seed.y) ?? 0,
  };
}

export function createCanvasNodeFromComponent(component: ElectronicComponent, options: CreateNodeOptions): CanvasNode {
  return hydrateCanvasNode(
    {
      componentId: options.componentId || component.id,
      height: options.height,
      id: options.id || `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: options.name || component.name,
      pins: options.pins,
      properties: {
        ...(component.defaultProperties || {}),
        ...(component.svgData ? { svgData: component.svgData } : {}),
        ...(options.properties || {}),
      },
      rotation: options.rotation,
      type: component.type,
      width: options.width,
      x: options.x,
      y: options.y,
    },
    [component]
  );
}
