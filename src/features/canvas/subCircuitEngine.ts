/**
 * Voltforge Sub-Circuit & Hierarchical Schematic Engine
 * Allows packing clusters of components into modular black-box IC blocks.
 */

import type { CanvasNode, Wire, PinPosition } from '../../types/domain';

export interface SubCircuitDefinition {
  id: string;
  name: string;
  internalNodes: CanvasNode[];
  internalWires: Wire[];
  exposedPins: PinPosition[];
  packageWidth?: number;
  packageHeight?: number;
}

export class SubCircuitEngine {
  /**
   * Packs selected nodes and their internal connecting wires into a single compound node.
   */
  static packToSubCircuit(
    selectedNodeIds: string[],
    allNodes: CanvasNode[],
    allWires: Wire[],
    subCircuitName: string = 'SubCircuit_Module'
  ): { compoundNode: CanvasNode; remainingWires: Wire[] } {
    const selectedNodes = allNodes.filter((n) => selectedNodeIds.includes(n.id));
    const internalWires = allWires.filter(
      (w) => selectedNodeIds.includes(w.fromNodeId) && selectedNodeIds.includes(w.toNodeId)
    );
    const externalWires = allWires.filter(
      (w) =>
        (selectedNodeIds.includes(w.fromNodeId) && !selectedNodeIds.includes(w.toNodeId)) ||
        (!selectedNodeIds.includes(w.fromNodeId) && selectedNodeIds.includes(w.toNodeId))
    );

    // Calculate center bounding box
    const minX = Math.min(...selectedNodes.map((n) => n.x));
    const minY = Math.min(...selectedNodes.map((n) => n.y));

    // Identify exposed pins (pins that have wires connecting to the outside world)
    const exposedPins: PinPosition[] = [];
    const pinTracker = new Set<string>();

    externalWires.forEach((w) => {
      if (selectedNodeIds.includes(w.fromNodeId)) {
        const node = selectedNodes.find((n) => n.id === w.fromNodeId);
        const pin = node?.pins?.find((p) => p.id === w.fromPinId);
        if (pin && !pinTracker.has(pin.id)) {
          pinTracker.add(pin.id);
          exposedPins.push({
            id: `sub_${pin.id}`,
            name: `${node?.name || 'U'}.${pin.name}`,
            type: pin.type,
            x: 0,
            y: (exposedPins.length + 1) * 20,
          });
        }
      }
      if (selectedNodeIds.includes(w.toNodeId)) {
        const node = selectedNodes.find((n) => n.id === w.toNodeId);
        const pin = node?.pins?.find((p) => p.id === w.toPinId);
        if (pin && !pinTracker.has(pin.id)) {
          pinTracker.add(pin.id);
          exposedPins.push({
            id: `sub_${pin.id}`,
            name: `${node?.name || 'U'}.${pin.name}`,
            type: pin.type,
            x: 120,
            y: (exposedPins.length + 1) * 20,
          });
        }
      }
    });

    const subCircuitId = `sub_${Date.now()}`;
    const compoundNode: CanvasNode = {
      id: subCircuitId,
      componentId: subCircuitId,
      type: 'SUB_CIRCUIT',
      name: subCircuitName,
      x: minX,
      y: minY,
      width: 140,
      height: Math.max(80, (exposedPins.length + 2) * 20),
      rotation: 0,
      pins: exposedPins,
      properties: {
        isSubCircuit: true,
        subCircuitDef: {
          id: subCircuitId,
          name: subCircuitName,
          internalNodes: selectedNodes,
          internalWires,
          exposedPins,
        },
      },
    };


    // Rewire external wires to the new compound node
    const updatedRemainingWires = allWires
      .filter((w) => !internalWires.includes(w))
      .map((w) => {
        if (selectedNodeIds.includes(w.fromNodeId)) {
          return { ...w, fromNodeId: subCircuitId, fromPinId: `sub_${w.fromPinId}` };
        }
        if (selectedNodeIds.includes(w.toNodeId)) {
          return { ...w, toNodeId: subCircuitId, toPinId: `sub_${w.toPinId}` };
        }
        return w;
      });

    return {
      compoundNode,
      remainingWires: updatedRemainingWires,
    };
  }

  /**
   * Flattens a schematic containing Sub-Circuits into atomic components for simulation.
   */
  static flattenSchematic(
    nodes: CanvasNode[],
    wires: Wire[]
  ): { flatNodes: CanvasNode[]; flatWires: Wire[] } {
    const flatNodes: CanvasNode[] = [];
    const flatWires: Wire[] = [...wires];

    nodes.forEach((node) => {
      if (node.type === 'SUB_CIRCUIT' && node.properties?.subCircuitDef) {
        const def = node.properties.subCircuitDef as SubCircuitDefinition;
        flatNodes.push(...def.internalNodes);
        flatWires.push(...def.internalWires);
      } else {
        flatNodes.push(node);
      }
    });

    return { flatNodes, flatWires };
  }
}
