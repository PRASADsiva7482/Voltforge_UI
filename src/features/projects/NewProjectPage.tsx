import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Cpu, Zap, Wifi, ChevronRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import { useToastStore } from '../../store/useToastStore';
import { generateDefaultCode } from '../../utils/codeTemplates';
import type { BoardType, CreateProjectRequest } from '../../types';

const MAX_NAME_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;

const boards: { type: BoardType; name: string; description: string; icon: typeof Cpu; gradient: string }[] = [
  { type: 'ARDUINO_UNO', name: 'Arduino Uno', description: 'Classic 8-bit ATmega328P board — great for beginners', icon: Cpu, gradient: 'from-blue-500 to-cyan-500' },
  { type: 'ARDUINO_MEGA', name: 'Arduino Mega', description: '54 digital pins, 16 analog — for complex projects', icon: Cpu, gradient: 'from-indigo-500 to-blue-500' },
  { type: 'ARDUINO_NANO', name: 'Arduino Nano', description: 'Compact breadboard-friendly board', icon: Cpu, gradient: 'from-sky-500 to-blue-400' },
  { type: 'ESP32', name: 'ESP32', description: 'Dual-core 240MHz + WiFi + Bluetooth — IoT powerhouse', icon: Wifi, gradient: 'from-emerald-500 to-green-500' },
  { type: 'ESP32_S3', name: 'ESP32-S3', description: 'AI-ready ESP32 with vector extensions', icon: Wifi, gradient: 'from-teal-500 to-emerald-500' },
  { type: 'ESP8266', name: 'ESP8266', description: 'Budget WiFi-enabled microcontroller', icon: Wifi, gradient: 'from-green-500 to-lime-500' },
];

/** Parse comma-separated tags: trims whitespace and removes empty entries. */
function parseTags(raw: string): string | undefined {
  const parsed = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(',');
  return parsed || undefined;
}

export default function NewProjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAi = searchParams.get('ai') === 'true';
  const addToast = useToastStore((s) => s.addToast);

  const [step, setStep] = useState(1);
  const [selectedBoard, setSelectedBoard] = useState<BoardType | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [tags, setTags] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: CreateProjectRequest) => projectApi.create(data),
    onSuccess: (res) => {
      const project = res.data.data;
      navigate(`/editor/${project.id}${isAi ? '?ai=true' : ''}`);
    },
    onError: (error: Error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        error.message ||
        'Failed to create project. Please try again.';
      addToast(message, 'error');
    },
  });

  const handleCreate = () => {
    if (!selectedBoard || !name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      boardType: selectedBoard,
      isPublic,
      tags: parseTags(tags),
      codeFiles: [
        {
          filename: 'main.ino',
          content: generateDefaultCode(selectedBoard, name.trim()),
          language: 'cpp',
          sortOrder: 0,
        },
      ],
    });
  };

  /** Navigate back safely — falls back to /projects if there is no browser history. */
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/projects');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto pt-8 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <button onClick={handleBack} className="flex items-center gap-2 text-surface-600 hover:text-surface-950 transition-colors mb-6 text-sm dark:text-surface-400 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-950 dark:text-white">{isAi ? t('AI Generate Project') : t('New Project')}</h1>
            <p className="text-surface-600 text-sm dark:text-surface-400">{isAi ? 'Let AI create a circuit for you' : 'Set up your new circuit project'}</p>
          </div>
        </div>
      </motion.div>

      {/* Step 1: Select Board */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-lg font-semibold text-surface-950 mb-1 dark:text-white">Choose Your Board</h2>
          <p className="text-surface-600 text-sm mb-6 dark:text-surface-400">Select the microcontroller for your project</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {boards.map((board) => {
              const Icon = board.icon;
              const selected = selectedBoard === board.type;
              return (
                <motion.button
                  key={board.type}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedBoard(board.type)}
                  className={`p-5 rounded-2xl text-left transition-all duration-300 border ${
                    selected
                      ? 'glass border-volt-500/40 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
                      : 'glass glass-hover border-surface-200 dark:border-white/5'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${board.gradient} flex items-center justify-center flex-shrink-0 ${selected ? 'opacity-100' : 'opacity-70'}`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-surface-950 dark:text-white">{board.name}</h3>
                      <p className="text-xs text-surface-600 mt-1 dark:text-surface-400">{board.description}</p>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
          <div className="flex justify-end mt-8">
            <button
              onClick={() => setStep(2)}
              disabled={!selectedBoard}
              className="vf-btn vf-btn-primary shadow-[0_0_18px_rgba(34,197,94,0.25)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 2: Project Details */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-lg font-semibold text-surface-950 mb-1 dark:text-white">Project Details</h2>
          <p className="text-surface-600 text-sm mb-6 dark:text-surface-400">Give your project a name and description</p>

          <div className="space-y-5">
            <div>
              <label htmlFor="project-name" className="block text-sm font-medium text-surface-700 mb-2 dark:text-surface-300">Project Name *</label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                maxLength={MAX_NAME_LENGTH}
                placeholder="e.g., Smart Home Controller"
                className="w-full px-4 py-3 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white"
                aria-required="true"
                autoFocus
              />
              <p className="text-xs text-surface-400 mt-1 text-right">{name.length}/{MAX_NAME_LENGTH}</p>
            </div>

            <div>
              <label htmlFor="project-description" className="block text-sm font-medium text-surface-700 mb-2 dark:text-surface-300">Description</label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder="Describe your circuit project..."
                rows={3}
                className="w-full px-4 py-3 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all resize-none dark:bg-white/5 dark:border-white/10 dark:text-white"
              />
              <p className="text-xs text-surface-400 mt-1 text-right">{description.length}/{MAX_DESCRIPTION_LENGTH}</p>
            </div>

            <div>
              <label htmlFor="project-tags" className="block text-sm font-medium text-surface-700 mb-2 dark:text-surface-300">Tags</label>
              <input
                id="project-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., iot, sensor, led (comma-separated)"
                className="w-full px-4 py-3 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPublic(!isPublic)}
                role="switch"
                aria-checked={isPublic}
                className={`w-10 h-6 rounded-full transition-colors relative ${isPublic ? 'bg-volt-500' : 'bg-surface-300 dark:bg-surface-700'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${isPublic ? 'left-4.5' : 'left-0.5'}`} />
              </button>
              <span className="text-sm text-surface-700 dark:text-surface-300">{isPublic ? 'Public — visible to everyone' : 'Private — only you can see this'}</span>
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-xl text-surface-600 hover:text-surface-950 transition-colors text-sm dark:text-surface-400 dark:hover:text-white">
              ← Back
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
              className="vf-btn vf-btn-primary shadow-[0_0_18px_rgba(34,197,94,0.25)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : isAi ? 'Create & Generate with AI' : 'Create Project'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
