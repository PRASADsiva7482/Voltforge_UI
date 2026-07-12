import { useState, useEffect, useMemo } from 'react'
import { Settings, Globe, Lock, Save, Trash2, Cpu, Search } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { projectApi } from '../../api/services'
import { useProjectStore } from '../../store/projectStore'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { FieldShell, TextInput, Textarea } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { BOARD_CATALOG } from '../canvas/boardCatalog'
import type { BoardType } from '../../types/domain'

interface Props {
  isOpen: boolean
  onClose: () => void
}

/** Unique family names from the catalog, in sort order. */
const BOARD_FAMILIES = Array.from(
  new Map(BOARD_CATALOG.map((b) => [b.family, b.sortOrder])),
)
  .sort((a, b) => a[1] - b[1])
  .map(([family]) => family)

export default function ProjectSettingsModal({ isOpen, onClose }: Props) {
  const { currentProject, setCurrentProject } = useProjectStore()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [boardType, setBoardType] = useState<BoardType>('ARDUINO_UNO')
  const [tags, setTags] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Board selector filter state
  const [boardSearch, setBoardSearch] = useState('')
  const [selectedFamily, setSelectedFamily] = useState<string>('All')

  useEffect(() => {
    if (currentProject) {
      setName(currentProject.name || '')
      setDescription(currentProject.description || '')
      setIsPublic(currentProject.isPublic || false)
      setBoardType(currentProject.boardType || 'ARDUINO_UNO')
      setTags(currentProject.tags || '')
    }
  }, [currentProject, isOpen])

  // Reset filters when modal opens
  useEffect(() => {
    if (isOpen) {
      setBoardSearch('')
      setSelectedFamily('All')
    }
  }, [isOpen])

  const filteredBoards = useMemo(() => {
    const query = boardSearch.toLowerCase().trim()
    return BOARD_CATALOG.filter((board) => {
      if (selectedFamily !== 'All' && board.family !== selectedFamily) return false
      if (!query) return true
      return (
        board.name.toLowerCase().includes(query) ||
        board.type.toLowerCase().includes(query) ||
        board.family.toLowerCase().includes(query) ||
        board.features.some((f) => f.toLowerCase().includes(query))
      )
    })
  }, [boardSearch, selectedFamily])

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

          <FieldShell label={`Board Platform (${filteredBoards.length})`}>
            {/* Search input */}
            <div className="vf-settings-board-search">
              <Search size={14} className="vf-settings-board-search__icon" />
              <input
                className="vf-settings-board-search__input"
                type="text"
                placeholder="Search boards…"
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
              />
            </div>

            {/* Family filter chips */}
            <div className="vf-settings-board-families">
              <button
                type="button"
                className={`vf-settings-family-chip ${selectedFamily === 'All' ? 'is-active' : ''}`}
                onClick={() => setSelectedFamily('All')}
              >
                All
              </button>
              {BOARD_FAMILIES.map((family) => (
                <button
                  key={family}
                  type="button"
                  className={`vf-settings-family-chip ${selectedFamily === family ? 'is-active' : ''}`}
                  onClick={() => setSelectedFamily(selectedFamily === family ? 'All' : family)}
                >
                  {family}
                </button>
              ))}
            </div>

            {/* Scrollable board grid */}
            <div className="vf-settings-board-scroll">
              <div className="vf-settings-board-grid">
                {filteredBoards.map((board) => (
                  <button
                    key={board.type}
                    type="button"
                    onClick={() => setBoardType(board.type)}
                    className={`vf-settings-board-card ${
                      boardType === board.type ? 'is-selected' : ''
                    }`}
                    title={`${board.family} — ${board.features.join(', ')}\nLogic: ${board.logicVoltage}V · Clock: ${board.clock}`}
                  >
                    <Cpu size={14} />
                    <span>{board.name}</span>
                  </button>
                ))}
                {filteredBoards.length === 0 && (
                  <div className="vf-settings-board-empty">No boards match your search.</div>
                )}
              </div>
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

