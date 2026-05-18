import { useMemo, useState } from 'react';
import { Upload, Plus, X, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { componentApi } from '../../api/services';
import type { ComponentCategory, PinPosition } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const pinTypes: PinPosition['type'][] = ['bidirectional', 'input', 'output', 'power', 'ground'];
const fieldClass = 'w-full rounded-md border border-surface-200 bg-white px-3 py-2 text-xs text-surface-950 outline-none focus:ring-1 focus:ring-volt-500/40 dark:border-white/10 dark:bg-white/5 dark:text-white';
const labelClass = 'block text-[10px] font-medium text-surface-500 dark:text-surface-400';

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

  if (!isOpen) return null;

  const upsertPin = (id: string, updates: Partial<PinPosition>) => {
    setPins(current => current.map(pin => pin.id === id ? { ...pin, ...updates } : pin));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 dark:bg-black/60">
      <div className="glass flex h-[min(720px,92vh)] w-[min(980px,96vw)] flex-col overflow-hidden rounded-lg border border-surface-200 bg-white/95 shadow-2xl dark:border-white/10 dark:bg-surface-950/95">
        <div className="flex items-center justify-between border-b border-surface-200/70 bg-surface-50/70 px-4 py-3 dark:border-white/5 dark:bg-surface-900/50">
          <div>
            <h2 className="text-sm font-semibold text-surface-950 dark:text-white">Custom Component Studio</h2>
            <p className="text-[10px] text-surface-500 dark:text-surface-400">Upload SVG, place pin anchors, save to your library.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-surface-500 hover:bg-surface-100 hover:text-surface-950 dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-[280px_1fr_260px]">
          <div className="space-y-3 border-r border-surface-200/70 p-4 dark:border-white/5">
            <label className={labelClass}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={fieldClass} />
            <label className={labelClass}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${fieldClass} h-20 resize-none`} />
            <label className={labelClass}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as ComponentCategory)} className={fieldClass}>
              {['SENSOR', 'DISPLAY', 'MOTOR', 'PASSIVE', 'COMMUNICATION', 'POWER', 'LED', 'RELAY'].map(item => <option key={item}>{item}</option>)}
            </select>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-surface-300 bg-surface-50 px-3 py-3 text-xs text-surface-600 hover:border-volt-500/50 hover:text-surface-950 dark:border-white/15 dark:bg-white/[0.03] dark:text-surface-300 dark:hover:border-volt-500/40 dark:hover:text-white">
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
            <label className="flex items-center gap-2 text-[11px] text-surface-600 dark:text-surface-300">
              <input type="checkbox" checked={publishToCommunity} onChange={e => setPublishToCommunity(e.target.checked)} />
              Publish to Community Hub
            </label>
          </div>

          <div className="relative min-h-0 overflow-auto bg-surface-100 p-6 dark:bg-[#080812]">
            <div
              className="relative mx-auto h-[360px] w-[480px] rounded border border-surface-300 bg-white dark:border-white/10 dark:bg-white/[0.02]"
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
                <img className="h-full w-full object-contain" src={`data:image/svg+xml;utf8,${encodeURIComponent(svgData)}`} />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-surface-500 dark:text-surface-600">Upload an SVG to begin</div>
              )}
              {pins.map(pin => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setSelectedPinId(pin.id); }}
                  className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${pin.id === selectedPinId ? 'border-white bg-volt-500' : 'border-volt-500 bg-white dark:border-volt-300 dark:bg-surface-950'}`}
                  style={{ left: `${(pin.x / 120) * 100}%`, top: `${(pin.y / 90) * 100}%` }}
                  title={pin.name}
                />
              ))}
            </div>
          </div>

          <div className="border-l border-surface-200/70 p-4 dark:border-white/5">
            <button
              onClick={() => {
                const id = `pin_${pins.length + 1}`;
                setPins([...pins, { id, name: `PIN ${pins.length + 1}`, x: 60, y: 90, type: 'bidirectional' }]);
                setSelectedPinId(id);
              }}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-surface-100 px-3 py-2 text-xs text-surface-700 hover:bg-surface-200 hover:text-surface-950 dark:bg-white/5 dark:text-surface-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Pin
            </button>
            {selectedPin ? (
              <div className="space-y-3">
                <input value={selectedPin.name} onChange={e => upsertPin(selectedPin.id, { name: e.target.value })} className={fieldClass} />
                <select value={selectedPin.type} onChange={e => upsertPin(selectedPin.id, { type: e.target.value as PinPosition['type'] })} className={fieldClass}>
                  {pinTypes.map(item => <option key={item}>{item}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={Math.round(selectedPin.x)} onChange={e => upsertPin(selectedPin.id, { x: Number(e.target.value) })} className={fieldClass} />
                  <input type="number" value={Math.round(selectedPin.y)} onChange={e => upsertPin(selectedPin.id, { y: Number(e.target.value) })} className={fieldClass} />
                </div>
              </div>
            ) : (
              <p className="text-xs text-surface-500 dark:text-surface-600">Select or create a pin anchor.</p>
            )}
          </div>
        </div>

        <div className="flex justify-between border-t border-surface-200/70 bg-surface-50/70 px-4 py-3 dark:border-white/5 dark:bg-surface-900/50">
          <span className="text-[10px] text-surface-500 dark:text-surface-400">{pins.length} pin anchors</span>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!name.trim() || !svgData || pins.length === 0 || saveMutation.isPending}
            className="flex items-center gap-2 rounded-md bg-volt-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {saveMutation.isPending ? 'Saving...' : 'Save Component'}
          </button>
        </div>
      </div>
    </div>
  );
}
