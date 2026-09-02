import type { AppUser, UserRole } from './auth'

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
export type BoardType =
  | 'ADAFRUIT_FEATHER_ESP32'
  | 'ADAFRUIT_FEATHER_M0'
  | 'ADAFRUIT_FEATHER_M4'
  | 'ADAFRUIT_FEATHER_NRF52840'
  | 'ADAFRUIT_FEATHER_RP2040'
  | 'ARDUINO_DUE'
  | 'ARDUINO_GIGA_R1'
  | 'ARDUINO_LEONARDO'
  | 'ARDUINO_MEGA'
  | 'ARDUINO_MICRO'
  | 'ARDUINO_NANO'
  | 'ARDUINO_NANO_33_IOT'
  | 'ARDUINO_NANO_EVERY'
  | 'ARDUINO_PORTENTA_H7'
  | 'ARDUINO_UNO'
  | 'ARDUINO_UNO_R4'
  | 'ATMEL_AVR_ATMEGA328P'
  | 'ATMEL_AVR_ATTINY'
  | 'ESP32'
  | 'ESP32_C3'
  | 'ESP32_C6'
  | 'ESP32_H2'
  | 'ESP32_LILYGO'
  | 'ESP32_M5STACK'
  | 'ESP32_S2'
  | 'ESP32_S3'
  | 'ESP32_TTGO'
  | 'ESP32_WROOM'
  | 'ESP32_WROVER'
  | 'ESP8266'
  | 'ESP8266_ESP01'
  | 'ESP8266_ESP12E'
  | 'ESP8266_WEMOS_D1_MINI'
  | 'RASPBERRY_PI_PICO'
  | 'RASPBERRY_PI_PICO_2'
  | 'RASPBERRY_PI_PICO_W'
  | 'SEEED_XIAO_ESP32C3'
  | 'SEEED_XIAO_ESP32S3'
  | 'SEEED_XIAO_NRF52840'
  | 'SEEED_XIAO_RP2040'
  | 'SEEED_XIAO_SAMD21'
  | 'SPARKFUN_THING_PLUS_ARTEMIS'
  | 'SPARKFUN_THING_PLUS_ESP32'
  | 'SPARKFUN_THING_PLUS_RP2040'
  | 'STM32_BLACK_PILL'
  | 'STM32_BLUE_PILL'
  | 'TEENSY_4_0'
  | 'TEENSY_4_1'
  | 'TEENSY_LC'
export type ComponentCategory =
  | 'BOARD'
  | 'LED'
  | 'SENSOR'
  | 'DISPLAY'
  | 'RELAY'
  | 'MOTOR'
  | 'PASSIVE'
  | 'COMMUNICATION'
  | 'POWER'
  | 'INSTRUMENT'
  | 'LOGIC'

export type ApiResponse<T> = {
  data: T
  errorCode?: string
  message: string
  success: boolean
  timestamp: string
}

export type PagedResponse<T> = {
  content: T[]
  first: boolean
  last: boolean
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export type User = AppUser & {
  accountStatus: AccountStatus
  avatarUrl?: string
  bio?: string
  createdAt: string
  email: string
  id: string
  keycloakId: string
  role: UserRole
  updatedAt: string
}

export type PinPosition = {
  electrical?: Record<string, unknown>
  id: string
  name: string
  type: 'input' | 'output' | 'bidirectional' | 'power' | 'ground'
  x: number
  y: number
}

export type WireBendPoint = {
  x: number
  y: number
}

export type CanvasNode = {
  componentId: string
  height: number
  id: string
  name: string
  pins: PinPosition[]
  properties: Record<string, unknown>
  rotation: number
  type: string
  width: number
  x: number
  y: number
}

export type Wire = {
  bendPoints: WireBendPoint[]
  color: string
  fromNodeId: string
  fromPinId: string
  id: string
  label?: string
  routingMode: 'straight' | 'orthogonal' | 'curved' | 'auto'
  toNodeId: string
  toPinId: string
}

export type CanvasLayout = {
  nodes: CanvasNode[]
  viewport: { scale: number; x: number; y: number }
  wires: Wire[]
}

export type CodeFile = {
  content: string
  createdAt: string
  filename: string
  id: string
  language: string
  sortOrder: number
  updatedAt: string
}

export type Project = {
  boardType: BoardType
  canvasLayout?: CanvasLayout
  codeFiles: CodeFile[]
  componentConfig?: Record<string, unknown>
  createdAt: string
  description?: string
  forkCount: number
  forkedFromId?: string
  forkedFromName?: string
  userForkId?: string
  id: string
  isPublic: boolean
  name: string
  owner: User
  tags?: string
  thumbnailUrl?: string
  updatedAt: string
  viewCount: number
}

export type ProjectSummary = Omit<Project, 'canvasLayout' | 'codeFiles' | 'componentConfig'>

export type ElectronicComponent = {
  category: ComponentCategory
  createdAt: string
  defaultProperties?: Record<string, unknown>
  description?: string
  iconUrl?: string
  id: string
  isPremium: boolean
  name: string
  pinConfig?: Record<string, unknown>
  sortOrder: number
  svgData?: string
  type: string
}

export type DashboardStats = {
  activeUsers: number
  newProjectsToday: number
  newUsersToday: number
  publicProjects: number
  roleBreakdown: Record<string, number>
  totalProjects: number
  totalUsers: number
}

export type CreateProjectRequest = {
  boardType?: BoardType
  canvasLayout?: Record<string, unknown>
  codeFiles?: { content: string; filename: string; language?: string; sortOrder?: number }[]
  componentConfig?: Record<string, unknown>
  description?: string
  isPublic?: boolean
  name: string
  tags?: string
}

export type UpdateProjectRequest = Partial<CreateProjectRequest> & {
  /** Optimistic-concurrency token from the last persisted project revision. */
  expectedRevision?: string
}

export type UpdateProfileRequest = {
  avatarUrl?: string
  bio?: string
  displayName?: string
}

export type CustomComponentRequest = {
  category?: ComponentCategory
  description?: string
  height?: number
  name: string
  pins: PinPosition[]
  publishToCommunity?: boolean
  svgData: string
  type?: string
  width?: number
}

export type AiGenerateRequest = {
  boardType?: BoardType
  code?: string
  components?: unknown[]
  componentTypes?: string[]
  context?: string
  prompt: string
  wires?: unknown[]
}

export type AiWireSuggestion = {
  color: string
  description: string
  fromComponentId: string
  fromPin: string
  toComponentId: string
  toPin: string
}

export type AiCitation = {
  authority?: 'project-state' | 'deterministic' | 'retrieved'
  citationId?: string
  claimIds?: string[]
  contentSha256?: string
  evidenceKind?: 'project' | 'deterministic' | 'local' | 'internet'
  evidenceRefs?: string[]
  exactModelEvidence?: true
  locator?: string
  modelPayloadSha256?: string
  recordId?: string
  snippet?: string
  sourceId?: string
  sourceRevision?: string
  sourceTimestamp?: string | null
  supportStatus?: 'supported' | 'conflicted' | 'reference-only'
  title: string
  untrustedContent?: boolean
  url?: string
}

export type AiGroundingClaim = {
  citationIds: string[]
  claimId: string
  claimTypes: ('datasheet-rating' | 'pin-capability' | 'library-api' | 'current-web')[]
  evidenceRefs: string[]
  reasonCode: string
  supportStatus: 'supported' | 'unsupported' | 'conflicted' | 'unknown'
  visibleTextTransformed: boolean
}

export type AiGroundingReport = {
  citationCount: number
  claims: AiGroundingClaim[]
  conflictedClaimCount: number
  conflicts: {
    citationIds: string[]
    claimType: AiGroundingClaim['claimTypes'][number]
    conflictId: string
    evidenceRefs: string[]
    property: string
    subject: string
  }[]
  maximumConfidence: number
  missingEvidence?: string[]
  policyId: 'vfai024-claim-grounding-v1'
  status: 'grounded' | 'uncertain' | 'conflicted' | 'no-high-risk-claims'
  supportedClaimCount: number
  uncertainty: {
    level: 'none' | 'medium' | 'high'
    missingEvidence: string[]
    reasonCode: string
  }
  unsupportedClaimCount: number
  usedEvidenceRefs: string[]
}

export type AiAction = {
  between?: string[]
  componentId?: string
  componentType?: string
  newValue?: unknown
  property?: string
  reason?: string
  type: string
  value?: string
  wireId?: string
}

export type AiCodeFix = {
  description?: string
  from?: string
  line?: number
  to?: string
  type: string
}

export type AiGenerateResponse = {
  additions?: AiAction[]
  canvasLayout?: Record<string, unknown>
  citations?: AiCitation[]
  codeFixes?: AiCodeFix[]
  componentConfig?: Record<string, unknown>
  confidence?: number
  generatedCode?: string
  message: string
  removals?: AiAction[]
  status: string
  wireSuggestions?: AiWireSuggestion[]
}

export type AiChatRequest = {
  contractVersion?: '1.0.0'
  schemaVersion?: 1
  boardType?: BoardType | string
  canvasData?: Record<string, unknown>
  canvasContext?: string
  code?: string
  components?: unknown[]
  context?: string
  diagnostics?: Record<string, unknown>[]
  files?: { content: string; filename: string; language: string }[]
  history?: { content: string; role: 'user' | 'assistant' }[]
  memory?: Record<string, unknown>[]
  message: string
  netlist?: Record<string, unknown>
  projectId?: string
  projectRevision?: string
  retrievedEvidence?: Record<string, unknown>[]
  sessionId?: string
  simulationState?: Record<string, unknown>
  wires?: unknown[]
}

export type AiChatResponse = {
  artifact?: AiArtifactIdentity
  additions?: AiAction[]
  citations?: AiCitation[]
  codeFixes?: AiCodeFix[]
  confidence?: number
  engineeringAuthority?: AiEngineeringAuthority
  engineeringAuthorityActive?: boolean
  engineeringFindings?: AiEngineeringFinding[]
  generatedCode?: string
  grounding?: AiGroundingReport
  hasCode: boolean
  internetRetrieval?: AiInternetRetrievalStatus
  localRetrieval?: AiLocalRetrievalStatus
  memory?: AiMemoryStatus
  mode?: 'neural-quality-gated' | 'deterministic-fallback' | 'unavailable'
  model?: 'voltforge-local-engine-v1'
  projectRevision?: string
  readiness?: Record<string, unknown>
  requestId?: string
  reply: string
  removals?: AiAction[]
  valueChanges?: AiAction[]
  wireSuggestions?: AiWireSuggestion[]
  contractVersion?: '1.0.0'
  schemaVersion?: 1
  sessionId?: string
}

export type AiHardwareSupportStatus = 'verified' | 'variant-required' | 'unsupported'

export type AiHardwareCoverageEntry = {
  boardType: string
  displayName: string
  family: string
  status: AiHardwareSupportStatus
  reasonCode: string
  reason: string
  recordId?: string
  recordRevision?: string
  variant?: string
}

export type AiHardwareCoverageResponse = {
  schemaVersion: 1
  reportId: string
  reportVersion: string
  uiCatalogVersion: string
  corpusVersion: string
  corpusCatalogSha256: string
  asOfDate: string
  entryCount: number
  summary: {
    verified: number
    variantRequired: number
    unsupported: number
  }
  entries: AiHardwareCoverageEntry[]
  reportSha256: string
}

export type AiComponentSupportStatus =
  | 'verified'
  | 'variant-required'
  | 'simulation-only'
  | 'unsupported'

export type AiComponentCoverageEntry = {
  componentType: string
  displayName: string
  category: string
  status: AiComponentSupportStatus
  reasonCode: string
  reason: string
  selectionGroup: string | null
  selectionRequirements: string[]
  physicalIdentitySelected: boolean
  aiElectricalClaimsAllowed: boolean
  variantGateRecordId?: string
  curatedExactCandidates?: Array<{
    recordId: string
    supportStatus: 'supported' | 'variant-required' | 'reference-only'
    variant: string
  }>
  candidateSelectionRequired?: boolean
}

export type AiComponentCoverageResponse = {
  schemaVersion: 1
  reportId: string
  reportVersion: string
  uiCatalogVersion: string
  corpusVersion: string
  corpusCatalogSha256: string
  asOfDate: string
  entryCount: number
  summary: {
    verified: number
    variantRequired: number
    simulationOnly: number
    unsupported: number
    distinctCuratedExactCandidates: number
  }
  genericLabelsMaySelectCandidate: false
  entries: AiComponentCoverageEntry[]
  reportSha256: string
}

export type AiArtifactIdentity = {
  artifactId?: string | null
  artifactVersion: string
  ready: boolean
  registryRevision?: number | null
  runtimeState: string
}

export type AiSseEvent = {
  artifact: AiArtifactIdentity
  contractVersion: '1.0.0'
  eventId: string
  mode: 'neural-quality-gated' | 'deterministic-fallback' | 'unavailable'
  model: 'voltforge-local-engine-v1'
  payload: Record<string, unknown>
  projectRevision: string
  requestId: string
  schemaVersion: 1
  sequence: number
  sessionId: string
  type: 'start' | 'tool' | 'citation' | 'uncertainty' | 'delta' | 'proposal' | 'complete' | 'error'
}

export type AiMemoryStatus = {
  contractVersion: '1.0.0'
  enabled: boolean
  omittedEntryCount: number
  policyId: 'vfai025-bounded-memory-v1'
  rawContentStoredInMetadata: false
  rawIdentifiersStored: false
  reasonCode: string
  selectedEntryCount: number
  staleEntryCount: number
  status: 'ready' | 'disabled' | 'unavailable'
  trainingUseAllowed: false
}

export type AiMemoryEntry = {
  authority: 'user-memory'
  content: string
  contentSha256: string
  contractVersion: '1.0.0'
  createdAt: string
  expiresAt: string
  kind: 'fact' | 'decision' | 'summary' | 'recent-turn'
  memoryId: string
  modelEvidenceAllowed: false
  projectRevision: string
  redactionApplied: boolean
  schemaVersion: 1
  scope: 'project' | 'session'
  source: 'user-approved' | 'recent-turn-summary'
  staleForProjectRevision: boolean
  trainingUseAllowed: false
  updatedAt: string
  version: number
}

export type AiMemoryState = {
  authenticatedScope: true
  enabled: boolean
  entries: AiMemoryEntry[]
  entryCount: number
  evictedCount: number
  expiredPurgedCount: number
  hiddenReasoningStored: false
  omittedEntryCount: number
  policyId: 'vfai025-bounded-memory-v1'
  projectRevision?: string | null
  rawIdentifiersStored: false
  rawProjectContextStored: false
  reasonCode: string
  staleEntryCount: number
  status: 'ready' | 'disabled' | 'unavailable'
  totalBytes: number
  trainingUseAllowed: false
}

export type AiInternetRetrievalStatus = {
  arbitraryUrlFetchAllowed: false
  blockedResultCount: number
  cacheHit: boolean
  degraded: boolean
  generationDependency: false
  networkAccessed: boolean
  networkAttempted: boolean
  policyId: string
  providerDomain: string
  providerId: string
  rawProjectContextSent: false
  rawProviderPayloadStored: false
  rawQueryStored: false
  reasonCode: string
  retrievedAt?: string | null
  returnedCount: number
  selectedForModelContext?: boolean
  status: 'complete' | 'degraded' | 'disabled' | 'no-results' | 'not-requested'
  trainingUseAllowed: false
  trigger: 'direct-endpoint' | 'explicit-request' | 'local-evidence-insufficient' | 'not-triggered'
  untrustedContent: true
}

export type AiLocalRetrievalStatus = {
  candidateCount?: number
  degraded: boolean
  embeddingsUsed: false
  indexId: string
  indexSha256?: string | null
  indexVersion: string
  networkAccessed: false
  policyId: string
  rawQueryStored: false
  reasonCode: string
  returnedCount: number
  selectedForModelContext?: boolean
  sourceId: string
  sourceRevision: string
  status: 'complete' | 'no-results' | 'unavailable'
}

export type AiLocalRetrievalRequest = {
  boardFilters?: string[]
  componentFilters?: string[]
  maximumResults?: number
  recordTypes?: string[]
  text: string
}

export type AiLocalRetrievalFact = {
  claimId: string
  conditions: string[]
  evidenceRefs: string[]
  factId: string
  pointer: string
  property: string
  status: 'verified' | 'bounded' | 'conditional' | 'unknown'
  unit?: string | null
  value: unknown
}

export type AiLocalRetrievalResult = {
  chunkId: string
  citation: AiCitation
  contentSha256: string
  facts: AiLocalRetrievalFact[]
  matchedTerms: string[]
  rank: number
  recordId: string
  recordType: string
  resultId: string
  score: string
  source: {
    recordId: string
    recordRevision: string
    sourceId: string
    sourceRevision: string
    validFrom: string
  }
  subject: {
    familyId: string
    name: string
    subjectId: string
    variant: string
  }
  supportStatus: 'supported' | 'variant-required' | 'reference-only'
}

export type AiLocalRetrievalResponse = AiLocalRetrievalStatus & {
  contractVersion: string
  filtersApplied: Record<string, string[]>
  networkAccessed: false
  querySha256: string
  responseId: string
  results: AiLocalRetrievalResult[]
  schemaVersion: 1
}

export type AiEngineeringAuthority = {
  applicableToolRuns?: number
  blockingFindings?: number
  criticalFindings?: number
  criticalModelOverrideAllowed: false
  findings?: number
  policyId: string
  policySha256?: string
  rawProjectContentStored: false
  reportId?: string
  sourceProjectRevision?: string
  status: 'pass' | 'review-required' | 'blocked' | 'unavailable' | string
  toolRuns?: number
}

export type AiEngineeringFinding = {
  affectedProjectIds: string[]
  blocking: boolean
  decision: 'violation' | 'warning' | 'unknown'
  evidenceRefs: string[]
  findingId: string
  fix: {
    applicationMode: 'proposal-only'
    evidenceRefs: string[]
    fixId: string
    machineApplicable: boolean
    requiresUserConfirmation: true
    summary: string
  }
  modelOverridePolicy: 'prohibited' | 'not-applicable'
  ruleId: string
  severity: 'CRITICAL' | 'HIGH' | 'WARNING' | 'INFO' | 'UNKNOWN'
  summary: string
}

export type AiValidationIssue = {
  affectedProjectIds?: string[]
  blocking?: boolean
  componentId?: string
  evidenceRefs?: string[]
  findingId?: string
  message: string
  modelOverridePolicy?: 'prohibited' | 'not-applicable'
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | string
  suggestedFix?: string
  type?: string
}

export type AiValidationResponse = {
  additions?: AiAction[]
  codeFixes?: AiCodeFix[]
  confidence?: number
  engineeringAuthority?: AiEngineeringAuthority
  engineeringReport?: Record<string, unknown>
  generalFeedback: string
  isValid: boolean
  issues?: AiValidationIssue[]
  removals?: AiAction[]
  safetyScore: number
  valueChanges?: AiAction[]
  wireSuggestions?: AiWireSuggestion[]
}

export type FirmwareCompileRequest = {
  boardType?: BoardType
  sketchName?: string
  source: string
}

export type FirmwareCompileResponse = {
  boardType: string
  compiler: string
  diagnostics?: string[]
  fqbn: string
  hex?: string
  metadata?: Record<string, unknown>
  stderr?: string
  stdout?: string
  success: boolean
}

export type DebugSnapshot = {
  breakpoints: number[]
  currentLine: number | null
  isPaused: boolean
  pins: Record<string, { mode: string; state: string; value: number }>
  variables: Record<string, number | string>
}
