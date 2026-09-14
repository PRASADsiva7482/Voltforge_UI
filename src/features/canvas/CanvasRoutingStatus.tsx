import { memo } from 'react';
import { useCanvasStore } from '../../store/canvasStore';

export default memo(function CanvasRoutingStatus() {
  const status = useCanvasStore(state => state.routingStatus);
  const retry = useCanvasStore(state => state.retryCanvasRouting);
  if (status.phase !== 'routing' && status.phase !== 'error') return null;
  return <div className="vf-canvas-routing" role="status" aria-live="polite">
    {status.phase === 'routing'
      ? `Preparing wires (${status.completed}/${status.total})…`
      : <>Wire layout could not finish. <button type="button" onClick={retry}>Retry wire layout</button></>}
  </div>;
});
