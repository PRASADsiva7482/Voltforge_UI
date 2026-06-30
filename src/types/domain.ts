import type { AppUser, UserRole } from './auth'

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
export type BoardType = 'ARDUINO_UNO' | 'ARDUINO_MEGA' | 'ARDUINO_NANO' | 'ESP32' | 'ESP32_S3' | 'ESP8266'
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
  componentTypes?: string[]
  prompt: string
}

export type AiWireSuggestion = {
  color: string
  description: string
  fromComponentId: string
  fromPin: string
  toComponentId: string
  toPin: string
}

export type AiGenerateResponse = {
  canvasLayout?: Record<string, unknown>
  componentConfig?: Record<string, unknown>
  generatedCode?: string
  message: string
  status: string
  wireSuggestions?: AiWireSuggestion[]
}

export type AiChatRequest = {
  context?: string
  history?: { content: string; role: 'user' | 'assistant' }[]
  message: string
}

export type AiChatResponse = {
  generatedCode?: string
  hasCode: boolean
  reply: string
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
