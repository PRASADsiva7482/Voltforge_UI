import { useState, useEffect } from 'react';
import { Settings, Globe, Lock, Save, Trash2, Cpu } from 'lucide-react';
import VfButton from '../../components/ui/VfButton';
import VfModal from '../../components/ui/VfModal';
import VfFormField from '../../components/ui/VfFormField';
import VfTextarea from '../../components/ui/VfTextarea';
import VfConfirmDialog from '../../components/ui/VfConfirmDialog';
import VfInput from '../../components/ui/VfInput';
import { useProjectStore } from '../../store/projectStore';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import type { BoardType } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProjectSettingsModal({ isOpen, onClose }: Props) {
  const { currentProject, setCurrentProject } = useProjectStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [boardType, setBoardType] = useState<BoardType>('ARDUINO_UNO');
  const [tags, setTags] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (currentProject) {
      setName(currentProject.name || '');
      setDescription(currentProject.description || '');
      setIsPublic(currentProject.isPublic || false);
      setBoardType(currentProject.boardType || 'ARDUINO_UNO');
      setTags(currentProject.tags || '');
    }
  }, [currentProject, isOpen]);

  const updateMutation = useMutation({
    mutationFn: () => projectApi.update(currentProject!.id, {
      name, description, isPublic, boardType, tags
    }),
    onSuccess: (res) => {
      setCurrentProject(res.data.data);
      queryClient.invalidateQueries({ queryKey: ['project', currentProject?.id] });
      onClose();
    }
  });

  if (!currentProject) return null;

  const boards: BoardType[] = ['ARDUINO_UNO', 'ARDUINO_MEGA', 'ARDUINO_NANO', 'ESP32', 'ESP32_S3', 'ESP8266'];

  const handleDelete = () => {
    // Add delete action when mutation is mapped
    setConfirmDeleteOpen(false);
    onClose();
  };

  const footer = (
    <div className="flex justify-between items-center w-full">
      <VfButton
        variant="danger"
        size="xs"
        icon={<Trash2 className="w-3.5 h-3.5" />}
        onClick={() => setConfirmDeleteOpen(true)}
      >
        Delete Project
      </VfButton>
      <div className="flex gap-2">
        <VfButton variant="ghost" size="xs" onClick={onClose}>
          Cancel
        </VfButton>
        <VfButton
          variant="primary"
          size="xs"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          loading={updateMutation.isPending}
          icon={<Save className="w-3.5 h-3.5" />}
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </VfButton>
      </div>
    </div>
  );

  return (
    <>
      <VfModal
        isOpen={isOpen}
        onClose={onClose}
        title="Project Settings"
        icon={<Settings className="w-5 h-5" />}
        footer={footer}
        size="md"
      >
        <div className="space-y-5">
          <VfFormField label="Project Name" htmlFor="settings-name">
            <VfInput
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </VfFormField>

          <VfFormField label="Description" htmlFor="settings-desc">
            <VfTextarea
              id="settings-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </VfFormField>

          <VfFormField label="Board Type">
            <div className="grid grid-cols-2 gap-2">
              {boards.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBoardType(b)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-all ${
                    boardType === b
                      ? 'bg-volt-500/20 border-volt-500/40 text-volt-500 dark:text-volt-400'
                      : 'bg-white/80 border-slate-200 text-slate-600 hover:text-slate-950 dark:bg-white/5 dark:border-white/5 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  {b.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </VfFormField>

          <VfFormField
            label="Visibility"
            helperText={isPublic ? 'Anyone can view and fork this project.' : 'Only you can access this project.'}
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs transition-all ${
                  isPublic
                    ? 'bg-volt-500/20 border-volt-500/40 text-volt-500 dark:text-volt-400'
                    : 'bg-white/80 border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/5 dark:text-slate-400'
                }`}
              >
                <Globe className="w-4 h-4" /> Public
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs transition-all ${
                  !isPublic
                    ? 'bg-slate-100 border-slate-200 text-slate-950 dark:bg-slate-800 dark:border-white/10 dark:text-white'
                    : 'bg-white/80 border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/5 dark:text-slate-400'
                }`}
              >
                <Lock className="w-4 h-4" /> Private
              </button>
            </div>
          </VfFormField>

          <VfFormField label="Tags" htmlFor="settings-tags">
            <VfInput
              id="settings-tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="iot, arduino, sensor (comma-separated)"
            />
          </VfFormField>
        </div>
      </VfModal>

      <VfConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Project permanently?"
        message="Are you sure you want to delete this project permanently? All files, netlist, and collaboration session history will be lost."
        isDestructive={true}
      />
    </>
  );
}
