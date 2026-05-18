import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Globe, Lock, Save, Trash2, Cpu } from 'lucide-react';
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

  const [name, setName] = useState(currentProject?.name || '');
  const [description, setDescription] = useState(currentProject?.description || '');
  const [isPublic, setIsPublic] = useState(currentProject?.isPublic || false);
  const [boardType, setBoardType] = useState<BoardType>(currentProject?.boardType || 'ARDUINO_UNO');
  const [tags, setTags] = useState(currentProject?.tags || '');

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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg glass rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200/70 bg-surface-50/70 dark:border-white/5 dark:bg-surface-900/50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-volt-400" />
                <h2 className="text-lg font-bold text-surface-950 dark:text-white">Project Settings</h2>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-950 transition-colors dark:text-surface-400 dark:hover:bg-white/5 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Project Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all resize-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Board Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {boards.map((b) => (
                    <button
                      key={b}
                      onClick={() => setBoardType(b)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-all ${
                        boardType === b
                          ? 'bg-volt-500/20 border-volt-500/40 text-volt-400'
                          : 'bg-white/80 border-surface-200 text-surface-600 hover:text-surface-950 dark:bg-white/5 dark:border-white/5 dark:text-surface-400 dark:hover:text-white'
                      }`}
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      {b.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Visibility</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsPublic(true)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs transition-all ${
                      isPublic ? 'bg-volt-500/20 border-volt-500/40 text-volt-500 dark:text-volt-400' : 'bg-white/80 border-surface-200 text-surface-600 dark:bg-white/5 dark:border-white/5 dark:text-surface-400'
                    }`}
                  >
                    <Globe className="w-4 h-4" /> Public
                  </button>
                  <button
                    onClick={() => setIsPublic(false)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs transition-all ${
                      !isPublic ? 'bg-surface-100 border-surface-200 text-surface-950 dark:bg-surface-800 dark:border-white/10 dark:text-white' : 'bg-white/80 border-surface-200 text-surface-600 dark:bg-white/5 dark:border-white/5 dark:text-surface-400'
                    }`}
                  >
                    <Lock className="w-4 h-4" /> Private
                  </button>
                </div>
                <p className="text-[10px] text-surface-500 mt-2 ml-1">
                  {isPublic ? 'Anyone can view and fork this project.' : 'Only you can access this project.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-2 dark:text-surface-400">Tags</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="iot, arduino, sensor (comma-separated)"
                  className="w-full px-4 py-2.5 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-surface-200/70 bg-surface-50/70 flex justify-between items-center dark:border-white/5 dark:bg-surface-900/50">
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                onClick={() => { if(confirm('Delete project permanently?')) { /* projectApi.delete... */ } }}
              >
                <Trash2 className="w-4 h-4" /> Delete Project
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl text-xs font-medium text-surface-600 hover:text-surface-950 transition-colors dark:text-surface-400 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-volt-500 text-white text-xs font-bold hover:bg-volt-400 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
