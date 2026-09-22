import { useCanvasStore } from '../../store/canvasStore'
import { usePcbStore } from '../../store/pcbStore'
import { useProjectStore } from '../../store/projectStore'

// Same UTF-8 JSON request budget enforced by ProjectRequestBodyAdvice in BL.
export const MAX_PROJECT_SAVE_BYTES = 4 * 1024 * 1024

export function exceedsProjectSaveBudget(payload: unknown) {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_PROJECT_SAVE_BYTES
}

export function captureEditorDocument() {
  const canvas = useCanvasStore.getState(), pcb = usePcbStore.getState(), project = useProjectStore.getState()
  if (!project.currentProject) return null
  return {
    projectId: project.currentProject.id,
    session: project.documentSession,
    revision: { canvas: canvas.localDocumentRevision, pcb: pcb.localDocumentRevision, code: project.codeRevision },
    payload: {
      canvasLayout: { nodes: canvas.documentNodes, wires: canvas.wires, viewport: canvas.viewport, routeCache: canvas.routeCache },
      componentConfig: { ...(project.currentProject.componentConfig || {}), pcbLayout: pcb.getLayout() },
      codeFiles: project.currentProject.codeFiles.map(({ content, filename, language, sortOrder }) => ({ content, filename, language, sortOrder })),
      expectedRevision: project.currentProject.documentRevision,
    },
  }
}

export function isCurrentDocumentSession(snapshot: NonNullable<ReturnType<typeof captureEditorDocument>>) {
  const project = useProjectStore.getState()
  return project.currentProject?.id === snapshot.projectId && project.documentSession === snapshot.session
}

export function hasEditsSince(snapshot: NonNullable<ReturnType<typeof captureEditorDocument>>) {
  return useCanvasStore.getState().localDocumentRevision !== snapshot.revision.canvas
    || usePcbStore.getState().localDocumentRevision !== snapshot.revision.pcb
    || useProjectStore.getState().codeRevision !== snapshot.revision.code
}
