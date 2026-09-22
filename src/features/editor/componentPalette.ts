import type { ElectronicComponent } from '../../types/domain';

export const PALETTE_PAGE_SIZE = 40;
const categoryOrder = ['BOARD', 'PASSIVE', 'LOGIC', 'LED', 'SENSOR', 'DISPLAY', 'MOTOR', 'RELAY', 'COMMUNICATION', 'POWER', 'INSTRUMENT'];
const categoryRanks = new Map(categoryOrder.map((category, index) => [category, index]));

export interface PaletteEntry {
  component: ElectronicComponent;
  searchText: string;
}

export function normalizePaletteSearch(search: string): string {
  return search.trim().toLowerCase();
}

// Build once per catalogue identity. Searching, pagination and metadata updates
// reuse this ordered index without sorting or normalizing every component again.
export function buildPaletteIndex(components: readonly ElectronicComponent[]): PaletteEntry[] {
  return [...components].sort((a, b) =>
    (categoryRanks.get(a.category) ?? categoryOrder.length) - (categoryRanks.get(b.category) ?? categoryOrder.length)
    || a.category.localeCompare(b.category)
    || a.sortOrder - b.sortOrder
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id)
  ).map(component => ({
    component,
    searchText: [component.name, component.type, component.type.replace(/_/g, ' '), component.description || ''].join('\n').toLowerCase(),
  }));
}

export function filterPaletteIndex(index: PaletteEntry[], normalizedSearch: string, category = ''): PaletteEntry[] {
  // Search covers the full catalogue, even while browsing a single category.
  if (normalizedSearch) return index.filter(entry => entry.searchText.includes(normalizedSearch));
  return category ? index.filter(entry => entry.component.category === category) : index;
}

export function getPalettePage(entries: PaletteEntry[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(entries.length / PALETTE_PAGE_SIZE));
  const page = Math.min(pageCount - 1, Math.max(0, Math.floor(requestedPage) || 0));
  const start = page * PALETTE_PAGE_SIZE;
  const groups = new Map<string, ElectronicComponent[]>();
  for (const { component } of entries.slice(start, start + PALETTE_PAGE_SIZE)) {
    const group = groups.get(component.category);
    if (group) group.push(component);
    else groups.set(component.category, [component]);
  }
  return { page, pageCount, start, end: Math.min(start + PALETTE_PAGE_SIZE, entries.length), groups };
}
