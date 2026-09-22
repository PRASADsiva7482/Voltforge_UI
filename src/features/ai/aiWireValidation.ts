import type { AiWireSuggestion, CanvasNode, PinPosition } from '../../types/domain';

function findPin(node: CanvasNode | undefined, reference: string): PinPosition | undefined {
  return node?.pins.find((pin) => pin.id === reference || pin.name === reference);
}

/**
 * Validate the minimum electrical contract before an AI wire mutates the
 * canvas. The simulator remains permissive for manual experimentation, but
 * AI actions should not create the most dangerous obvious mismatches.
 */
export function validateAiWire(nodes: CanvasNode[], suggestion: AiWireSuggestion): string | null {
  const fromNode = nodes.find((node) => node.id === suggestion.fromComponentId);
  const toNode = nodes.find((node) => node.id === suggestion.toComponentId);
  if (!fromNode || !toNode) return 'AI suggested a component that is not present on this canvas.';
  if (fromNode.id === toNode.id) return 'A component cannot be wired to itself.';

  const fromPin = findPin(fromNode, suggestion.fromPin);
  const toPin = findPin(toNode, suggestion.toPin);
  if (!fromPin || !toPin) return 'AI suggested a pin that is not present on this canvas.';

  if ((fromPin.type === 'power' && toPin.type === 'ground')
    || (fromPin.type === 'ground' && toPin.type === 'power')) {
    return 'Direct power-to-ground connections are blocked by the AI safety validator.';
  }
  if (fromPin.type === 'output' && toPin.type === 'output') {
    return 'Two output pins cannot be connected directly.';
  }
  if (fromPin.type === 'input' && toPin.type === 'input') {
    return 'Two input-only pins cannot be connected directly.';
  }

  return null;
}
