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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="glass flex h-[min(720px,92vh)] w-[min(980px,96vw)] flex-col overflow-hidden rounded-lg border border-white/10 bg-surface-950">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Custom Component Studio</h2>
            <p className="text-[10px] text-surface-500">Upload SVG, place pin anchors, save to your library.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-surface-400 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-[280px_1fr_260px]">
          <div className="space-y-3 border-r border-white/5 p-4">
            <label className="block text-[10px] text-surface-500">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none" />
            <label className="block text-[10px] text-surface-500">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="h-20 w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none" />
            <label className="block text-[10px] text-surface-500">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as ComponentCategory)} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none">
              {['SENSOR', 'DISPLAY', 'MOTOR', 'PASSIVE', 'COMMUNICATION', 'POWER', 'LED', 'RELAY'].map(item => <option key={item}>{item}</option>)}
            </select>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-white/[0.03] px-3 py-3 text-xs text-surface-300 hover:border-volt-500/40">
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
            <label className="flex items-center gap-2 text-[11px] text-surface-300">
              <input type="checkbox" checked={publishToCommunity} onChange={e => setPublishToCommunity(e.target.checked)} />
              Publish to Community Hub
            </label>
          </div>

          <div className="relative min-h-0 overflow-auto bg-[#080812] p-6">
            <div
              className="relative mx-auto h-[360px] w-[480px] rounded border border-white/10 bg-white/[0.02]"
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
                <div className="flex h-full items-center justify-center text-xs text-surface-600">Upload an SVG to begin</div>
              )}
              {pins.map(pin => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setSelectedPinId(pin.id); }}
                  className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${pin.id === selectedPinId ? 'border-white bg-volt-500' : 'border-volt-300 bg-surface-950'}`}
                  style={{ left: `${(pin.x / 120) * 100}%`, top: `${(pin.y / 90) * 100}%` }}
                  title={pin.name}
                />
              ))}
            </div>
          </div>

          <div className="border-l border-white/5 p-4">
            <button
              onClick={() => {
                const id = `pin_${pins.length + 1}`;
                setPins([...pins, { id, name: `PIN ${pins.length + 1}`, x: 60, y: 90, type: 'bidirectional' }]);
                setSelectedPinId(id);
              }}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-white/5 px-3 py-2 text-xs text-surface-300 hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Pin
            </button>
            {selectedPin ? (
              <div className="space-y-3">
                <input value={selectedPin.name} onChange={e => upsertPin(selectedPin.id, { name: e.target.value })} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none" />
                <select value={selectedPin.type} onChange={e => upsertPin(selectedPin.id, { type: e.target.value as PinPosition['type'] })} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none">
                  {pinTypes.map(item => <option key={item}>{item}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={Math.round(selectedPin.x)} onChange={e => upsertPin(selectedPin.id, { x: Number(e.target.value) })} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none" />
                  <input type="number" value={Math.round(selectedPin.y)} onChange={e => upsertPin(selectedPin.id, { y: Number(e.target.value) })} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none" />
                </div>
              </div>
            ) : (
              <p className="text-xs text-surface-600">Select or create a pin anchor.</p>
            )}
          </div>
        </div>

        <div className="flex justify-between border-t border-white/5 px-4 py-3">
          <span className="text-[10px] text-surface-500">{pins.length} pin anchors</span>
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
