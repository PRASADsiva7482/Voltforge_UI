import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Cpu, Zap, Wifi, ChevronRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import type { BoardType, CreateProjectRequest } from '../../types';

const boards: { type: BoardType; name: string; description: string; icon: any; gradient: string }[] = [
  { type: 'ARDUINO_UNO', name: 'Arduino Uno', description: 'Classic 8-bit ATmega328P board — great for beginners', icon: Cpu, gradient: 'from-blue-500 to-cyan-500' },
  { type: 'ARDUINO_MEGA', name: 'Arduino Mega', description: '54 digital pins, 16 analog — for complex projects', icon: Cpu, gradient: 'from-indigo-500 to-blue-500' },
  { type: 'ARDUINO_NANO', name: 'Arduino Nano', description: 'Compact breadboard-friendly board', icon: Cpu, gradient: 'from-sky-500 to-blue-400' },
  { type: 'ESP32', name: 'ESP32', description: 'Dual-core 240MHz + WiFi + Bluetooth — IoT powerhouse', icon: Wifi, gradient: 'from-emerald-500 to-green-500' },
  { type: 'ESP32_S3', name: 'ESP32-S3', description: 'AI-ready ESP32 with vector extensions', icon: Wifi, gradient: 'from-teal-500 to-emerald-500' },
  { type: 'ESP8266', name: 'ESP8266', description: 'Budget WiFi-enabled microcontroller', icon: Wifi, gradient: 'from-green-500 to-lime-500' },
];

export default function NewProjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAi = searchParams.get('ai') === 'true';

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
  });

  const handleCreate = () => {
    if (!selectedBoard || !name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      boardType: selectedBoard,
      isPublic,
      tags: tags.trim() || undefined,
      codeFiles: [{
        filename: 'main.ino',
        content: `// ${name}\n// Board: ${selectedBoard.replace(/_/g, ' ')}\n\nvoid setup() {\n  Serial.begin(9600);\n  Serial.println("VoltForge — ${name}");\n}\n\nvoid loop() {\n  // Your code here\n  delay(1000);\n}\n`,
        language: 'cpp',
        sortOrder: 0,
      }],
    });
  };

  return (
    <div className="p-8 max-w-3xl mx-auto pt-8 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-surface-400 hover:text-white transition-colors mb-6 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{isAi ? t('AI Generate Project') : t('New Project')}</h1>
            <p className="text-surface-400 text-sm">{isAi ? 'Let AI create a circuit for you' : 'Set up your new circuit project'}</p>
          </div>
        </div>
      </motion.div>

      {/* Step 1: Select Board */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-lg font-semibold text-white mb-1">Choose Your Board</h2>
          <p className="text-surface-400 text-sm mb-6">Select the microcontroller for your project</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      : 'glass glass-hover border-white/5'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${board.gradient} flex items-center justify-center flex-shrink-0 ${selected ? 'opacity-100' : 'opacity-70'}`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{board.name}</h3>
                      <p className="text-xs text-surface-400 mt-1">{board.description}</p>
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
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-volt-500 to-volt-600 text-white font-medium hover:from-volt-400 hover:to-volt-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 2: Project Details */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-lg font-semibold text-white mb-1">Project Details</h2>
          <p className="text-surface-400 text-sm mb-6">Give your project a name and description</p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">Project Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Smart Home Controller"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your circuit project..."
                rows={3}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-300 mb-2">Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., iot, sensor, led (comma-separated)"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPublic(!isPublic)}
                className={`w-10 h-6 rounded-full transition-colors relative ${isPublic ? 'bg-volt-500' : 'bg-surface-700'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${isPublic ? 'left-4.5' : 'left-0.5'}`} />
              </button>
              <span className="text-sm text-surface-300">{isPublic ? 'Public — visible to everyone' : 'Private — only you can see this'}</span>
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-xl text-surface-400 hover:text-white transition-colors text-sm">
              ← Back
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-volt-500 to-volt-600 text-white font-medium hover:from-volt-400 hover:to-volt-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(34,197,94,0.3)]"
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
