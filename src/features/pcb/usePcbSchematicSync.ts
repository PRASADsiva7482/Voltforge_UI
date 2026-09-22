import { useEffect } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { usePcbStore } from '../../store/pcbStore';

/** Subscribe outside React so schematic geometry and runtime feedback do not render the PCB scene. */
export function usePcbSchematicSync() {
  useEffect(() => {
    const disconnect = usePcbStore.getState().connectSchematic(() => {
      const { documentNodes: nodes, wires } = useCanvasStore.getState();
      return { nodes, wires };
    });
    const unsubscribe = useCanvasStore.subscribe((state, previous) => {
      if (state.documentNodes !== previous.documentNodes || state.wires !== previous.wires) {
        usePcbStore.getState().requestSchematicSync();
      }
    });
    return () => { unsubscribe(); disconnect(); };
  }, []);
}
