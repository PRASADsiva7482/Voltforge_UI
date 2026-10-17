import type { BoardType, CanvasLayout, CreateProjectRequest, Project } from '../../types/domain'
import { BOARD_TYPE_SET, getBoardProfile, isBoardComponentType } from '../canvas/boardCatalog'
import { hydrateCanvasNode } from '../canvas/componentFactory'
import { generateDefaultCode } from '../../utils/codeTemplates'

export type ProjectFormValues = { name: string; description: string; boardType: string; isPublic: boolean }
export type ProjectFormErrors = Partial<Record<'name' | 'description' | 'boardType', string>>

export const DISALLOWED_PROJECT_NAMES = new Set([
  'untitled circuit',
  'untitled',
  'untitled project',
  'बिना शीर्षक वाला सर्किट',
  'ಶೀರ್ಷಿಕೆ ಇಲ್ಲದ ಸರ್ಕ್ಯೂಟ್',
  'തലക്കെട്ടില്ലാത്ത സർക്യൂട്ട്',
  'विनाशीर्षक सर्किट',
  'தலைப்பற்ற சுற்று',
  'శీర్షిక లేని సర్క్యూట్',
])

export function isDisallowedProjectName(name: string): boolean {
  return DISALLOWED_PROJECT_NAMES.has(name.trim().toLowerCase())
}

export function validateProjectForm(values: ProjectFormValues): ProjectFormErrors {
  const errors: ProjectFormErrors = {}
  const name = values.name.trim()
  if (!name) {
    errors.name = 'Enter a project name.'
  } else if (isDisallowedProjectName(name)) {
    errors.name = 'Project name cannot be "Untitled circuit". Please choose a descriptive name.'
  } else if (name.length > 200) {
    errors.name = 'Use 200 characters or fewer.'
  }

  const description = values.description.trim()
  if (!description) {
    errors.description = 'Enter a project description.'
  } else if (description.length > 5000) {
    errors.description = 'Use 5000 characters or fewer.'
  }

  if (!BOARD_TYPE_SET.has(values.boardType)) {
    errors.boardType = 'Choose a supported development board.'
  }
  return errors
}

export function createInitialProjectLayout(boardType: string): CanvasLayout {
  if (!getBoardProfile(boardType)) throw new Error('Unsupported development board')
  return {
    nodes: [hydrateCanvasNode({ id: 'project-board', type: boardType, x: 120, y: 100 })],
    wires: [], viewport: { x: 0, y: 0, scale: 1 },
  }
}

export function createProjectPayload(values: ProjectFormValues): CreateProjectRequest {
  if (Object.keys(validateProjectForm(values)).length) throw new Error('Invalid project configuration')
  const name = values.name.trim(), boardType = values.boardType as BoardType
  return {
    name, description: values.description.trim(), boardType, isPublic: values.isPublic,
    canvasLayout: createInitialProjectLayout(boardType),
    codeFiles: [{ filename: 'main.ino', language: 'cpp', sortOrder: 0, content: generateDefaultCode(boardType, name) }],
  }
}

/** Legacy only: infer a missing target from a single saved board, otherwise use the historical Uno default.
 * Explicit targets and explicit layouts (including empty layouts) are never replaced. */
export function resolveProjectConfiguration(project: Project): { project: Project; notice?: string } {
  let boardType = project.boardType
  let notice: string | undefined
  if (!boardType) {
    const boards = [...new Set((project.canvasLayout?.nodes ?? []).filter(node => isBoardComponentType(node.type)).map(node => node.type))]
    boardType = (boards.length === 1 ? boards[0] : 'ARDUINO_UNO') as BoardType
    notice = `This legacy project has no board target. Using ${boardType}; save to retain this configuration.`
  }
  let canvasLayout = project.canvasLayout
  if (canvasLayout == null && getBoardProfile(boardType)) {
    canvasLayout = createInitialProjectLayout(boardType)
    notice = `This project had no saved schematic. Initialized its saved ${boardType} board; save to retain the layout.`
  }
  return { project: { ...project, boardType, canvasLayout }, notice }
}
