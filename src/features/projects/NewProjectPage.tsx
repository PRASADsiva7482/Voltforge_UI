import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, CircuitBoard, Lock, Unlock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectApi } from '../../api/services'
import { Topbar } from '../../components/layout'
import { Box, Button, FieldShell, SelectField, TextInput, Textarea, Toggle } from '../../components/ui'
import type { BoardType } from '../../types/domain'

const boardOptions: BoardType[] = ['ARDUINO_UNO', 'ARDUINO_MEGA', 'ARDUINO_NANO', 'ESP32', 'ESP32_S3', 'ESP8266']

export function NewProjectPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [name, setName] = useState(t('Untitled circuit'))
  const [description, setDescription] = useState('')
  const [boardType, setBoardType] = useState<BoardType>('ARDUINO_UNO')
  const [isPublic, setPublic] = useState(false)

  const createProject = useMutation({
    mutationFn: () =>
      projectApi.create({
        boardType,
        description,
        name,
        isPublic,
        codeFiles: [
          {
            content: 'void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n}\n',
            filename: 'main.ino',
            language: 'cpp',
            sortOrder: 0,
          },
        ],
      }),
    onSuccess: (event) => {
      navigate(`/editor/${event.data.data.id}`)
    },
  })

  return (
    <>
      <Topbar eyebrow={t("Projects")} title={t("New project")} />

      <section className="content-band form-grid">
        <Box>
          <div className="form-grid">
            <FieldShell label={t("Project name")}>
              <TextInput value={name} onChange={(event) => setName(event.target.value)} />
            </FieldShell>
            <FieldShell label={t("Description")}>
              <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
            </FieldShell>
            <FieldShell label={t("Development board")}>
              <SelectField value={boardType} onChange={(event) => setBoardType(event.target.value as BoardType)}>
                {boardOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.replace('_', ' ')}
                  </option>
                ))}
              </SelectField>
            </FieldShell>
            <Toggle checked={isPublic} label={isPublic ? t("Public project") : t("Private project")} onChange={(event) => setPublic(event.target.checked)} />
          </div>
          <div className="component-row">
            <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/projects')}>
              {t("Back")}
            </Button>
            <Button icon={isPublic ? <Unlock size={16} /> : <Lock size={16} />} isLoading={createProject.isPending} onClick={() => createProject.mutate()} variant="primary">
              {t("Create project")}
            </Button>
          </div>
          {createProject.isError ? <p className="form-error">{t("Project API offline. Check your services and try again.")}</p> : null}
        </Box>
      </section>
    </>
  )
}
