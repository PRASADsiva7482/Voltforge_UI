import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Lock, Unlock } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { projectApi } from '../../api/services'
import { Topbar } from '../../components/layout'
import { Box, Button, FieldShell, SelectField, TextInput, Textarea, Toggle } from '../../components/ui'
import { BOARD_CATALOG, supportsAvr8js } from '../canvas/boardCatalog'
import { boardGeometryStatusLabel, boardGeometryTooltip } from '../canvas/boardGeometry'
import { useToastStore } from '../../store/useToastStore'
import { createProjectPayload, validateProjectForm, type ProjectFormErrors, type ProjectFormValues } from './projectConfiguration'

const boardFamilies = [...new Set(BOARD_CATALOG.map(board => board.family))]

export function NewProjectPage() {
  const navigate = useNavigate(), queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const [values, setValues] = useState<ProjectFormValues>({ name: searchParams.get('name') || '', description: searchParams.get('description') || '', boardType: searchParams.get('board') ?? 'ARDUINO_UNO', isPublic: false })
  const [errors, setErrors] = useState<ProjectFormErrors>({})
  const [failure, setFailure] = useState('')
  const selectedBoard = BOARD_CATALOG.find(board => board.type === values.boardType)
  const submitted = useRef(false), submitting = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const focusError = (next: ProjectFormErrors) => requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`#project-${Object.keys(next)[0]}`)?.focus())
  const change = <K extends keyof ProjectFormValues>(field: K, value: ProjectFormValues[K]) => {
    const next = { ...values, [field]: value }
    setValues(next); setFailure('')
    if (submitted.current) setErrors(validateProjectForm(next))
  }
  const createProject = useMutation({
    mutationFn: async (snapshot: ProjectFormValues) => {
      const response = await projectApi.create(createProjectPayload(snapshot))
      if (!response.data.success || !response.data.data?.id) throw new Error('Project creation was not confirmed.')
      return response.data.data
    },
    onSuccess: project => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      useToastStore.getState().addToast(t('Project created'), 'success')
      navigate(`/editor/${project.id}`)
    },
    onError: error => {
      const data = isAxiosError(error) ? error.response?.data : undefined
      const next: ProjectFormErrors = {}
      for (const field of ['name', 'description', 'boardType'] as const) {
        if (typeof data?.data?.[field] === 'string') next[field] = data.data[field]
      }
      setErrors(next); focusError(next)
      setFailure(data?.errorCode === 'VALIDATION_ERROR' ? 'Check the highlighted fields.' : 'Could not create the project. Your entries are preserved. Please try again.')
    },
    onSettled: () => { submitting.current = false },
  })

  return <>
    <Topbar eyebrow={t('Projects')} title={t('New project')} />
    <section className="vf-form-layout">
      <Box><form ref={form} noValidate onSubmit={event => {
        event.preventDefault()
        if (submitting.current) return
        submitted.current = true
        const next = validateProjectForm(values); setErrors(next); setFailure('')
        if (Object.keys(next).length) { focusError(next); return }
        submitting.current = true; createProject.mutate({ ...values })
      }}>
        <fieldset disabled={createProject.isPending} className="vf-project-fields">
          <div className="form-grid">
            <FieldShell htmlFor="project-name" label={t('Project name')} required>
              <TextInput id="project-name" aria-label={t('Project name')} required maxLength={200} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'project-name-error' : undefined} value={values.name} onChange={event => change('name', event.target.value)} />
              {errors.name && <span id="project-name-error" className="form-error">{t(errors.name)}</span>}
            </FieldShell>
            <FieldShell htmlFor="project-description" label={t('Description')} required>
              <Textarea id="project-description" aria-label={t('Description')} required maxLength={5000} rows={3} aria-invalid={!!errors.description} aria-describedby={errors.description ? 'project-description-error' : undefined} value={values.description} onChange={event => change('description', event.target.value)} />
              {errors.description && <span id="project-description-error" className="form-error">{t(errors.description)}</span>}
            </FieldShell>
            <FieldShell htmlFor="project-boardType" label={t('Development board')} required>
              <SelectField id="project-boardType" aria-label={t('Development board')} required value={values.boardType} aria-invalid={!!errors.boardType} aria-describedby="project-board-help project-board-error" onChange={event => change('boardType', event.target.value)}>
                {!BOARD_CATALOG.some(board => board.type === values.boardType) && <option value={values.boardType} disabled>{t('Unsupported board — choose a board')}</option>}
                {boardFamilies.map(family => <optgroup key={family} label={family}>{BOARD_CATALOG.filter(board => board.family === family).map(board => <option key={board.type} value={board.type}>{board.name}</option>)}</optgroup>)}
              </SelectField>
              <span id="project-board-help" className="vf-field__hint">{t('Required. Adds this board and its pins to your schematic and sets the firmware target.')}</span>
              {selectedBoard && <span className="vf-field__hint" title={boardGeometryTooltip(selectedBoard.geometry)}>{boardGeometryStatusLabel(selectedBoard.geometry.pinoutStatus)}{selectedBoard.geometry.pinoutStatus !== 'manufacturer-verified' && ' — verify the physical variant before building hardware.'}</span>}
              <span id="project-board-error" className="form-error">{errors.boardType && t(errors.boardType)}</span>
            </FieldShell>
            <Toggle checked={!values.isPublic} label={t('Private project')} onChange={event => change('isPublic', !event.target.checked)} />
          </div>
        </fieldset>
        <div className="component-row">
          <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/projects')}>{t('Back')}</Button>
          <Button type="submit" icon={values.isPublic ? <Unlock size={16} /> : <Lock size={16} />} isLoading={createProject.isPending} variant="primary">{t('Create project')}</Button>
        </div>
        {failure && <p role="alert" className="form-error">{t(failure)}</p>}
      </form></Box>
      <aside className="vf-form-aside"><p className="vf-eyebrow">{t('Project setup')}</p><h2>{t('A home for your circuit.')}</h2><p>{t('Your project keeps the schematic, component settings, and firmware together.')}</p><p>{supportsAvr8js(values.boardType) ? t('This target supports ATmega328P browser emulation when compiled firmware is available.') : t('This target uses source compatibility simulation, not native processor emulation. Compilation requires the matching toolchain on the server.')}</p><p>{values.isPublic ? t('Public projects can be viewed by the community.') : t('Private projects are visible only to authorized collaborators.')}</p></aside>
    </section>
  </>
}
