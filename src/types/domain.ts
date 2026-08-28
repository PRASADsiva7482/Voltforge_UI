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

export type UpdateProjectRequest = Partial<CreateProjectRequest>

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
  snippet?: string
  title: string
  url?: string
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
  boardType?: BoardType | string
  canvasData?: Record<string, unknown>
  canvasContext?: string
  code?: string
  components?: unknown[]
  context?: string
  files?: { content: string; filename: string; language: string }[]
  history?: { content: string; role: 'user' | 'assistant' }[]
  message: string
  netlist?: Record<string, unknown>
  projectId?: string
  sessionId?: string
  simulationState?: Record<string, unknown>
  wires?: unknown[]
}

export type AiChatResponse = {
  additions?: AiAction[]
  citations?: AiCitation[]
  codeFixes?: AiCodeFix[]
  confidence?: number
  generatedCode?: string
  hasCode: boolean
  reply: string
  removals?: AiAction[]
  valueChanges?: AiAction[]
  wireSuggestions?: AiWireSuggestion[]
}

export type AiValidationIssue = {
  componentId: string
  message: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | string
  suggestedFix?: string
}

export type AiValidationResponse = {
  additions?: AiAction[]
  codeFixes?: AiCodeFix[]
  confidence?: number
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
