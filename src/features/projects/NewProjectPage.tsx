import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Lock, Unlock } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectApi } from '../../api/services'
import { Topbar } from '../../components/layout'
import { Box, Button, FieldShell, SelectField, TextInput, Textarea, Toggle } from '../../components/ui'
import { BOARD_CATALOG } from '../canvas/boardCatalog'
import { generateDefaultCode } from '../../utils/codeTemplates'
import type { BoardType } from '../../types/domain'
import { useToastStore } from '../../store/useToastStore'

const boardOptions = BOARD_CATALOG
const boardFamilies = Array.from(new Set(boardOptions.map((board) => board.family)))

export function NewProjectPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const paramBoard = searchParams.get('board') as BoardType | null
  const paramName = searchParams.get('name')
  const [name, setName] = useState(paramName || t('Untitled circuit'))
  const [description, setDescription] = useState('')
  const [boardType, setBoardType] = useState<BoardType>(boardOptions.some(board => board.type === paramBoard) ? paramBoard! : 'ARDUINO_UNO')
  const [isPublic, setPublic] = useState(false)

  const createProject = useMutation({
    mutationFn: () =>
      projectApi.create({
        boardType,
        description,
        name: name.trim(),
        isPublic,
        codeFiles: [
          {
            content: generateDefaultCode(boardType, name),
            filename: 'main.ino',
            language: 'cpp',
            sortOrder: 0,
          },
        ],
      }),
    onSuccess: (event) => {
      useToastStore.getState().addToast(t('Project created'), 'success')
      navigate(`/editor/${event.data.data.id}`)
    },
  })

  return (
    <>
      <Topbar eyebrow={t("Projects")} title={t("New project")} />

      <section className="vf-form-layout">
        <Box>
          <form onSubmit={event => { event.preventDefault(); if (name.trim() && !createProject.isPending) createProject.mutate() }}>
          <div className="form-grid">
            <FieldShell label={t("Project name")}>
              <TextInput required maxLength={200} aria-invalid={!name.trim()} value={name} onChange={(event) => setName(event.target.value)} />
            </FieldShell>
            <FieldShell label={t("Description")}>
              <Textarea maxLength={5000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
            </FieldShell>
            <FieldShell label={t("Development board")}>
              <SelectField value={boardType} onChange={(event) => setBoardType(event.target.value as BoardType)}>
                {boardFamilies.map((family) => (
                  <optgroup key={family} label={family}>
                    {boardOptions
                      .filter((board) => board.family === family)
                      .map((board) => (
                        <option key={board.type} value={board.type}>
                          {board.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </SelectField>
            </FieldShell>
            <Toggle checked={isPublic} label={isPublic ? t("Public project") : t("Private project")} onChange={(event) => setPublic(event.target.checked)} />
          </div>
          <div className="component-row">
            <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/projects')}>
              {t("Back")}
            </Button>
            <Button type="submit" disabled={!name.trim()} icon={isPublic ? <Unlock size={16} /> : <Lock size={16} />} isLoading={createProject.isPending} variant="primary">
              {t("Create project")}
            </Button>
          </div>
          {createProject.isError ? <p role="alert" className="form-error">{t('Could not create the project. Your entries are preserved. Please try again.')}</p> : null}
          </form>
        </Box>
        <aside className="vf-form-aside"><p className="vf-eyebrow">{t('Project setup')}</p><h2>{t('A home for your circuit.')}</h2><p>{t('Your project keeps the schematic, component settings, and firmware together.')}</p><p>{t('Choose a board to generate starter firmware. Simulation and compilation support vary by board; the editor shows available capabilities.')}</p><p>{isPublic ? t('Public projects can be viewed by the community.') : t('Private projects are visible only to authorized collaborators.')}</p></aside>
      </section>
    </>
  )
}
