// ═══════════════════════════════════════════════════════════════════════════
// VoltForge — TypeScript Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export type UserRole = 'USER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type BoardType = 'ARDUINO_UNO' | 'ARDUINO_MEGA' | 'ARDUINO_NANO' | 'ESP32' | 'ESP32_S3' | 'ESP8266';
export type ComponentCategory = 'BOARD' | 'LED' | 'SENSOR' | 'DISPLAY' | 'RELAY' | 'MOTOR' | 'PASSIVE' | 'COMMUNICATION' | 'POWER';
export type SharePermission = 'VIEW' | 'EDIT' | 'ADMIN';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
  errorCode?: string;
}

export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface User {
  id: string;
  keycloakId: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  role: UserRole;
  accountStatus: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  boardType: BoardType;
  canvasLayout?: CanvasLayout;
  componentConfig?: Record<string, unknown>;
  isPublic: boolean;
  forkCount: number;
  viewCount: number;
  forkedFromId?: string;
  thumbnailUrl?: string;
  tags?: string;
  owner: User;
  codeFiles: CodeFile[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  boardType: BoardType;
  isPublic: boolean;
  forkCount: number;
  viewCount: number;
  thumbnailUrl?: string;
  tags?: string;
  owner: User;
  createdAt: string;
  updatedAt: string;
}

export interface CodeFile {
  id: string;
  filename: string;
  content: string;
  language: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ElectronicComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  type: string;
  description?: string;
  defaultProperties?: Record<string, unknown>;
  pinConfig?: Record<string, unknown>;
  iconUrl?: string;
  svgData?: string;
  isPremium: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CustomComponentRequest {
  name: string;
  description?: string;
  category?: ComponentCategory;
  type?: string;
  svgData: string;
  width?: number;
  height?: number;
  pins: PinPosition[];
  publishToCommunity?: boolean;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  totalProjects: number;
  publicProjects: number;
  newProjectsToday: number;
  roleBreakdown: Record<string, number>;
}

// ── Canvas Types ──────────────────────────────────────────────────────────
export interface CanvasNode {
  id: string;
  componentId: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  properties: Record<string, unknown>;
  pins: PinPosition[];
}

export interface PinPosition {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'input' | 'output' | 'bidirectional' | 'power' | 'ground';
  electrical?: Record<string, unknown>;
}

export interface DebugSnapshot {
  currentLine: number | null;
  variables: Record<string, number | string>;
  pins: Record<string, { mode: string; state: string; value: number }>;
  isPaused: boolean;
  breakpoints: number[];
}

export interface WireBendPoint {
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  fromNodeId: string;
  fromPinId: string;
  toNodeId: string;
  toPinId: string;
  color: string;
  bendPoints: WireBendPoint[];
  routingMode: 'straight' | 'orthogonal' | 'curved' | 'auto';
  label?: string;
}

export interface CanvasLayout {
  nodes: CanvasNode[];
  wires: Wire[];
  viewport: { x: number; y: number; scale: number };
}

// ── AI Types ──────────────────────────────────────────────────────────────
export interface AiGenerateRequest {
  prompt: string;
  boardType?: BoardType;
  componentTypes?: string[];
}

export interface AiGenerateResponse {
  status: string;
  message: string;
  canvasLayout?: Record<string, unknown>;
  componentConfig?: Record<string, unknown>;
  wireSuggestions?: AiWireSuggestion[];
  generatedCode?: string;
}

export interface AiWireSuggestion {
  fromComponentId: string;
  fromPin: string;
  toComponentId: string;
  toPin: string;
  color: string;
  description: string;
}

export interface AiChatRequest {
  message: string;
  context?: string;
  history?: AiChatMessage[];
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatResponse {
  reply: string;
  generatedCode?: string;
  hasCode: boolean;
}

// Simulation / firmware compile types
export interface FirmwareCompileRequest {
  source: string;
  boardType?: BoardType;
  sketchName?: string;
}

export interface FirmwareCompileResponse {
  success: boolean;
  boardType: string;
  fqbn: string;
  compiler: string;
  hex?: string;
  stdout?: string;
  stderr?: string;
  diagnostics?: string[];
  metadata?: Record<string, unknown>;
}

// ── Request Types ─────────────────────────────────────────────────────────
export interface CreateProjectRequest {
  name: string;
  description?: string;
  boardType?: BoardType;
  canvasLayout?: Record<string, unknown>;
  componentConfig?: Record<string, unknown>;
  isPublic?: boolean;
  tags?: string;
  codeFiles?: { filename: string; content: string; language?: string; sortOrder?: number }[];
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  boardType?: BoardType;
  canvasLayout?: Record<string, unknown>;
  componentConfig?: Record<string, unknown>;
  isPublic?: boolean;
  tags?: string;
  codeFiles?: { filename: string; content: string; language?: string; sortOrder?: number }[];
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
}
