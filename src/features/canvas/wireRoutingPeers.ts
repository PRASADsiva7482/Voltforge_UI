import type { Wire } from './canvasTypes';
import { componentPairKey } from '../../utils/wireRouting';

/** Only component-pair membership determines the smart-router lane offset.
 * Stable peer lists keep unrelated edits from invalidating every wire renderer.
 * Own wire bends/color/labels remain supplied separately as the current wire. */
export class WireRoutingPeerCache {
  private previous = new Map<string, Wire[]>();
  update(wires: Wire[]): ReadonlyMap<string, Wire[]> {
    const next = new Map<string, Wire[]>();
    for (const wire of wires) {
      const key = componentPairKey(wire), group = next.get(key);
      if (group) group.push(wire); else next.set(key, [wire]);
    }
    for (const [key, group] of next) {
      const old = this.previous.get(key);
      if (old && old.length === group.length && old.every((wire, i) => wire.id === group[i].id)) next.set(key, old);
    }
    this.previous = next;
    return next;
  }
}
