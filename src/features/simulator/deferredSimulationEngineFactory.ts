import { useCanvasStore } from '../../store/canvasStore'
import { SimulationEngine, type SimulationCallbacks } from './SimulationEngine'
import { LogicRegistry } from './logic/LogicRegistry'

export type DeferredSimulationCallbacks = Omit<SimulationCallbacks, 'onPinStateChange'>

export function createSimulationEngine(callbacks: DeferredSimulationCallbacks) {
  return new SimulationEngine({
    ...callbacks,
    onPinStateChange: (componentId, pinId, state, value) => {
      const node = useCanvasStore.getState().nodes.find((item) => item.id === componentId)
      if (node) LogicRegistry.dispatch(node.type, componentId, pinId, state, value)
    },
  })
}
