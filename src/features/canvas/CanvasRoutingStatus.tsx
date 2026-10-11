import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanvasStore } from '../../store/canvasStore';

export default memo(function CanvasRoutingStatus() {
  const { t } = useTranslation();
  const status = useCanvasStore(state => state.routingStatus);
  const retry = useCanvasStore(state => state.retryCanvasRouting);
  if (status.phase !== 'routing' && status.phase !== 'error') return null;
  return <div className="vf-canvas-routing" role="status" aria-live="polite">
    {status.phase === 'routing'
      ? `${t('Preparing wires')} (${status.completed}/${status.total})…`
      : <>{t('Wire layout could not finish.')} <button type="button" onClick={retry}>{t('Retry wire layout')}</button></>}
  </div>;
});
