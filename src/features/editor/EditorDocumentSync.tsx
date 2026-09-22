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
    // Keep the former Live Sync persistence window, but save through the same
    // guarded REST path as the Save button so every write acknowledges a token.
    let debounce = window.setTimeout(onSave, 2000)
    const schedule = () => { window.clearTimeout(debounce); debounce = window.setTimeout(onSave, 2000) }
    const canvas = useCanvasStore.subscribe((next, previous) => {
      if (next.localDocumentRevision !== previous.localDocumentRevision) schedule()
    })
    const pcb = usePcbStore.subscribe((next, previous) => {
      if (next.localDocumentRevision !== previous.localDocumentRevision) schedule()
    })
    const code = useProjectStore.subscribe((next, previous) => {
      if (next.codeRevision !== previous.codeRevision) schedule()
    })
    // Bound the wait during continuous editing and retry transient failures.
    const timer = window.setInterval(onSave, 10000)
    return () => { window.clearTimeout(debounce); window.clearInterval(timer); canvas(); pcb(); code() }
  }, [enabled, isDirty, onSave])
  return null
})
