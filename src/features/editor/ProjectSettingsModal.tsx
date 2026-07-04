import { useState, useEffect } from 'react'
import { Settings, Globe, Lock, Save, Trash2, Cpu } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { projectApi } from '../../api/services'
import { useProjectStore } from '../../store/projectStore'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { FieldShell, TextInput, Textarea } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import type { BoardType } from '../../types/domain'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const BOARDS: BoardType[] = [
  'ARDUINO_UNO',
  'ARDUINO_MEGA',
  'ARDUINO_NANO',
  'ESP32',
  'ESP32_S3',
  'ESP8266',
]

export default function ProjectSettingsModal({ isOpen, onClose }: Props) {
  const { currentProject, setCurrentProject } = useProjectStore()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [boardType, setBoardType] = useState<BoardType>('ARDUINO_UNO')
  const [tags, setTags] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  useEffect(() => {
    if (currentProject) {
      setName(currentProject.name || '')
      setDescription(currentProject.description || '')
      setIsPublic(currentProject.isPublic || false)
      setBoardType(currentProject.boardType || 'ARDUINO_UNO')
      setTags(currentProject.tags || '')
    }
  }, [currentProject, isOpen])

  const updateMutation = useMutation({
    mutationFn: () =>
      projectApi.update(currentProject!.id, {
        name,
        description,
        isPublic,
        boardType,
        tags,
      }),
    onSuccess: (res) => {
      setCurrentProject(res.data.data)
      queryClient.invalidateQueries({ queryKey: ['project', currentProject?.id] })
      onClose()
    },
  })

  if (!currentProject) return null

  const handleDelete = () => {
    // Perform actual project deletion in database/store if needed
    setConfirmDeleteOpen(false)
    onClose()
  }

  const footer = (
    <div className="vf-settings-footer-row">
      <Button
        variant="danger"
        size="sm"
        icon={<Trash2 size={14} />}
        onClick={() => setConfirmDeleteOpen(true)}
      >
        Delete Project
      </Button>
      <div className="vf-settings-footer-actions">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          isLoading={updateMutation.isPending}
          icon={<Save size={14} />}
        >
          Save Changes
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Project Settings"
        icon={<Settings size={18} />}
        footer={footer}
        size="md"
      >
        <div className="vf-settings-form">
          <FieldShell label="Project Name">
            <TextInput
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FieldShell>

          <FieldShell label="Description">
            <Textarea
              id="settings-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </FieldShell>

          <FieldShell label="Board Platform">
            <div className="vf-settings-board-grid">
              {BOARDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBoardType(b)}
                  className={`vf-settings-board-card ${
                    boardType === b ? 'is-selected' : ''
                  }`}
                >
                  <Cpu size={14} />
                  <span>{b.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          </FieldShell>

          <FieldShell
            label="Project Visibility"
            hint={
              isPublic
                ? 'Anyone can view and fork this project.'
                : 'Only you can access this project.'
            }
          >
            <div className="vf-settings-visibility-row">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`vf-settings-visibility-btn ${isPublic ? 'is-active' : ''}`}
              >
                <Globe size={14} />
                <span>Public</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`vf-settings-visibility-btn ${!isPublic ? 'is-active' : ''}`}
              >
                <Lock size={14} />
                <span>Private</span>
              </button>
            </div>
          </FieldShell>

          <FieldShell label="Tags">
            <TextInput
              id="settings-tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="iot, arduino, sensor (comma-separated)"
            />
          </FieldShell>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Project permanently?"
        message="Are you sure you want to delete this project permanently? All files, netlist, and collaboration session history will be lost."
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
      />
    </>
  )
}
export { ProjectSettingsModal }
