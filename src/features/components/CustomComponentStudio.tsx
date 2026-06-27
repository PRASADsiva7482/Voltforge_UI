import { useMemo, useState } from 'react';
import { Upload, Plus, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import VfButton from '../../components/ui/VfButton';
import VfModal from '../../components/ui/VfModal';
import VfFormField from '../../components/ui/VfFormField';
import VfTextarea from '../../components/ui/VfTextarea';
import VfSelect from '../../components/ui/VfSelect';
import VfInput from '../../components/ui/VfInput';
import { componentApi } from '../../api/services';
import type { ComponentCategory, PinPosition } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const pinTypes: PinPosition['type'][] = ['bidirectional', 'input', 'output', 'power', 'ground'];
const fieldClass = 'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-950 outline-none focus:ring-1 focus:ring-volt-500/40 dark:border-white/10 dark:bg-white/5 dark:text-white';

export default function CustomComponentStudio({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('Custom Module');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ComponentCategory>('SENSOR');
  const [svgData, setSvgData] = useState('');
  const [pins, setPins] = useState<PinPosition[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [publishToCommunity, setPublishToCommunity] = useState(false);

  const selectedPin = useMemo(() => pins.find(pin => pin.id === selectedPinId) || null, [pins, selectedPinId]);

  const saveMutation = useMutation({
    mutationFn: () => componentApi.createCustom({
      name,
      description,
      category,
      svgData,
      width: 120,
      height: 90,
      pins,
      publishToCommunity,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components'] });
      onClose();
    },
  });

  const upsertPin = (id: string, updates: Partial<PinPosition>) => {
    setPins(current => current.map(pin => pin.id === id ? { ...pin, ...updates } : pin));
  };

  const footer = (
    <div className="flex justify-between items-center w-full">
      <span className="text-[10px] text-slate-500 dark:text-slate-400">{pins.length} pin anchors</span>
      <VfButton
        variant="primary"
        size="xs"
        icon={<Save className="h-3.5 w-3.5" />}
        disabled={!name.trim() || !svgData || pins.length === 0 || saveMutation.isPending}
        loading={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? 'Saving...' : 'Save Component'}
      </VfButton>
    </div>
  );

  return (
    <VfModal
      isOpen={isOpen}
      onClose={onClose}
      title="Custom Component Studio"
      size="full"
      footer={footer}
    >
      <div className="grid h-full grid-cols-[280px_1fr_260px] gap-1 overflow-hidden -mx-6 -my-6">
        {/* Left column settings */}
        <div className="space-y-4 border-r border-slate-200/70 p-4 dark:border-white/5 overflow-y-auto">
          <VfFormField label="Name">
            <VfInput value={name} onChange={e => setName(e.target.value)} inputSize="sm" />
          </VfFormField>

          <VfFormField label="Description">
            <VfTextarea value={description} onChange={e => setDescription(e.target.value)} className="h-20" />
          </VfFormField>

          <VfFormField label="Category">
            <VfSelect
              value={category}
              onChange={e => setCategory(e.target.value as ComponentCategory)}
              options={[
                { value: 'SENSOR', label: 'SENSOR' },
                { value: 'DISPLAY', label: 'DISPLAY' },
                { value: 'MOTOR', label: 'MOTOR' },
                { value: 'PASSIVE', label: 'PASSIVE' },
                { value: 'COMMUNICATION', label: 'COMMUNICATION' },
                { value: 'POWER', label: 'POWER' },
                { value: 'LED', label: 'LED' },
                { value: 'RELAY', label: 'RELAY' }
              ]}
            />
          </VfFormField>

          <div className="space-y-2 pt-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-600 hover:border-volt-500/50 hover:text-slate-955 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-volt-500/40 dark:hover:text-white">
              <Upload className="h-4 w-4" />
              Upload SVG
              <input
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={async event => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setSvgData(await file.text());
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={publishToCommunity} onChange={e => setPublishToCommunity(e.target.checked)} />
              Publish to Community Hub
            </label>
          </div>
        </div>

        {/* Center column workspace */}
        <div className="relative min-h-0 overflow-auto bg-slate-100 p-6 dark:bg-[#080812] flex items-center justify-center">
          <div
            className="relative h-[360px] w-[480px] rounded border border-slate-300 bg-white dark:border-white/10 dark:bg-white/[0.02]"
            onClick={(event) => {
              if (!svgData) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = ((event.clientX - rect.left) / rect.width) * 120;
              const y = ((event.clientY - rect.top) / rect.height) * 90;
              const id = `pin_${pins.length + 1}`;
              setPins([...pins, { id, name: `PIN ${pins.length + 1}`, x, y, type: 'bidirectional' }]);
              setSelectedPinId(id);
            }}
          >
            {svgData ? (
              <img className="h-full w-full object-contain pointer-events-none" src={`data:image/svg+xml;utf8,${encodeURIComponent(svgData)}`} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-600">Upload an SVG to begin</div>
            )}
            {pins.map(pin => (
              <button
                key={pin.id}
                type="button"
                onClick={(event) => { event.stopPropagation(); setSelectedPinId(pin.id); }}
                className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${pin.id === selectedPinId ? 'border-white bg-volt-500' : 'border-volt-500 bg-white dark:border-volt-300 dark:bg-slate-950'}`}
                style={{ left: `${(pin.x / 120) * 100}%`, top: `${(pin.y / 90) * 100}%` }}
                title={pin.name}
              />
            ))}
          </div>
        </div>

        {/* Right column details */}
        <div className="border-l border-slate-200/70 p-4 dark:border-white/5 overflow-y-auto">
          <VfButton
            variant="secondary"
            size="xs"
            onClick={() => {
              const id = `pin_${pins.length + 1}`;
              setPins([...pins, { id, name: `PIN ${pins.length + 1}`, x: 60, y: 45, type: 'bidirectional' }]);
              setSelectedPinId(id);
            }}
            className="mb-4 w-full"
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Add Pin
          </VfButton>
          
          {selectedPin ? (
            <div className="space-y-4">
              <VfFormField label="Pin Name">
                <VfInput value={selectedPin.name} onChange={e => upsertPin(selectedPin.id, { name: e.target.value })} inputSize="sm" />
              </VfFormField>
              
              <VfFormField label="Pin Type">
                <VfSelect
                  value={selectedPin.type}
                  onChange={e => upsertPin(selectedPin.id, { type: e.target.value as PinPosition['type'] })}
                  options={pinTypes.map(item => ({ value: item, label: item }))}
                />
              </VfFormField>

              <VfFormField label="Coordinates (X / Y)">
                <div className="grid grid-cols-2 gap-2">
                  <VfInput type="number" value={Math.round(selectedPin.x)} onChange={e => upsertPin(selectedPin.id, { x: Number(e.target.value) })} inputSize="sm" />
                  <VfInput type="number" value={Math.round(selectedPin.y)} onChange={e => upsertPin(selectedPin.id, { y: Number(e.target.value) })} inputSize="sm" />
                </div>
              </VfFormField>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-600 text-center py-8">Select or create a pin anchor.</p>
          )}
        </div>
      </div>
    </VfModal>
  );
}
