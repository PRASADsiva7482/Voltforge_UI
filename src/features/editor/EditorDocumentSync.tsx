import { memo, useEffect, useLayoutEffect } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { usePcbStore } from '../../store/pcbStore'
import { useProjectStore } from '../../store/projectStore'
import type { useCollaboration } from '../../hooks/useCollaboration'

interface EditorDocumentSyncProps {
  isOwner: boolean
  broadcastEnabled: boolean
  broadcastCanvasSync: ReturnType<typeof useCollaboration>['broadcastCanvasSync']
}

// Gate on local revisions before dirty/transport work. Runtime, hydration and
// derived PCB state do not tick them. No serialization or React sample commits.
function EditorDocumentSync({
  isOwner, broadcastEnabled, broadcastCanvasSync,
}: EditorDocumentSyncProps) {
  useLayoutEffect(() => {
    const onChange = (next: { localDocumentRevision: number }, previous: { localDocumentRevision: number }) => {
      if (next.localDocumentRevision === previous.localDocumentRevision || !isOwner) return
      const project = useProjectStore.getState()
      if (!project.isDirty) project.setDirty(true)
      if (broadcastEnabled) broadcastCanvasSync()
    }
    const canvas = useCanvasStore.subscribe(onChange), pcb = usePcbStore.subscribe(onChange)
    // Reconnect can publish pending real edits; clean loads never send.
    if (broadcastEnabled && isOwner && useProjectStore.getState().isDirty) broadcastCanvasSync()
    return () => { canvas(); pcb() }
  }, [isOwner, broadcastEnabled, broadcastCanvasSync])

  return null
}

export default memo(EditorDocumentSync)

export function EditorDirtyIndicator() {
  const isDirty = useProjectStore((state) => state.isDirty)
  return isDirty ? <span className="vf-editor__dirty-dot" /> : null
}

export const EditorAutosave = memo(function EditorAutosave({ enabled, onSave }: {
  enabled: boolean
  onSave: () => void
}) {
  const isDirty = useProjectStore((state) => state.isDirty)
  useEffect(() => {
    if (!enabled || !isDirty) return
    const timer = window.setInterval(onSave, 10000)
    return () => window.clearInterval(timer)
  }, [enabled, isDirty, onSave])
  return null
})
