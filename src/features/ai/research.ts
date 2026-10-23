/** Server capability contract; never infer availability from a local preference. */
export interface ResearchRequest {
  mode: 'off' | 'auto' | 'on'
  publicQuery?: string
  consentToExternalQuery: boolean
  documentIds: string[]
}

export interface ResearchCapability {
  state: 'disabled' | 'unavailable' | 'available' | 'temporarily_failing'
  available: boolean
  configured: boolean
  code: string
  message: string
  supportedModes?: ResearchRequest['mode'][]
}

export interface ResearchCapabilities {
  contractVersion: string
  web: ResearchCapability
  documents: ResearchCapability
}
