import { useEffect, useRef } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { AudioEngine } from '../simulator/AudioEngine';
import { CanvasAudioState } from './canvasAudioState';

export function CanvasAudioBridge({ isSimulating = false }: { isSimulating?: boolean }) {
  const state = useRef<CanvasAudioState | null>(null);
  if (!state.current) state.current = new CanvasAudioState(AudioEngine);
  useEffect(() => {
    const audio = state.current!;
    audio.update(useCanvasStore.getState().nodes, isSimulating);
    return useCanvasStore.subscribe((next, previous) => {
      if (next.nodes !== previous.nodes) audio.update(next.nodes, isSimulating);
    });
  }, [isSimulating]);
  useEffect(() => () => state.current?.dispose(), []);
  return null;
}
