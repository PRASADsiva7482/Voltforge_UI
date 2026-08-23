/** Hierarchical schematic packing and deterministic flattening. */

import type { CanvasNode, Wire, PinPosition } from '../../types/domain';

export interface SubCircuitConnection {
  nodeId: string;
  pinId: string;
}

export interface SubCircuitDefinition {
  id: string;
  name: string;
  internalNodes: CanvasNode[];
  internalWires: Wire[];
  exposedPins: PinPosition[];
  exposedConnections?: Record<string, SubCircuitConnection>;
  packageWidth?: number;
  packageHeight?: number;
}

function endpointKey(nodeId: string, pinId: string): string {
  return `${nodeId}:${pinId}`;
}

function isSubCircuit(node: CanvasNode): boolean {
  return node.type === 'SUB_CIRCUIT' && Boolean(node.properties?.subCircuitDef);
}

export class SubCircuitEngine {
  /** Return the visible top-level component that owns each flattened component. */
  static componentOwnerMap(nodes: CanvasNode[]): Map<string, string> {
    const owners = new Map<string, string>();

    const visit = (node: CanvasNode, ownerId: string) => {
      const definition = node.type === 'SUB_CIRCUIT'
        ? node.properties?.subCircuitDef as SubCircuitDefinition | undefined
        : undefined;
      if (!definition) {
        owners.set(node.id, ownerId);
        return;
      }
      for (const internalNode of definition.internalNodes || []) {
        visit(internalNode, ownerId);
      }
    };

    for (const node of nodes) visit(node, node.id);
    return owners;
  }

  /**
   * Project solved internal terminal nodes onto the visible black-box pins.
   * This keeps probes, meter readings, and diagnostics useful after flattening.
   */
  static projectExposedPins(
    nodes: CanvasNode[],
    pinToMNANode: Map<string, number>,
  ) {
    const resolve = (node: CanvasNode, pinId: string): { nodeId: string; pinId: string } | undefined => {
      let currentNode = node;
      let currentPin = pinId;
      const visited = new Set<string>();

      while (currentNode.type === 'SUB_CIRCUIT') {
        const key = `${currentNode.id}:${currentPin}`;
        if (visited.has(key)) return undefined;
        visited.add(key);

        const definition = currentNode.properties?.subCircuitDef as SubCircuitDefinition | undefined;
        const connection = definition?.exposedConnections?.[currentPin];
        if (!connection) return undefined;
        const nextNode = definition?.internalNodes?.find((candidate) => candidate.id === connection.nodeId);
        if (!nextNode) return connection;
        currentNode = nextNode;
        currentPin = connection.pinId;
      }

      return { nodeId: currentNode.id, pinId: currentPin };
    };

    for (const node of nodes) {
      if (node.type !== 'SUB_CIRCUIT') continue;
      for (const pin of node.pins || []) {
        const resolved = resolve(node, pin.id);
        if (!resolved) continue;
        const mnaNode = pinToMNANode.get(`${resolved.nodeId}:${resolved.pinId}`);
        if (mnaNode !== undefined) pinToMNANode.set(`${node.id}:${pin.id}`, mnaNode);
      }
    }
  }

  /** Pack selected nodes while preserving every external terminal identity. */
  static packToSubCircuit(
    selectedNodeIds: string[],
    allNodes: CanvasNode[],
    allWires: Wire[],
    subCircuitName = 'SubCircuit_Module',
  ): { compoundNode: CanvasNode; remainingWires: Wire[] } {
    const selected = new Set(selectedNodeIds);
    const selectedNodes = allNodes.filter((node) => selected.has(node.id));
    if (selectedNodes.length === 0) {
      throw new Error('Cannot create a subcircuit without selected components');
    }

    const internalWires = allWires.filter((wire) => selected.has(wire.fromNodeId) && selected.has(wire.toNodeId));
    const externalWires = allWires.filter((wire) =>
      selected.has(wire.fromNodeId) !== selected.has(wire.toNodeId),
    );
    const subCircuitId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const internalIdMap = new Map(selectedNodes.map((node) => [node.id, `${subCircuitId}__${node.id}`]));
    const exposedPins: PinPosition[] = [];
    const exposedConnections: Record<string, SubCircuitConnection> = {};
    const exposedPinByEndpoint = new Map<string, string>();

    const expose = (nodeId: string, pinId: string, side: 'left' | 'right') => {
      const endpoint = endpointKey(nodeId, pinId);
      const existing = exposedPinByEndpoint.get(endpoint);
      if (existing) return existing;
      const node = selectedNodes.find((item) => item.id === nodeId);
      const pin = node?.pins.find((item) => item.id === pinId);
      if (!node || !pin) return undefined;

      const exposedId = `subpin_${exposedPins.length + 1}`;
      exposedPinByEndpoint.set(endpoint, exposedId);
      exposedConnections[exposedId] = {
        nodeId: internalIdMap.get(nodeId) || nodeId,
        pinId,
      };
      exposedPins.push({
        ...pin,
        id: exposedId,
        name: `${node.name}.${pin.name}`,
        x: side === 'left' ? 0 : 140,
        y: (exposedPins.length + 1) * 20,
      });
      return exposedId;
    };

    for (const wire of externalWires) {
      if (selected.has(wire.fromNodeId)) expose(wire.fromNodeId, wire.fromPinId, 'right');
      if (selected.has(wire.toNodeId)) expose(wire.toNodeId, wire.toPinId, 'left');
    }

    const minX = Math.min(...selectedNodes.map((node) => node.x));
    const minY = Math.min(...selectedNodes.map((node) => node.y));
    const internalNodes = selectedNodes.map((node) => ({
      ...node,
      id: internalIdMap.get(node.id) || node.id,
      componentId: internalIdMap.get(node.id) || node.componentId,
    }));
    const internalWireIds = new Set(internalWires.map((wire) => wire.id));
    const namespacedInternalWires = internalWires.map((wire) => ({
      ...wire,
      id: `${subCircuitId}__${wire.id}`,
      fromNodeId: internalIdMap.get(wire.fromNodeId) || wire.fromNodeId,
      toNodeId: internalIdMap.get(wire.toNodeId) || wire.toNodeId,
    }));

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
          internalNodes,
          internalWires: namespacedInternalWires,
          exposedPins,
          exposedConnections,
        } satisfies SubCircuitDefinition,
      },
    };

    const remainingWires = allWires
      .filter((wire) => !internalWireIds.has(wire.id))
      .map((wire) => {
        if (selected.has(wire.fromNodeId)) {
          const pinId = expose(wire.fromNodeId, wire.fromPinId, 'right');
          return pinId ? { ...wire, fromNodeId: subCircuitId, fromPinId: pinId } : wire;
        }
        if (selected.has(wire.toNodeId)) {
          const pinId = expose(wire.toNodeId, wire.toPinId, 'left');
          return pinId ? { ...wire, toNodeId: subCircuitId, toPinId: pinId } : wire;
        }
        return wire;
      });

    return { compoundNode, remainingWires };
  }

  /** Flatten nested subcircuits, reconnecting compound terminals explicitly. */
  static flattenSchematic(
    nodes: CanvasNode[],
    wires: Wire[],
  ): { flatNodes: CanvasNode[]; flatWires: Wire[] } {
    let flatNodes = [...nodes];
    let flatWires = [...wires];
    let expanded = true;

    while (expanded) {
      expanded = false;
      for (const compound of flatNodes) {
        if (!isSubCircuit(compound)) continue;
        const definition = compound.properties.subCircuitDef as SubCircuitDefinition;
        const connections = definition.exposedConnections || {};
        const externalWires = flatWires.filter((wire) =>
          wire.fromNodeId === compound.id || wire.toNodeId === compound.id,
        );

        flatWires = flatWires
          .filter((wire) => wire.fromNodeId !== compound.id && wire.toNodeId !== compound.id)
          .concat(definition.internalWires || []);

        for (const wire of externalWires) {
          const replaceEndpoint = (nodeId: string, pinId: string): { nodeId: string; pinId: string } => {
            if (nodeId !== compound.id) return { nodeId, pinId };
            const connection = connections[pinId];
            return connection || { nodeId, pinId };
          };
          const from = replaceEndpoint(wire.fromNodeId, wire.fromPinId);
          const to = replaceEndpoint(wire.toNodeId, wire.toPinId);
          flatWires.push({ ...wire, fromNodeId: from.nodeId, fromPinId: from.pinId, toNodeId: to.nodeId, toPinId: to.pinId });
        }

        flatNodes = flatNodes
          .filter((node) => node.id !== compound.id)
          .concat(definition.internalNodes || []);
        expanded = true;
        break;
      }
    }

    return { flatNodes, flatWires };
  }
}
