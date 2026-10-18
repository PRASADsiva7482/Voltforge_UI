/** Transient, explicit attachment. Never stored separately from a sent chat. */
export interface ExecutionAttachment {
  id: string
  projectId: string
  runId: string | null
  boardType: string | null
  phase: string
  baudRate: number
  output: string[]
  diagnostic: string | null
}
