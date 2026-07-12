import type { AppUser, UserRole } from './auth'

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
export type BoardType =
  | 'ARDUINO_UNO'
  | 'ARDUINO_UNO_R4'
  | 'ARDUINO_NANO'
  | 'ARDUINO_NANO_EVERY'
  | 'ARDUINO_NANO_33_IOT'
  | 'ARDUINO_MEGA'
  | 'ARDUINO_LEONARDO'
  | 'ARDUINO_MICRO'
  | 'ARDUINO_DUE'
  | 'ARDUINO_GIGA_R1'
  | 'ARDUINO_PORTENTA_H7'
  | 'ESP8266'
  | 'ESP8266_WEMOS_D1_MINI'
  | 'ESP8266_ESP01'
  | 'ESP8266_ESP12E'
  | 'ESP32'
  | 'ESP32_WROOM'
  | 'ESP32_WROVER'
  | 'ESP32_S2'
  | 'ESP32_S3'
  | 'ESP32_C3'
  | 'ESP32_C6'
  | 'ESP32_H2'
  | 'ESP32_TTGO'
  | 'ESP32_LILYGO'
  | 'ESP32_M5STACK'
  | 'RASPBERRY_PI_PICO'
  | 'RASPBERRY_PI_PICO_W'
  | 'RASPBERRY_PI_PICO_2'
  | 'RASPBERRY_PI_ZERO_2_W'
  | 'RASPBERRY_PI_3'
  | 'RASPBERRY_PI_4'
  | 'RASPBERRY_PI_5'
  | 'RASPBERRY_PI_COMPUTE_MODULE'
  | 'STM32_BLUE_PILL'
  | 'STM32_BLACK_PILL'
  | 'STM32_NUCLEO'
  | 'STM32_DISCOVERY'
  | 'TEENSY_4_0'
  | 'TEENSY_4_1'
  | 'TEENSY_LC'
  | 'BBC_MICROBIT_V1'
  | 'BBC_MICROBIT_V2'
  | 'SEEED_XIAO_SAMD21'
  | 'SEEED_XIAO_RP2040'
  | 'SEEED_XIAO_ESP32C3'
  | 'SEEED_XIAO_ESP32S3'
  | 'SEEED_XIAO_NRF52840'
  | 'ADAFRUIT_FEATHER_M0'
  | 'ADAFRUIT_FEATHER_M4'
  | 'ADAFRUIT_FEATHER_ESP32'
  | 'ADAFRUIT_FEATHER_RP2040'
  | 'ADAFRUIT_FEATHER_NRF52840'
  | 'SPARKFUN_THING_PLUS_ESP32'
  | 'SPARKFUN_THING_PLUS_RP2040'
  | 'SPARKFUN_THING_PLUS_ARTEMIS'
  | 'PARTICLE_PHOTON'
  | 'PARTICLE_ARGON'
  | 'PARTICLE_BORON'
  | 'BEAGLEBONE_BLACK'
  | 'BEAGLEBONE_AI64'
  | 'ODROID_C4'
  | 'ODROID_M1'
  | 'ORANGE_PI_ZERO'
  | 'ORANGE_PI_3B'
  | 'JETSON_NANO'
  | 'JETSON_ORIN_NANO'
  | 'CORAL_DEV_BOARD'
  | 'TI_LAUNCHPAD_MSP430'
  | 'TI_LAUNCHPAD_TIVA_C'
  | 'TI_SIMPLELINK_CC32XX'
  | 'NXP_FRDM'
  | 'NXP_LPCXPRESSO'
  | 'NXP_IMX_RT_EVK'
  | 'MICROCHIP_CURIOSITY_NANO'
  | 'MICROCHIP_PICKIT'
  | 'ATMEL_AVR_ATMEGA328P'
  | 'ATMEL_AVR_ATTINY'
  | 'NORDIC_NRF52840_DK'
  | 'NORDIC_NRF5340_DK'
  | 'SILICON_LABS_EFR32_DEV_KIT'
  | 'INFINEON_XMC'
  | 'INFINEON_PSOC4'
  | 'INFINEON_PSOC5'
  | 'INFINEON_PSOC6'
  | 'RENESAS_RA'
  | 'RENESAS_RX'
  | 'RENESAS_RZ'
  | 'CH32V003'
  | 'CH32V203'
  | 'RISC_V_SIPEED_LONGAN_NANO'
  | 'RISC_V_VISIONFIVE'
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
