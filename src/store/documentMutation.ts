import type { CanvasNode } from '../types/domain'

export function shallowDocumentEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && Object.is(left[key], right[key]))
}

// A user operation often spreads the live node, including simulator feedback.
// Apply only its actual changes to the authored node. Runtime writes never call
// this path; authored/custom properties and imported values need no denylist.
function applyAuthoredDelta<T extends object>(authored: T, previousLive: T, nextLive: T): T {
  const result = { ...authored } as Record<string, unknown>
  const previous = previousLive as Record<string, unknown>, next = nextLive as Record<string, unknown>
  let changed = false
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (Object.is(previous[key], next[key]) && Object.hasOwn(previous, key) === Object.hasOwn(next, key)) continue
    changed = true
    if (Object.hasOwn(next, key)) result[key] = next[key]
    else delete result[key]
  }
  return changed ? result as T : authored
}

export function reconcileAuthoredNodes(authored: CanvasNode[], previous: CanvasNode[], next: CanvasNode[], previousIndex: ReadonlyMap<string, number>): CanvasNode[] {
  if (previous === next) return authored
  const result = next.map(node => {
    // Authored and live arrays share their ID order. Reuse the store's index
    // instead of building two full maps on each drag frame.
    const index = previousIndex.get(node.id)
    const baseline = index === undefined ? undefined : authored[index]
    const oldLive = index === undefined ? undefined : previous[index]
    if (!baseline || !oldLive) return node
    if (node === oldLive) return baseline
    const properties = applyAuthoredDelta(baseline.properties, oldLive.properties, node.properties)
    const updated = applyAuthoredDelta(baseline, oldLive, { ...node, properties: oldLive.properties })
    return properties === baseline.properties ? updated : { ...updated, properties }
  })
  return result.length === authored.length && result.every((node, index) => node === authored[index]) ? authored : result
}
