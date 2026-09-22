import { useCallback, useEffect, useRef } from 'react'
import type { SimulationEngine } from './SimulationEngine'
import type { DeferredSimulationCallbacks } from './deferredSimulationEngineFactory'

export class SimulationEngineLoadCancelledError extends Error {
  constructor() {
    super('Simulation engine load was cancelled')
    this.name = 'SimulationEngineLoadCancelledError'
  }
}

export function useDeferredSimulationEngine(callbacks: DeferredSimulationCallbacks) {
  const callbacksRef = useRef(callbacks)
  const engineRef = useRef<SimulationEngine | null>(null)
  const loadingRef = useRef<Promise<SimulationEngine> | null>(null)
  const lifecycleRef = useRef(0)
  callbacksRef.current = callbacks

  const getSimulationEngine = useCallback(() => {
    if (engineRef.current) return Promise.resolve(engineRef.current)
    if (loadingRef.current) return loadingRef.current

    const lifecycle = lifecycleRef.current
    const loading = import('./deferredSimulationEngineFactory').then(({ createSimulationEngine }) => {
      const engine = createSimulationEngine({
        onSerialOutput: (text, options) => callbacksRef.current.onSerialOutput(text, options),
        onBaudRateChange: (baudRate) => callbacksRef.current.onBaudRateChange?.(baudRate),
        onDebugSnapshot: (snapshot) => callbacksRef.current.onDebugSnapshot?.(snapshot),
        onError: (error) => callbacksRef.current.onError(error),
      })

      if (lifecycle !== lifecycleRef.current) {
        engine.stop()
        throw new SimulationEngineLoadCancelledError()
      }

      engineRef.current = engine
      return engine
    }).finally(() => {
      if (loadingRef.current === loading) loadingRef.current = null
    })

    loadingRef.current = loading
    return loading
  }, [])

  const stopSimulationEngine = useCallback(() => {
    engineRef.current?.stop()
  }, [])

  useEffect(() => () => {
    lifecycleRef.current += 1
    engineRef.current?.stop()
    engineRef.current = null
    loadingRef.current = null
  }, [])

  return { engineRef, getSimulationEngine, stopSimulationEngine }
}
