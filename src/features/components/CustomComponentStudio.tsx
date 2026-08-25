import { useState } from 'react'
import { Plus, Save, Trash2, Upload } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { componentApi } from '../../api/services'
import { Modal } from '../../components/ui/Modal'
import { Breadcrumbs } from '../../components/ui/Breadcrumbs'
import { FieldShell, TextInput, SelectField, Textarea } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import type { ComponentCategory, PinPosition } from '../../types/domain'
import { validateComponentSchema } from '../canvas/customComponentSchema'
import { useToastStore } from '../../store/useToastStore'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const PIN_TYPES: PinPosition['type'][] = ['bidirectional', 'input', 'output', 'power', 'ground']

function nextPinId(pins: PinPosition[]) {
  const existing = new Set(pins.map((pin) => pin.id))
  let index = pins.length + 1
  while (existing.has(`pin_${index}`)) index += 1
  return `pin_${index}`
}

export default function CustomComponentStudio({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient()
  const addToast = useToastStore((s) => s.addToast)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<ComponentCategory>('SENSOR')
  const [svgData, setSvgData] = useState('')
  const [publishToCommunity, setPublishToCommunity] = useState(false)
  const [pins, setPins] = useState<PinPosition[]>([])
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)

  const selectedPin = pins.find((p) => p.id === selectedPinId)

  const saveMutation = useMutation({
    mutationFn: () => {
      const type = `CUSTOM_${name.toUpperCase().replace(/\s+/g, '_')}`
      const validation = validateComponentSchema({
        id: type,
        name,
        category: 'Sensor',
        packageType: 'MODULE',
        pinCount: pins.length,
        pins: pins.map((pin) => ({
          id: pin.id,
          name: pin.name,
          side: pin.x <= 40 ? 'left' : pin.x >= 80 ? 'right' : pin.y <= 40 ? 'top' : 'bottom',
        })),
      })
      if (!validation.valid) throw new Error(validation.errors.join(' '))
      return componentApi.createCustom({
        name,
        description,
        type,
        category,
        svgData,
        width: 120,
        height: 90,
        pins,
        publishToCommunity,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components'] })
      onClose()
    },
    onError: (error) => addToast(error instanceof Error ? error.message : 'Unable to save custom component.', 'error'),
  })

  const upsertPin = (id: string, updates: Partial<PinPosition>) => {
    setPins((current) =>
      current.map((pin) => (pin.id === id ? { ...pin, ...updates } : pin))
    )
  }

  const deleteSelectedPin = () => {
    if (!selectedPinId) return
    setPins((current) => current.filter((pin) => pin.id !== selectedPinId))
    setSelectedPinId(null)
  }

  const footer = (
    <div className="vf-studio-footer-content">
      <span className="vf-studio-footer-status">
        {pins.length} pin anchors
      </span>
      <Button
        variant="primary"
        size="sm"
        icon={<Save size={14} />}
        disabled={
          !name.trim() || !svgData || pins.length === 0 || saveMutation.isPending
        }
        isLoading={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        Save Component
      </Button>
    </div>
  )

  const breadcrumbItems = [
    { label: 'Component Panel' },
    { label: 'Custom Component Studio' },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<Breadcrumbs items={breadcrumbItems} />}
      size="full"
      footer={footer}
    >
      <div className="vf-studio-layout">
        {/* Left Settings Panel */}
        <aside className="vf-studio-sidebar vf-studio-sidebar--left">
          <FieldShell label="Component Name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Temperature Sensor"
            />
          </FieldShell>

          <FieldShell label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter component details..."
              className="vf-studio-desc-input"
            />
          </FieldShell>

          <FieldShell label="Category">
            <SelectField
              value={category}
              onChange={(e) => setCategory(e.target.value as ComponentCategory)}
            >
              <option value="SENSOR">SENSOR</option>
              <option value="DISPLAY">DISPLAY</option>
              <option value="MOTOR">MOTOR</option>
              <option value="PASSIVE">PASSIVE</option>
              <option value="COMMUNICATION">COMMUNICATION</option>
              <option value="POWER">POWER</option>
              <option value="LED">LED</option>
              <option value="RELAY">RELAY</option>
            </SelectField>
          </FieldShell>

          <div className="vf-studio-upload-section">
            <label className="vf-studio-upload-btn">
              <Upload size={16} />
              <span>Upload SVG File</span>
              <input
                type="file"
                accept=".svg,image/svg+xml"
                className="vf-studio-hidden-file"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  setSvgData(await file.text())
                }}
              />
            </label>
            <label className="vf-studio-checkbox-label">
              <input
                type="checkbox"
                checked={publishToCommunity}
                onChange={(e) => setPublishToCommunity(e.target.checked)}
              />
              <span>Publish to Community Hub</span>
            </label>
          </div>
        </aside>

        {/* Center Workspace */}
        <main className="vf-studio-workspace" onClick={(event) => {
          if (!svgData) return
          const rect = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - rect.left) / rect.width) * 120
          const y = ((event.clientY - rect.top) / rect.height) * 90
          const id = nextPinId(pins)
          setPins([
            ...pins,
            { id, name: `PIN ${pins.length + 1}`, x, y, type: 'bidirectional' },
          ])
          setSelectedPinId(id)
        }}>
          <div className="vf-studio-canvas">
            {svgData ? (
              <img
                className="vf-studio-canvas__image"
                src={`data:image/svg+xml;utf8,${encodeURIComponent(svgData)}`}
                alt="Custom component shape preview"
              />
            ) : (
              <div className="vf-studio-canvas__empty">
                Upload an SVG to begin adding pin anchors
              </div>
            )}
            {pins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setSelectedPinId(pin.id)
                }}
                className={`vf-studio-pin-anchor ${
                  pin.id === selectedPinId ? 'is-selected' : ''
                }`}
                style={{
                  left: `${(pin.x / 120) * 100}%`,
                  top: `${(pin.y / 90) * 100}%`,
                }}
                title={pin.name}
              />
            ))}
          </div>
        </main>

        {/* Right Settings Panel */}
        <aside className="vf-studio-sidebar vf-studio-sidebar--right">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const id = nextPinId(pins)
              setPins([
                ...pins,
                { id, name: `PIN ${pins.length + 1}`, x: 60, y: 45, type: 'bidirectional' },
              ])
              setSelectedPinId(id)
            }}
            className="vf-studio-add-pin-btn"
            icon={<Plus size={14} />}
          >
            Add Pin Anchor
          </Button>

          {selectedPin ? (
            <div className="vf-studio-pin-details">
              <FieldShell label="Pin Identifier">
                <TextInput
                  value={selectedPin.name}
                  onChange={(e) => upsertPin(selectedPin.id, { name: e.target.value })}
                />
              </FieldShell>

              <FieldShell label="Electrical Type">
                <SelectField
                  value={selectedPin.type}
                  onChange={(e) =>
                    upsertPin(selectedPin.id, {
                      type: e.target.value as PinPosition['type'],
                    })
                  }
                >
                  {PIN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </SelectField>
              </FieldShell>

              <FieldShell label="Coordinates (X / Y)">
                <div className="vf-studio-coord-grid">
                  <TextInput
                    type="number"
                    value={Math.round(selectedPin.x)}
                    onChange={(e) =>
                      upsertPin(selectedPin.id, { x: Number(e.target.value) })
                    }
                  />
                  <TextInput
                    type="number"
                    value={Math.round(selectedPin.y)}
                    onChange={(e) =>
                      upsertPin(selectedPin.id, { y: Number(e.target.value) })
                    }
                  />
                </div>
              </FieldShell>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={deleteSelectedPin}
              >
                Delete Pin Anchor
              </Button>
            </div>
          ) : (
            <p className="vf-studio-sidebar-empty">
              Select or click on the canvas to edit a pin anchor.
            </p>
          )}
        </aside>
      </div>
    </Modal>
  )
}
export { CustomComponentStudio }
